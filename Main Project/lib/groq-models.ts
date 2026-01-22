export const GROQ_MODELS = [
  { id: "llama-3.1-70b-versatile", name: "Llama 3.1 70B Versatile" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant" },
  { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B 32768" },
  { id: "gemma2-9b-it", name: "Gemma2 9B IT" },
] as const

export const GROQ_DEFAULT_MODEL = "llama-3.1-8b-instant"

export const GROQ_MODEL_IDS: string[] = GROQ_MODELS.map((m) => m.id)

export function isGroqModelSupported(id: string): boolean {
  return GROQ_MODEL_IDS.includes(id)
}
