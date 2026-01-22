import { NextRequest, NextResponse } from "next/server"
import { getChatIndex, createChat } from "@/lib/workspace-files"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get("workspaceId")
    const includeDeleted = searchParams.get("includeDeleted") === "true"

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 })
    }

    const index = await getChatIndex(workspaceId)
    const chats = includeDeleted
      ? index.chats
      : index.chats.filter((c) => !c.isDeleted)

    return NextResponse.json({ chats })
  } catch (e: any) {
    console.error("Error fetching chats:", e)
    return NextResponse.json({ error: "Failed to load chats" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, title, description } = body as {
      workspaceId?: string
      title?: string
      description?: string
    }

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 })
    }

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "Chat name is required" }, { status: 400 })
    }

    if (title.trim().length > 100) {
      return NextResponse.json({ error: "Chat name must be 100 characters or less" }, { status: 400 })
    }

    if (description && description.trim().length > 500) {
      return NextResponse.json({ error: "Description must be 500 characters or less" }, { status: 400 })
    }

    const chat = await createChat(workspaceId, title.trim(), description?.trim())

    return NextResponse.json({ chat })
  } catch (e: any) {
    console.error("Error creating chat:", e)
    return NextResponse.json({ error: e?.message || "Failed to create chat" }, { status: 500 })
  }
}
