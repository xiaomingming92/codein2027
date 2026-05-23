"use client"

import type { ThreadStats } from "@/stores/chat-store"

interface ChatStatsProps {
  stats: ThreadStats
}

export function ChatStats({ stats }: ChatStatsProps) {
  const totalTokens = stats.estimatedInputTokens + stats.estimatedOutputTokens

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span title="累计 Token 消耗">
        Token: {totalTokens.toLocaleString()}
      </span>
      <span className="text-muted-foreground/40">·</span>
      <span title="当前上下文大小">
        当前上下文大小: {stats.contextWindowTokens.toLocaleString()}
      </span>
      <span className="text-muted-foreground/40">·</span>
      <span title="消息累计轮数">
        消息累计轮数: {stats.messageCount} 轮
      </span>
    </div>
  )
}
