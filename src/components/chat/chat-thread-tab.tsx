"use client"

import * as React from "react"
import { useChatStore } from "@/stores/chat-store"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"

const MAX_TITLE_LENGTH = 50

function ThreadTab({
  title,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  title: string
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (newTitle: string) => void
}) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [editValue, setEditValue] = React.useState(title)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(title)
    setIsEditing(true)
  }

  const handleSave = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== title) {
      onRename(trimmed.slice(0, MAX_TITLE_LENGTH))
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSave()
    } else if (e.key === "Escape") {
      setEditValue(title)
      setIsEditing(false)
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={onSelect}
        className={cn(
          "group inline-flex items-center gap-1 h-8 px-3 pl-4 text-xs font-medium transition-all duration-200",
          "clip-path-[polygon(0_0,_calc(100%_-_14px)_0,_100%_14px,_100%_100%,_0_100%)]",
          !isActive
            ? [
                "bg-background text-foreground",
                "border border-border",
                "shadow-sm",
              ].join(" ")
            : [
                "bg-muted/60 text-muted-foreground",
                "border border-border/60",
                "hover:bg-muted/80 hover:text-foreground",
              ].join(" ")
        )}
        title={isEditing ? undefined : title}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value.slice(0, MAX_TITLE_LENGTH))}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="h-5 w-[120px] bg-background border border-border rounded px-1 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <span
            className="truncate max-w-[120px] select-none"
            onDoubleClick={handleDoubleClick}
          >
            {title}
          </span>
        )}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation()
              onDelete()
            }
          }}
          className={cn(
            "shrink-0 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
            "hover:bg-destructive/20 hover:text-destructive",
            "focus:opacity-100 focus:outline-none"
          )}
        >
          <X className="h-3 w-3" />
        </span>
      </button>
    </div>
  )
}

export function ChatThreadTab() {
  const threads = useChatStore((s) => s.threads)
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  const createThread = useChatStore((s) => s.createThread)
  const switchThread = useChatStore((s) => s.switchThread)
  const deleteThread = useChatStore((s) => s.deleteThread)
  const updateThreadTitle = useChatStore((s) => s.updateThreadTitle)

  const handleCreate = () => {
    createThread()
  }

  return (
    <div className="flex items-end">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCreate}
        className="h-8 px-2 shrink-0 text-muted-foreground hover:text-foreground mb-0"
        title="新对话"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>

      <ScrollArea className="flex-1">
        <div className="flex items-end gap-0.5">
          {threads.map((thread) => (
            <ThreadTab
              key={thread.id}
              title={thread.title}
              isActive={thread.id === activeThreadId}
              onSelect={() => switchThread(thread.id)}
              onDelete={() => deleteThread(thread.id)}
              onRename={(newTitle) => updateThreadTitle(thread.id, newTitle)}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
