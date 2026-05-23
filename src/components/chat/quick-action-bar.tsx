"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Target, ClipboardList, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { FileUploadButton } from "@/components/chat/file-upload-button"

interface PrimaryAction {
  id: string
  label: string
  icon: React.ReactNode
  intent: string
  prompt: string
  tooltip: string
}

const PRIMARY_ACTIONS: PrimaryAction[] = [
  {
    id: "analyze",
    label: "分析",
    icon: <Target className="h-4 w-4" />,
    intent: "analysis",
    prompt: "请帮我分析当前情况，给出详细评估",
    tooltip: "全面分析当前情况，基于知识库进行深度推理",
  },
  {
    id: "plan",
    label: "规划",
    icon: <ClipboardList className="h-4 w-4" />,
    intent: "planning",
    prompt: "请帮我制定一个详细的执行计划",
    tooltip: "为目标制定执行计划，自动检测权衡点",
  },
]

interface QuickActionBarProps {
  onPrimaryAction?: (action: PrimaryAction) => void
  onFileSelect?: (files: FileList) => void
  activeIntent?: string | null
  isStreaming?: boolean
  onToggleIntent?: (intent: string | null) => void
  enableImageUpload?: boolean
  className?: string
}

export function QuickActionBar({
  onPrimaryAction,
  onFileSelect,
  activeIntent,
  isStreaming,
  onToggleIntent,
  enableImageUpload = false,
  className,
}: QuickActionBarProps) {
  const handlePrimaryClick = (action: PrimaryAction) => {
    if (activeIntent === action.intent) {
      if (isStreaming) {
        return
      }
      onToggleIntent?.(null)
      return
    }

    onToggleIntent?.(action.intent)
    onPrimaryAction?.(action)
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex items-center gap-2">
          {PRIMARY_ACTIONS.map((action) => {
            const isActive = activeIntent === action.intent
            const isBusy = isActive && isStreaming

            return (
              <Tooltip key={action.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={isActive ? "default" : "secondary"}
                    size="default"
                    className={cn(
                      "h-8 px-3 text-sm cursor-pointer font-medium transition-all duration-200",
                      isActive && "ring-2 ring-primary/30 shadow-md",
                      isBusy && "animate-pulse"
                    )}
                    onClick={() => handlePrimaryClick(action)}
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      action.icon
                    )}
                    <span className="ml-1.5">{action.label}</span>
                    {isActive && !isBusy && (
                      <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary-foreground/70 inline-block" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px]">
                  <p className="text-xs">
                    {isBusy
                      ? `${action.label}正在进行中，无法取消`
                      : isActive
                      ? `点击取消${action.label}模式`
                      : action.tooltip}
                  </p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        <div className="w-px h-5 bg-border" />

        {onFileSelect && (
          <div className="flex items-center gap-1">
            <FileUploadButton
              type="doc"
              onFileSelect={onFileSelect}
            />
            {enableImageUpload && (
              <FileUploadButton
                type="image"
                onFileSelect={onFileSelect}
              />
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

export type { PrimaryAction }
