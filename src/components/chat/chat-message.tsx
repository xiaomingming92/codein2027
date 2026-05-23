"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { StructuredResponseRenderer } from "@/components/chat/structured-response-renderer"
import type { StructuredAgentResponse } from "@/agents/types"

interface ChatMessageProps {
  role: "user" | "assistant" | "system"
  content: string
  name?: string
  timestamp?: string
  structuredData?: StructuredAgentResponse
  className?: string
}

export function ChatMessage({
  role,
  content,
  name,
  timestamp,
  structuredData,
  className,
}: ChatMessageProps) {
  const isUser = role === "user"

  if (role === "assistant" && structuredData) {
    return (
      <div
        className={cn(
          "flex",
          "justify-start",
          className
        )}
      >
        <div
          className={cn(
            "max-w-[80%] rounded-lg px-4 py-2",
            "bg-muted"
          )}
        >
          {name && (
            <div className="text-xs font-semibold mb-1 opacity-70">
              {name}
            </div>
          )}
          <StructuredResponseRenderer data={structuredData} />
          {timestamp && (
            <div className="text-xs opacity-50 mt-1">
              {new Date(timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex",
        isUser ? "justify-end" : "justify-start",
        className
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        )}
      >
        {name && (
          <div className="text-xs font-semibold mb-1 opacity-70">
            {name}
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap">{content}</p>
        {timestamp && (
          <div className="text-xs opacity-50 mt-1">
            {new Date(timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  )
}
