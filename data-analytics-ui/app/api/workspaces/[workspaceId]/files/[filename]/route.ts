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
  return path.join(getWorkspaceDir(workspaceId), filename)
}

export async function GET(
  req: NextRequest,
  { params }: { params: { workspaceId: string; filename: string } },
) {
  try {
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

    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": stats.size.toString(),
      },
    })
  } catch (e: any) {
    console.error("Error downloading file:", e)
    return NextResponse.json({ error: e?.message || "Failed to download file" }, { status: 500 })
  }
}
