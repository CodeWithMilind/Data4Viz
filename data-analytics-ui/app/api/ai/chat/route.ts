import { NextRequest, NextResponse } from "next/server"
import { GROQ_DEFAULT_MODEL, isGroqModelSupported } from "@/lib/groq-models"
import {
  getChatHistory,
  appendChatMessages,
  getFilesIndex,
  getRelevantFiles,
  type ChatMessage,
} from "@/lib/workspace-files"
import type { WorkspaceContext } from "@/lib/workspace-context"

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

function isDecommissionError(err: string): boolean {
  const s = String(err).toLowerCase()
  return /decommission|deprecated|not found|invalid model|does not exist|unknown model|model .* (is )?not (available|supported)/i.test(s)
}

async function callGroq(
  key: string,
  model: string,
  messages: { role: string; content: string }[],
): Promise<{ content?: string; error?: string }> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = data?.error?.message || data?.error || "Request failed"
    return { error: res.status === 401 ? "Invalid API key" : err }
  }
  const content = data?.choices?.[0]?.message?.content ?? ""
  return { content }
}

function buildSystemPrompt(
  context: WorkspaceContext | null,
  filesIndex: any[],
  relevantFiles: any[],
): string {
  let prompt = `You are Data4Viz AI Agent.`

  if (context) {
    prompt += `\n\nCurrent workspace state:\n`
    prompt += `- Dataset uploaded: ${context.hasDataset ? "yes" : "no"}\n`
    prompt += `- Dataset count: ${context.datasetCount}\n`
    prompt += `- Dataset summary available: ${context.datasetSummaryAvailable ? "yes" : "no"}\n`
    prompt += `- Data cleaned: ${context.isDataCleaned ? "yes" : "no"}\n`
    prompt += `- Cleaning steps applied: ${context.cleaningStepsCount}\n`
    prompt += `- Outliers handled: ${context.isOutlierHandled ? "yes" : "no"}\n`

    prompt += `\nYour job:\n`
    prompt += `- Guide the user step-by-step through their data analysis workflow\n`
    prompt += `- Recommend the next logical action based on current state\n`
    prompt += `- Be concise and proactive\n`
    prompt += `- If user asks generic questions, gently steer them toward dataset actions\n`
    prompt += `- Only explain "why" when explicitly asked\n`
  }

  prompt += `\n\nYou have access to the following workspace files:\n\nFILES:\n`
  for (const entry of filesIndex) {
    prompt += `- ${entry.file}: ${entry.summary}\n`
  }

  if (relevantFiles.length > 0) {
    prompt += `\nRELEVANT FILE CONTENTS:\n`
    for (const file of relevantFiles) {
      prompt += `\n--- ${file.file} ---\n${file.content}\n`
    }
  }

  prompt += `\nUse these files when answering questions. Reference specific files when relevant.`
  return prompt
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, userMessage, workspaceContext, provider, model, apiKey: bodyKey } = body as {
      workspaceId?: string
      userMessage?: string
      workspaceContext?: WorkspaceContext
      provider?: string
      model?: string
      apiKey?: string
    }

    if (provider !== "groq") {
      return NextResponse.json({ error: "Only Groq is supported" }, { status: 400 })
    }

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 })
    }

    if (!userMessage || typeof userMessage !== "string") {
      return NextResponse.json({ error: "userMessage required" }, { status: 400 })
    }

    const key = process.env.GROQ_API_KEY || bodyKey
    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "API key required" }, { status: 400 })
    }

    const resolvedModel = isGroqModelSupported(model) ? model : GROQ_DEFAULT_MODEL

    let chatHistory = { messages: [] }
    let filesIndex: any[] = []
    let relevantFiles: any[] = []

    try {
      chatHistory = await getChatHistory(workspaceId)
    } catch (e) {
      console.error("Failed to load chat history:", e)
    }

    try {
      filesIndex = await getFilesIndex(workspaceId)
    } catch (e) {
      console.error("Failed to load files index:", e)
    }

    try {
      relevantFiles = await getRelevantFiles(workspaceId, 5, 5000)
    } catch (e) {
      console.error("Failed to load relevant files:", e)
    }

    const systemPrompt = buildSystemPrompt(workspaceContext || null, filesIndex, relevantFiles)

    const historyMessages = chatHistory.messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...historyMessages,
      { role: "user" as const, content: userMessage },
    ]

    let out = await callGroq(key, resolvedModel, messages)

    if (out.error && isDecommissionError(out.error)) {
      out = await callGroq(key, GROQ_DEFAULT_MODEL, messages)
      if (out.error) {
        out = { error: "Model was updated. Please try again." }
      }
    }

    if (out.error) {
      return NextResponse.json({ error: out.error }, { status: 200 })
    }

    const userMsg: ChatMessage = {
      id: `${Date.now()}`,
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
    }

    const assistantMsg: ChatMessage = {
      id: `${Date.now() + 1}`,
      role: "assistant",
      content: out.content ?? "",
      timestamp: Date.now() + 1,
    }

    try {
      await appendChatMessages(workspaceId, [userMsg, assistantMsg])
    } catch (e: any) {
      console.error("Failed to save chat messages to file:", e?.message || e)
      console.error("WorkspaceId:", workspaceId)
      console.error("Error details:", e)
    }

    // Trigger files refresh event (client-side will listen for this)
    // Note: This is a server-side API, so we can't directly dispatch events
    // The client will refresh when navigating or the Files page will poll/refresh

    return NextResponse.json({ content: out.content ?? "" })
  } catch (e) {
    return NextResponse.json({ error: "Network error" }, { status: 200 })
  }
}
