import { NextRequest, NextResponse } from "next/server"
import { getChatIndex, updateChat, deleteChat } from "@/lib/workspace-files"

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ chatId: string }> | { chatId: string } },
) {
  try {
    const params = await Promise.resolve(context.params)
    const { chatId } = params
    const body = await req.json()
    const { workspaceId, title, description } = body as {
      workspaceId?: string
      title?: string
      description?: string
    }

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 })
    }

    if (title !== undefined && (!title || typeof title !== "string" || title.trim().length === 0)) {
      return NextResponse.json({ error: "Chat name cannot be empty" }, { status: 400 })
    }

    if (title && title.trim().length > 100) {
      return NextResponse.json({ error: "Chat name must be 100 characters or less" }, { status: 400 })
    }

    if (description && description.trim().length > 500) {
      return NextResponse.json({ error: "Description must be 500 characters or less" }, { status: 400 })
    }

    await updateChat(workspaceId, chatId, {
      title: title?.trim(),
      description: description?.trim(),
    })

    const index = await getChatIndex(workspaceId)
    const chat = index.chats.find((c) => c.chatId === chatId)

    return NextResponse.json({ chat })
  } catch (e: any) {
    console.error("Error updating chat:", e)
    return NextResponse.json({ error: e?.message || "Failed to update chat" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ chatId: string }> | { chatId: string } },
) {
  try {
    const params = await Promise.resolve(context.params)
    const { chatId } = params
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get("workspaceId")

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 })
    }

    await deleteChat(workspaceId, chatId)

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("Error deleting chat:", e)
    return NextResponse.json({ error: e?.message || "Failed to delete chat" }, { status: 500 })
  }
}
