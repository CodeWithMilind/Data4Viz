import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import { existsSync } from "fs"

const WORKSPACES_DIR = path.join(process.cwd(), "workspaces")

function getWorkspaceDir(workspaceId: string): string {
  return path.join(WORKSPACES_DIR, workspaceId)
}

/**
 * GET /api/workspaces/[workspaceId]/files/[filename]
 * 
 * Download a file from workspace storage.
 * Handles files in subdirectories (e.g., "files/overview.json", "notebooks/notebook.ipynb")
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string; filename: string }> | { workspaceId: string; filename: string } },
) {
  try {
    const params = await Promise.resolve(context.params)
    let { workspaceId, filename } = params

    if (!workspaceId || !filename) {
      return NextResponse.json({ error: "workspaceId and filename required" }, { status: 400 })
    }

    // Decode URL-encoded filename (handles special characters and spaces)
    filename = decodeURIComponent(filename)

    const workspaceDir = getWorkspaceDir(workspaceId)
    
    // Handle subdirectory prefixes (files/, notebooks/, etc.)
    // The filename can include subdirectory prefix like "files/overview.json"
    const filePath = path.join(workspaceDir, filename)

    // Security: Ensure file is within workspace directory (prevent path traversal)
    const resolvedPath = path.resolve(filePath)
    const resolvedWorkspaceDir = path.resolve(workspaceDir)
    if (!resolvedPath.startsWith(resolvedWorkspaceDir)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 })
    }

    // Check if file exists
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Read file content
    let content: string | Buffer
    const fileExtension = path.extname(filename).toLowerCase()
    
    // Determine content type and read file appropriately
    let contentType: string
    if (fileExtension === ".json") {
      content = await fs.readFile(filePath, "utf-8")
      contentType = "application/json"
    } else if (fileExtension === ".ipynb") {
      content = await fs.readFile(filePath, "utf-8")
      contentType = "application/x-ipynb+json"
    } else if (fileExtension === ".csv") {
      content = await fs.readFile(filePath, "utf-8")
      contentType = "text/csv"
    } else if (fileExtension === ".log") {
      content = await fs.readFile(filePath, "utf-8")
      contentType = "text/plain"
    } else {
      // Binary files
      content = await fs.readFile(filePath)
      contentType = "application/octet-stream"
    }

    // Extract just the filename for download (remove subdirectory prefix)
    const downloadFilename = filename.split("/").pop() || filename

    // Return file with appropriate headers
    return new NextResponse(content, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${downloadFilename}"`,
      },
    })
  } catch (e: any) {
    console.error("[Files API] Error downloading file:", e)
    return NextResponse.json({ error: e?.message || "Failed to download file" }, { status: 500 })
  }
}
