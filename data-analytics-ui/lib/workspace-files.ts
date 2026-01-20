// SERVER-ONLY MODULE: This file uses Node.js filesystem APIs
// DO NOT import this in client components - use API routes instead

// Build-time guard: Prevent client-side imports
// This will cause build to fail if imported in client components
if (typeof window !== "undefined") {
  throw new Error(
    "workspace-files.ts is a server-only module and cannot be imported in client components. " +
    "Use API routes (e.g., /api/workspaces/[workspaceId]/files) instead."
  )
}

// Runtime guard: Additional check for edge cases
if (typeof process === "undefined" || !process.versions?.node) {
  throw new Error(
    "workspace-files.ts requires Node.js runtime and cannot be used in browser environment."
  )
}

import { promises as fs } from "fs"
import path from "path"
import { existsSync, mkdirSync, unlinkSync } from "fs"

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

export interface DatasetIntelligenceSnapshot {
  file_name: string
  rows: number
  columns: number
  schema: Array<{
    name: string
    type: "numeric" | "categorical" | "text" | "datetime"
    missing: number
  }>
  numeric_summary: Record<string, {
    min: number
    max: number
    mean: number
  }>
  categorical_summary: Record<string, string[]>
  data_quality: {
    missing_columns: number
    duplicate_rows: number
  }
}

function getWorkspaceDir(workspaceId: string): string {
  return path.join(WORKSPACES_DIR, workspaceId)
}

function getChatsDir(workspaceId: string): string {
  return path.join(getWorkspaceDir(workspaceId), "ai_chats")
}

function getFilePath(workspaceId: string, filename: string): string {
  return path.join(getWorkspaceDir(workspaceId), filename)
}

function getChatFilePath(workspaceId: string, chatId: string, filename: string): string {
  return path.join(getChatsDir(workspaceId), filename.replace("<chatId>", chatId))
}

async function ensureWorkspaceDir(workspaceId: string): Promise<void> {
  try {
    const dir = getWorkspaceDir(workspaceId)
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true })
    }
    const chatsDir = getChatsDir(workspaceId)
    if (!existsSync(chatsDir)) {
      await fs.mkdir(chatsDir, { recursive: true })
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
    const files: string[] = []
    
    // List root files
    const rootFiles = await fs.readdir(dir)
    for (const file of rootFiles) {
      if (file.endsWith(".json") && !file.startsWith(".")) {
        files.push(file)
      }
    }
    
    // List chat files
    const chatsDir = getChatsDir(workspaceId)
    if (existsSync(chatsDir)) {
      const chatFiles = await fs.readdir(chatsDir)
      for (const file of chatFiles) {
        if (file.endsWith(".json") && !file.startsWith(".")) {
          files.push(`ai_chats/${file}`)
        }
      }
    }
    
    // List notebook files
    const notebooksDir = path.join(dir, "notebooks")
    if (existsSync(notebooksDir)) {
      const notebookFiles = await fs.readdir(notebooksDir)
      for (const file of notebookFiles) {
        if (file.endsWith(".ipynb") && !file.startsWith(".")) {
          files.push(`notebooks/${file}`)
        }
      }
    }
    
    return files
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
  if (filename.startsWith("ai_chat") && filename.endsWith(".json")) return "conversation"
  if (filename === "index.json" && filename.includes("ai_chats")) return "index"
  if (filename.includes("dataset")) return "dataset"
  if (filename.includes("meta")) return "metadata"
  if (filename.includes("config")) return "config"
  if (filename.includes("schema")) return "schema"
  return "data"
}

async function generateFileSummary(workspaceId: string, filename: string): Promise<string> {
  if (filename.startsWith("ai_chat_") && filename.endsWith(".json") && !filename.includes("recent") && !filename.includes("summary")) {
    return "Full chat history (append-only)"
  }
  if (filename.includes("ai_chat_recent_")) {
    return "Recent chat messages (working memory)"
  }
  if (filename.includes("ai_chat_summary_")) {
    return "Long-term chat summary"
  }
  if (filename === "index.json" && filename.includes("ai_chats")) {
    return "Chat index"
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

async function getChatIndexPath(workspaceId: string): Promise<string> {
  await ensureWorkspaceDir(workspaceId)
  return path.join(getChatsDir(workspaceId), "index.json")
}

export async function getChatIndex(workspaceId: string): Promise<ChatIndex> {
  try {
    const indexPath = await getChatIndexPath(workspaceId)
    if (!existsSync(indexPath)) {
      return { chats: [] }
    }
    const content = await fs.readFile(indexPath, "utf-8")
    return JSON.parse(content) as ChatIndex
  } catch {
    return { chats: [] }
  }
}

export async function saveChatIndex(workspaceId: string, index: ChatIndex): Promise<void> {
  const indexPath = await getChatIndexPath(workspaceId)
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8")
}

export async function createChat(
  workspaceId: string,
  title: string,
  description?: string,
): Promise<ChatEntry> {
  const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const now = Date.now()
  
  const chat: ChatEntry = {
    chatId,
    title,
    description,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  }
  
  const index = await getChatIndex(workspaceId)
  index.chats.push(chat)
  await saveChatIndex(workspaceId, index)
  
  // Create empty chat files
  await ensureWorkspaceDir(workspaceId)
  const emptyHistory: ChatHistory = { messages: [] }
  const emptyRecent: RecentChat = { messages: [] }
  
  await writeChatFile(workspaceId, chatId, "ai_chat_<chatId>.json", emptyHistory, true)
  await writeChatFile(workspaceId, chatId, "ai_chat_recent_<chatId>.json", emptyRecent, true)
  
  return chat
}

export async function updateChat(
  workspaceId: string,
  chatId: string,
  updates: { title?: string; description?: string },
): Promise<void> {
  const index = await getChatIndex(workspaceId)
  const chat = index.chats.find((c) => c.chatId === chatId)
  if (!chat) {
    throw new Error(`Chat ${chatId} not found`)
  }
  
  if (updates.title !== undefined) chat.title = updates.title
  if (updates.description !== undefined) chat.description = updates.description
  chat.updatedAt = Date.now()
  
  await saveChatIndex(workspaceId, index)
}

export async function generateDatasetIntelligence(
  workspaceId: string,
  overview: any,
  datasetFileName: string,
): Promise<DatasetIntelligenceSnapshot> {
  const schema = overview.columns.map((col: any) => ({
    name: col.name,
    type: col.inferred_type === "numeric" ? "numeric" : col.inferred_type === "datetime" ? "datetime" : col.inferred_type === "categorical" ? "categorical" : "text",
    missing: col.missing_count || 0,
  }))

  const numericSummary: Record<string, { min: number; max: number; mean: number }> = {}
  const categoricalSummary: Record<string, string[]> = {}

  // Build numeric summary from column insights if available
  if (overview.column_insights) {
    for (const col of overview.columns) {
      if (col.inferred_type === "numeric" && overview.column_insights[col.name]) {
        const insights = overview.column_insights[col.name]
        // We don't have min/max/mean in column_insights, so we'll leave numeric_summary empty
        // The AI can still use the schema information
      } else if (col.inferred_type === "categorical" && overview.column_insights[col.name]) {
        const insights = overview.column_insights[col.name]
        if (insights.top_values) {
          categoricalSummary[col.name] = Object.keys(insights.top_values).slice(0, 5)
        }
      }
    }
  }

  const missingColumns = schema.filter((s) => s.missing > 0).length

  const snapshot: DatasetIntelligenceSnapshot = {
    file_name: datasetFileName,
    rows: overview.total_rows,
    columns: overview.total_columns,
    schema,
    numeric_summary: numericSummary,
    categorical_summary: categoricalSummary,
    data_quality: {
      missing_columns: missingColumns,
      duplicate_rows: overview.duplicate_row_count || 0,
    },
  }

  return snapshot
}

export async function saveDatasetIntelligence(
  workspaceId: string,
  snapshot: DatasetIntelligenceSnapshot,
): Promise<void> {
  await writeWorkspaceFile(workspaceId, "dataset_intelligence.json", snapshot, false)
}

export async function getDatasetIntelligence(
  workspaceId: string,
): Promise<DatasetIntelligenceSnapshot | null> {
  return await readWorkspaceFile<DatasetIntelligenceSnapshot>(workspaceId, "dataset_intelligence.json")
}

export async function deleteChat(workspaceId: string, chatId: string): Promise<void> {
  const index = await getChatIndex(workspaceId)
  const chat = index.chats.find((c) => c.chatId === chatId)
  if (!chat) {
    throw new Error(`Chat ${chatId} not found`)
  }
  
  // Hard delete: physically remove all chat files
  const chatFiles = [
    `ai_chat_${chatId}.json`,
    `ai_chat_recent_${chatId}.json`,
    `ai_chat_summary_${chatId}.json`,
  ]
  
  const chatsDir = getChatsDir(workspaceId)
  for (const filename of chatFiles) {
    const filePath = path.join(chatsDir, filename)
    try {
      if (existsSync(filePath)) {
        await fs.unlink(filePath)
      }
    } catch (error) {
      console.error(`Failed to delete chat file ${filename}:`, error)
      // Continue with other files even if one fails
    }
  }
  
  // Remove from index
  index.chats = index.chats.filter((c) => c.chatId !== chatId)
  await saveChatIndex(workspaceId, index)
  
  // Update files index to remove deleted chat files
  try {
    await updateFilesIndex(workspaceId, "")
  } catch (error) {
    console.error("Failed to update files index after chat deletion:", error)
  }
}

async function writeChatFile<T>(
  workspaceId: string,
  chatId: string,
  filename: string,
  data: T,
  skipIndexUpdate: boolean = false,
): Promise<void> {
  await ensureWorkspaceDir(workspaceId)
  const filePath = getChatFilePath(workspaceId, chatId, filename)
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
  } catch (error: any) {
    console.error(`Failed to write chat file ${filename}:`, error?.message || error)
    throw error
  }
  if (!skipIndexUpdate) {
    updateFilesIndex(workspaceId, path.basename(filePath)).catch((e) => {
      console.error("Failed to update files index:", e)
    })
  }
}

async function readChatFile<T>(
  workspaceId: string,
  chatId: string,
  filename: string,
): Promise<T | null> {
  try {
    const filePath = getChatFilePath(workspaceId, chatId, filename)
    if (!existsSync(filePath)) {
      return null
    }
    const content = await fs.readFile(filePath, "utf-8")
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

export async function getChatHistory(workspaceId: string, chatId: string): Promise<ChatHistory> {
  const history = await readChatFile<ChatHistory>(workspaceId, chatId, "ai_chat_<chatId>.json")
  const result = history || { messages: [] }
  
  if (result.messages.length > 0) {
    const recentExists = await readChatFile<RecentChat>(workspaceId, chatId, "ai_chat_recent_<chatId>.json")
    if (!recentExists) {
      await rebuildRecentChat(workspaceId, chatId, RECENT_CHAT_MAX_MESSAGES).catch((e) => {
        console.error("Failed to initialize recent chat:", e)
      })
    }
  }
  
  return result
}

export async function appendChatMessages(
  workspaceId: string,
  chatId: string,
  messages: ChatMessage[],
): Promise<void> {
  const history = await getChatHistory(workspaceId, chatId)
  history.messages.push(...messages)
  await writeChatFile(workspaceId, chatId, "ai_chat_<chatId>.json", history, false)
  
  // Rebuild recent chat after appending
  await rebuildRecentChat(workspaceId, chatId, 15)
  
  // Update chat updatedAt
  const index = await getChatIndex(workspaceId)
  const chat = index.chats.find((c) => c.chatId === chatId)
  if (chat) {
    chat.updatedAt = Date.now()
    await saveChatIndex(workspaceId, index)
  }
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

export interface ChatEntry {
  chatId: string
  title: string
  description?: string
  createdAt: number
  updatedAt: number
  isDeleted: boolean
}

export interface ChatIndex {
  chats: ChatEntry[]
}

const RECENT_CHAT_MAX_MESSAGES = 15
const SUMMARY_THRESHOLD = 100

export async function rebuildRecentChat(
  workspaceId: string,
  chatId: string,
  maxMessages: number = RECENT_CHAT_MAX_MESSAGES,
): Promise<void> {
  try {
    const history = await readChatFile<ChatHistory>(workspaceId, chatId, "ai_chat_<chatId>.json")
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

    await writeChatFile(workspaceId, chatId, "ai_chat_recent_<chatId>.json", recentChat, false)
    
    if (messages.length >= SUMMARY_THRESHOLD) {
      await generateChatSummary(workspaceId, chatId).catch((e) => {
        console.error("Failed to generate chat summary:", e)
      })
    }
  } catch (error) {
    console.error("Failed to rebuild recent chat:", error)
    throw error
  }
}

export async function getRecentChat(workspaceId: string, chatId: string): Promise<RecentChat> {
  const recent = await readChatFile<RecentChat>(workspaceId, chatId, "ai_chat_recent_<chatId>.json")
  return recent || { messages: [] }
}

export async function getChatSummary(workspaceId: string, chatId: string): Promise<ChatSummary | null> {
  return await readChatFile<ChatSummary>(workspaceId, chatId, "ai_chat_summary_<chatId>.json")
}

async function generateChatSummary(workspaceId: string, chatId: string): Promise<void> {
  try {
    const history = await readChatFile<ChatHistory>(workspaceId, chatId, "ai_chat_<chatId>.json")
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
    
    await writeChatFile(workspaceId, chatId, "ai_chat_summary_<chatId>.json", summary, false)
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
    // AI must NEVER read any chat files or index files
    if (
      entry.file.includes("ai_chat") ||
      entry.file.includes("index.json") ||
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
