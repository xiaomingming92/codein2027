import { prisma } from "@/lib/prisma"
import { ANALYSIS_EXPERTS } from "@/agents/experts/registry"
import type { AnalysisExpert } from "@/agents/experts/registry"

export interface StrategicActiveExpert {
  expertId: string
  activatedAt: string
}

export interface RuntimeInputEntry {
  value: string
  label: string
}

export interface AnalysisTurnRecord {
  turn: number
  intent: string
  thinkingLevel: string
  strategyDescriptorId: string
  activeExpertIds: string[]
  verdictConfidence: number | null
  evidenceCount: number
  followUpCount: number
  followedUpFromTurn: number | null
  timestamp: string
}

export interface AnalysisContext {
  threadId: string
  activeExperts: StrategicActiveExpert[]
  runtimeInputs: Record<string, RuntimeInputEntry>
  turnHistory: AnalysisTurnRecord[]
  totalTurns: number
  updatedAt: string
}

type ChatThreadMetadata = Record<string, unknown>

function createDefaultContext(threadId: string): AnalysisContext {
  return {
    threadId,
    activeExperts: [],
    runtimeInputs: {},
    turnHistory: [],
    totalTurns: 0,
    updatedAt: new Date().toISOString(),
  }
}

function isAnalysisContext(value: unknown): value is AnalysisContext {
  if (!value || typeof value !== "object") return false
  const ctx = value as Record<string, unknown>
  return (
    typeof ctx.threadId === "string" &&
    Array.isArray(ctx.activeExperts) &&
    typeof ctx.runtimeInputs === "object" &&
    Array.isArray(ctx.turnHistory) &&
    typeof ctx.totalTurns === "number" &&
    typeof ctx.updatedAt === "string"
  )
}

export async function getAnalysisContext(threadId: string): Promise<AnalysisContext> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: { metadata: true },
  })

  if (!thread) {
    return createDefaultContext(threadId)
  }

  const metadata = thread.metadata as ChatThreadMetadata | null
  if (!metadata) {
    return createDefaultContext(threadId)
  }

  const rawContext = metadata.analysisContext
  if (isAnalysisContext(rawContext)) {
    return rawContext
  }

  return createDefaultContext(threadId)
}

export async function saveAnalysisContext(threadId: string, context: AnalysisContext): Promise<void> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: { metadata: true },
  })

  const existingMetadata = (thread?.metadata as ChatThreadMetadata | null) ?? {}

  await prisma.chatThread.update({
    where: { id: threadId },
    data: {
      metadata: JSON.parse(
        JSON.stringify({
          ...existingMetadata,
          analysisContext: context,
        })
      ),
    },
  })
}

export function getExpert(expertId: string): AnalysisExpert | undefined {
  return ANALYSIS_EXPERTS[expertId]
}

export function activateExpert(ctx: AnalysisContext, expertId: string): AnalysisContext {
  const expert = getExpert(expertId)
  if (!expert) {
    console.warn(`[ANALYSIS-CONTEXT] 无效 expertId: "${expertId}"，不在 ANALYSIS_EXPERTS 注册表中，静默忽略`)
    return ctx
  }

  const alreadyActive = ctx.activeExperts.some((item) => item.expertId === expertId)
  if (alreadyActive) {
    return ctx
  }

  return {
    ...ctx,
    activeExperts: [
      ...ctx.activeExperts,
      { expertId, activatedAt: new Date().toISOString() },
    ],
    updatedAt: new Date().toISOString(),
  }
}

export function deactivateExpert(ctx: AnalysisContext, expertId: string): AnalysisContext {
  return {
    ...ctx,
    activeExperts: ctx.activeExperts.filter((item) => item.expertId !== expertId),
    updatedAt: new Date().toISOString(),
  }
}

export function updateRuntimeInput(
  ctx: AnalysisContext,
  key: string,
  value: string,
  label: string
): AnalysisContext {
  return {
    ...ctx,
    runtimeInputs: {
      ...ctx.runtimeInputs,
      [key]: { value, label },
    },
    updatedAt: new Date().toISOString(),
  }
}

export function appendTurnRecord(ctx: AnalysisContext, record: AnalysisTurnRecord): AnalysisContext {
  const nextTurn = ctx.totalTurns + 1
  return {
    ...ctx,
    totalTurns: nextTurn,
    turnHistory: [
      ...ctx.turnHistory,
      { ...record, turn: nextTurn },
    ],
    updatedAt: new Date().toISOString(),
  }
}
