import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  GROQ_DEFAULT_MODEL,
  isGroqModelSupported,
} from "./groq-models"

export type AIProvider = "groq" | "openai" | "anthropic" | "google" | "meta" | "mistral"

export interface AIConfigState {
  provider: AIProvider
  model: string
  apiKey: string
  modelAutoUpdated: boolean
  setProvider: (p: AIProvider) => void
  setModel: (m: string) => void
  setApiKey: (k: string) => void
  setModelAutoUpdated: (v: boolean) => void
}

export const useAIConfigStore = create<AIConfigState>()(
  persist(
    (set) => ({
      provider: "groq",
      model: GROQ_DEFAULT_MODEL,
      apiKey: "",
      modelAutoUpdated: false,
      setProvider: (p) =>
        set((s) => ({
          provider: p,
          model: p === "groq" ? GROQ_DEFAULT_MODEL : s.model,
        })),
      setModel: (m) => set({ model: m, modelAutoUpdated: false }),
      setApiKey: (k) => set({ apiKey: k }),
      setModelAutoUpdated: (v) => set({ modelAutoUpdated: v }),
    }),
    {
      name: "ai-config",
      partialize: (s) => ({ provider: s.provider, model: s.model, apiKey: s.apiKey, modelAutoUpdated: s.modelAutoUpdated }),
      onRehydrateStorage: () => (state) => {
        if (state?.provider === "groq" && state?.model && !isGroqModelSupported(state.model)) {
          useAIConfigStore.getState().setModel(GROQ_DEFAULT_MODEL)
          useAIConfigStore.getState().setModelAutoUpdated(true)
        }
      },
    },
  ),
)
