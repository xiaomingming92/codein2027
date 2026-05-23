"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

interface StreamingMessageProps {
  content: string
  isStreaming?: boolean
  className?: string
}

export function StreamingMessage({
  content,
  isStreaming,
  className,
}: StreamingMessageProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2",
        className
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2 bg-muted"
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{content}</p>
        {isStreaming && (
          <span className="inline-block ml-1 animate-pulse">▊</span>
        )}
      </div>
      {isStreaming && (
        <Loader2 className="h-4 w-4 animate-spin mt-2 text-muted-foreground" />
      )}
    </div>
  )
}
