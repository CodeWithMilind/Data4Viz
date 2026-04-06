/**
 * Frontend service for AI calls.
 * All AI requests from the UI should go through this service,
 * which then calls the backend proxy route (/api/ai).
 */
export interface AIResponse {
  content?: string
  error?: string
}

export async function getAIResponse({
  prompt,
  messages,
  model,
  apiKey,
  provider,
}: {
  prompt?: string
  messages?: { role: string; content: string }[]
  model: string | null
  apiKey: string | null
  provider: string | null
}): Promise<AIResponse> {
  if (!apiKey) {
    return { error: "API key required" }
  }

  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        messages,
        model,
        apiKey,
        provider,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: data.error || `HTTP ${res.status}: Request failed` }
    }

    return await res.json()
  } catch (error: any) {
    console.error("[ai-service] Network error calling /api/ai:", error)
    return { error: "Invalid API key or request failed" }
  }
}
