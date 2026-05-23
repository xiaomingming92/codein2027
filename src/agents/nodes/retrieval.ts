import { AgentState } from "../state"
import { searchKnowledgeDocuments } from "@/services/knowledge-indexer"
import { agentAudit, agentAuditRetrieval, agentAuditNodeError } from "@/lib/agent-audit-logger"
import { getActiveTracer } from "@/agents"
import { NodeStreamController } from "@/agents/node-stream-controller"
import { randomUUID } from "crypto"

export async function retrievalNode(state: typeof AgentState.State) {
  const { currentTask, project } = state
  const stream = NodeStreamController.fromState(state, "retrieval")
  stream.nodeStarted()
  const traceId = stream.traceId

  const evidenceChain = [...(state.evidenceChain || [])]

  if (traceId) {
    const tracer = getActiveTracer(traceId)
    if (tracer) {
      tracer.setEvidenceBefore(
        evidenceChain.map(e => ({ id: e.id, source: e.source }))
      )
    }
  }

  if (project) {
    evidenceChain.push({
      id: `e_proj_${randomUUID().substring(0, 8)}`,
      source: "project_context",
      type: "context",
      content: JSON.stringify(project),
      reliability: 0.9,
      relevance: 1.0,
      timestamp: new Date().toISOString(),
      metadata: { projectId: project.id },
      expandable: true,
    })
  }

  if (currentTask?.query) {
    try {
      stream.ragSearch(currentTask.query)

      const knowledgeResults = await searchKnowledgeDocuments(currentTask.query, 5)

      if (knowledgeResults.length === 0) {
        agentAuditRetrieval(currentTask.query, 0, evidenceChain.length)
        agentAudit("RAG_EMPTY", "知识库无相关文档", {
          query: currentTask.query,
          suggestion: "请先同步知识库或检查 sourceType 过滤条件",
        })
        evidenceChain.push({
          id: `e_empty_${randomUUID().substring(0, 8)}`,
          source: "knowledge_empty",
          type: "warning",
          content: "知识库中未找到相关文档，建议先同步知识库",
          reliability: 0.0,
          relevance: 0.0,
          timestamp: new Date().toISOString(),
          metadata: { warning: true },
          expandable: false,
        })
      } else {
        agentAuditRetrieval(currentTask.query, knowledgeResults.length, evidenceChain.length + knowledgeResults.length)

        const isFullDocumentRequest = /查看|显示|展示|完整|全文|全量|打开|阅读/.test(currentTask.query || "")

        for (const result of knowledgeResults) {
          const documentName = (result.metadata?.name as string) || (result.metadata?.fileName as string) || "未知文档"
          const evidenceId = `e_know_${randomUUID().substring(0, 8)}`
          evidenceChain.push({
            id: evidenceId,
            source: "knowledge",
            type: isFullDocumentRequest ? "full_document" : "document_chunk",
            content: result.content,
            reliability: 0.85,
            relevance: result.relevance,
            timestamp: new Date().toISOString(),
            metadata: {
              ...result.metadata,
              documentName,
              distance: result.distance,
              isFullDocumentRequest,
            },
            expandable: true,
            detailUrl: result.metadata?.sourceUrl as string | undefined,
          })

          stream.evidenceFound({
            id: evidenceId,
            source: "knowledge",
            type: isFullDocumentRequest ? "full_document" : "document_chunk",
            relevance: result.relevance,
            summary: result.content.slice(0, 120),
          })
        }
      }

      stream.ragResult(
        knowledgeResults.length,
        evidenceChain.filter(e => e.source === "knowledge").reduce<Record<string, number>>((acc, e) => {
          const s = (e.metadata?.documentName as string) || "knowledge"
          acc[s] = (acc[s] || 0) + 1
          return acc
        }, {}),
      )
    } catch (error) {
      agentAuditNodeError("retrieval", error, { phase: "knowledge_search" })
      console.error("Knowledge search failed:", error)
    }
  }

  if (currentTask?.entities?.keywords) {
    const keywords = currentTask.entities.keywords as string[]
    evidenceChain.push({
      id: `e_kw_${randomUUID().substring(0, 8)}`,
      source: "keywords",
      type: "extracted",
      content: keywords.join(", "),
      reliability: 0.7,
      relevance: 0.6,
      timestamp: new Date().toISOString(),
      metadata: { keywords },
      expandable: false,
    })
  }

  if (currentTask?.entities?.multimodal) {
    const multimodal = currentTask.entities.multimodal as {
      hasImage: boolean
      hasAudio: boolean
    }
    if (multimodal.hasImage || multimodal.hasAudio) {
      evidenceChain.push({
        id: `e_mm_${randomUUID().substring(0, 8)}`,
        source: "multimodal",
        type: "media",
        content: `用户输入包含${multimodal.hasImage ? "图片" : ""}${multimodal.hasAudio ? "音频" : ""}内容`,
        reliability: 0.6,
        relevance: 0.5,
        timestamp: new Date().toISOString(),
        metadata: multimodal,
        expandable: false,
      })
    }
  }

  if (traceId) {
    const tracer = getActiveTracer(traceId)
    if (tracer) {
      tracer.recordEvidenceDiff(
        evidenceChain.map(e => ({ id: e.id, source: e.source }))
      )
    }
  }

  const totalScore = evidenceChain.reduce((sum, e) => sum + e.reliability * e.relevance, 0)
  const sourceBreakdown: Record<string, number> = {}
  for (const e of evidenceChain) {
    sourceBreakdown[e.source] = (sourceBreakdown[e.source] || 0) + 1
  }

  const structuredEvidenceChain = {
    evidences: evidenceChain.map((e) => ({
      id: e.id,
      source: e.source,
      type: e.type,
      relevance: e.relevance,
      summary: e.content.slice(0, 100),
    })),
    totalScore,
    sourceBreakdown,
  }

  stream.structuredOutput({ evidenceChain: structuredEvidenceChain })

  return {
    evidenceChain,
    retrievalContext: {
      documents: evidenceChain.filter((e) => e.source === "knowledge"),
      tasks: [],
      economic: [],
    },
  }
}
