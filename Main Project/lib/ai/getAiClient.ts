/**
 * Shared AI Client Utility
 * 
 * SINGLE SOURCE OF TRUTH for AI API key resolution.
 * Used by both Chat and Auto Summarize features.
 * 
 * API Key Resolution Priority:
 * 1. Request body apiKey (from user settings)
 * 2. Fallback to process.env.GROQ_API_KEY (server default)
 * 
 * This ensures Auto Summarize uses the SAME API key as Chat.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

export type AIProvider = "groq" | "openai"

export interface AIRequestOptions {
  provider: AIProvider
  model: string
  apiKey: string
  messages: AIMessage[]
}

export interface AIClientConfig {
  apiKey: string
  model: string
}

export interface AIMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface AIResponse {
  content?: string
  error?: string
}

/**
 * Unified entry point for AI responses.
 * Dynamically calls the appropriate provider based on the settings.
 */
export async function getAIResponse({
  provider,
  model,
  apiKey,
  messages,
}: AIRequestOptions): Promise<AIResponse> {
  if (!apiKey) {
    return { error: "Invalid API key or request failed" }
  }

  try {
    if (provider === "openai") {
      return await callOpenAI(apiKey, model, messages)
    }

    // Default to Groq
    return await callGroq(apiKey, model, messages)
  } catch (error) {
    return { error: "Invalid API key or request failed" }
  }
}

/**
 * Call OpenAI API with the provided API key.
 */
export async function callOpenAI(
  apiKey: string,
  model: string,
  messages: AIMessage[],
): Promise<AIResponse> {
  console.log(`[getAiClient] callOpenAI: model=${model}, messages=${messages.length}`)
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages,
      }),
    })

    console.log(`[getAiClient] OpenAI response status: ${res.status}`)

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error("[getAiClient] OpenAI error response:", data)
      return { error: "Invalid API key or request failed" }
    }

    const content = data?.choices?.[0]?.message?.content ?? ""
    return { content }
  } catch (error: any) {
    console.error("[getAiClient] OpenAI fetch exception:", error)
    return { error: "Invalid API key or request failed" }
  }
}

/**
 * Resolve API key using the SAME logic as Chat.
 * Priority: bodyKey (user settings) > process.env.GROQ_API_KEY (server default)
 */
export function resolveApiKey(provider: AIProvider, bodyKey?: string): string | null {
  // Same logic as chat/route.ts line 360
  const envKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GROQ_API_KEY
  const key = envKey || bodyKey
  if (!key || typeof key !== "string") {
    return null
  }
  return key
}

/**
 * Call Groq API with the resolved API key.
 * This is the shared implementation used by both Chat and Auto Summarize.
 */
export async function callGroq(
  apiKey: string,
  model: string,
  messages: AIMessage[],
): Promise<AIResponse> {
  console.log(`[getAiClient] callGroq: model=${model}, messages=${messages.length}`)
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
    })

    console.log(`[getAiClient] Groq response status: ${res.status}`)

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error("[getAiClient] Groq error response:", data)
      return { error: "Invalid API key or request failed" }
    }

    const content = data?.choices?.[0]?.message?.content ?? ""
    return { content }
  } catch (error: any) {
    console.error("[getAiClient] Groq fetch exception:", error)
    return { error: "Invalid API key or request failed" }
  }
}

/**
 * Check if error is due to model decommission.
 */
export function isDecommissionError(err: string): boolean {
  const s = String(err).toLowerCase()
  return /decommission|deprecated|not found|invalid model|does not exist|unknown model|model .* (is )?not (available|supported)/i.test(s)
}
