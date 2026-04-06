import { NextRequest, NextResponse } from "next/server"
import { getAIResponse, type AIProvider, type AIMessage } from "@/lib/ai/getAiClient"

/**
 * Unified Backend Proxy for ALL AI requests.
 * This ensures that the frontend never calls external AI APIs directly,
 * preventing CORS issues and securing API keys.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log("[api/ai] Received request body:", JSON.stringify(body, null, 2))

    const { prompt, model, apiKey, provider, messages } = body as {
      prompt?: string
      model?: string
      apiKey?: string
      provider?: string
      messages?: AIMessage[]
    }

    if (!apiKey) {
      console.error("[api/ai] Missing API key")
      return NextResponse.json({ error: "API key required" }, { status: 400 })
    }

    const aiProvider = (provider as AIProvider) || "groq"
    
    // Use messages if provided (for chat), otherwise fallback to single prompt
    const aiMessages: AIMessage[] = messages || [
      { role: "user", content: prompt || "" }
    ]

    console.log(`[api/ai] Calling ${aiProvider} with model ${model}`)

    const result = await getAIResponse({
      provider: aiProvider,
      model: model || (aiProvider === "openai" ? "gpt-4o-mini" : "llama-3.1-70b-versatile"),
      apiKey,
      messages: aiMessages,
    })

    if (result.error) {
      console.error(`[api/ai] ${aiProvider} error:`, result.error)
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    console.log(`[api/ai] Success! Received response from ${aiProvider}`)
    return NextResponse.json({ content: result.content })
  } catch (error: any) {
    console.error("[api/ai] Critical error in backend route:", error)
    return NextResponse.json({ error: error.message || "Network error" }, { status: 500 })
  }
}
