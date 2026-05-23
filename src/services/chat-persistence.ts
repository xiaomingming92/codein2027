import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import {
  chatPersistAudit,
  chatPersistAuditPhaseStart,
  chatPersistAuditPhaseEnd,
} from "@/lib/chat-persistence-logger"
import type { ChainTrace } from "@/lib/agent-chain-tracer"

export type ChatPersistAuditData = {
  startedAt: string
  threadCreated: boolean
  messageCount: number
  chainTraceSaved: boolean
  totalDurationMs: number
  completedAt?: string
  error?: string
}

export class ChatPersistenceService {
  async createThread(userId: string, projectId?: string, intent?: string) {
    chatPersistAudit("THREAD_CREATE", "创建线程", { userId, projectId, intent })
    try {
      const thread = await prisma.chatThread.create({
        data: { userId, projectId: projectId || null, intent: intent || null },
      })
      chatPersistAudit("THREAD_CREATE", "线程创建成功", { threadId: thread.id, userId })
      return thread
    } catch (error) {
      chatPersistAudit("PERSIST_FAIL", "线程创建失败", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async getThread(threadId: string) {
    chatPersistAudit("THREAD_LOAD", "加载线程", { threadId })
    try {
      const thread = await prisma.chatThread.findUnique({
        where: { id: threadId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
      if (thread) {
        chatPersistAudit("THREAD_LOAD", "线程加载成功", {
          threadId,
          messageCount: thread.messages.length,
          title: thread.title,
        })
      } else {
        chatPersistAudit("THREAD_LOAD", "线程不存在", { threadId })
      }
      return thread
    } catch (error) {
      chatPersistAudit("PERSIST_FAIL", "线程加载失败", {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async getThreadsByUser(userId: string) {
    chatPersistAuditPhaseStart("REHYDRATE_LOAD_THREADS", `加载用户线程列表: ${userId}`)
    try {
      const threads = await prisma.chatThread.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          intent: true,
          projectId: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
      })
      chatPersistAuditPhaseEnd("REHYDRATE_LOAD_THREADS", `加载${threads.length}个线程`)
      return threads
    } catch (error) {
      chatPersistAudit("REHYDRATE_FAIL", "线程列表加载失败", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async getThreadMessages(threadId: string) {
    chatPersistAuditPhaseStart("REHYDRATE_LOAD_MESSAGES", `加载线程消息: ${threadId}`)
    try {
      const messages = await prisma.chatMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: "asc" },
      })
      chatPersistAuditPhaseEnd("REHYDRATE_LOAD_MESSAGES", `加载${messages.length}条消息`)
      return messages
    } catch (error) {
      chatPersistAudit("REHYDRATE_FAIL", "消息加载失败", {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async addMessage(
    threadId: string,
    role: "USER" | "ASSISTANT" | "SYSTEM",
    content: string,
    metadata?: unknown,
    traceId?: string
  ) {
    chatPersistAudit("MESSAGE_SAVE_CHUNK", "保存消息", {
      threadId,
      role,
      contentLength: content.length,
      hasMetadata: !!metadata,
      traceId: traceId || null,
    })
    try {
      const message = await prisma.chatMessage.create({
        data: {
          threadId,
          role,
          content,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
          traceId: traceId || null,
        },
      })
      chatPersistAudit("MESSAGE_SAVE_CHUNK", "消息保存成功", {
        messageId: message.id,
        threadId,
        role,
      })
      return message
    } catch (error) {
      chatPersistAudit("PERSIST_FAIL", "消息保存失败", {
        threadId,
        role,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async updateThreadTitle(threadId: string, title: string) {
    chatPersistAudit("THREAD_UPDATE", "更新线程标题", { threadId, title })
    try {
      const thread = await prisma.chatThread.update({
        where: { id: threadId },
        data: { title },
      })
      chatPersistAudit("THREAD_UPDATE", "标题更新成功", { threadId, title })
      return thread
    } catch (error) {
      chatPersistAudit("PERSIST_FAIL", "标题更新失败", {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async deleteThread(threadId: string) {
    chatPersistAudit("THREAD_DELETE", "删除线程", { threadId })
    try {
      await prisma.chatThread.delete({ where: { id: threadId } })
      chatPersistAudit("THREAD_DELETE", "线程删除成功", { threadId })
    } catch (error) {
      chatPersistAudit("PERSIST_FAIL", "线程删除失败", {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async saveChainTrace(threadId: string, chainTrace: ChainTrace) {
    chatPersistAuditPhaseStart("CHAIN_TRACE_SAVE", `保存链路追踪: traceId=${chainTrace.traceId}`)
    try {
      const record = await prisma.chainTraceRecord.create({
        data: {
          threadId,
          traceId: chainTrace.traceId,
          trigger: chainTrace.trigger as Prisma.InputJsonValue,
          nodes: chainTrace.nodes as unknown as Prisma.InputJsonValue,
          evidenceDiff: chainTrace.evidenceChainSnapshot as Prisma.InputJsonValue,
          totalDurationMs: chainTrace.endTime ? chainTrace.endTime - chainTrace.startTime : null,
        },
      })
      chatPersistAuditPhaseEnd("CHAIN_TRACE_SAVE", `链路追踪已保存: ${record.id}`)
      return record
    } catch (error) {
      chatPersistAudit("PERSIST_FAIL", "链路追踪保存失败", {
        threadId,
        traceId: chainTrace.traceId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async saveAuditData(threadId: string, auditData: ChatPersistAuditData) {
    try {
      await prisma.chatThread.update({
        where: { id: threadId },
        data: {
          metadata: {
            lastPersistAudit: auditData,
          },
        },
      })
    } catch (error) {
      chatPersistAudit("PERSIST_FAIL", "审计数据回写失败", {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export const chatPersistence = new ChatPersistenceService()
