import { NextRequest, NextResponse } from "next/server"
import { getChatHistory } from "@/lib/workspace-files"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get("workspaceId")

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 })
    }

    // Return full history for UI display (not used by AI)
    const history = await getChatHistory(workspaceId)
    return NextResponse.json(history)
  } catch (e) {
    return NextResponse.json({ error: "Failed to load chat history" }, { status: 500 })
  }
}
