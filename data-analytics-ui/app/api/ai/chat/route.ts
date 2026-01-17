import { NextRequest, NextResponse } from "next/server"
import { GROQ_DEFAULT_MODEL, isGroqModelSupported } from "@/lib/groq-models"

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { messages, provider, model, apiKey: bodyKey } = body as {
      messages?: { role: string; content: string }[]
      provider?: string
      model?: string
      apiKey?: string
    }

    if (provider !== "groq") {
      return NextResponse.json({ error: "Only Groq is supported" }, { status: 400 })
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 })
    }

    const key = process.env.GROQ_API_KEY || bodyKey
    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "API key required" }, { status: 400 })
    }

    const resolvedModel = isGroqModelSupported(model) ? model : GROQ_DEFAULT_MODEL

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
    return NextResponse.json({ content: out.content ?? "" })
  } catch (e) {
    return NextResponse.json({ error: "Network error" }, { status: 200 })
  }
}
