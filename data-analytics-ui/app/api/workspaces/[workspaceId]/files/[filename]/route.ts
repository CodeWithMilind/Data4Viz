import { NextRequest, NextResponse } from "next/server"
import { readWorkspaceFile } from "@/lib/workspace-files"
import { promises as fs } from "fs"
import path from "path"
import { existsSync } from "fs"

const WORKSPACES_DIR = path.join(process.cwd(), "workspaces")

function getWorkspaceDir(workspaceId: string): string {
  return path.join(WORKSPACES_DIR, workspaceId)
}

function getFilePath(workspaceId: string, filename: string): string {
  // Handle subdirectories (notebooks/, files/, datasets/, etc.)
  // Path is relative to workspace root
  return path.join(getWorkspaceDir(workspaceId), filename)
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string; filename: string }> | { workspaceId: string; filename: string } },
) {
  try {
    // Handle both Promise and direct params (Next.js 15+ vs older versions)
    const params = await Promise.resolve(context.params)
    const { workspaceId, filename } = params

    if (!workspaceId || !filename) {
      return NextResponse.json({ error: "workspaceId and filename required" }, { status: 400 })
    }

    const filePath = getFilePath(workspaceId, filename)
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const content = await fs.readFile(filePath, "utf-8")
    const stats = await fs.stat(filePath)

    // Determine content type based on file extension
    const contentType = filename.endsWith(".ipynb")
      ? "application/x-ipynb+json"
      : filename.endsWith(".json")
        ? "application/json"
        : "application/octet-stream"

    return new NextResponse(content, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename.split("/").pop()}"`,
        "Content-Length": stats.size.toString(),
      },
    })
  } catch (e: any) {
    console.error("Error downloading file:", e)
    return NextResponse.json({ error: e?.message || "Failed to download file" }, { status: 500 })
  }
}
