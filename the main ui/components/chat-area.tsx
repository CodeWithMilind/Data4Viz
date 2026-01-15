"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatMessages } from "@/components/chat-messages"
import { ChatInput } from "@/components/chat-input"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  suggestions?: string[]
}

const initialMessages: Message[] = [
  {
    id: "1",
    role: "user",
    content: "Show me the top 5 products by revenue",
  },
  {
    id: "2",
    role: "assistant",
    content:
      "Here are the top 5 products by revenue from your dataset:\n\n1. **Premium Widget Pro** — $1,245,890\n2. **Enterprise Suite** — $987,450\n3. **Analytics Dashboard** — $756,320\n4. **Data Connector Plus** — $543,210\n5. **Cloud Storage Basic** — $432,100\n\nThe Premium Widget Pro leads with significantly higher revenue, accounting for approximately 31% of the total top 5 revenue.",
    suggestions: [
      "Show revenue trends over time",
      "Compare Q3 vs Q4 performance",
      "Which regions have the highest sales?",
    ],
  },
]

export function ChatArea() {
  const [messages, setMessages] = useState<Message[]>(initialMessages)

  const handleSendMessage = (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    }

    setMessages((prev) => [...prev, userMessage])

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "I'm analyzing your request. Based on the current dataset, I'll provide insights shortly...\n\nThis is a demo response. In production, this would connect to your data analysis backend.",
        suggestions: ["Show more details", "Export this analysis", "Compare with previous period"],
      }
      setMessages((prev) => [...prev, aiMessage])
    }, 1000)
  }

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion)
  }

  return (
    <main className="flex-1 flex flex-col h-screen bg-background">
      {/* Header */}
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

      {/* Messages */}
      <ChatMessages messages={messages} onSuggestionClick={handleSuggestionClick} />

      {/* Input */}
      <ChatInput onSendMessage={handleSendMessage} />
    </main>
  )
}
