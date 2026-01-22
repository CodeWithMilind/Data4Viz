"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { Download, ArrowRight, Plus, MessageSquare, Edit2, Trash2, MoreVertical, Sparkles, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatMessages } from "@/components/chat-messages"
import { ChatInput } from "@/components/chat-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAIConfigStore } from "@/lib/ai-config-store"
import { useDataExposureStore } from "@/lib/data-exposure-store"
import { useWorkspace } from "@/contexts/workspace-context"
import { computeWorkspaceContext, getRecommendation } from "@/lib/workspace-context"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  suggestions?: string[]
}

interface ChatEntry {
  chatId: string
  title: string
  description?: string
  createdAt: number
  updatedAt: number
  isDeleted: boolean
}

interface ChatAreaProps {
  onNavigate?: (page: string) => void
  currentPage?: string
}

export function ChatArea({ onNavigate, currentPage }: ChatAreaProps) {
  const [chats, setChats] = useState<ChatEntry[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [isLoadingChats, setIsLoadingChats] = useState(true)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newChatTitle, setNewChatTitle] = useState("")
  const [newChatDescription, setNewChatDescription] = useState("")
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [renameChatId, setRenameChatId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState("")
  const [renameDescription, setRenameDescription] = useState("")
  const [isAutoSummarizing, setIsAutoSummarizing] = useState(false)

  const { provider, model, apiKey } = useAIConfigStore()
  const { dataExposurePercentage, setDataExposurePercentage } = useDataExposureStore()
  const { currentWorkspace } = useWorkspace()
  const { toast } = useToast()

  const workspaceContext = useMemo(() => computeWorkspaceContext(currentWorkspace), [currentWorkspace])
  const activeChat = chats.find((c) => c.chatId === activeChatId)

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

  const loadChats = useCallback(async () => {
    if (!currentWorkspace?.id) {
      setIsLoadingChats(false)
      setChats([])
      return
    }

    try {
      const res = await fetch(`/api/ai/chats?workspaceId=${currentWorkspace.id}`)
      if (res.ok) {
        const data = await res.json()
        const loadedChats = data.chats || []
        setChats(loadedChats)
        
        if (loadedChats.length > 0 && !activeChatId) {
          setActiveChatId(loadedChats[0].chatId)
        }
      }
    } catch {
    } finally {
      setIsLoadingChats(false)
    }
  }, [currentWorkspace?.id, activeChatId])

  useEffect(() => {
    loadChats()
  }, [loadChats])

  useEffect(() => {
    async function loadChatHistory() {
      if (!currentWorkspace?.id || !activeChatId) {
        setIsLoadingHistory(false)
        setMessages([])
        return
      }

      setIsLoadingHistory(true)
      try {
        const res = await fetch(`/api/ai/chat/history?workspaceId=${currentWorkspace.id}&chatId=${activeChatId}`)
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
  }, [currentWorkspace?.id, activeChatId])

  useEffect(() => {
    return () => {
      setMessages((prev) => prev.filter((m) => m.id !== "loading"))
      setIsSending(false)
    }
  }, [])

  const canSend = provider === "groq" && !!apiKey && !isSending && !!currentWorkspace?.id && !!activeChatId
  const warning =
    !currentWorkspace?.id
      ? "Select a workspace to start chatting."
      : !activeChatId
        ? "Create or select a chat to start."
        : !apiKey && provider === "groq"
          ? "Add your Groq API key in Settings to enable chat."
          : provider !== "groq"
            ? "Only Groq is supported. Set Groq in Settings."
            : null

  const runFetch = useCallback(
    async (userMessage: string) => {
      if (!currentWorkspace?.id || !activeChatId) {
        setError("No workspace or chat selected")
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
            chatId: activeChatId,
            userMessage,
            workspaceContext,
            provider,
            model,
            apiKey,
            dataExposurePercentage, // UI-based configuration (source of truth)
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

        window.dispatchEvent(new CustomEvent("refreshFiles"))
        loadChats()
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
    [provider, model, apiKey, currentWorkspace?.id, activeChatId, workspaceContext, loadChats],
  )

  const handleSendMessage = (content: string) => {
    // Use crypto.randomUUID() for stable client-side ID generation (prevents hydration mismatch)
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content }
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

  const handleCreateChat = async () => {
    if (!newChatTitle.trim() || !currentWorkspace?.id) return

    setIsCreatingChat(true)
    try {
      const res = await fetch("/api/ai/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          title: newChatTitle.trim(),
          description: newChatDescription.trim() || undefined,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setActiveChatId(data.chat.chatId)
        setNewChatOpen(false)
        setNewChatTitle("")
        setNewChatDescription("")
        await loadChats()
      } else {
        const error = await res.json()
        setError(error.error || "Failed to create chat")
      }
    } catch {
      setError("Failed to create chat")
    } finally {
      setIsCreatingChat(false)
    }
  }

  const handleRenameChat = async () => {
    if (!renameChatId || !renameTitle.trim() || !currentWorkspace?.id) return

    try {
      const res = await fetch(`/api/ai/chats/${renameChatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          title: renameTitle.trim(),
          description: renameDescription.trim() || undefined,
        }),
      })

      if (res.ok) {
        setRenameChatId(null)
        setRenameTitle("")
        setRenameDescription("")
        await loadChats()
      } else {
        const error = await res.json()
        setError(error.error || "Failed to rename chat")
      }
    } catch {
      setError("Failed to rename chat")
    }
  }

  const handleDeleteChat = async (chatId: string) => {
    if (!currentWorkspace?.id) return

    try {
      const res = await fetch(`/api/ai/chats/${chatId}?workspaceId=${currentWorkspace.id}`, {
        method: "DELETE",
      })

      if (res.ok) {
        if (activeChatId === chatId) {
          const remainingChats = chats.filter((c) => c.chatId !== chatId)
          setActiveChatId(remainingChats.length > 0 ? remainingChats[0].chatId : null)
        }
        await loadChats()
      }
    } catch {
      setError("Failed to delete chat")
    }
  }

  const openRenameDialog = (chat: ChatEntry) => {
    setRenameChatId(chat.chatId)
    setRenameTitle(chat.title)
    setRenameDescription(chat.description || "")
  }

  const handleAutoSummarize = useCallback(async () => {
    if (!currentWorkspace?.id || !workspaceContext?.hasDataset) {
      toast({
        title: "Error",
        description: "Please upload a dataset first",
        variant: "destructive",
      })
      return
    }

    // Get the first dataset from workspace (source of truth)
    const firstDataset = currentWorkspace.datasets?.[0]
    if (!firstDataset || !firstDataset.fileName) {
      toast({
        title: "Error",
        description: "No dataset file found in workspace",
        variant: "destructive",
      })
      return
    }

    const datasetId = firstDataset.fileName

    console.log("[handleAutoSummarize] Starting code generation...", {
      workspaceId: currentWorkspace.id,
      datasetId,
      provider,
      model,
      hasApiKey: !!apiKey,
    })

    setIsAutoSummarizing(true)

    try {
      // Call isolated code generation endpoint
      console.log("[handleAutoSummarize] Calling API...")
      const res = await fetch("/api/ai/auto-summarize-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          datasetId,
          provider,
          model,
          apiKey,
          dataExposurePercentage, // UI-based configuration
        }),
      })

      console.log("[handleAutoSummarize] API response status:", res.status)

      const data = await res.json().catch(() => ({ success: false, error: "Failed to parse response" }))
      console.log("[handleAutoSummarize] API response data:", data)

      // Check for success flag (non-blocking error handling)
      if (!res.ok || !data.success) {
        const errorMessage = data.error || `HTTP ${res.status}: Failed to generate code`
        console.error("[handleAutoSummarize] API error:", errorMessage)
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        })
        return // Early return - no throw, no navigation
      }

      console.log("[handleAutoSummarize] Success! Code generated")

      // Store generated code in localStorage (workspace-specific key)
      const storageKey = `ai-generated-code-${currentWorkspace.id}`
      if (data.code) {
        localStorage.setItem(storageKey, data.code)
        // Dispatch event to notify Jupyter page
        window.dispatchEvent(new CustomEvent("aiCodeGenerated", { 
          detail: { workspaceId: currentWorkspace.id, code: data.code } 
        }))
      }

      toast({
        title: "Success",
        description: "AI-generated Python analysis code created! Check Jupyter Notebook section.",
      })
      
      // Navigate to notebook page
      if (onNavigate) {
        console.log("[handleAutoSummarize] Navigating to notebook page")
        onNavigate("notebook")
      }
    } catch (err: any) {
      // Catch any unexpected errors (network, parsing, etc.)
      // NEVER throw - always handle gracefully
      console.error("[handleAutoSummarize] Unexpected error:", err)
      toast({
        title: "Error",
        description: err.message || "Failed to generate code",
        variant: "destructive",
      })
    } finally {
      // LOOP SAFETY: Always resolve loading state (non-blocking guarantee)
      console.log("[handleAutoSummarize] Setting isAutoSummarizing to false")
      setIsAutoSummarizing(false)
    }
  }, [currentWorkspace, workspaceContext?.hasDataset, provider, model, apiKey, toast, onNavigate])

  if (isLoadingChats) {
    return (
      <main className="flex-1 flex flex-col h-screen bg-background">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading chats...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 flex h-screen bg-background">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border space-y-2">
          <Button
            onClick={() => setNewChatOpen(true)}
            className="w-full gap-2"
            size="sm"
            disabled={!currentWorkspace?.id}
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
          <Button
            onClick={handleAutoSummarize}
            className="w-full gap-2"
            size="sm"
            variant="outline"
            disabled={!currentWorkspace?.id || !workspaceContext?.hasDataset || isAutoSummarizing}
          >
            <Sparkles className="w-4 h-4" />
            {isAutoSummarizing ? "Summarizing..." : "Auto Summarize Dataset"}
          </Button>
        </div>

        {/* AI Agent Control Panel - Data Exposure */}
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-primary" />
            <Label className="text-sm font-medium text-foreground">Data Exposure</Label>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Dataset Access</span>
              <span className="text-xs font-medium text-foreground">
                {dataExposurePercentage}%
                {dataExposurePercentage === 100 && (
                  <span className="ml-1 text-xs text-green-600 dark:text-green-400">(Full)</span>
                )}
              </span>
            </div>
            <Slider
              value={[dataExposurePercentage]}
              onValueChange={(value) => setDataExposurePercentage(value[0])}
              min={1}
              max={100}
              step={1}
              className="w-full"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Limited</span>
              <span>Full Access</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Controls how much of your dataset the AI agent can analyze. Higher values provide more comprehensive insights.
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No chats yet. Create one to get started.
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {chats.map((chat) => (
                <div
                  key={chat.chatId}
                  className={cn(
                    "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
                    activeChatId === chat.chatId
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-muted/50",
                  )}
                  onClick={() => setActiveChatId(chat.chatId)}
                >
                  <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{chat.title}</div>
                    {chat.description && (
                      <div className="text-xs text-muted-foreground truncate">{chat.description}</div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="w-6 h-6 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openRenameDialog(chat)}>
                        <Edit2 className="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDeleteChat(chat.chatId)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        {!activeChatId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">Select a chat or create a new one</p>
              <Button onClick={() => setNewChatOpen(true)} disabled={!currentWorkspace?.id}>
                <Plus className="w-4 h-4 mr-2" />
                New Chat
              </Button>
            </div>
          </div>
        ) : (
          <>
            <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{activeChat?.title || "Chat"}</span>
                {activeChat?.description && (
                  <span className="text-xs text-muted-foreground">• {activeChat.description}</span>
                )}
              </div>
              <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                <Download className="w-4 h-4" />
                Export
              </Button>
            </header>

            {isLoadingHistory ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading chat history...</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col relative min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto min-h-0">
                  <ChatMessages messages={messages} onSuggestionClick={handleSuggestionClick} />
                </div>

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
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Chat</DialogTitle>
            <DialogDescription>Give your chat a name to get started.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="chat-title">Chat Name *</Label>
              <Input
                id="chat-title"
                value={newChatTitle}
                onChange={(e) => setNewChatTitle(e.target.value)}
                placeholder="e.g., Data Cleaning Session"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newChatTitle.trim()) {
                    handleCreateChat()
                  }
                }}
              />
            </div>
            <div>
              <Label htmlFor="chat-description">Description (optional)</Label>
              <Textarea
                id="chat-description"
                value={newChatDescription}
                onChange={(e) => setNewChatDescription(e.target.value)}
                placeholder="e.g., Handle missing values and duplicates"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewChatOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateChat} disabled={!newChatTitle.trim() || isCreatingChat}>
              {isCreatingChat ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameChatId} onOpenChange={(open) => !open && setRenameChatId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
            <DialogDescription>Update the chat name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rename-title">Chat Name *</Label>
              <Input
                id="rename-title"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                placeholder="e.g., Data Cleaning Session"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameTitle.trim()) {
                    handleRenameChat()
                  }
                }}
              />
            </div>
            <div>
              <Label htmlFor="rename-description">Description (optional)</Label>
              <Textarea
                id="rename-description"
                value={renameDescription}
                onChange={(e) => setRenameDescription(e.target.value)}
                placeholder="e.g., Handle missing values and duplicates"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameChatId(null)}>
              Cancel
            </Button>
            <Button onClick={handleRenameChat} disabled={!renameTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
