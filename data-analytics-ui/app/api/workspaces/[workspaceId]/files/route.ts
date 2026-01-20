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

    // Filter files to only show those belonging to this workspace
    // This enforces workspace-scoped file view
    // HIDE NON-EXISTENT FILES: Only return files that exist on disk
    const fileList = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(workspaceDir, filename)
        
        // Verify file exists on disk before including in list
        if (!existsSync(filePath)) {
          return null // Exclude non-existent files
        }

        let size = 0
        let stats: any = null

        try {
          stats = await fs.stat(filePath)
          size = stats.size
        } catch {
          // File might have been deleted between existsSync and stat
          return null
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

        // Determine if file is protected (only system notebooks are protected, CSV files can be deleted)
        const isProtected = filename.startsWith("notebooks/")

        return {
          id: `local-${filename}`,
          name: filename,
          relativePath: filename, // Exact relative path from workspace root (source of truth)
          size,
          type: type.toUpperCase(),
          created_at: stats?.birthtime?.toISOString(),
          updated_at: stats?.mtime?.toISOString(),
          is_protected: isProtected,
        }
      }),
    )

    // Filter out null entries (non-existent files)
    const existingFiles = fileList.filter((file) => file !== null)

    return NextResponse.json({ files: existingFiles })
  } catch (e: any) {
    console.error("Error listing workspace files:", e)
    return NextResponse.json({ error: e?.message || "Failed to list files" }, { status: 500 })
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]/files
 * 
 * Server-only endpoint for deleting files from workspace.
 * 
 * Accepts POST body with:
 * {
 *   workspaceId: string,
 *   relativePath: string (exact relative path from workspace root)
 * }
 * 
 * This endpoint:
 * 1. Validates protection status (CSV, notebooks/)
 * 2. Validates via backend API (checks ownership, etc.)
 * 3. Deletes the physical file from filesystem using exact relativePath
 * 4. Updates workspace files index
 * 
 * All filesystem operations are performed server-side only.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> | { workspaceId: string } },
) {
  try {
    const params = await Promise.resolve(context.params)
    const { workspaceId } = params

    // Parse request body
    const body = await req.json().catch(() => ({}))
    const { relativePath } = body

    if (!workspaceId || !relativePath) {
      return NextResponse.json(
        { error: "workspaceId and relativePath required in request body" },
        { status: 400 }
      )
    }

    // PROTECTION RULE: Only system notebooks are protected (CSV files can be deleted)
    if (relativePath.startsWith("notebooks/")) {
      return NextResponse.json({
        success: true,
        deleted: false,
        protected: true,
      })
    }

    const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

    // Step 1: Validate deletion via backend API (checks ownership, protection, etc.)
    try {
      const backendResponse = await fetch(
        `${BACKEND_URL}/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(relativePath)}`,
        {
          method: "DELETE",
        }
      )

      // Handle backend response - parse JSON safely
      let backendResult: any = null
      try {
        backendResult = await backendResponse.json()
      } catch {
        // If JSON parse fails, check status
        if (!backendResponse.ok) {
          // Backend returned error without JSON - return idempotent success
          return NextResponse.json({
            success: true,
            deleted: false,
            reason: "backend_error",
          })
        }
      }
      
      // If backend returns success response (even if deleted: false), forward it
      if (backendResult && backendResult.success === true) {
        return NextResponse.json({
          success: true,
          deleted: backendResult.deleted || false,
          protected: backendResult.protected || false,
          reason: backendResult.reason,
        })
      }
      
      // If backend returns error status, return idempotent success (file may already be deleted)
      if (!backendResponse.ok) {
        // Treat as idempotent - file may not exist, which is fine
        return NextResponse.json({
          success: true,
          deleted: false,
          reason: "not_found_or_error",
        })
      }
    } catch (backendError: any) {
      console.error("[Files API] Backend validation failed:", backendError)
      return NextResponse.json(
        { error: "Backend validation failed. Cannot delete file without validation." },
        { status: 503 }
      )
    }

    // Step 2: Delete physical file from local filesystem using exact relativePath
    const workspaceDir = getWorkspaceDir(workspaceId)
    const filePath = path.join(workspaceDir, relativePath)

    // IDEMPOTENT DELETE: If file doesn't exist, return success with deleted: false
    let deleted = false
    if (!existsSync(filePath)) {
      console.log(`[Files API] File not found (idempotent): ${filePath} (relativePath: ${relativePath})`)
      // Return success - idempotent operation
      return NextResponse.json({
        success: true,
        deleted: false,
        reason: "not_found",
      })
    }

    // Delete the physical file
    try {
      await fs.unlink(filePath)
      deleted = true
      console.log(`[Files API] Deleted file: ${filePath} (relativePath: ${relativePath})`)
    } catch (unlinkError: any) {
      console.error(`[Files API] Failed to delete file: ${unlinkError}`)
      return NextResponse.json(
        { error: `Failed to delete file: ${unlinkError.message}` },
        { status: 500 }
      )
    }

    // Step 3: Update workspace files index (remove deleted file from metadata)
    // This ensures file is removed from all metadata/indexes
    // Backend already handles file registry cleanup via unregister_file
    const { updateFilesIndex } = await import("@/lib/workspace-files")
    try {
      await updateFilesIndex(workspaceId, "")
      console.log(`[Files API] Updated files index for workspace: ${workspaceId}`)
    } catch (error) {
      console.warn("[Files API] Failed to update files index:", error)
      // Continue even if index update fails - file is already deleted
    }

    // CONSISTENT RESPONSE SHAPE
    return NextResponse.json({
      success: true,
      deleted: deleted,
    })
  } catch (e: any) {
    console.error("[Files API] Error deleting file:", e)
    return NextResponse.json({ error: e?.message || "Failed to delete file" }, { status: 500 })
  }
}
