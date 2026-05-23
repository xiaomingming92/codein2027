const BASE_URL = "http://localhost:3000"

interface SseEvent {
  type?: string
  token?: string
  thinking?: { node: string; content: string }
  data?: Record<string, unknown>
  evidence?: Record<string, unknown>
  query?: string
  status?: string
  count?: number
  sources?: Record<string, number>
  nodeName?: string
}

interface CheckResult {
  name: string
  passed: boolean
  detail: string
}

let results: CheckResult[] = []

function pass(name: string, detail: string) {
  results.push({ name, passed: true, detail })
  console.log(`  ✅ ${name}: ${detail}`)
}

function fail(name: string, detail: string) {
  results.push({ name, passed: false, detail })
  console.log(`  ❌ ${name}: ${detail}`)
}

function parseSseEvents(raw: string): SseEvent[] {
  const events: SseEvent[] = []
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue
    const dataStr = line.slice(6)
    if (dataStr === "[DONE]") continue
    try {
      events.push(JSON.parse(dataStr))
    } catch {}
  }
  return events
}

async function fetchStream(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/agent/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`)
  }
  return res.text()
}

async function testStreamingFlow() {
  console.log("\n=== SSE 事件流完整性测试 ===\n")
  const threadId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  console.log("1. 发送请求: 介绍团队协同智能体")
  const raw = await fetchStream({
    messages: [{ role: "user", content: "介绍团队协同智能体" }],
    threadId,
  })
  const events = parseSseEvents(raw)

  pass("HTTP 连接", `收到 ${events.length} 个 SSE 事件`)

  // 事件类型统计
  const typeCount: Record<string, number> = {}
  for (const e of events) {
    const t = e.type || (e.token !== undefined ? "token" : e.thinking ? "thinking" : "unknown")
    typeCount[t] = (typeCount[t] || 0) + 1
  }
  console.log(`  事件类型: ${JSON.stringify(typeCount)}`)

  // 检查必需的事件类型
  const hasStructuredUpdate = events.some(e => e.type === "structured_update")
  const hasToken = events.some(e => e.type === "token" || e.token !== undefined)
  const hasThinking = events.some(e => e.thinking)

  if (hasStructuredUpdate) pass("structured_update", `${typeCount["structured_update"] || 0} 个事件`)
  else fail("structured_update", "未收到 structured_update 事件")

  if (hasToken) pass("token 流", `${typeCount["token"] || 0} 个 token 事件`)
  else fail("token 流", "未收到 token 事件")

  if (hasThinking) pass("thinking 事件", `${typeCount["thinking"] || 0} 个 thinking 事件`)
  else console.log("  ⚠ thinking 事件: 0 (仅 structured_update 模式)")

  // 检查 structured_update 数据字段
  const structuredEvents = events.filter(e => e.type === "structured_update")
  const dataFields = new Set<string>()
  for (const e of structuredEvents) {
    if (e.data) {
      for (const k of Object.keys(e.data)) dataFields.add(k)
    }
  }
  console.log(`  structured_update 包含字段: [${[...dataFields].join(", ")}]`)

  if (dataFields.has("intent")) pass("intent 数据", "structured_update 包含 intent")
  else fail("intent 数据", "structured_update 缺少 intent")

  if (dataFields.has("evidenceChain")) pass("evidenceChain 数据", "structured_update 包含 evidenceChain")
  else fail("evidenceChain 数据", "structured_update 缺少 evidenceChain")

  if (dataFields.has("reasoningPath")) pass("reasoningPath 数据", "structured_update 包含 reasoningPath")
  else fail("reasoningPath 数据", "structured_update 缺少 reasoningPath")

  if (dataFields.has("verdict")) pass("verdict 数据", "structured_update 包含 verdict")
  else fail("verdict 数据", "structured_update 缺少 verdict")

  if (dataFields.has("displayContent")) pass("displayContent 数据", "structured_update 包含 displayContent")
  else fail("displayContent 数据", "structured_update 缺少 displayContent")

  // 检查事件顺序：structured_update 必须在 token 之前
  let firstTokenIdx = events.findIndex(e => e.type === "token" || e.token !== undefined)
  let lastStructuredIdx = -1
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === "structured_update") lastStructuredIdx = i
  }
  if (firstTokenIdx > -1 && lastStructuredIdx > -1 && lastStructuredIdx < firstTokenIdx) {
    pass("事件顺序", `structured_update (#${lastStructuredIdx}) < token (#${firstTokenIdx})`)
  } else if (firstTokenIdx === -1) {
    fail("事件顺序", "未找到 token 事件")
  } else {
    console.log(`  ⚠ 事件顺序: structured_update 的最后位置=#${lastStructuredIdx}, token 的第一个位置=#${firstTokenIdx}`)
  }

  // 检查 token 文本是否非空
  const allTokens = events
    .filter(e => e.type === "token" || e.token !== undefined)
    .map(e => e.content || e.token || "")
    .join("")
  if (allTokens.length > 0) {
    pass("回复内容", `${allTokens.length} 字符: "${allTokens.slice(0, 80)}..."`)
  } else {
    fail("回复内容", "无回复文本")
  }

  console.log("\n=== RAG 检索链路测试 ===\n")

  const ragThreadId = `test-rag-${Date.now()}`
  const ragRaw = await fetchStream({
    messages: [{ role: "user", content: "Agri-Machine 执行智能体 PRD 有哪些重要内容" }],
    threadId: ragThreadId,
  })
  const ragEvents = parseSseEvents(ragRaw)

  const ragSearchEvents = ragEvents.filter(e => e.type === "rag_search")
  const evidenceEvents = ragEvents.filter(e => e.type === "evidence_found")
  const ragResultEvents = ragEvents.filter(e => e.type === "rag_result")

  if (ragSearchEvents.length > 0) pass("rag_search", `${ragSearchEvents.length} 个事件`)
  else fail("rag_search", "未收到 rag_search 事件")

  if (evidenceEvents.length > 0) {
    pass("evidence_found", `${evidenceEvents.length} 条证据`)
    for (const e of evidenceEvents) {
      const ev = e.evidence as Record<string, unknown> | undefined
      if (ev) {
        const rel = typeof ev.relevance === "number" ? ev.relevance : -999
        const src = ev.source as string | undefined
        if (rel < 0) {
          console.log(`  ⚠ evidence relevance 为负: relevance=${rel}, source=${src}`)
        }
      }
    }
  } else {
    fail("evidence_found", "未收到 evidence_found 事件")
  }

  if (ragResultEvents.length > 0) pass("rag_result", `${ragResultEvents.length} 个 sumary 事件`)
  else fail("rag_result", "未收到 rag_result 事件")

  console.log("\n=== 流式 token 输出测试 ===\n")

  const tokThreadId = `test-tok-${Date.now()}`
  const tokRaw = await fetchStream({
    messages: [{ role: "user", content: "你好" }],
    threadId: tokThreadId,
  })
  const tokEvents = parseSseEvents(tokRaw)
  const tokenEvents = tokEvents.filter(e => e.type === "token" || e.token !== undefined)

  if (tokenEvents.length > 1) {
    pass("逐字输出", `${tokenEvents.length} 个 token 事件`)
  } else if (tokenEvents.length === 1) {
    console.log(`  ⚠ 逐字输出: 仅 1 个 token 事件 (可能是一次性输出)`)
  } else {
    fail("逐字输出", "无 token 事件")
  }

  const uniqueTokenContents = new Set(tokenEvents.map(e => e.content || e.token || ""))
  if (uniqueTokenContents.size > 1) {
    pass("token 去重", `${tokenEvents.length} 事件, ${uniqueTokenContents.size} 个不同 content`)
  } else {
    console.log(`  ⚠ token 去重: 所有 token 相同 (可能是增量 vs 全量问题)`)
  }

  console.log("\n=== 总结 ===\n")
  const passed = results.filter(r => r.passed).length
  const total = results.length
  console.log(`通过: ${passed}/${total}`)
  if (passed === total) {
    console.log("🎉 所有检查通过!")
  } else {
    console.log("💥 存在失败项，详见上方标记 ❌ 的行")
  }
  process.exit(passed === total ? 0 : 1)
}

testStreamingFlow().catch(err => {
  console.error("测试失败:", err.message)
  process.exit(1)
})
