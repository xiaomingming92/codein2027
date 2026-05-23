"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Paperclip, ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileUploadButtonProps {
  type: "doc" | "image"
  onFileSelect: (files: FileList) => void
  className?: string
}

export function FileUploadButton({ type, onFileSelect, className }: FileUploadButtonProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const accept = type === "image" ? "image/*" : ".pdf,.doc,.docx,.txt,.md"
  const icon = type === "image" ? <ImageIcon className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />

  return (
    <div className={cn("inline-flex", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 cursor-pointer"
        onClick={() => inputRef.current?.click()}
      >
        {icon}
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            onFileSelect(e.target.files)
          }
        }}
        accept={accept}
      />
    </div>
  )
}
