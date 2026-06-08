# ADD 范式案例参考与实施计划

> **范式定义位置**：ADD 范式的核心原则和开发工作流已分散到三个层级：
> - **强制层**：`.ai/rules/project_rules.md` — ADD-0 到 ADD-6 作为不可违反的约束
> - **引导层**：`.ai/skills/add-paradigm/SKILL.md` — Step 0 到 Step 6（含 Step 3.5 AI 合规检查）完整工作流
> - **参考层**：本文件 — RAG 案例、聊天持久化/ChainTracer/RAG 修复的实施计划

---

## 范式边界与桥接

### ADD 是开发阶段编程范式

ADD 的反馈闭环消费者是 **IDE 中的 AI 助手 + 编程人员**，不是运行时组件。

```
开发阶段（ADD 范式）                 运行时（裁决层范式）
──────────────────                  ──────────────────
消费者：AI 助手 + 程序员             消费者：UI 组件 + 其他服务
反馈闭环：审计数据 → AI 调整策略     反馈闭环：裁决结果 → 能力对象 → 组件渲染
             → 程序员调整方向
```

### 开发阶段到运行时的桥接

ADD 产出的 AuditPhase 枚举天然可桥接到运行时状态定义：

| ADD 产出 | 桥接到运行时 |
|----------|-------------|
| AuditPhase 枚举（Step 0） | 裁决层的业务状态枚举 |
| auditPhaseStart/End（Step 2） | 裁决层的状态迁移规则 |
| 审计数据的结构化 extra（Step 2） | 裁决层的能力对象属性 |

桥接是**后续步骤**，不在 ADD 当前范围内。先通过 ADD 在开发阶段验证业务状态的完整性，再将验证过的状态定义迁移到裁决层。

---

## 一、范式起源：RAG 索引的可审计开发历程

### 1.1 迭代收敛过程

RAG 索引系统经历了以下多轮审计驱动的迭代收敛：

```
第0轮：无审计
  → 用户报告"同步按钮不工作"
  → 开发者无法判断"点击后到底发生了什么"
  → 完全黑箱，只能猜测

第1轮：植入审计日志
  → 定义 AuditPhase 枚举（SYNC_START/SCAN/DETECT_CHANGES/PHASE_*/VECTORIZE_*）
  → 每个阶段植入 auditPhaseStart/auditPhaseEnd 对称标记
  → 审计数据暴露：9个文档全部因 Unique constraint failed 而失败
  → 根因：ChromaDB 认证失败导致首次同步未执行向量化

第2轮：修复 ChromaDB 认证
  → 创建 DirectChromaClient 绕过 LangChain SDK 的认证缺陷
  → 审计数据验证：9个文档全部成功向量化
  → 但发现：status 映射 API/前端不一致

第3轮：统一状态常量
  → 创建 DOC_STATUS/SOURCE_TYPE 统一常量
  → 审计数据验证：状态映射一致
  → 但发现：最后一个文档卡在"处理中"

第4轮：细化审计粒度到 chunk 级
  → 添加 VECTORIZE_CHUNK 阶段，记录每个块的 token 数和耗时
  → 添加 VECTORIZE_FAIL 阶段，记录失败详情
  → 审计数据暴露：卡死文档的向量化过程在某块中断
  → 修复后：审计数据验证所有块都完成

第5轮：审计数据回写数据库
  → 将 lastSyncAudit 写入 Document.metadata
  → 形成闭环：日志用于实时调试，数据库用于历史查询
  → 前端可展示"上次同步耗时/token数/向量数"
```

### 1.2 六个核心模式与 ADD 原则的映射

| 迭代中提取的模式 | 对应 ADD 原则 | 在 RAG 中的具体体现 |
|------------------|---------------|---------------------|
| 先审计，后修复 | ADD-1 | 第1轮先植审计，才发现 Unique constraint failed |
| 阶段标记对称 | ADD-2 | PHASE_ADDED 开始(9个) vs 结束(0个成功) → 9个失败 |
| 最小可观测单元 | ADD-3 | 第4轮细化到 VECTORIZE_CHUNK，定位到卡死的具体块 |
| 双通道输出 + 结构化 Extra | ADD-4 | console + file + DB 三通道，extra 含 tokens/duration |
| 审计数据回写数据库 | ADD-5 | lastSyncAudit 写入 Document.metadata |
| 失败路径等价审计 | ADD-6 | VECTORIZE_FAIL 包含 duration_ms + tokens_processed |

---

## 二、按照 ADD 范式实施聊天持久化

### Step 0：定义审计阶段

```typescript
type ChatPersistencePhase =
  | "PERSIST_START"
  | "THREAD_CREATE"
  | "THREAD_LOAD"
  | "THREAD_UPDATE"
  | "THREAD_DELETE"
  | "MESSAGE_SAVE"
  | "MESSAGE_SAVE_CHUNK"
  | "CHAIN_TRACE_SAVE"
  | "PERSIST_DONE"
  | "PERSIST_FAIL"
  | "REHYDRATE_START"
  | "REHYDRATE_LOAD_THREADS"
  | "REHYDRATE_LOAD_MESSAGES"
  | "REHYDRATE_DONE"
  | "REHYDRATE_FAIL"
```

### Step 1：审计基础设施

**1.1 新建 `src/lib/chat-persistence-logger.ts`**

与 `audit-logger.ts`（KB审计）和 `agent-audit-logger.ts`（Agent审计）同构：

```typescript
import * as fs from "fs/promises"
import * as path from "path"

const PREFIX = "[CHAT-PERSIST]"

const LOG_DIR = process.env.CHAT_PERSIST_LOG_DIR || path.join(process.cwd(), "logs", "chat-persistence")
const LOG_FILE = process.env.CHAT_PERSIST_LOG_FILE || "chat-persist.log"
const ENABLE_FILE_LOG = process.env.CHAT_PERSIST_ENABLE_FILE_LOG === "true" || process.env.NODE_ENV === "development"

type ChatPersistencePhase =
  | "PERSIST_START" | "THREAD_CREATE" | "THREAD_LOAD" | "THREAD_UPDATE" | "THREAD_DELETE"
  | "MESSAGE_SAVE" | "MESSAGE_SAVE_CHUNK" | "CHAIN_TRACE_SAVE"
  | "PERSIST_DONE" | "PERSIST_FAIL"
  | "REHYDRATE_START" | "REHYDRATE_LOAD_THREADS" | "REHYDRATE_LOAD_MESSAGES"
  | "REHYDRATE_DONE" | "REHYDRATE_FAIL"

// 双通道输出：console + file
// 格式：[CHAT-PERSIST] [ISO时间] [阶段] 详情 | {JSON extra}
// 与 KB-AUDIT 和 AGENT-AUDIT 完全同构
```

**1.2 修正 Prisma Schema**

```prisma
model ChatThread {
  id          String   @id @default(cuid())
  title       String   @default("新对话")
  projectId   String?
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  intent      String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  messages    ChatMessage[]
  chainTraces ChainTraceRecord[]
}

model ChatMessage {
  id          String      @id @default(cuid())
  threadId    String
  thread      ChatThread  @relation(fields: [threadId], references: [id], onDelete: Cascade)
  role        MessageRole
  content     String
  attachments String[]
  metadata    Json?
  traceId     String?
  createdAt   DateTime    @default(now())
}

model ChainTraceRecord {
  id                String      @id @default(cuid())
  threadId          String
  thread            ChatThread  @relation(fields: [threadId], references: [id], onDelete: Cascade)
  traceId           String      @unique
  trigger           Json
  nodes             Json
  evidenceDiff      Json
  worldLineSnapshots Json
  modelParamSnapshots Json
  totalDurationMs   Int?
  createdAt         DateTime    @default(now())
}
```

**1.3 新建 `src/services/chat-persistence.ts`**

每个方法都植入审计点（Step 2 的内容直接在实现中完成）：

```typescript
export class ChatPersistenceService {
  async createThread(userId: string, projectId?: string) {
    chatPersistAudit("THREAD_CREATE", "创建线程", { userId, projectId })
    try {
      const thread = await prisma.chatThread.create({ data: { userId, projectId } })
      chatPersistAudit("THREAD_CREATE", "线程创建成功", { threadId: thread.id, userId })
      return thread
    } catch (error) {
      chatPersistAudit("PERSIST_FAIL", "线程创建失败", { userId, error: String(error) })
      throw error
    }
  }

  async addMessage(threadId: string, role: string, content: string, metadata?: unknown, traceId?: string) {
    chatPersistAudit("MESSAGE_SAVE_CHUNK", "保存消息", {
      threadId, role, contentLength: content.length, hasMetadata: !!metadata, traceId
    })
    try {
      const message = await prisma.chatMessage.create({
        data: { threadId, role: role as MessageRole, content, metadata, traceId }
      })
      chatPersistAudit("MESSAGE_SAVE_CHUNK", "消息保存成功", { messageId: message.id, threadId, role })
      return message
    } catch (error) {
      chatPersistAudit("PERSIST_FAIL", "消息保存失败", { threadId, role, error: String(error) })
      throw error
    }
  }

  // ... 其他方法同理
}
```

### Step 2：植入审计点到业务代码

**2.1 Chat API Route**

```typescript
// src/app/api/agent/chat/route.ts

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let threadId: string

  try {
    const body = await request.json()
    threadId = body.threadId || randomUUID()

    chatPersistAuditPhaseStart("PERSIST_START", `threadId=${threadId}`)

    let thread = await chatPersistence.getThread(threadId)
    if (!thread) {
      thread = await chatPersistence.createThread(body.user?.id || "anonymous", body.project?.id)
    }

    chatPersistAuditPhaseStart("MESSAGE_SAVE", `threadId=${threadId}`)
    const lastMsg = body.messages[body.messages.length - 1]
    await chatPersistence.addMessage(threadId, "USER", lastMsg.content, undefined, undefined)
    chatPersistAuditPhaseEnd("MESSAGE_SAVE", "用户消息已保存")

    const result = await runAgent(...)

    const assistantMsg = result?.messages?.[result.messages.length - 1]
    if (assistantMsg) {
      await chatPersistence.addMessage(
        threadId, "ASSISTANT", assistantMsg.content,
        result.structuredResponse, traceId
      )
    }

    chatPersistAuditPhaseStart("CHAIN_TRACE_SAVE", `traceId=${traceId}`)
    await chatPersistence.saveChainTrace(threadId, chainTrace)
    chatPersistAuditPhaseEnd("CHAIN_TRACE_SAVE", "链路追踪已保存")

    const durationMs = Date.now() - startTime
    chatPersistAuditPhaseEnd("PERSIST_START", `完成, 耗时${durationMs}ms`)

    return NextResponse.json({ success: true, data: { ... } })
  } catch (error) {
    chatPersistAudit("PERSIST_FAIL", "聊天持久化失败", {
      threadId, error: String(error), duration_ms: Date.now() - startTime
    })
    return NextResponse.json({ success: false, error: ... }, { status: 500 })
  }
}
```

**2.2 前端 Rehydrate**

```typescript
// chat-store.ts 添加 rehydrate

rehydrateFromServer: async () => {
  chatPersistAuditPhaseStart("REHYDRATE_START", "从服务器恢复聊天数据")
  try {
    chatPersistAuditPhaseStart("REHYDRATE_LOAD_THREADS", "加载线程列表")
    const threadsResp = await fetch("/api/agent/chat/threads")
    const threadsData = await threadsResp.json()
    chatPersistAuditPhaseEnd("REHYDRATE_LOAD_THREADS", `加载${threadsData.data?.length || 0}个线程`)

    if (activeThreadId) {
      chatPersistAuditPhaseStart("REHYDRATE_LOAD_MESSAGES", `加载线程${activeThreadId}的消息`)
      const msgsResp = await fetch(`/api/agent/chat/threads/${activeThreadId}/messages`)
      const msgsData = await msgsResp.json()
      chatPersistAuditPhaseEnd("REHYDRATE_LOAD_MESSAGES", `加载${msgsData.data?.length || 0}条消息`)
    }

    chatPersistAuditPhaseEnd("REHYDRATE_START", "恢复完成")
  } catch (error) {
    chatPersistAudit("REHYDRATE_FAIL", "恢复失败", { error: String(error) })
  }
}
```

### Step 3-6：运行、审计、修复、收敛

实施完成后，通过以下方式验证：

1. 运行聊天，检查 `logs/chat-persistence/chat-persist.log` 中阶段标记对称性
2. 刷新页面，检查 REHYDRATE 阶段日志
3. 检查数据库中 ChatThread/ChatMessage/ChainTraceRecord 数据
4. 如有异常，从审计数据定位问题，修复，重新验证

---

## 三、ChainTracer 完整接入（按 ADD 范式）

### Step 0：定义审计阶段

```typescript
type TracerIntegrationPhase =
  | "TRACER_INTEGRATION_START"
  | "INPUT_SNAPSHOT_FIX"
  | "ROUTE_DECISION_INTEGRATION"
  | "EVIDENCE_DIFF_INTEGRATION"
  | "WORLDLINE_SNAPSHOT_INTEGRATION"
  | "MODEL_PARAM_INTEGRATION"
  | "TRACER_PERSIST_INTEGRATION"
  | "TRACER_INTEGRATION_DONE"
```

### Step 1-2：逐个接入，每个接入点都有审计

**修正 inputSnapshot**：

```typescript
// agents/index.ts wrapNodeWithAudit
const inputSnapshot = {
  intent: state.currentTask?.intent || state.explicitIntent,
  evidenceCount: state.evidenceChain?.length || 0,
  hasVerdict: !!state.verdictResult,
  hasInteractionPoint: !!state.pendingInteraction,
  explicitIntent: state.explicitIntent,
}
agentAudit("TRACER_INTEGRATION", `inputSnapshot修正: node=${nodeName}`, inputSnapshot)
tracer.recordNode(nodeName, inputSnapshot, result, startTime, Date.now())
```

**接入路由决策**：

```typescript
// edges/conditional.ts
export function routeByIntent(state: typeof AgentState.State) {
  const intent = state.currentTask?.intent || state.explicitIntent
  const target = "retrieval"

  const traceId = state.conversationContext?.traceId as string
  if (traceId && activeTracers.has(traceId)) {
    activeTracers.get(traceId)!.recordRouteDecision("intention", target, `intent=${intent}`, intent)
  }

  agentAuditRoute("intention", target, `intent=${intent}`)
  return target
}
```

**接入证据链 diff**：

```typescript
// nodes/retrieval.ts
export async function retrievalNode(state: typeof AgentState.State) {
  const traceId = state.conversationContext?.traceId as string

  if (traceId && activeTracers.has(traceId)) {
    activeTracers.get(traceId)!.setEvidenceBefore(
      (state.evidenceChain || []).map(e => ({ id: e.id, source: e.source }))
    )
  }

  // ... 执行检索 ...

  if (traceId && activeTracers.has(traceId)) {
    activeTracers.get(traceId)!.recordEvidenceDiff(
      (result.evidenceChain || []).map(e => ({ id: e.id, source: e.source }))
    )
  }

  return result
}
```

---

## 四、RAG 检索修复（按 ADD 范式）

### Step 0：定义审计阶段

```typescript
type RAGFixPhase =
  | "RAG_FIX_START"
  | "DISTANCES_SEMANTIC_FIX"
  | "EMPTY_RESULT_DEGRADATION"
  | "RAG_FIX_DONE"
```

### Step 1-2：修复并审计

**修复 distances 语义**：

```typescript
// retrieval.ts
relevance: result.score ? Math.max(0, 1 - result.score) : 0.5
agentAudit("RAG_FIX", "distances语义修正", {
  originalScore: result.score,
  convertedRelevance: Math.max(0, 1 - result.score),
})
```

**检索为0降级**：

```typescript
if (knowledgeResults.length === 0) {
  agentAuditRetrieval(query, 0, evidenceChain.length, {
    warning: "知识库无相关文档",
    suggestion: "请先同步知识库",
  })
  evidenceChain.push({
    id: `e_empty_${randomUUID().substring(0, 8)}`,
    source: "knowledge_empty",
    type: "warning",
    content: "知识库中未找到相关文档，建议先同步知识库",
    reliability: 0.0,
    relevance: 0.0,
  })
}
```

---

## 五、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/chat-persistence-logger.ts` | 新建 | 聊天持久化审计日志（与KB/Agent审计同构） |
| `prisma/schema.prisma` | 修改 | 新增 ChatThread、ChainTraceRecord，修改 ChatMessage |
| `src/services/chat-persistence.ts` | 新建 | 聊天持久化服务（每个方法植入审计点） |
| `src/app/api/agent/chat/route.ts` | 修改 | 消息写入数据库 + 审计标记 |
| `src/app/api/agent/chat/threads/route.ts` | 新建 | 线程列表 CRUD API（含审计） |
| `src/app/api/agent/chat/threads/[threadId]/messages/route.ts` | 新建 | 消息加载 API（含审计） |
| `src/stores/chat-store.ts` | 修改 | 添加 persist + rehydrate（含审计） |
| `src/agents/index.ts` | 修改 | 修正 inputSnapshot，接入路由决策记录 |
| `src/agents/edges/conditional.ts` | 修改 | 路由决策记录到 tracer |
| `src/agents/nodes/retrieval.ts` | 修改 | 修复 distances 语义 + 证据链 diff + 空结果降级 |
| `src/agents/nodes/verdict.ts` | 修改 | 模型参数快照记录 |
| `src/agents/nodes/response.ts` | 修改 | 检索为0时标记提示 |

---

## 六、实施优先级

1. **Step 0-1** — 定义审计阶段 + 实现审计基础设施（chat-persistence-logger.ts + Prisma Schema）
2. **Step 2** — 植入审计点到持久化服务 + Chat API Route + 前端 Rehydrate
3. **Step 3-6** — 运行验证，从审计数据定位问题，修复，收敛
4. ChainTracer 完整接入（按 ADD 范式逐个接入）
5. RAG 检索修复（按 ADD 范式修复 + 审计）

---

## 七、验收标准

### 功能验收

1. 页面刷新后，聊天消息可从数据库恢复显示
2. 线程列表在刷新后保持（标题、时间）
3. 每条消息的 metadata 包含结构化响应数据
4. ChainTrace 写入数据库，可通过 traceId 查询

### 范式验收

5. `logs/chat-persistence/chat-persist.log` 中阶段标记对称（每个 Start 有对应 End）
6. 最小可观测单元数据完整（每条消息保存都有审计记录）
7. 失败路径有等价审计（PERSIST_FAIL 阶段有结构化 extra）
8. ChainTracer 的 5 个 record 方法全部被正确调用
9. RAG 检索 distances 语义正确
10. TypeScript 编译通过
