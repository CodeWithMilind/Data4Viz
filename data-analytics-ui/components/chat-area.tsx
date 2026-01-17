"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { Download, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatMessages } from "@/components/chat-messages"
import { ChatInput } from "@/components/chat-input"
import { useAIConfigStore } from "@/lib/ai-config-store"
import { useWorkspace } from "@/contexts/workspace-context"
import { computeWorkspaceContext, getRecommendation } from "@/lib/workspace-context"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  suggestions?: string[]
}

interface ChatAreaProps {
  onNavigate?: (page: string) => void
  currentPage?: string
}

export function ChatArea({ onNavigate, currentPage }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)

  const { provider, model, apiKey } = useAIConfigStore()
  const { currentWorkspace } = useWorkspace()

  const workspaceContext = useMemo(() => computeWorkspaceContext(currentWorkspace), [currentWorkspace])
  const recommendation = useMemo(() => {
    if (!workspaceContext) return null
    const rec = getRecommendation(workspaceContext)
    if (!rec) return null

    if (currentPage === rec.page) {
      return null
    }

    const recentMessages = messages.slice(-5)
    const alreadySuggested = recentMessages.some(
      (m) => m.role === "assistant" && m.content.toLowerCase().includes(rec.action.toLowerCase()),
    )

    if (alreadySuggested) {
      return null
    }

    return rec
  }, [workspaceContext, messages, currentPage])

  useEffect(() => {
    async function loadChatHistory() {
      if (!currentWorkspace?.id) {
        setIsLoadingHistory(false)
        setMessages([])
        return
      }

      try {
        const res = await fetch(`/api/ai/chat/history?workspaceId=${currentWorkspace.id}`)
        if (res.ok) {
          const data = await res.json()
          const loadedMessages: Message[] = (data.messages || [])
            .filter((m: any) => m.content !== "...")
            .map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
            }))
          setMessages(loadedMessages)
        }
      } catch {
      } finally {
        setIsLoadingHistory(false)
        setMessages((prev) => prev.filter((m) => m.id !== "loading"))
      }
    }

    loadChatHistory()
  }, [currentWorkspace?.id])

  useEffect(() => {
    return () => {
      setMessages((prev) => prev.filter((m) => m.id !== "loading"))
      setIsSending(false)
    }
  }, [])

  const canSend = provider === "groq" && !!apiKey && !isSending && !!currentWorkspace?.id
  const warning =
    !currentWorkspace?.id
      ? "Select a workspace to start chatting."
      : !apiKey && provider === "groq"
        ? "Add your Groq API key in Settings to enable chat."
        : provider !== "groq"
          ? "Only Groq is supported. Set Groq in Settings."
          : null

  const runFetch = useCallback(
    async (userMessage: string) => {
      if (!currentWorkspace?.id) {
        setError("No workspace selected")
        return
      }

      setIsSending(true)
      setError(null)
      setMessages((prev) => [...prev, { id: "loading", role: "assistant" as const, content: "..." }])

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: currentWorkspace.id,
            userMessage,
            workspaceContext,
            provider,
            model,
            apiKey,
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }

        let data
        try {
          data = await res.json()
        } catch (parseError) {
          setMessages((p) => p.filter((m) => m.id !== "loading"))
          setError("Invalid response from server")
          return
        }

        setMessages((p) => p.filter((m) => m.id !== "loading"))
        if (data.error) {
          setError(data.error)
          return
        }
        if (!data.content) {
          setError("Empty response from AI")
          return
        }
        setMessages((p) => [
          ...p,
          { id: crypto.randomUUID(), role: "assistant" as const, content: data.content },
        ])
      } catch (err: any) {
        clearTimeout(timeoutId)
        setMessages((p) => p.filter((m) => m.id !== "loading"))
        if (err.name === "AbortError") {
          setError("Request timed out. Please try again.")
        } else {
          setError("Network error. Please check your connection and try again.")
        }
      } finally {
        setIsSending(false)
      }
    },
    [provider, model, apiKey, currentWorkspace?.id, workspaceContext],
  )

  const handleSendMessage = (content: string) => {
    const userMsg: Message = { id: Date.now().toString(), role: "user", content }
    setMessages((prev) => [...prev, userMsg])
    runFetch(content)
  }

  const handleRetry = () => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user" && m.content !== "...")
    if (!lastUserMessage) return
    runFetch(lastUserMessage.content)
  }

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion)
  }

  if (isLoadingHistory) {
    return (
      <main className="flex-1 flex flex-col h-screen bg-background">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading chat history...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 flex flex-col h-screen bg-background">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Workspace:</span>
          <span className="text-sm font-medium text-foreground">
            {currentWorkspace?.name || "No workspace"}
          </span>
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
            {!error && recommendation && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 text-sm text-blue-700 dark:text-blue-400">
                <span>{recommendation.message}</span>
                {onNavigate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate(recommendation.page)}
                    className="gap-1.5"
                  >
                    {recommendation.action}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            )}
            {!error && !recommendation && warning && (
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
