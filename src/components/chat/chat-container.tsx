"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, FileText, X, Loader2 } from "lucide-react"
import { QuickActionBar } from "@/components/chat/quick-action-bar"
import { StructuredResponseRenderer } from "@/components/chat/structured-response-renderer"
import { NodeProgressTimeline } from "@/components/chat/node-progress-timeline"
import { cn } from "@/lib/utils"
import { LAYOUT_CONFIG, getChatInputMinHeight, getChatInputMaxHeight } from "@/config/layout-config"
import { useActiveModel } from "@/stores/model-config-store"
import type { PrimaryAction } from "@/components/chat/quick-action-bar"
import type { StructuredAgentResponse } from "@/agents/types"
import type { StreamingEvidence, StreamingReasoningStep, StreamingNodeStep } from "@/stores/chat-store"

interface Message {
  role: "user" | "assistant" | "system"
  content: string
  name?: string
  timestamp?: string
  structuredData?: StructuredAgentResponse
}

interface UploadedFile {
  id: string
  name: string
  type: string
  size: number
  file?: File
}

interface ChatContainerProps {
  messages: Message[]
  onSend: (message: string, files?: UploadedFile[], explicitIntent?: string) => void
  isLoading?: boolean
  activeIntent?: string | null
  onToggleIntent?: (intent: string | null) => void
  streamingEvidence?: StreamingEvidence[]
  streamingReasoningSteps?: StreamingReasoningStep[]
  streamingStatus?: string
  streamingNodeSteps?: StreamingNodeStep[]
  className?: string
}

export function ChatContainer({
  messages,
  onSend,
  isLoading,
  activeIntent,
  onToggleIntent,
  streamingEvidence,
  streamingReasoningSteps,
  streamingStatus,
  streamingNodeSteps,
  className,
}: ChatContainerProps) {
  const enableImageUpload = useActiveModel()?.multimodal ?? false
  const [input, setInput] = React.useState("")
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([])
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const scrollRootRef = React.useRef<HTMLDivElement>(null)

  const scrollToBottom = React.useCallback(() => {
    const root = scrollRootRef.current
    if (!root) return
    const viewport = root.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [])

  React.useEffect(() => {
    scrollToBottom()
  }, [messages, streamingEvidence, streamingReasoningSteps, isLoading, scrollToBottom])

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      const minHeight = getChatInputMinHeight()
      const maxHeight = getChatInputMaxHeight()
      const scrollHeight = textarea.scrollHeight
      const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight))
      textarea.style.height = newHeight + "px"
    }
  }

  React.useEffect(() => {
    adjustTextareaHeight()
  }, [input])

  const handleSend = (explicitIntent?: string) => {
    if ((input.trim() || uploadedFiles.length > 0) && !isLoading) {
      onSend(input.trim(), uploadedFiles, explicitIntent)
      setInput("")
      setUploadedFiles([])
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = (files: FileList) => {
    const newFiles: UploadedFile[] = Array.from(files).map((file, index) => ({
      id: `file-${Date.now()}-${index}`,
      name: file.name,
      type: file.type,
      size: file.size,
      file: file,
    }))
    setUploadedFiles((prev) => [...prev, ...newFiles])
  }

  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const handlePrimaryAction = (action: PrimaryAction) => {
    if (activeIntent === action.intent) {
      if (isLoading) {
        return
      }
      onToggleIntent?.(null)
      return
    }

    onToggleIntent?.(action.intent)
    setInput(action.prompt)
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
    setTimeout(() => {
      handleSend(action.intent)
    }, 50)
  }

  return (
    <div className={cn("flex flex-col min-h-0", className)}>
      <ScrollArea ref={scrollRootRef} className="flex-1 mb-4 pd-4">
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-4 py-2",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {msg.role === "assistant" && msg.structuredData ? (
                  <StructuredResponseRenderer data={msg.structuredData} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          {isLoading && messages.length > 0 && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg bg-muted px-4 py-3 space-y-3">
                {streamingNodeSteps && streamingNodeSteps.length > 0 && (
                  <NodeProgressTimeline steps={streamingNodeSteps} />
                )}
                {(!streamingNodeSteps || streamingNodeSteps.length === 0) && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <p className="text-sm text-foreground/80">
                      {streamingStatus || "思考中..."}
                    </p>
                  </div>
                )}
                {streamingStatus && streamingNodeSteps && streamingNodeSteps.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-pulse" />
                    <p className="text-[12px] text-foreground/70">
                      {streamingStatus}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="bg-muted/50 rounded-lg p-3 space-y-3 shadow-sm border">
        {uploadedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-1 bg-background rounded px-2 py-1 text-xs border"
              >
                <FileText className="h-3 w-3" />
                <span className="truncate max-w-[120px]">{file.name}</span>
                <button
                  onClick={() => removeFile(file.id)}
                  className="text-muted-foreground hover:text-foreground ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <QuickActionBar
          onPrimaryAction={handlePrimaryAction}
          onFileSelect={(files) => {
            handleFileSelect(files)
          }}
          activeIntent={activeIntent}
          isStreaming={isLoading}
          onToggleIntent={onToggleIntent}
          enableImageUpload={enableImageUpload}
        />

        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入您的问题... (Ctrl+Enter 发送)"
            disabled={isLoading}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            rows={LAYOUT_CONFIG.chatInput.minRows}
          />
          <Button
            onClick={() => handleSend()}
            disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}
            size="icon"
            className="h-10 w-10 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
