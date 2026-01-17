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
  const dir = getWorkspaceDir(workspaceId)
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true })
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
  try {
    await ensureWorkspaceDir(workspaceId)
    const filePath = getFilePath(workspaceId, filename)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
    if (!skipIndexUpdate && filename !== "files_index.json") {
      updateFilesIndex(workspaceId, filename).catch((e) => {
        console.error("Failed to update files index:", e)
      })
    }
  } catch (error) {
    console.error(`Failed to write workspace file ${filename}:`, error)
    throw error
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
    return "Chat history with user"
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
  return history || { messages: [] }
}

export async function appendChatMessage(
  workspaceId: string,
  message: ChatMessage,
): Promise<void> {
  try {
    const history = await getChatHistory(workspaceId)
    history.messages.push(message)
    await writeWorkspaceFile(workspaceId, "ai_chat.json", history, false)
  } catch (error) {
    console.error("Failed to append chat message:", error)
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
    if (entry.file === "ai_chat.json" || entry.file === "files_index.json") {
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
