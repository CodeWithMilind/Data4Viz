"use client"

import { useEffect, useRef } from "react"
import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Message } from "@/components/chat-area"

interface ChatMessagesProps {
  messages: Message[]
  onSuggestionClick: (suggestion: string) => void
}

export function ChatMessages({ messages, onSuggestionClick }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.map((message) => (
          <div key={message.id} className={cn("flex gap-4", message.role === "user" ? "justify-end" : "justify-start")}>
            {message.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-accent-foreground" />
              </div>
            )}

            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3",
                message.role === "user"
                  ? "bg-chat-user text-chat-user-foreground"
                  : "bg-chat-ai text-chat-ai-foreground",
              )}
            >
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {message.content.split("\n").map((line, i) => {
                  // Handle bold text
                  const parts = line.split(/(\*\*[^*]+\*\*)/g)
                  return (
                    <span key={i}>
                      {parts.map((part, j) => {
                        if (part.startsWith("**") && part.endsWith("**")) {
                          return <strong key={j}>{part.slice(2, -2)}</strong>
                        }
                        return part
                      })}
                      {i < message.content.split("\n").length - 1 && <br />}
                    </span>
                  )
                })}
              </div>

              {/* Suggestions */}
              {message.role === "assistant" && message.suggestions && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {message.suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => onSuggestionClick(suggestion)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border bg-background text-foreground hover:bg-secondary transition-colors duration-200"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {message.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-primary-foreground">JD</span>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
