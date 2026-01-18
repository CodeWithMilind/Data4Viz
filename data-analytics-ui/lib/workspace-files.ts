import { promises as fs } from "fs"
import path from "path"
import { existsSync, mkdirSync } from "fs"

const WORKSPACES_DIR = path.join(process.cwd(), "workspaces")

if (!existsSync(WORKSPACES_DIR)) {
  mkdirSync(WORKSPACES_DIR, { recursive: true })
}

export interface FileIndexEntry {
  file: string
  type: string
  summary: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export interface ChatHistory {
  messages: ChatMessage[]
}

function getWorkspaceDir(workspaceId: string): string {
  return path.join(WORKSPACES_DIR, workspaceId)
}

function getFilePath(workspaceId: string, filename: string): string {
  return path.join(getWorkspaceDir(workspaceId), filename)
}

async function ensureWorkspaceDir(workspaceId: string): Promise<void> {
  try {
    const dir = getWorkspaceDir(workspaceId)
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true })
    }
  } catch (error) {
    console.error(`Failed to ensure workspace directory for ${workspaceId}:`, error)
    throw error
  }
}

export async function readWorkspaceFile<T>(workspaceId: string, filename: string): Promise<T | null> {
  try {
    const filePath = getFilePath(workspaceId, filename)
    if (!existsSync(filePath)) {
      return null
    }
    const content = await fs.readFile(filePath, "utf-8")
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

export async function writeWorkspaceFile<T>(
  workspaceId: string,
  filename: string,
  data: T,
  skipIndexUpdate: boolean = false,
): Promise<void> {
  await ensureWorkspaceDir(workspaceId)
  const filePath = getFilePath(workspaceId, filename)
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
  } catch (error: any) {
    console.error(`Failed to write workspace file ${filename}:`, error?.message || error)
    console.error(`File path: ${filePath}`)
    console.error(`Workspace ID: ${workspaceId}`)
    throw error
  }
  if (!skipIndexUpdate && filename !== "files_index.json") {
    updateFilesIndex(workspaceId, filename).catch((e) => {
      console.error("Failed to update files index:", e)
    })
  }
}

export async function listWorkspaceFiles(workspaceId: string): Promise<string[]> {
  try {
    const dir = getWorkspaceDir(workspaceId)
    if (!existsSync(dir)) {
      return []
    }
    const files = await fs.readdir(dir)
    return files.filter((f) => f.endsWith(".json"))
  } catch {
    return []
  }
}

export async function getFilesIndex(workspaceId: string): Promise<FileIndexEntry[]> {
  const index = await readWorkspaceFile<FileIndexEntry[]>(workspaceId, "files_index.json")
  return index || []
}

export async function updateFilesIndex(workspaceId: string, filename: string): Promise<void> {
  try {
    const files = await listWorkspaceFiles(workspaceId)
    const existingIndex = await getFilesIndex(workspaceId)
    const indexMap = new Map(existingIndex.map((e) => [e.file, e]))

    for (const file of files) {
      if (!indexMap.has(file)) {
        const type = inferFileType(file)
        const summary = await generateFileSummary(workspaceId, file)
        indexMap.set(file, { file, type, summary })
      }
    }

    const removed = existingIndex.filter((e) => !files.includes(e.file))
    for (const entry of removed) {
      indexMap.delete(entry.file)
    }

    const index = Array.from(indexMap.values())
    await writeWorkspaceFile(workspaceId, "files_index.json", index, true)
  } catch (error) {
    console.error("Failed to update files index:", error)
  }
}

function inferFileType(filename: string): string {
  if (filename === "ai_chat.json") return "conversation"
  if (filename.includes("dataset")) return "dataset"
  if (filename.includes("meta")) return "metadata"
  if (filename.includes("config")) return "config"
  if (filename.includes("schema")) return "schema"
  return "data"
}

async function generateFileSummary(workspaceId: string, filename: string): Promise<string> {
  if (filename === "ai_chat.json") {
    return "Full chat history with user (append-only)"
  }
  if (filename === "ai_chat_recent.json") {
    return "Recent chat messages (working memory)"
  }
  if (filename === "ai_chat_summary.json") {
    return "Long-term chat summary"
  }
  if (filename === "files_index.json") {
    return "Index of workspace files"
  }

  try {
    const content = await readWorkspaceFile<any>(workspaceId, filename)
    if (!content) return "Empty file"

    if (filename.includes("dataset")) {
      return `Dataset metadata and schema`
    }
    if (typeof content === "object") {
      const keys = Object.keys(content).slice(0, 3).join(", ")
      return `Contains: ${keys}${Object.keys(content).length > 3 ? "..." : ""}`
    }
    return "Workspace data file"
  } catch {
    return "Workspace file"
  }
}

export async function getChatHistory(workspaceId: string): Promise<ChatHistory> {
  const history = await readWorkspaceFile<ChatHistory>(workspaceId, "ai_chat.json")
  const result = history || { messages: [] }
  
  // Ensure recent chat is initialized if history exists
  if (result.messages.length > 0) {
    const recentExists = await readWorkspaceFile<RecentChat>(workspaceId, "ai_chat_recent.json")
    if (!recentExists) {
      await rebuildRecentChat(workspaceId, RECENT_CHAT_MAX_MESSAGES).catch((e) => {
        console.error("Failed to initialize recent chat:", e)
      })
    }
  }
  
  return result
}

export async function appendChatMessage(
  workspaceId: string,
  message: ChatMessage,
): Promise<void> {
  const history = await getChatHistory(workspaceId)
  history.messages.push(message)
  await writeWorkspaceFile(workspaceId, "ai_chat.json", history, false)
}

export async function appendChatMessages(
  workspaceId: string,
  messages: ChatMessage[],
): Promise<void> {
  const history = await getChatHistory(workspaceId)
  history.messages.push(...messages)
  await writeWorkspaceFile(workspaceId, "ai_chat.json", history, false)
  
  // Rebuild recent chat after appending
  await rebuildRecentChat(workspaceId, 15)
}

export interface RecentChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface RecentChat {
  messages: RecentChatMessage[]
}

export interface ChatSummary {
  summary: string
  messageCount: number
  lastUpdated: number
}

const RECENT_CHAT_MAX_MESSAGES = 15
const SUMMARY_THRESHOLD = 100

export async function rebuildRecentChat(
  workspaceId: string,
  maxMessages: number = RECENT_CHAT_MAX_MESSAGES,
): Promise<void> {
  try {
    // Read directly to avoid recursion
    const history = await readWorkspaceFile<ChatHistory>(workspaceId, "ai_chat.json")
    const messages = history?.messages || []
    
    const recentMessages: RecentChatMessage[] = messages
      .slice(-maxMessages)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }))

    const recentChat: RecentChat = {
      messages: recentMessages,
    }

    await writeWorkspaceFile(workspaceId, "ai_chat_recent.json", recentChat, false)
    
    // Check if summary needs to be generated
    if (messages.length >= SUMMARY_THRESHOLD) {
      await generateChatSummary(workspaceId).catch((e) => {
        console.error("Failed to generate chat summary:", e)
      })
    }
  } catch (error) {
    console.error("Failed to rebuild recent chat:", error)
    throw error
  }
}

export async function getRecentChat(workspaceId: string): Promise<RecentChat> {
  const recent = await readWorkspaceFile<RecentChat>(workspaceId, "ai_chat_recent.json")
  return recent || { messages: [] }
}

export async function getChatSummary(workspaceId: string): Promise<ChatSummary | null> {
  return await readWorkspaceFile<ChatSummary>(workspaceId, "ai_chat_summary.json")
}

async function generateChatSummary(workspaceId: string): Promise<void> {
  try {
    // Read directly to avoid recursion
    const history = await readWorkspaceFile<ChatHistory>(workspaceId, "ai_chat.json")
    const messages = history?.messages || []
    const messageCount = messages.length
    
    // Generate a simple summary based on early messages
    const earlyMessages = messages.slice(0, Math.min(20, messageCount))
    const topics: string[] = []
    const datasets: string[] = []
    
    for (const msg of earlyMessages) {
      const content = msg.content.toLowerCase()
      if (content.includes("dataset") || content.includes("data")) {
        const match = content.match(/(?:dataset|data|file)[\s:]+([^\s,\.]+)/i)
        if (match) datasets.push(match[1])
      }
      if (content.includes("clean") || content.includes("outlier") || content.includes("visual")) {
        if (!topics.includes("data analysis")) topics.push("data analysis")
      }
    }
    
    const summary: ChatSummary = {
      summary: `User has been working on ${datasets.length > 0 ? datasets.join(", ") : "data analysis"}. ${topics.length > 0 ? `Topics discussed: ${topics.join(", ")}.` : ""} Total messages: ${messageCount}.`,
      messageCount,
      lastUpdated: Date.now(),
    }
    
    await writeWorkspaceFile(workspaceId, "ai_chat_summary.json", summary, false)
  } catch (error) {
    console.error("Failed to generate chat summary:", error)
    throw error
  }
}

export async function getRelevantFiles(
  workspaceId: string,
  maxFiles: number = 5,
  maxSizePerFile: number = 5000,
): Promise<{ file: string; content: string; summary: string }[]> {
  const index = await getFilesIndex(workspaceId)
  const relevant: { file: string; content: string; summary: string }[] = []

  for (const entry of index) {
    // AI must NEVER read ai_chat.json, ai_chat_recent.json, or ai_chat_summary.json
    if (
      entry.file === "ai_chat.json" ||
      entry.file === "ai_chat_recent.json" ||
      entry.file === "ai_chat_summary.json" ||
      entry.file === "files_index.json"
    ) {
      continue
    }
    if (relevant.length >= maxFiles) break

    const content = await readWorkspaceFile<any>(workspaceId, entry.file)
    if (!content) continue

    const contentStr = JSON.stringify(content)
    if (contentStr.length > maxSizePerFile) {
      const trimmed = contentStr.substring(0, maxSizePerFile) + "... (truncated)"
      relevant.push({ file: entry.file, content: trimmed, summary: entry.summary })
    } else {
      relevant.push({ file: entry.file, content: contentStr, summary: entry.summary })
    }
  }

  return relevant
}
