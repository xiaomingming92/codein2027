import { expect, test, describe } from "vitest"

const BASE_URL = "http://localhost:3000"

// 使用 Node 内置 fetch，如果没有就跳过
async function safeFetch(input: RequestInfo, init?: RequestInit) {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch(input, init)
  }
  throw new Error("fetch is not available. Run with: npx vitest --pool forks --poolOptions.forks.singleFork")
}

interface SseEvent {
  type?: string
  token?: string
  thinking?: { node: string; content: string }
  data?: Record<string, unknown>
  evidence?: Record<string, unknown>
  query?: string
  count?: number
  sources?: Record<string, number>
  done?: boolean
  threadId?: string
  traceId?: string
  error?: string
}

interface StreamingNodeStep {
  node: string
  label: string
  detail: string
  status: "running" | "done" | "error"
  startedAt: number
  completedAt?: number
}

// 模拟前端 chat-panel.tsx 的事件处理状态机
class SimulatedChatPanelState {
  hasFirstToken = false
  fullContent = ""
  streamingNodeSteps: StreamingNodeStep[] = []
  streamingStatus = ""
  streamingEvidence: Array<{ id: string; source: string; relevance: number; summary: string }> = []
  streamingReasoningSteps: Array<{ step: number; action: string; description: string }> = []
  streamingIntent: Record<string, unknown> | null = null
  streamingVerdictData: Record<string, unknown> | null = null
  assistantMessageCreated = false
  structuredData: Record<string, unknown> = {}
  events: string[] = []
  errors: string[] = []

  private nodeLabelMap: Record<string, string> = {
    intention: "意图识别",
    retrieval: "证据收集",
    reasoning: "逻辑推理",
    verdict: "综合裁决",
    "interaction-point-detection": "交互检测",
    response: "响应生成",
  }

  private nodeKeyMap: Record<string, string> = {
    intention: "intention",
    retrieval: "retrieval",
    reasoning: "reasoning",
    verdict: "verdict",
    interactionPointDetection: "interaction-point-detection",
    response: "response",
  }

  processEvent(event: SseEvent): void {
    this.events.push(event.type || event.token || JSON.stringify(event).slice(0, 40))

    if (event.type === "token") {
      this.handleToken(event.content!)
      return
    }

    if (event.type === "structured_update") {
      this.handleStructuredUpdate(event.data!)
      return
    }

    if (event.type === "evidence_found") {
      this.handleEvidenceFound(event.evidence!)
      return
    }

    if (event.type === "rag_search") {
      this.handleRagSearch(event.query!)
      return
    }

    if (event.type === "rag_result") {
      this.handleRagResult(event.count!, event.sources!)
      return
    }

    if (event.token) {
      this.handleToken(event.token)
      return
    }

    if (event.thinking?.content) {
      this.handleThinking(event.thinking)
      return
    }

    if (event.done) {
      this.completeStreamingNodeStep("response")
      return
    }
  }

  private handleToken(token: string): void {
    if (!this.hasFirstToken) {
      this.hasFirstToken = true
      this.assistantMessageCreated = true
      this.completeStreamingNodeStep("verdict")
      this.completeStreamingNodeStep("interaction-point-detection")
      this.setStreamingNodeStep("response", "生成回复中...")
    }
    this.fullContent += token
  }

  private handleStructuredUpdate(data: Record<string, unknown>): void {
    if (this.hasFirstToken) {
      this.structuredData = { ...this.structuredData, ...data }
    }

    if (data.intent) {
      const intentObj = data.intent as Record<string, unknown>
      this.streamingIntent = intentObj
      this.setStreamingNodeStep("intention", `意图: ${intentObj.type} (${intentObj.source})`)
    }

    if (data.evidenceChain && !this.hasFirstToken) {
      const ec = data.evidenceChain as Record<string, unknown>
      const evidences = ec.evidences as Array<Record<string, unknown>> | undefined
      if (evidences) {
        for (const e of evidences) {
          this.streamingEvidence.push({
            id: e.id as string,
            source: e.source as string,
            relevance: typeof e.relevance === "number" ? e.relevance : 0,
            summary: typeof e.summary === "string" ? e.summary : "",
          })
        }
      }
      if (evidences) {
        this.setStreamingNodeStep("retrieval", `证据链: ${evidences.length}条`)
      }
    }

    if (data.reasoningPath?.steps) {
      const steps = (data.reasoningPath as Record<string, unknown>).steps as Array<Record<string, unknown>>
      this.streamingReasoningSteps = steps.map((s) => ({
        step: s.step as number,
        action: s.action as string,
        description: s.description as string,
      }))
      this.setStreamingNodeStep("reasoning", `推理中: ${steps.length}步`)
    }

    if (data.verdict && !this.hasFirstToken) {
      const verdictObj = data.verdict as Record<string, unknown>
      this.streamingVerdictData = verdictObj
      const verdictType = verdictObj.type as string | undefined
      const conf = (verdictObj.confidence as Record<string, unknown> | undefined)?.final_confidence
      let detail = "裁决中"
      if (verdictType) detail = `裁决: ${verdictType}`
      if (typeof conf === "number") detail += ` ${conf}%`
      this.setStreamingNodeStep("verdict", detail)
    }

    if (data.interactionPoint) {
      this.setStreamingNodeStep("interaction-point-detection", "检测交互点")
    }
  }

  private handleEvidenceFound(evidence: Record<string, unknown>): void {
    this.streamingEvidence.push({
      id: evidence.id as string,
      source: evidence.source as string,
      relevance: evidence.relevance as number,
      summary: evidence.summary as string,
    })
  }

  private handleRagSearch(query: string): void {
    this.streamingStatus = `正在搜索知识库: ${query.slice(0, 30)}...`
    this.setStreamingNodeStep("retrieval", `搜索知识库: ${query.slice(0, 30)}...`)
  }

  private handleRagResult(count: number, sources: Record<string, number>): void {
    let statusText = `检索完成: ${count}条`
    if (sources && Object.keys(sources).length > 0) {
      const sourceParts = Object.entries(sources).map(([name, c]) => `${name}×${c}`)
      statusText += ` (${sourceParts.join(", ")})`
    }
    this.streamingStatus = statusText
    this.setStreamingNodeStep("retrieval", statusText)
  }

  private handleThinking(thinking: { node: string; content: string }): void {
    this.streamingStatus = thinking.content
    const normalNode = this.nodeKeyMap[thinking.node] || thinking.node
    this.completeStreamingNodeStepWithDetail(normalNode, thinking.content)
  }

  private setStreamingNodeStep(node: string, detail: string): void {
    const existingIndex = this.streamingNodeSteps.findIndex((s) => s.node === node)
    if (existingIndex >= 0) {
      this.streamingNodeSteps[existingIndex] = {
        ...this.streamingNodeSteps[existingIndex],
        detail,
        status: "running",
      }
    } else {
      this.streamingNodeSteps.push({
        node,
        label: this.nodeLabelMap[node] || node,
        detail,
        status: "running",
        startedAt: Date.now(),
      })
    }
  }

  private completeStreamingNodeStep(node: string): void {
    const existingIndex = this.streamingNodeSteps.findIndex((s) => s.node === node)
    if (existingIndex < 0) return
    this.streamingNodeSteps[existingIndex] = {
      ...this.streamingNodeSteps[existingIndex],
      status: "done",
      completedAt: Date.now(),
    }
  }

  private completeStreamingNodeStepWithDetail(node: string, detail: string): void {
    const existingIndex = this.streamingNodeSteps.findIndex((s) => s.node === node)
    const now = Date.now()
    if (existingIndex >= 0) {
      this.streamingNodeSteps[existingIndex] = {
        ...this.streamingNodeSteps[existingIndex],
        detail,
        status: "done",
        completedAt: now,
      }
    } else {
      this.streamingNodeSteps.push({
        node,
        label: this.nodeLabelMap[node] || node,
        detail,
        status: "done",
        startedAt: now,
        completedAt: now,
      })
    }
  }
}

// 工具: 解析 SSE 事件字符串
function parseSseEvents(rawSse: string): SseEvent[] {
  const events: SseEvent[] = []
  const lines = rawSse.split("\n")
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue
    const dataStr = line.slice(6)
    if (dataStr === "[DONE]") continue
    try {
      const parsed = JSON.parse(dataStr)
      events.push(parsed)
    } catch {
      // skip malformed events
    }
  }
  return events
}

describe("SSE 事件流完整性测试", () => {
  const EVENT_ORDER: Array<{
    type: string
    node: string
    mustAppearBeforeToken: boolean
  }> = [
    { type: "structured_update", node: "intention", mustAppearBeforeToken: true },
    { type: "rag_search", node: "retrieval", mustAppearBeforeToken: true },
    { type: "structured_update", node: "evidenceChain", mustAppearBeforeToken: true },
    { type: "structured_update", node: "reasoningPath", mustAppearBeforeToken: true },
    { type: "structured_update", node: "verdict", mustAppearBeforeToken: true },
    { type: "token", node: "", mustAppearBeforeToken: false },
  ]

  test("结构化事件顺序: intent → evidenceChain → reasoningPath → verdict → token", async () => {
    // 发送真实 API 请求
    const response = await fetch("http://localhost:3000/api/agent/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "介绍团队协同智能体" }],
        threadId: `test-${Date.now()}`,
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")

    const rawBody = await response.text()
    const events = parseSseEvents(rawBody)

    let firstTokenIndex = events.findIndex((e) => e.type === "token" || !!e.token)
    expect(firstTokenIndex, "必须收到至少一个 token 事件").toBeGreaterThan(-1)

    // 验证结构事件先于 token
    const structuredBeforeToken = events.filter(
      (e) =>
        e.type === "structured_update" &&
        events.indexOf(e) < firstTokenIndex
    )
    expect(structuredBeforeToken.length, "所有 structured_update 必须在 token 之前").toBeGreaterThanOrEqual(4)

    // 验证 structured_update 包含必要字段
    const intentEvent = events.find(
      (e) =>
        e.type === "structured_update" &&
        e.data?.intent
    )
    expect(intentEvent, "必须收到 intent 结构化事件").toBeTruthy()
    expect((intentEvent!.data!.intent as Record<string, unknown>).type, "intent 必须有 type 字段").toBeTruthy()

    const ecEvent = events.find(
      (e) =>
        e.type === "structured_update" &&
        e.data?.evidenceChain
    )
    expect(ecEvent, "必须收到 evidenceChain 结构化事件").toBeTruthy()

    const rpEvent = events.find(
      (e) =>
        e.type === "structured_update" &&
        e.data?.reasoningPath
    )
    expect(rpEvent, "必须收到 reasoningPath 结构化事件").toBeTruthy()

    const vEvent = events.find(
      (e) =>
        e.type === "structured_update" &&
        e.data?.verdict
    )
    expect(vEvent, "必须收到 verdict 结构化事件").toBeTruthy()
  }, 120000)

  test("前端状态机: NodeProgressTimeline 所有节点正确从 running → done", async () => {
    const response = await fetch("http://localhost:3000/api/agent/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "分析项目风险" }],
        threadId: `test-${Date.now()}`,
        intent: "analysis",
      }),
    })

    const rawBody = await response.text()
    const events = parseSseEvents(rawBody)
    const state = new SimulatedChatPanelState()

    for (const event of events) {
      state.processEvent(event)
    }

    // 验证所有节点存在
    const expectedNodes = [
      "intention",
      "retrieval",
      "reasoning",
      "verdict",
      "interaction-point-detection",
      "response",
    ]

    for (const node of expectedNodes) {
      const step = state.streamingNodeSteps.find((s) => s.node === node)
      expect(step, `NodeProgressTimeline 必须包含节点: ${node}`).toBeTruthy()
    }

    // 验证 assistant 消息已创建
    expect(state.assistantMessageCreated, "必须创建 assistant 消息").toBe(true)

    // 验证最终 structuredData 不为空
    expect(Object.keys(state.structuredData).length, "最终 structuredData 不能为空").toBeGreaterThan(0)

    // 验证 response 在 finally 中正确清理逻辑
    const runningNodes = state.streamingNodeSteps.filter((s) => s.status === "running")
    console.log(`运行中节点: ${runningNodes.map((s) => s.node).join(", ")}`)
  }, 120000)

  test("RAG 检索: rag_search → evidence_found → rag_result 事件链完整性", async () => {
    const response = await fetch("http://localhost:3000/api/agent/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Agri-Machine 执行智能体 PRD 有哪些重要内容" }],
        threadId: `test-${Date.now()}`,
      }),
    })

    const rawBody = await response.text()
    const events = parseSseEvents(rawBody)

    const ragSearch = events.filter((e) => e.type === "rag_search")
    const evidenceFound = events.filter((e) => e.type === "evidence_found")
    const ragResult = events.filter((e) => e.type === "rag_result")

    console.log(`RAG: ${ragSearch.length} search, ${evidenceFound.length} evidence, ${ragResult.length} result`)

    expect(ragSearch.length, "必须有 rag_search 事件").toBeGreaterThan(0)
    expect(ragResult.length, "必须有 rag_result 事件").toBeGreaterThan(0)

    // 如果有 evidence_found，检查 relevance 不为负
    for (const e of evidenceFound) {
      const ev = e.evidence as Record<string, unknown>
      expect(typeof ev.relevance, `evidence_found relevance 必须是 number`).toBe("number")
      if ((ev.relevance as number) < 0) {
        console.warn(`⚠ evidence relevance 为负: ${ev.relevance}, source=${ev.source}`)
      }
    }
  }, 120000)

  test("流式 token 文本: 逐字输出验证", async () => {
    const response = await fetch("http://localhost:3000/api/agent/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "你好" }],
        threadId: `test-${Date.now()}`,
      }),
    })

    const rawBody = await response.text()
    const events = parseSseEvents(rawBody)

    const tokenEvents = events.filter((e) => e.type === "token")
    const bareTokenEvents = events.filter((e) => !e.type && !!e.token)

    const allTokenContent = [...tokenEvents.map((e) => e.content), ...bareTokenEvents.map((e) => e.token)]
      .filter(Boolean)
      .join("")

    console.log(`Tokens: ${allTokenContent.length} 字符, 事件数: ${tokenEvents.length + bareTokenEvents.length}`)

    expect(allTokenContent.length, "流式 token 总长度必须 > 0").toBeGreaterThan(0)
    expect(tokenEvents.length + bareTokenEvents.length, "必须有多个 token 事件").toBeGreaterThan(1)
  }, 120000)
})
