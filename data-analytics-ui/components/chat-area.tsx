"use client"

import { useState, useCallback } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatMessages } from "@/components/chat-messages"
import { ChatInput } from "@/components/chat-input"
import { useAIConfigStore } from "@/lib/ai-config-store"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  suggestions?: string[]
}

export function ChatArea() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { provider, model, apiKey } = useAIConfigStore()

  const canSend = provider === "groq" && !!apiKey && !isSending
  const warning =
    !apiKey && provider === "groq"
      ? "Add your Groq API key in Settings to enable chat."
      : provider !== "groq"
        ? "Only Groq is supported. Set Groq in Settings."
        : null

  const runFetch = useCallback(
    async (msgs: Message[]) => {
      const forApi = msgs
        .filter((m) => m.content !== "...")
        .map((m) => ({ role: m.role, content: m.content }))
      setIsSending(true)
      setError(null)
      setMessages((prev) => [...prev, { id: "loading", role: "assistant" as const, content: "..." }])

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: forApi, provider, model, apiKey }),
        })
        const data = await res.json()

        setMessages((p) => p.filter((m) => m.id !== "loading"))
        if (data.error) {
          setError(data.error)
          return
        }
        setMessages((p) => [
          ...p,
          { id: crypto.randomUUID(), role: "assistant" as const, content: data.content || "" },
        ])
      } catch (_) {
        setMessages((p) => p.filter((m) => m.id !== "loading"))
        setError("Network error")
      } finally {
        setIsSending(false)
      }
    },
    [provider, model, apiKey],
  )

  const handleSendMessage = (content: string) => {
    const userMsg: Message = { id: Date.now().toString(), role: "user", content }
    const next = [...messages, userMsg]
    setMessages(next)
    runFetch(next)
  }

  const handleRetry = () => {
    const base = messages.filter((m) => m.content !== "...")
    if (base.length === 0) return
    runFetch(base)
  }

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion)
  }

  return (
    <main className="flex-1 flex flex-col h-screen bg-background">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Workspace:</span>
          <span className="text-sm font-medium text-foreground">Sales Analysis Q4</span>
        </div>
        <Button variant="outline" size="sm" className="gap-2 bg-transparent">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </header>

      <ChatMessages messages={messages} onSuggestionClick={handleSuggestionClick} />

      <ChatInput
        onSendMessage={handleSendMessage}
        disabled={!canSend}
        top={
          <>
            {error && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={handleRetry}>
                  Retry
                </Button>
              </div>
            )}
            {!error && warning && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                {warning}
              </div>
            )}
          </>
        }
      />
    </main>
  )
}
