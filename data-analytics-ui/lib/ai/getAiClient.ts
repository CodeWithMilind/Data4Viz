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
 * Resolve API key using the SAME logic as Chat.
 * Priority: bodyKey (user settings) > process.env.GROQ_API_KEY (server default)
 */
export function resolveApiKey(bodyKey?: string): string | null {
  // Same logic as chat/route.ts line 360
  const key = process.env.GROQ_API_KEY || bodyKey
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
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
  } catch (error: any) {
    return { error: error.message || "AI request failed" }
  }
}

/**
 * Check if error is due to model decommission.
 */
export function isDecommissionError(err: string): boolean {
  const s = String(err).toLowerCase()
  return /decommission|deprecated|not found|invalid model|does not exist|unknown model|model .* (is )?not (available|supported)/i.test(s)
}
