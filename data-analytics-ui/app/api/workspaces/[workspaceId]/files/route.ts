import { NextRequest, NextResponse } from "next/server"
import { listWorkspaceFiles, getFilesIndex } from "@/lib/workspace-files"
import { promises as fs } from "fs"
import path from "path"
import { existsSync } from "fs"

const WORKSPACES_DIR = path.join(process.cwd(), "workspaces")

function getWorkspaceDir(workspaceId: string): string {
  return path.join(WORKSPACES_DIR, workspaceId)
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> | { workspaceId: string } },
) {
  try {
    // Handle both Promise and direct params (Next.js 15+ vs older versions)
    const params = await Promise.resolve(context.params)
    const { workspaceId } = params

    if (!workspaceId) {
      console.error("[Files API] workspaceId is missing from params:", params)
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 })
    }

    const workspaceDir = getWorkspaceDir(workspaceId)
    console.log(`[Files API] Listing files for workspace: ${workspaceId}`)
    console.log(`[Files API] Workspace dir: ${workspaceDir}`)
    console.log(`[Files API] Directory exists: ${existsSync(workspaceDir)}`)
    
    if (!existsSync(workspaceDir)) {
      console.log(`[Files API] Workspace directory does not exist: ${workspaceDir}`)
      return NextResponse.json({ files: [] })
    }

    const files = await listWorkspaceFiles(workspaceId)
    console.log(`[Files API] Found ${files.length} files:`, files)
    
    // Check if ai_chat.json exists
    const chatFilePath = path.join(workspaceDir, "ai_chat.json")
    console.log(`[Files API] ai_chat.json path: ${chatFilePath}, exists: ${existsSync(chatFilePath)}`)
    const filesIndex = await getFilesIndex(workspaceId)

    const fileList = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(workspaceDir, filename)
        let size = 0
        let stats: any = null

        try {
          stats = await fs.stat(filePath)
          size = stats.size
        } catch {
          // File might not exist
        }

        const indexEntry = filesIndex.find((e) => e.file === filename)
        let type = indexEntry?.type || (filename.endsWith(".json") ? "JSON" : filename.endsWith(".ipynb") ? "NOTEBOOK" : "UNKNOWN")
        
        // Ensure chat files are properly typed
        if (filename.includes("ai_chat") && type !== "conversation") {
          type = "conversation"
        }
        
        // Ensure notebook files are properly typed
        if (filename.endsWith(".ipynb") && type !== "NOTEBOOK") {
          type = "NOTEBOOK"
        }

        return {
          id: `local-${filename}`,
          name: filename,
          size,
          type: type.toUpperCase(),
          created_at: stats?.birthtime?.toISOString(),
          updated_at: stats?.mtime?.toISOString(),
        }
      }),
    )

    return NextResponse.json({ files: fileList })
  } catch (e: any) {
    console.error("Error listing workspace files:", e)
    return NextResponse.json({ error: e?.message || "Failed to list files" }, { status: 500 })
  }
}
