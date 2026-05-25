# PLAN: farm-agent 改进 — 类型收敛 + thinkingLevel + ResponseStrategy + 分析专家模式 + 语义缓存

## PLAN 元信息
- **Plan 名称**: co-agent-simplified-v1
- **启动时间**: 2026-05-23T08:00:00+08:00
- **主导 AI**: Trae Agent
- **目标仓库**: `/home/xmm/ai/farm-agent`
- **ADD-7 审计策略**: 见文末附录

---

## 〇、概述

### 0.1 项目基线

farm-agent 相比 team-coordinator-agent 功能范围有所精简（不含 worldline/L0-L4/VerdictRegistry/CapabilityModel），保留核心六节点决策管线。代码实现质量要求与 team-coordinator-agent 完全一致，禁止任何形式的简化实现。

```
intention → retrieval → reasoning → interactionPointDetection → verdict → response
```

**当前代码基线**（`src/agents/`）：

| 节点 | 文件 | 当前行为 |
|------|------|---------|
| intention | [intention.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/intention.ts) | LLM 解析意图，输出 `currentTask.intent` |
| retrieval | [retrieval.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/retrieval.ts) | ChromaDB 语义检索 + 任务/经济数据拼接 |
| reasoning | [reasoning.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/reasoning.ts) | LLM 推理，产出 `verdictResult`（含 reasoning_path + conclusion + confidence） |
| interactionPointDetection | [interaction-point-detection.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/interaction-point-detection.ts) | 检测是否需要用户二次确认（analysis/planning 意图触发） |
| verdict | [verdict.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/verdict.ts) | 不依赖世界线，直接产出最终 verdictResult |
| response | [response.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/response.ts) | 三固定分支：有裁决/有交互点 → 结构化回复；有 currentTask → 知识库辅助回复；否则 → 问候语 |

**当前条件路由**（[conditional.ts](file:///home/xmm/ai/farm-agent/src/agents/edges/conditional.ts)）：

| 路由函数 | 当前行为 | 说明 |
|---------|---------|------|
| `routeByIntent` | 所有意图 → `"retrieval"` | 无 fast/deep 区分，每条消息都走完整 RAG |
| `routeByInteractionPoint` | 有 pendingInteraction → `"response"`；否则 → `"verdict"` | 交互点优先 |
| `routeByVerdictType` | 无条件 → `"response"` | 裁决后直接进入 response |

**关键缺陷**：

1. **类型重复**：[state.ts](file:///home/xmm/ai/farm-agent/src/agents/state.ts) 内联定义了 `Evidence` 接口，与 [src/types/evidence.ts](file:///home/xmm/ai/farm-agent/src/types/evidence.ts) 重复，字段略有差异（state.ts 多了 `expandable`/`detailUrl`/`score`，少了 `source` 的精确联合类型和 `expires_at`）
2. **无 fast 通道**：chat 意图也走完整 6 节点管线，浪费 token 和延迟
3. **response 三固定分支**：未根据意图类型和上下文动态调整回复策略
4. **无对话记忆**：每轮对话独立，无法识别追问、无法累积用户选择的分析维度
5. **无语义缓存**：相同问题重复调用 LLM

### 0.2 本计划目标

在 **不改 Prisma Schema、不改前端组件、不引入 worldline/L0-L4/VerdictRegistry/CapabilityModel** 的前提下，实现 5 项后端改进：

| Step | 改进 | 解决什么问题 |
|------|------|-------------|
| 1 | 类型收敛（Evidence 统一 + EvidenceRef 引用句柄） | 消除重复定义，建立引用体系 |
| 2 | 简化 thinkingLevel（2 级：fast / deep） | chat 直通 response，节省延迟 |
| 3 | ResponseStrategy 集中裁决（自声明匹配 + 修饰器管道） | 按意图动态调整回复策略，策略自声明匹配条件 |
| 4 | 能力模块矩阵 + 分析上下文（含可学习诊断记录） | 支持用户选择分析维度，跨轮记忆累积，采集路径质量 |
| 5 | 语义缓存（LRU + 自主学习 TTL + Generation-based 淘汰） | 相同问题复用缓存；TTL 从常量自主学习 |
| 6 | 策略演化闭环（路径质量采集 → 审计数据回流 → 策略参数自主学习） | 系统运行中从自己数据里学习，越来越不像旧的自己 |

### 0.3 界面说明

```
┌─────────────────────────────────────────────┐
│              聊天界面                        │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │                                       │  │
│  │   [用户未输入时 → 展示能力模块矩阵]     │  │
│  │                                       │  │
│  │   ┌──────┐ ┌──────┐ ┌──────┐         │  │
│  │   │作物对比│ │ROI测算│ │病虫害 │  ...   │  │
│  │   └──────┘ └──────┘ └──────┘         │  │
│  │                                       │  │
│  │   [用户选择模块后 → 进入深度推理]      │  │
│  │                                       │  │
│  │   用户: "邗江区种水稻，分析一下"        │  │
│  │        ↓                              │  │
│  │   RAG 已就绪（农技文档+行情+政策）      │  │
│  │   深度推理链路 (6节点)                 │  │
│  │        ↓                              │  │
│  │   输出: 分析报告（非行动方案）          │  │
│  │   + 推荐选项                          │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘

每个模块 = 一个分析专家。用户选择后激活专家，
记忆保持跨轮激活状态，后续推理只跑已激活的专家。
```

### 0.4 与 team-coordinator-agent 的区别

本计划是 team-coordinator-agent（完整版）的简化子集。下表说明本计划做了哪些、没做哪些、以及对应完整版中的哪个模块：

| 能力 | 简化版（本计划） | 完整版对应模块 | 为什么简化 |
|------|----------------|---------------|-----------|
| 意图感知复杂度控制 | 2 级 thinkingLevel (fast/deep) → ResponseStrategy | 4 档 ResponseComplexityMode (minimal/concise/standard/comprehensive) + ComplexityPolicy + 追问升级规则 | 农业场景意图类型较少，2 级已覆盖核心需求 |
| 对话记忆 | AnalysisContext（专家激活状态 + runtimeInputs 累积） | ConversationMemory（summary + entities + followUpCount + lastQuerySummary） | 分析专家模式的记忆需求更偏结构化维度累积，文本摘要为后续可选增强 |
| 语义缓存 | SimpleSemanticCache（LRU + TTL + kbGeneration 淘汰） | SemanticCache（同架构 + 500 条目 + CACHE_TTL 按意图细分 + Hash-based 精准化方向） | 核心架构一致，容量和 TTL 调小以适配简化版负载 |

### 0.5 不做的边界

- ❌ 不引入 worldline / L0-L4 / VerdictRegistry / CapabilityModel
- ❌ 不改 Prisma Schema（现有 12 个模型不变）
- ❌ 不改前端组件（左侧领域树、中间模块网格、右侧聊天——前端由其他同学负责）
- ❌ 不做复杂报告模板引擎（如自定义模板变量、多皮肤、拖拽排版）。但实现轻量级 `report-generator` 服务，基于现有 `DisplayContent` 和 `AnalysisContext` 生成 md/pdf/docx/xlsx 下载结果——这属于"管道末端格式化输出"，不是模板引擎
- ❌ 不需要特殊模型支持（分析专家模式 = 同一个 LLM + 不同 prompt 模板路由，任何 LLM 均可运行）
- ❌ 不修改 intention / retrieval / reasoning / verdict / interactionPointDetection 节点的核心 prompt 逻辑（只做参数注入和过滤）

### 0.6 GPT 结构评价与架构定位

外部结构性评价指出：farm-agent 当前已经不是简单 pipeline，而是由四套并行系统组成的半操作系统级架构雏形：

| 子系统 | 代表模块 | 当前职责 | 结构问题 |
|--------|----------|----------|----------|
| 交互系统 | chat-thread / chat-ui / streaming / input enhancement | 用户输入、会话、流式输出 | 只掌握消息状态，不掌握认知状态 |
| 记忆系统 | rag-knowledge-base / semantic-cache / retrieval pipeline | 知识检索、证据、缓存、知识版本 | 与 reasoning state、cache state 分裂 |
| 认知系统 | co-agent / reasoning / response-strategy / expert-registry / evolution-loop | 意图、推理、专家、策略、演化 | 更像分段 reasoning protocol，未形成统一 agent lifecycle |
| 执行系统 | event-bus / mcp-server / audit / logging / workspace-pmo | 工程编排、审计、恢复、工具调用 | event bus 尚未成为 cognitive decision flow 中枢 |

核心判断：当前系统处于 **L2 → L3 初期**，已经具备模块化 pipeline、局部多智能体能力和演化雏形，但结构仍然分裂；最大缺口不是功能数量，而是缺少统一控制理论与全局状态模型。

当前缺失的闭环是：

```text
Observation → Decision → Execution → Feedback → Update Policy
```

现有系统已经有 Observation、Execution、Feedback，但 Policy Update Loop 与 Global State Model 尚未成为统一内核。

### 0.7 前 7 轮与第 8 轮的分工

本 Plan 的前 7 轮仍然保持原有原子边界：先把 farm-agent 当前局部闭包收敛，不在执行中途引入全局重构。

| 阶段 | 定位 | 目标 | 禁止越界 |
|------|------|------|----------|
| 第1轮 | AgentState 地基 | Evidence / EvidenceRef / EvidenceSummary / ThinkingLevel 收敛 | 不做 Global State Model |
| 第2轮 | 响应策略闭包 | ResponseStrategy 集中裁决 | 不做 AnalysisContext / 多 agent 仲裁 |
| 第3轮 | 领域上下文闭包 | ExpertRegistry + AnalysisContext 持久化 | 不消费专家能力，不改全局状态 |
| 第4轮 | 管线消费闭包 | activeExperts 接入 retrieval/reasoning/response/report | 不引入 cognitive event bus |
| 第5轮 | 记忆复用闭包 | SemanticCache + kbGeneration | 不做完整 policy update loop |
| 第6轮 | 演化反馈闭包 | path metrics + TTL stats + turnHistory | 不做 competition-based execution |
| 第7轮 | 审计闭包 | 三层审计与 traceId 运行时排查 | 不把 AuditLog 当全局世界模型 |
| 第8轮 | 架构合流闭包 | Global State Model + Cognitive Event Bus + Policy Loop | 不再局部补丁式扩张 |

第 8 轮是后续 L4 演进，不等同于本文原来的 `Step 8: 三层审计管线`。原 `Step 8` 已被第7轮承接；新的第8轮是在前7轮收敛之后，建立统一认知与执行内核。

### 0.8 第 8 轮目标草案：统一认知与执行内核

第8轮只在前7轮全部完成并通过 ADD-7 回查后启动。目标是把四套系统合流为一个可治理的 Agent OS 内核：

1. **Global State Model**
   - 统一 chat state、agent state、memory state、tool/execution state、policy state、audit state、feedback state。
   - 建立 single source of truth for "what is happening"。
   - 第1轮的 `AgentState.currentTask.thinkingLevel`、`EvidenceRef`、`EvidenceSummary` 是该模型的地基，不应被绕过。

2. **Cognitive Event Bus**
   - 将 event bus 从 UI/logging event 升级为认知执行事件中枢。
   - 事件链至少覆盖 Thought → Decision → Action → Feedback → PolicyUpdate。
   - 关键事件包括 IntentDetected、RouteDecided、EvidenceRetrieved、ReasoningPathGenerated、StrategyResolved、ActionProposed、FeedbackObserved、PolicyUpdated。

3. **Policy Update Loop**
   - 将第6轮 path metrics、TTL stats、turnHistory 与第7轮 L2 审计合流。
   - 形成可解释策略更新：cache TTL、response promptHint、expert activation、evidence filter relaxation。
   - 策略更新必须有来源数据、决策理由、影响范围和回滚路径。

4. **Competition-based Agent Execution**
   - 在统一状态与事件总线之后，引入 multiple reasoning paths、scoring、arbitration。
   - 禁止在 Global State Model 前提前实现，否则多路径输出不可比较、不可复现、不可审计。

第8轮产物应是新的独立 spec，而不是塞回前7轮任务中。

---

## Step 1: 类型收敛（不简化）

### 1.1 问题描述

当前存在两套 Evidence 定义：

1. [src/types/evidence.ts](file:///home/xmm/ai/farm-agent/src/types/evidence.ts) 中的 `Evidence` 接口（包含 `source` 精确联合类型、`expires_at`）
2. [src/agents/state.ts](file:///home/xmm/ai/farm-agent/src/agents/state.ts) L33-L45 中内联定义的 `Evidence` 接口（包含 `expandable`/`detailUrl`/`score`，缺少 `expires_at`）

两套定义字段不一致，Prompt types 中也有内联 evidence 定义。需要统一为一个权威定义，并新增引用句柄和摘要类型。

### 1.2 设计

```typescript
// src/types/evidence.ts — 修改
export interface Evidence {
  id: string
  chunkId?: string                // 新增：ChromaDB 文档块 ID（用于前端溯源）
  source: "document" | "task" | "economic" | "history" | "team_input" | "sensor"
  type: string
  content: string
  reliability: number
  relevance: number
  timestamp: string
  expires_at?: string
  metadata: Record<string, unknown>
  expandable?: boolean            // 从 state.ts 合并：前端是否可展开
  detailUrl?: string              // 从 state.ts 合并：展开后跳转链接
  score?: number                  // 从 state.ts 合并：ChromaDB 相似度分数
}

// 新增：引用句柄 — 在 prompt types 中指代证据时使用（不传完整 content）
export interface EvidenceRef {
  id: string
  chunkId?: string
  source: string
  reliability: number
  relevance: number
  docName: string
  contentExcerpt?: string         // 简短摘要，避免 prompt 中重复完整 content
}

// 新增：展示摘要 — 前端 evidence_digest section 使用
export interface EvidenceSummary {
  id: string
  source: string
  type: string
  relevance: number
  summary: string                 // 一行总结，如 "基于XX文档3条证据"
}
```

### 1.3 变更点

| 文件 | 操作 | 具体改动 |
|------|------|---------|
| [src/types/evidence.ts](file:///home/xmm/ai/farm-agent/src/types/evidence.ts) | 修改 | Evidence 新增 `chunkId`/`expandable`/`detailUrl`/`score`；新增 `EvidenceRef` 和 `EvidenceSummary` 接口 |
| [src/agents/state.ts](file:///home/xmm/ai/farm-agent/src/agents/state.ts) | 修改 | 删除 L33-L45 内联 Evidence 定义，改为 `import { Evidence } from "@/types/evidence"` |
| [src/agents/prompts/types.ts](file:///home/xmm/ai/farm-agent/src/agents/prompts/types.ts) | 修改 | 所有内联 evidence 类型替换为 `EvidenceRef[]` |
| [src/agents/nodes/interaction-point-detection.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/interaction-point-detection.ts) | 修改 | evidence 引用替换为新的统一类型 |
| [src/agents/prompts/interaction-point-detection.ts](file:///home/xmm/ai/farm-agent/src/agents/prompts/interaction-point-detection.ts) | 修改 | evidence 引用替换为新的统一类型 |
| [src/agents/nodes/retrieval.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/retrieval.ts) | 修改 | 产出证据时填充 `chunkId` |

### 1.4 验证

```bash
npx tsc --noEmit      # 零类型错误
```

---

## Step 2: 简化 thinkingLevel（2 级）

### 2.1 设计

```
                     intention
                         │
                    [thinkingLevel?]
                   ╱              ╲
              fast                deep
            ("chat"意图)        (其余所有意图)
                │                   │
                ▼                   ▼
            response            retrieval
                                   │
                              全链路6节点
```

| thinkingLevel | 路径 | 触发意图 | 说明 |
|--------------|------|---------|------|
| `fast` | intention → **response** | `chat` | 跳过检索/推理/裁决，直接生成简短回复 |
| `deep` | 全链路 6 节点 | `question`/`analysis`/`planning`/`decision`/`creation`/`modification` | 完整 RAG + 推理 + 裁决 |

`fast` 通道下 response 节点仍然可以访问 `state.evidenceChain`（如果有内容），但不强制走 retrieval。

### 2.2 变更点

| 文件 | 操作 | 具体改动 |
|------|------|---------|
| [src/agents/state.ts](file:///home/xmm/ai/farm-agent/src/agents/state.ts) | 修改 | `CurrentTask` 接口新增 `thinkingLevel?: "fast" \| "deep"` 字段 |
| [src/agents/nodes/intention.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/intention.ts) | 修改 | intention 输出时设置 `currentTask.thinkingLevel`：chat → `"fast"`，其余 → `"deep"` |
| [src/agents/edges/conditional.ts](file:///home/xmm/ai/farm-agent/src/agents/edges/conditional.ts) | 修改 | `routeByIntent` 按 thinkingLevel 分流：fast → `"response"`，deep → `"retrieval"` |
| [src/agents/prompts/types.ts](file:///home/xmm/ai/farm-agent/src/agents/prompts/types.ts) | 修改 | `CurrentTask` 类型新增 `thinkingLevel` |

### 2.3 路由代码变更

```typescript
// conditional.ts routeByIntent — 改为：
export function routeByIntent(state: typeof AgentState.State) {
  const thinkingLevel = state.currentTask?.thinkingLevel || "deep"

  if (thinkingLevel === "fast") {
    agentAuditRoute("intention", "response", "fast通道: chat意图直通response")
    return "response"
  }

  agentAuditRoute("intention", "retrieval", "deep通道: 走完整6节点管线")
  return "retrieval"
}
```

### 2.4 验证

| 验证项 | 方法 |
|--------|------|
| fast 通道 | 发送"你好" → SSE 事件只出现 intention → response，不出现 retrieval/reasoning/verdict |
| deep 通道 | 发送"水稻育秧步骤" → 完整 6 节点 SSE 事件序列 |
| 回复长度 | fast 回复 < 100 tokens；deep 回复视内容而定 |

---

## Step 3: ResponseStrategy 集中管理

### 3.1 问题描述

当前 [response.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/response.ts) 三段分支逻辑中，回复策略（system prompt 约束、输出格式、section 组合）分散在 `buildStreamingTextPrompt`（L218-L260）和 `buildDisplayFromState`（L262-L322）中，修改策略需要改动多处。

### 3.2 设计

将所有展示规则集中到一个策略对象和两个函数中：

```typescript
// src/agents/response-strategy.ts（新建）

export type ThinkingLevel = "fast" | "deep"

// ──── 产出定义：策略产生的最终配置 ──────────────────────
//
// 这是 ResponseStrategy 的"结果面" — resolver 匹配到合适的
// descriptor 后，取其 apply 字段 + 叠加修饰器管道，最终产出此结构。

export interface ResponseStrategy {
  sections: Array<
    | "conclusion"
    | "evidence_digest"
    | "evidence"
    | "reasoning"
    | "confidence"
    | "risk"
    | "interaction"
    | "action_steps"
    | "timeline"
  >
  promptHint: string
  maxTokens: number
  showEvidenceDigest: boolean
}

// ──── 裁决上下文：解析器需要的全部输入 ──────────────────
//
// 所有输入变量集中在一个结构体里，而不是散落为函数参数。
// 类似 Linux pollfd：你声明你关心的事件集合，
// 裁决层逐一遍历每个文件描述符，告诉你哪些就绪。
//
// 每个 descriptor 的 matches 方法消费同一个 ctx，
// 自己判断"我是否适用于这个上下文"。

export interface StrategyContext {
  thinkingLevel: ThinkingLevel
  intent: string
  activeExperts: Array<{ expertId: string }>
  hasNonPriorEvidence: boolean
}

// ──── 策略描述符：自声明对象 ────────────────────────────
//
// 每个策略是一个完整的对象，不仅携带产出配置，
// 还携带自我声明"我什么时候匹配"的 matches 方法。
//
// 这与字符串 key 的 flat Record 有本质区别：
//
//   Record 模式：
//     找策略 = 拼接字符串 → 字典查找 → 找不到 → 手动回退
//     每个调用方都需要知道 key 的拼法
//
//   描述符模式：
//     找策略 = 把 ctx 丢给每个 descriptor.matches(ctx)
//     调用方不需要知道任何 key 约定
//     新增策略只需 register()，不需要改 resolver
//     优先级打破平局 — 更具体的策略自动胜出

export interface StrategyDescriptor {
  /** 唯一标识，用于调试和审计 */
  id: string
  /** 该策略产出的配置 */
  apply: ResponseStrategy
  /** 自声明匹配规则：给定上下文，我是否适用 */
  matches: (ctx: StrategyContext) => boolean
  /**
   * 优先级。同一上下文可能有多个 descriptor 匹配。
   * 数值越大越优先，取最高优先级的匹配。
   * 10 = 通用兜底，20 = 意图级精确匹配，
   * 30 = 专家增强等高阶策略（预留）
   */
  priority: number
}

// ──── 策略注册表：裁决层集中管理 ────────────────────────
//
// 所有策略描述符注册到同一个数组。
// resolver 不依赖字符串拼接，而是遍历注册表，
// 让每个 descriptor 自检 matches(ctx)。
//
// 类比 Linux VFS：
//   每个文件系统注册自己的 file_operations 结构体，
//   VFS 通过 fd → inode → ops 表找到对应的函数指针，
//   调用方只需要 read(fd, buf) 一个统一接口。
//
// 这里同理：
//   每个意图注册自己的 StrategyDescriptor，
//   resolver 遍历 → filter(matches) → sort(priority) → pick first，
//   调用方只需要 resolveResponseStrategy(ctx) 一个统一接口。

const registry: StrategyDescriptor[] = []

function register(descriptor: StrategyDescriptor): void {
  registry.push(descriptor)
}

// ──── 注册所有策略描述符 ─────────────────────────────────
//
// 每个 descriptor 的 matches 是自包含的纯函数。
// 不再需要 INTENT_FALLBACK 字符串映射 — 回退由
// 低优先级的 catch-all descriptor 自然承担。

// fast 通道：一切 chat 走这里
register({
  id: "fast:chat",
  matches: (ctx) => ctx.thinkingLevel === "fast",
  priority: 10,
  apply: {
    sections: ["conclusion"],
    promptHint: "回复控制在1-2句话以内，不要展开，不要列出细节。",
    maxTokens: 256,
    showEvidenceDigest: false,
  },
})

// ──── deep 通道 ──────────────────────────────────

// 分析类：结论 + 证据 + 推理 + 置信度 + 风险
register({
  id: "deep:analysis",
  matches: (ctx) => ctx.thinkingLevel === "deep" && ctx.intent === "analysis",
  priority: 20,
  apply: {
    sections: ["conclusion", "evidence", "reasoning", "confidence", "risk", "interaction"],
    promptHint: "先给出分析结论，再从依据→推理→置信度→风险逐一展开。分析不是行动计划，不要列出\"步骤1/步骤2\"。",
    maxTokens: 2048,
    showEvidenceDigest: true,
  },
})

// 计划类：结论 + action_steps + timeline + risks（不需要证据链和置信度）
register({
  id: "deep:planning",
  matches: (ctx) => ctx.thinkingLevel === "deep" && ctx.intent === "planning",
  priority: 20,
  apply: {
    sections: ["conclusion", "action_steps", "timeline", "risk", "interaction"],
    promptHint:
      "按计划项逐一列出，每项包含：动作描述、执行人建议、预估耗时、前置依赖。" +
      "这是行动计划（plan），不是分析报告——不需要证据链和置信度，" +
      "但需要可执行的步骤和时间线。",
    maxTokens: 2048,
    showEvidenceDigest: false,
  },
})

// 决策类：结论 + 证据 + 推理 + 置信度 + 风险
register({
  id: "deep:decision",
  matches: (ctx) => ctx.thinkingLevel === "deep" && ctx.intent === "decision",
  priority: 20,
  apply: {
    sections: ["conclusion", "evidence", "reasoning", "confidence", "risk"],
    promptHint: "先给最终决策结论，再列出决策依据、置信度和潜在风险。决策要明确、可落地。",
    maxTokens: 1280,
    showEvidenceDigest: true,
  },
})

// 知识问答：结论 + evidence_digest + evidence（不展开推理）
register({
  id: "deep:question",
  matches: (ctx) => ctx.thinkingLevel === "deep" && ctx.intent === "question",
  priority: 20,
  apply: {
    sections: ["conclusion", "evidence_digest", "evidence"],
    promptHint: "基于知识库简洁回答，引用具体文档。回答控制在200字以内，不要展开推理。",
    maxTokens: 512,
    showEvidenceDigest: true,
  },
})

// 创建类：结论 + evidence_digest（简洁建议，不需要推理和风险）
register({
  id: "deep:creation",
  matches: (ctx) => ctx.thinkingLevel === "deep" && ctx.intent === "creation",
  priority: 20,
  apply: {
    sections: ["conclusion", "evidence_digest"],
    promptHint: "给出建议方案，简洁明确，不要过度展开。",
    maxTokens: 768,
    showEvidenceDigest: true,
  },
})

// 修改类：结论 + evidence_digest
register({
  id: "deep:modification",
  matches: (ctx) => ctx.thinkingLevel === "deep" && ctx.intent === "modification",
  priority: 20,
  apply: {
    sections: ["conclusion", "evidence_digest"],
    promptHint: "给出修改建议，简洁明确，不要过度展开。",
    maxTokens: 768,
    showEvidenceDigest: true,
  },
})

// catch-all 兜底：所有 deep 下未精确匹配的意图回退到此
// priority=1 确保精确匹配的策略总是优先
register({
  id: "deep:fallback",
  matches: (ctx) => ctx.thinkingLevel === "deep",
  priority: 1,
  apply: {
    sections: ["conclusion", "evidence", "reasoning", "confidence", "risk", "interaction"],
    promptHint: "先给出结论，再按优先级和依赖关系逐一展开，保持结构化表达。",
    maxTokens: 2048,
    showEvidenceDigest: true,
  },
})

// ──── 解析器：集中裁决 ──────────────────────────────────
//
// 不拼接字符串、不查字典、不维护回退链。
//
// 流程：
//   1. 遍历注册表，让每个 descriptor 自检 matches(ctx)
//   2. 按 priority 降序排序 — 高优先级的精确匹配自动胜出
//   3. 取第一个（最高优先级匹配）
//   4. 叠加修饰器管道
//
// 新增策略只需在模块顶层 register()，不需要改此函数。
//
// 类比 Linux poll：
//   poll(fds, nfds, timeout)
//     → 内核遍历每个 fd
//     → 检查 fd.events & 当前状态
//     → 返回就绪的 fd 集合
//
// 这里：
//   resolveResponseStrategy(ctx)
//     → 遍历 registry
//     → 检查 descriptor.matches(ctx)
//     → 返回最高优先级的 strategy

export function resolveResponseStrategy(ctx: StrategyContext): ResponseStrategy {
  const candidates = registry
    .filter(d => d.matches(ctx))
    .sort((a, b) => b.priority - a.priority)

  // 理论上 registry 中总有兜底策略匹配，但防御一下
  if (candidates.length === 0) {
    throw new Error(
      `No strategy matched context: thinkingLevel=${ctx.thinkingLevel} intent=${ctx.intent}`
    )
  }

  let strategy: ResponseStrategy = { ...candidates[0].apply }

  // ──── 修饰器管道 ─────────────────────────────────
  // 匹配到的 descriptor 产出基础策略，
  // 以下修饰器在基础策略上叠加运行时变换。

  // 修饰器 1：分析专家合并 outputSections
  //         激活的分析专家可能产出基础策略不含的 section 类型
  if (ctx.activeExperts && ctx.activeExperts.length > 0) {
    const expertSections = new Set(strategy.sections)
    for (const ea of ctx.activeExperts) {
      const expert = ANALYSIS_EXPERTS[ea.expertId]
      if (expert?.outputSections) {
        for (const s of expert.outputSections) {
          expertSections.add(s)
        }
      }
    }
    strategy.sections = [...expertSections]
  }

  // 修饰器 2：evidence_digest 运行时降级
  //         如果所有证据都是先验知识（无实际来源），不展示摘要
  if (strategy.showEvidenceDigest && !ctx.hasNonPriorEvidence) {
    strategy = { ...strategy, showEvidenceDigest: false }
  }

  return strategy
}
```

**`promptHint` 注入方式**：在 `buildStreamingTextPrompt` 的 system prompt 末尾追加，例如：

```
要求：
...
{strategy.promptHint}
```

**section 过滤逻辑**（在 `buildDisplayFromState` 中）：

- 遍历每个 section，检查是否在 `strategy.sections` 中
- `evidence_digest`：仅在 `showEvidenceDigest = true` 且存在非先验证据时生成（一行摘要 `"基于X条证据"`）
- `action_steps`：planning 意图专用，展示为编号步骤列表（"1. ***\n2. ***\n..."）
- `timeline`：planning 意图专用，展示为"预计耗时 / 开始时间 / 前置依赖"三列描述
- `fast:chat` 仅保留 `conclusion` + 可能的 `interaction`

### 3.3 变更点

| 文件 | 操作 | 具体改动 |
|------|------|---------|
| [src/agents/response-strategy.ts](file:///home/xmm/ai/farm-agent/src/agents/response-strategy.ts) | **新建** | `StrategyDescriptor` 自声明对象 + `StrategyContext` 裁决上下文 + `registry` 注册表（8 个 descriptor + catch-all 兜底）+ `register()` + `resolveResponseStrategy(ctx)` 遍历裁决（替换旧有的 `INTENT_FALLBACK` 字符串回退链） |
| [src/agents/nodes/response.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/response.ts) | 修改 | 构建 `StrategyContext` → 调用 `resolveResponseStrategy(ctx)` 替代硬编码三段分支；`buildStreamingTextPrompt` 追加 `promptHint`；`buildDisplayFromState` 按 strategy.sections 过滤 |
| [src/agents/types.ts](file:///home/xmm/ai/farm-agent/src/agents/types.ts) | 修改 | `DisplayContent["sections"]` 联合类型新增 `"evidence_digest"` / `"action_steps"` / `"timeline"` |

### 3.4 验证

| 验证项 | 方法 |
|--------|------|
| fast 回复 | "你好" → 回复 ≤ 2 句话，无证据/推理/置信度 section |
| analysis 回复 | "邗江区种水稻分析" → sections 含 conclusion + evidence + reasoning + confidence + risks |
| planning 回复 | "制定下月种植计划" → sections 含 conclusion + action_steps + timeline + risks，不含 evidence_digest |
| decision 回复 | 选择类问题 → sections 含 conclusion + evidence + reasoning + confidence + risks，promptHint 含"先给最终决策结论" |
| question 回复 | "水稻育秧步骤" → sections 含 conclusion + evidence_digest + evidence，不含 reasoning |
| evidence_digest | planning 意图不展示（showEvidenceDigest=false）；analysis/decision 有非先验证据时展示 |
| 回退链 | 未预定义的意图（如 conversation 子类型）→ 回退到 analysis 策略 |
| section 类型扩展 | `src/agents/types.ts` 中 `DisplayContent["sections"]` 联合类型新增 `"evidence_digest"` / `"action_steps"` / `"timeline"` |

---

## Step 4: 能力模块矩阵 + 分析上下文（分析专家模式）

### 4.1 问题描述

当前 Agent 的推理维度是固定的——每次对话都按意图类型走相同的 reasoning prompt，用户无法选择"我想从哪些角度分析"。需要支持：

1. 用户在聊天界面选择分析模块（作物对比 / ROI 测算 / 病虫害风险）
2. 系统记住用户的选择，跨轮次保持激活状态
3. 后续推理只跑已激活的分析专家，RAG 检索也按专家要求过滤文档
4. 这个模式叫"分析专家模式"——**同一个 LLM + 不同 prompt 模板**，不需要特殊模型

### 4.2 分析专家注册表

每个分析专家定义了四件事：

| 属性 | 含义 | 示例 |
|------|------|------|
| `inputSchema` | 需要什么输入参数 | `{ region, crop, season, area }` |
| `outputSections` | 产出什么结构 | `{ conclusion, confidence, risks }` |
| `promptTemplate` | 推理 Prompt 模板 | "请从作物品种、产量预期、成本三个维度分析..." |
| `evidenceFilter` | 需要哪类 RAG 文档 | `{ source: { $in: ["种植技术","市场行情"] } }` |

```typescript
// src/agents/experts/registry.ts（新建）

export interface AnalysisExpert {
  id: string                    // 唯一标识：如 "crop_compare"
  label: string                 // 显示名："作物对比分析"
  domain: string                // 所属领域："种植" / "经济" / "管收"
  description: string           // 一句话说明
  inputSchema: Array<{          // 需要的输入参数
    key: string
    label: string
    required: boolean
  }>
  outputSections: Array<"conclusion" | "confidence" | "risk" | "evidence" | "reasoning">
  promptTemplate: string        // 推理维度指令片段
  evidenceFilter?: Record<string, unknown>  // RAG 检索过滤条件
}

export const ANALYSIS_EXPERTS: Record<string, AnalysisExpert> = {
  crop_compare: {
    id: "crop_compare",
    label: "作物对比",
    domain: "种植",
    description: "多作物品种在指定地块的适应性对比",
    inputSchema: [
      { key: "region", label: "地块", required: true },
      { key: "crops", label: "候选作物", required: true },
    ],
    outputSections: ["conclusion", "evidence", "reasoning"],
    promptTemplate: "请从以下维度进行作物对比分析：品种适应性、产量预期、抗病虫害能力、经济效益",
    evidenceFilter: { source: { $in: ["种植技术"] } },
  },
  roi_analysis: {
    id: "roi_analysis",
    label: "ROI 测算",
    domain: "经济",
    description: "投入产出比与回收周期分析",
    inputSchema: [
      { key: "region", label: "地块", required: true },
      { key: "crop", label: "作物", required: true },
      { key: "investment", label: "投入预算", required: false },
    ],
    outputSections: ["conclusion", "confidence", "evidence", "reasoning"],
    promptTemplate: "请进行 ROI 分析：投入成本构成、产出预估、回收周期、敏感性分析",
    evidenceFilter: { source: { $in: ["市场行情", "经济数据"] } },
  },
  pest_risk: {
    id: "pest_risk",
    label: "病虫害风险评估",
    domain: "管收",
    description: "基于历史数据和气象条件的病虫害风险预测",
    inputSchema: [
      { key: "region", label: "地块", required: true },
      { key: "crop", label: "作物", required: true },
      { key: "season", label: "季节", required: true },
    ],
    outputSections: ["conclusion", "risk", "evidence", "reasoning"],
    promptTemplate: "请评估病虫害风险：历史发生规律、当前气象条件、易感品种、防控建议",
    evidenceFilter: { source: { $in: ["植保情报", "农技信息"] } },
  },
  // 后续按需扩展：
  // soil_assessment: { ... }
  // weather_impact: { ... }
  // policy_check: { ... }
}
```

### 4.3 分析上下文（AnalysisContext）

分析上下文是跨轮对话记忆的核心数据结构。它与 ResponseStrategy 的 `ConversationMemory` 不同——不关注文本摘要，而是关注**用户选择了哪些分析维度**和**实时参数变量**。

```typescript
// src/services/analysis-context.ts（新建）

export interface AnalysisTurnRecord {
  turn: number
  intent: string
  thinkingLevel: ThinkingLevel
  strategyDescriptorId: string
  activeExpertIds: string[]
  verdictConfidence?: number         // -1 表示未产出置信度
  evidenceCount: number
  followUpCount: number              // 0 = 用户满意
  followedUpFromTurn?: number        // 上轮追问来源
  timestamp: number
}

export interface AnalysisContext {
  threadId: string
  activeExperts: Array<{
    expertId: string              // 对应 ANALYSIS_EXPERTS 的 key
    activatedAt: number           // 激活时间戳
  }>
  runtimeInputs: Record<string, {  // 实时变量（覆盖式更新）
    value: string
    label: string
    updatedAt: number
  }>
  turnHistory: AnalysisTurnRecord[]  // 新增：每轮管线的诊断记录
  totalTurns: number
  updatedAt: number
}

// 从 ChatThread.metadata 加载
export async function getAnalysisContext(threadId: string): Promise<AnalysisContext | null>

// 持久化到 ChatThread.metadata.analysisContext
// ChatThread.metadata 是 Prisma Json 字段，无需改 Schema
export async function saveAnalysisContext(threadId: string, context: AnalysisContext): Promise<void>

// 管理 activeExperts
export function activateExpert(ctx: AnalysisContext, expertId: string): AnalysisContext
export function deactivateExpert(ctx: AnalysisContext, expertId: string): AnalysisContext

// 管理 runtimeInputs
export function updateRuntimeInput(
  ctx: AnalysisContext,
  key: string,
  value: string,
  label: string
): AnalysisContext

// 管理 turnHistory（Step 6 演化回路）
export function appendTurnRecord(
  ctx: AnalysisContext,
  record: Omit<AnalysisTurnRecord, "turn">
): AnalysisContext
```

### 4.4 记忆的作用：跨轮保持 activatedExperts 不丢失

```
第1轮: 用户选择 "作物对比" + "ROI测算"
       → activeExperts = ["crop_compare", "roi_analysis"]
       → 存入 ChatThread.metadata.analysisContext

第2轮: 用户追问 "那加上大豆呢？"
       → 加载 analysisContext → activeExperts 仍在
       → 两个专家都参与推理
       → runtimeInputs 更新: crops 追加 "大豆"

第3轮: 用户新增选择 "病虫害风险"
       → activeExperts 追加 "pest_risk"
       → 三个专家同时推理
       → 持久化回 DB
```

没有记忆的话，每轮都要重新选择模块——用户无法在已有分析基础上追加新维度。

### 4.5 与管线各节点的交互

| 节点 | 如何消费 AnalysisContext + ANALYSIS_EXPERTS |
|------|------------------------------------------|
| **retrieval** | 在 [retrieval.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/retrieval.ts) 中，收集所有 `activeExperts` 的 `evidenceFilter`，合并为 ChromaDB 检索条件。例如选了 crop_compare + roi_analysis，就同时检索"种植技术"+"市场行情"文档 |
| **reasoning** | 在 [reasoning.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/reasoning.ts) 中，从 ANALYSIS_EXPERTS 取每个激活专家的 `promptTemplate`，拼接为多维推理指令；注入 `runtimeInputs` 作为已知参数 |
| **response** | 在 [response.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/response.ts) 中，合并所有激活专家的 `outputSections`，去重后传给 ResponseStrategy；不同专家的结论分 section 渲染 |
| **intention** | 可选增强：如果 `activeExperts` 非空，intention 解析时倾向匹配已激活专家所属领域的意图 |

### 4.6 推理 Prompt 组装

reasoning 节点中，当 `analysisContext.activeExperts` 非空时，prompt 追加以下上下文块：

```
[分析上下文 - 已激活 {N} 个分析专家]

=== 作物对比分析 ===
请从以下维度进行作物对比分析：品种适应性、产量预期、抗病虫害能力、经济效益
已知参数：
  - 地块：邗江区
  - 候选作物：水稻、玉米、大豆

=== ROI 测算 ===
请进行 ROI 分析：投入成本构成、产出预估、回收周期、敏感性分析
已知参数：
  - 地块：邗江区
  - 作物：水稻

请基于以上各专家维度的要求和证据链，分别进行分析，最终汇总结论。
```

当 `analysisContext.activeExperts` 为空时，reasoning 行为不变（走默认推理 prompt）。

### 4.7 数据流入来源

| 来源 | 写入字段 | 触发时机 |
|------|---------|---------|
| 前端模块选择（未来） | `activeExperts` | 用户勾选/取消模块时 |
| 右侧聊天输入实体提取 | `runtimeInputs` | 每轮消息中 intent 解析出实体后 |
| interactionPointSelections | `activeExperts` 或 `runtimeInputs` | 用户确认交互卡片时 |

> **注意**：前端领域树和模块网格尚未实现。Step 4 先建好后端基础设施（ANALYSIS_EXPERTS 注册表 + AnalysisContext CRUD + 管线节点消费），前端通过 API 写入即可。

### 4.8 激活专家的多阶段产出

激活的分析专家在不同管线阶段产出不同的结构化数据，最终汇合为一个完整的分析结果，并提供下载能力。

#### 4.8.1 产出总览

```
用户消息 + activeExperts
        │
        ▼
  retrieval (4.8.2)
  产出: 按 expert evidenceFilter 过滤的文档列表
        │
        ▼
  reasoning (4.8.3)
  产出: 结构化推理结果，按专家分节
        │
        ▼
  verdict (4.8.4)
  产出: 汇总裁决（合并多专家结论）
        │
        ▼
  response (4.8.5)
  产出: DisplayContent.sections（前端渲染用）
        │
        ▼
  download (4.8.6)
  产出: 可下载的合并分析报告 (Markdown)
```

#### 4.8.2 retrieval 阶段产出

检索节点收集所有 `activeExperts` 的 `evidenceFilter`，合并为 ChromaDB 查询条件：

```
专家激活状态: crop_compare + roi_analysis

ChromaDB 检索条件:
  { source: { $in: ["种植技术", "市场行情", "经济数据"] } }

产出 evidenceChain:
┌─────────────────────────────────────────────┐
│ evidence[0]: source=种植技术, chunkId=...,  │
│              content="水稻在邗江区..."       │
│ evidence[1]: source=市场行情, chunkId=...,  │
│              content="2025年稻谷收购价..."   │
│ evidence[2]: source=经济数据, chunkId=...,  │
│              content="邗江区农业补贴..."     │
└─────────────────────────────────────────────┘
```

#### 4.8.3 reasoning 阶段产出

推理节点将各专家的 `promptTemplate` + `runtimeInputs` + 证据链一起发给 LLM，产出按专家分节的结构化推理：

```
┌──────────────────────────────────────────────────────┐
│ === 作物对比分析 ===                                  │
│ conclusion:                                           │
│   邗江区水稻主栽品种建议南粳9108，搭配淮稻5号，       │
│   大豆建议套种徐豆18。                                │
│ evidence:                                             │
│   - [种植技术] 南粳9108 在苏中地区亩产650kg           │
│   - [种植技术] 淮稻5号 抗稻瘟病，耐肥抗倒            │
│   - [种植技术] 徐豆18 生育期105天，适合麦茬后播种     │
│ reasoning:                                            │
│   品种适应性 > 产量预期 > 抗病虫害 > 经济比较          │
│                                                      │
│ === ROI 测算 ===                                      │
│ conclusion:                                           │
│   水稻亩均净收益约 820 元，IRR 12%，2.3 年回收投入    │
│ confidence: 78%                                       │
│ evidence:                                             │
│   - [市场行情] 2025年粳稻收购价 2.8 元/kg            │
│   - [经济数据] 邗江区水稻种植补贴 120 元/亩          │
│ reasoning:                                            │
│   投入成本构成 > 产出预估 > 回收周期 > 敏感性分析      │
│                                                      │
│ 最终汇总结论:                                         │
│   [合并两专家结论，标注置信度差异和建议优先级]         │
└──────────────────────────────────────────────────────┘
```

LLM 产出的 rawContent 被解析为 `verdictResult`，其中各专家的 conclusion/confidence/risks 按 `outputSections` 定义合并。

#### 4.8.4 verdict 阶段产出

简化版中 verdict 不做世界线权重调整，直接透传 reasoning 节点的合并结果：

```typescript
verdictResult = {
  type: "analysis",
  conclusion: {
    content: "邗江区水稻主栽建议南粳9108+淮稻5号混栽，套种大豆徐豆18...",
    actions: [],
    risks: [],  // pest_risk 未激活，故为空
  },
  confidence: { final_confidence: 78 },
  reasoning_path: [ /* 两专家的推理步骤合并 */ ],
}
```

#### 4.8.5 response 阶段产出

response 节点合并所有 activeExperts 的 `outputSections` 并集去重，传给 ResponseStrategy，最终产出 `DisplayContent`：

```
ResponseStrategy 合并逻辑:
  1. 取 STRATEGIES[thinkingLevel] 基础策略
  2. crop_compare:   outputSections = ["conclusion", "evidence", "reasoning"]
     roi_analysis:   outputSections = ["conclusion", "confidence", "evidence", "reasoning"]
  3. 并集去重:       ["conclusion", "confidence", "evidence", "reasoning"]
  4. 生成 DisplayContent.sections:
     - conclusion  → "邗江区水稻主栽建议南粳9108..."
     - confidence  → "综合置信度 78%"
     - evidence    → "基于5条证据（2种植+3市场/经济）"
     - reasoning   → "1.适应性对比 → 2.产量预估 → ..."
```

#### 4.8.6 下载产出：多格式报告服务

分析专家模式下，用户需要多种格式的输出——文本分析用 Markdown/PDF 存档，财务数据用 Excel 表格，正式汇报用 Word 文档。不同业务自然需要不同文件格式。

**报告格式与业务映射**：

| 格式 | MIME Type | 适用专家 | 使用场景 |
|------|-----------|---------|---------|
| `md` | `text/markdown` | crop_compare, pest_risk, soil_assessment | 文本分析存档、Git 管理、二次编辑 |
| `pdf` | `application/pdf` | 所有专家 | 正式汇报、甲方交付、打印 |
| `docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | crop_compare, pest_risk, weather_impact | 内部流转、领导审批、多部门传阅 |
| `xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | roi_analysis, economic_feasibility | 财务测算表、成本明细、利润分析 |

**每个专家的默认推荐格式**（定义在 AnalysisExpert 中）：

```typescript
export interface AnalysisExpert {
  id: string
  label: string
  // ... 其他字段
  reportFormats: ReportFormat[]   // 该专家支持的导出格式，第一个为默认
}

// 注册表示例
export const ANALYSIS_EXPERTS = {
  crop_compare: {
    // ...
    reportFormats: ["md", "pdf", "docx"],   // 文本分析 → MD 默认
  },
  roi_analysis: {
    // ...
    reportFormats: ["xlsx", "pdf"],          // 财务测算 → XLSX 默认
  },
  pest_risk: {
    // ...
    reportFormats: ["md", "pdf", "docx"],    // 风险评估 → MD 默认
  },
}
```

**API 设计**：

```
GET /api/agent/chat/threads/{threadId}/messages/{messageId}/report
  ?format=md|pdf|docx|xlsx

不指定 format 时 → 根据 activeExperts 推断默认格式：
  - 只有 roi_analysis 激活 → 默认 xlsx
  - 只有 crop_compare / pest_risk 激活 → 默认 md
  - 多种类专家混合激活 → 默认 pdf

返回响应头:
  format=md   → Content-Type: text/markdown; charset=utf-8
                Content-Disposition: attachment; filename="crop_analysis_20260523.md"
  format=pdf  → Content-Type: application/pdf
                Content-Disposition: attachment; filename="crop_analysis_20260523.pdf"
  format=docx → Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
                Content-Disposition: attachment; filename="crop_analysis_20260523.docx"
  format=xlsx → Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
                Content-Disposition: attachment; filename="roi_analysis_20260523.xlsx"
```

**架构：两层分离（服务层 + 路由层）**：

```
src/services/report-generator.ts        ← 服务层：各格式生成逻辑
src/app/api/agent/chat/threads/{threadId}/messages/{messageId}/report/route.ts  ← 路由层：HTTP 接口
```

**服务层 — ReportGenerator**：

```typescript
// src/services/report-generator.ts（新建）

import type { StructuredAgentResponse, DisplayContent } from "@/agents/types"
import type { AnalysisContext } from "@/services/analysis-context"
import { ANALYSIS_EXPERTS } from "@/agents/experts/registry"

export type ReportFormat = "md" | "pdf" | "docx" | "xlsx"

export interface ReportResult {
  content: Buffer | string
  format: ReportFormat
  filename: string
  mimeType: string
}

// 格式 → MIME 映射
const MIME_TYPES: Record<ReportFormat, string> = {
  md:   "text/markdown; charset=utf-8",
  pdf:  "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

// 推导默认格式：根据激活的专家取各专家 reportFormats[0] 的众数
// 混合激活时回退为 pdf
function inferDefaultFormat(
  activeExperts: Array<{ expertId: string }>
): ReportFormat {
  if (activeExperts.length === 0) return "md"

  const formats = activeExperts.map(ea => {
    const expert = ANALYSIS_EXPERTS[ea.expertId]
    return expert?.reportFormats?.[0]
  }).filter(Boolean) as ReportFormat[]

  const unique = [...new Set(formats)]
  if (unique.length === 1) return unique[0]
  return "pdf"  // 多种专家混合 → pdf 统一
}

export async function generateReport(
  structured: StructuredAgentResponse,
  analysisContext: AnalysisContext | null,
  format?: ReportFormat
): Promise<ReportResult> {
  // 确定格式
  const effectiveFormat = format
    ?? inferDefaultFormat(analysisContext?.activeExperts ?? [])

  const timestamp = new Date().toISOString().slice(0, 10)

  switch (effectiveFormat) {
    case "md":
      return generateMarkdown(structured, analysisContext, timestamp)
    case "pdf":
      return generatePdf(structured, analysisContext, timestamp)
    case "docx":
      return generateDocx(structured, analysisContext, timestamp)
    case "xlsx":
      return generateXlsx(structured, analysisContext, timestamp)
  }
}

// ──── MD 生成器 ────────────────────────────────────
function generateMarkdown(
  structured: StructuredAgentResponse,
  analysisContext: AnalysisContext | null,
  timestamp: string
): ReportResult {
  const content = buildReportMarkdown(structured, analysisContext, timestamp)
  return {
    content,
    format: "md",
    filename: `analysis_${timestamp}.md`,
    mimeType: MIME_TYPES.md,
  }
}

// ──── PDF 生成器 ────────────────────────────────────
// 策略：先生成 Markdown → 通过 remark/rehype 转 HTML → Puppeteer/Playwright 渲染为 PDF
// 或者使用更轻量的 pdfmake / jspdf（本期先用 Markdown 内嵌 HTML，后续引入 pdf 库）
async function generatePdf(
  structured: StructuredAgentResponse,
  analysisContext: AnalysisContext | null,
  timestamp: string
): Promise<ReportResult> {
  const mdContent = buildReportMarkdown(structured, analysisContext, timestamp)

  // 简化实现：将 Markdown 包装为 HTML，使用简单的 HTML→PDF 转换
  // 正式版建议引入 pdfmake 或使用无头浏览器
  const htmlContent = markdownToHtml(mdContent)
  const pdfBuffer = await htmlToPdf(htmlContent)

  return {
    content: Buffer.from(pdfBuffer),
    format: "pdf",
    filename: `analysis_${timestamp}.pdf`,
    mimeType: MIME_TYPES.pdf,
  }
}

// ──── DOCX 生成器 ────────────────────────────────────
// 使用 docx (npm) 库构建。文本分析类专家用此格式。
async function generateDocx(
  structured: StructuredAgentResponse,
  analysisContext: AnalysisContext | null,
  timestamp: string
): Promise<ReportResult> {
  const { Document, Packer, Paragraph, HeadingLevel } = await import("docx")

  const children: any[] = []
  children.push(new Paragraph({ text: "农业分析报告", heading: HeadingLevel.HEADING_1 }))
  children.push(new Paragraph({ text: `分析时间: ${timestamp}` }))

  if (analysisContext?.runtimeInputs?.region?.value) {
    children.push(new Paragraph({ text: `地块: ${analysisContext.runtimeInputs.region.value}` }))
  }

  // 结论
  children.push(new Paragraph({ text: "一、分析结论", heading: HeadingLevel.HEADING_2 }))
  children.push(new Paragraph({ text: structured.displayContent.summary }))

  // 按 section 逐条写入
  let secNum = 1
  for (const s of structured.displayContent.sections) {
    if (s.type === "conclusion" || s.type === "evidence" || s.type === "reasoning" || s.type === "confidence") {
      secNum++
      children.push(new Paragraph({ text: `${toRoman(secNum)}、${s.title}`, heading: HeadingLevel.HEADING_2 }))
      children.push(new Paragraph({ text: s.content }))
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  })
  const buffer = await Packer.toBuffer(doc)

  return {
    content: Buffer.from(buffer),
    format: "docx",
    filename: `analysis_${timestamp}.docx`,
    mimeType: MIME_TYPES.docx,
  }
}

// ──── XLSX 生成器 ────────────────────────────────────
// 使用 exceljs 或 xlsx (npm) 库。财务测算类专家用此格式。
async function generateXlsx(
  structured: StructuredAgentResponse,
  analysisContext: AnalysisContext | null,
  timestamp: string
): Promise<ReportResult> {
  const ExcelJS = await import("exceljs")
  const workbook = new ExcelJS.Workbook()

  // Sheet 1: 分析概要
  const summarySheet = workbook.addWorksheet("分析概要")
  summarySheet.columns = [
    { header: "项目", key: "item", width: 20 },
    { header: "内容", key: "value", width: 60 },
  ]
  summarySheet.addRows([
    { item: "分析时间", value: timestamp },
    { item: "地块", value: analysisContext?.runtimeInputs?.region?.value || "-" },
    { item: "综合置信度", value: `${structured.verdict?.confidence?.finalConfidence ?? "-"}%` },
  ])

  // Sheet 2: 结论与推理
  const detailSheet = workbook.addWorksheet("分析详情")
  detailSheet.columns = [
    { header: "章节", key: "section", width: 15 },
    { header: "类型", key: "type", width: 15 },
    { header: "内容", key: "content", width: 80 },
  ]
  for (const s of structured.displayContent.sections) {
    detailSheet.addRow({
      section: s.title,
      type: s.type,
      content: s.content,
    })
  }

  // Sheet 3: 证据明细
  const evidenceSheet = workbook.addWorksheet("证据明细")
  evidenceSheet.columns = [
    { header: "来源", key: "source", width: 15 },
    { header: "类型", key: "type", width: 15 },
    { header: "可靠性", key: "reliability", width: 10 },
    { header: "相关性", key: "relevance", width: 10 },
    { header: "内容摘要", key: "content", width: 60 },
  ]
  for (const e of structured.evidenceChain.evidences) {
    evidenceSheet.addRow({
      source: e.source,
      type: e.type,
      reliability: e.reliability,
      relevance: e.relevance,
      content: e.content.slice(0, 200),
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return {
    content: Buffer.from(buffer),
    format: "xlsx",
    filename: `analysis_${timestamp}.xlsx`,
    mimeType: MIME_TYPES.xlsx,
  }
}

// ──── 通用 Markdown 模板（MD/PDF/DOCX 共享） ──────────
function buildReportMarkdown(
  structured: StructuredAgentResponse,
  analysisContext: AnalysisContext | null,
  timestamp: string
): string {
  const lines: string[] = []
  lines.push("# 农业分析报告\n")
  lines.push(`**分析时间**: ${timestamp}`)

  if (analysisContext?.runtimeInputs?.region?.value) {
    lines.push(`**地块**: ${analysisContext.runtimeInputs.region.value}`)
  }

  const expertLabels = analysisContext?.activeExperts
    ?.map(ea => ANALYSIS_EXPERTS[ea.expertId]?.label)
    .filter(Boolean) ?? []
  if (expertLabels.length) {
    lines.push(`**激活模块**: ${expertLabels.join("、")}`)
  }

  if (structured.verdict?.confidence?.finalConfidence) {
    lines.push(`**综合置信度**: ${structured.verdict.confidence.finalConfidence}%`)
  }
  lines.push("")

  // 结论
  lines.push("---\n\n## 一、分析结论\n")
  lines.push(structured.displayContent.summary)
  lines.push("")

  // sections
  let secNum = 1
  for (const s of structured.displayContent.sections) {
    if (["conclusion", "evidence", "reasoning", "confidence"].includes(s.type)) {
      secNum++
      lines.push(`---\n\n## ${toRoman(secNum)}、${s.title}\n`)
      lines.push(s.content)
      lines.push("")
    }
  }

  const totalEvidences = structured.evidenceChain?.evidences?.length ?? 0
  lines.push(`---\n\n> 本报告由农业智能体自动生成。基于 ${totalEvidences} 条证据。`)

  return lines.join("\n")
}
```

**路由层 — report/route.ts**：

```typescript
// src/app/api/agent/chat/threads/[threadId]/messages/[messageId]/report/route.ts
// GET handler

export async function GET(request: NextRequest, { params }) {
  const { threadId, messageId } = params
  const format = request.nextUrl.searchParams.get("format") as ReportFormat | null

  // 1. 从 ChatMessage 加载 StructuredAgentResponse + analysisContext
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: { thread: { select: { metadata: true } } },
  })
  if (!message?.structuredResponse) {
    return new Response("Not Found", { status: 404 })
  }

  const structured = message.structuredResponse as StructuredAgentResponse
  const analysisContext = (message.thread.metadata as any)?.analysisContext ?? null

  // 2. 调用生成服务
  const report = await generateReport(structured, analysisContext, format)

  // 3. 返回文件
  return new Response(report.content, {
    headers: {
      "Content-Type": report.mimeType,
      "Content-Disposition": `attachment; filename="${report.filename}"`,
    },
  })
}
```

**依赖引入（添加到 package.json）**：

```json
{
  "dependencies": {
    "docx": "^9.x",         // DOCX 生成
    "exceljs": "^4.x",      // XLSX 生成
    "pdfmake": "^0.2.x"     // PDF 生成（轻量，不需要无头浏览器）
  }
}
```

> 注：`pdfmake` 支持中文需配置字体文件。农业场景固定字体（如宋体/黑体），可内置到 `public/fonts/`。

**前端下载入口**（不同格式按钮按 expert 的 reportFormats 动态渲染）：

```
[📥 MD]  [📥 PDF]  [📥 DOCX]   ← crop_compare / pest_risk
[📥 XLSX]  [📥 PDF]             ← roi_analysis
```

> 前端按钮属于 UI 变更，不在本计划范围。Step 4 只建后端 API + 服务层。

### 4.9 变更点

| 文件 | 操作 | 具体改动 |
|------|------|---------|
| [src/agents/experts/registry.ts](file:///home/xmm/ai/farm-agent/src/agents/experts/registry.ts) | **新建** | `AnalysisExpert` 接口 + `ANALYSIS_EXPERTS` 注册表（含 `reportFormats` 字段） |
| [src/services/analysis-context.ts](file:///home/xmm/ai/farm-agent/src/services/analysis-context.ts) | **新建** | `AnalysisContext` 类型 + CRUD（读/写 ChatThread.metadata） |
| [src/services/report-generator.ts](file:///home/xmm/ai/farm-agent/src/services/report-generator.ts) | **新建** | `generateReport()` + 4 格式生成器（MD/PDF/DOCX/XLSX）+ 默认格式推导 |
| [src/agents/state.ts](file:///home/xmm/ai/farm-agent/src/agents/state.ts) | 修改 | AgentState 新增 `analysisContext: Annotation<AnalysisContext \| null>()` |
| [src/app/api/agent/chat/stream/route.ts](file:///home/xmm/ai/farm-agent/src/app/api/agent/chat/stream/route.ts) | 修改 | 请求开始加载 `getAnalysisContext(threadId)` → 注入 state；请求结束后 `saveAnalysisContext(threadId, ctx)` |
| [src/agents/nodes/retrieval.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/retrieval.ts) | 修改 | 合并 activeExperts 的 evidenceFilter 做 ChromaDB 检索过滤 |
| [src/agents/nodes/reasoning.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/reasoning.ts) | 修改 | 拼接各专家的 promptTemplate + 注入 runtimeInputs |
| [src/agents/nodes/response.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/response.ts) | 修改 | 合并 activeExperts 的 outputSections → 传给 ResponseStrategy |
| [src/app/api/agent/chat/threads/[threadId]/messages/[messageId]/report/route.ts](file:///home/xmm/ai/farm-agent/src/app/api/agent/chat/threads/[threadId]/messages/[messageId]/report/route.ts) | **新建** | 多格式报告下载 API（路由层） |

### 4.10 验证

| 验证项 | 方法 |
|--------|------|
| 注册表完整性 | `ANALYSIS_EXPERTS` 含 crop_compare / roi_analysis / pest_risk 三个专家，每个专家有四属性（inputSchema/outputSections/promptTemplate/evidenceFilter） |
| 专家激活 | 第1轮手动注入 `activeExperts=["crop_compare","roi_analysis"]` → reasoning prompt 中包含两个专家的 promptTemplate |
| 跨轮记忆 | 第1轮激活2个专家 → 刷新页面（模拟第2轮）→ activeExperts 仍为2个 |
| RAG 按专家过滤 | activeExperts 含 roi_analysis → retrieval 只检索"市场行情"+"经济数据"来源文档 |
| 推理按专家维度 | reasoning prompt 中每个专家有独立的分析维度块 |
| 输出按专家 sections 合并 | response 的 DisplayContent.sections 包含各专家对应的 type（conclusion/confidence/risks） |
| 下载分析报告 | GET /report?format=md → 返回 Markdown；format=xlsx → 返回 Excel（3个Sheet）；format=docx → 返回 Word；format=pdf → 返回 PDF；不指定格式时按专家自动推导（roi→xlsx, 其他→md, 混合→pdf） |

---

## Step 5: 语义缓存（LRU + TTL + Generation-based 淘汰）

### 5.1 问题描述

相同问题重复发送给 Agent 时，每次都走完整管线（intention → retrieval → reasoning → verdict → response），浪费 LLM token 和响应延迟。需要一层语义级缓存：相同意图 + 相似问题 → 直接返回缓存结果。

### 5.2 设计

#### 缓存键构建

缓存键由三元组组成，确保缓存命中时结果确实适用于当前请求：

```typescript
interface CacheKey {
  queryHash: string      // 用户消息内容的 SHA256 前 16 位
  intentHash: string     // 意图类型的 hash
  contextHash: string    // 项目/线程上下文的 hash（projectId + threadId）
  compositeKey: string   // 三者拼接的最终键
}
```

#### Generation-based 三层职责分离

这是从 team-coordinator-agent 完整版继承的核心架构。条目不决策，条目只是诚实——缓存失效由架构层统一判定：

```
层              谁                 做什么                                   触发时机
────────────────────────────────────────────────────────────────────────────────
标记层(生产者)   KnowledgeIndexer  索引完成后调用 bumpKbGeneration()         知识库文档变更时
               递增全局版本号

标记层(携带者)   CacheEntry        写入时记录 kbGeneration:                   缓存写入时
               "我出生在 generation N"，字段本身是死的

判定层(消费者)   SemanticCache.get() 读条目的 kbGeneration 与全局比对，      每次缓存查询时
                不匹配 → 淘汰，这是架构层的统一判定

统计层(观测者)   AuditLog          记录 GENERATION_BUMPED / STALE 分布      (可选)
```

**为什么用 Generation 而不是 TTL**：TTL 只能处理"时间到了"的场景，但不知道知识库内容是否变了。知识库新增文档后，旧缓存可能已过时——Generation 递增后所有旧条目在下次查询时自动检测到 `kbGeneration < currentGeneration`，惰性淘汰，O(1) 操作。

**触发链**：
```
知识库文档变更 (create/update/delete)
  → KnowledgeIndexer 索引完成后
  → bumpKbGeneration()（全局版本号 +1，一行代码）
  → 无需扫描任何缓存条目 (O(1))
  → 下次 get() 时自动感知 stale，惰性淘汰
```

#### 缓存配置

```typescript
// 最大条目数
const MAX_CACHE_SIZE = 200

// TTL（秒）— 按意图类型区分
const CACHE_TTL: Record<string, number> = {
  chat: 3600,         // 闲聊缓存 1 小时
  question: 1800,     // 知识问答缓存 30 分钟
  analysis: 300,      // 分析类缓存 5 分钟（数据时效性要求高）
  planning: 600,
  decision: 600,
  creation: 300,
  modification: 300,
  default: 300,
}
```

#### 实现

```typescript
// src/services/semantic-cache.ts（新建）

// 全局知识库 generation
let kbGeneration = 0

export function bumpKbGeneration(): number {
  kbGeneration++
  return kbGeneration
}

export function getKbGeneration(): number {
  return kbGeneration
}

interface CacheEntry {
  responseContent: string      // 完整回复文本
  displayContent: DisplayContent // 结构化展示内容
  createdAt: Date
  ttl: number                  // 到期时间（秒）
  hitCount: number
  sourceTraceId: string        // 原始请求的 traceId
  kbGeneration: number         // "我出生在 generation N"
  intent: string
}

class SimpleSemanticCache {
  private store = new Map<string, CacheEntry>()
  private maxSize = MAX_CACHE_SIZE

  get(key: CacheKey): CacheEntry | null {
    const entry = this.store.get(key.compositeKey)
    if (!entry) return null

    // Generation 过期判定
    if (entry.kbGeneration < kbGeneration) {
      this.store.delete(key.compositeKey)
      return null
    }

    // TTL 过期判定
    if (Date.now() - entry.createdAt.getTime() > entry.ttl * 1000) {
      this.store.delete(key.compositeKey)
      return null
    }

    entry.hitCount++
    return entry
  }

  set(key: CacheKey, entry: CacheEntry): void {
    // LRU 淘汰：超出容量时删除最旧的条目
    if (this.store.size >= this.maxSize) {
      const oldest = [...this.store.entries()]
        .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime())[0]
      if (oldest) this.store.delete(oldest[0])
    }
    this.store.set(key.compositeKey, entry)
  }

  invalidate(pattern: RegExp): number {
    let count = 0
    for (const key of this.store.keys()) {
      if (pattern.test(key)) {
        this.store.delete(key)
        count++
      }
    }
    return count
  }

  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return { size: this.store.size, maxSize: this.maxSize }
  }
}

export function buildCacheKey(
  query: string,
  intent: string,
  projectId?: string,
  threadId?: string,
): CacheKey {
  // 生产环境使用 crypto.createHash，此处示意
  const queryHash = hashString(query).slice(0, 16)
  const intentHash = hashString(intent).slice(0, 8)
  const contextHash = hashString(`${projectId || ""}-${threadId || ""}`).slice(0, 8)
  return {
    queryHash,
    intentHash,
    contextHash,
    compositeKey: `${queryHash}:${intentHash}:${contextHash}`,
  }
}

export const semanticCache = new SimpleSemanticCache()
```

### 5.3 stream/route.ts 集成方案

缓存在 [stream/route.ts](file:///home/xmm/ai/farm-agent/src/app/api/agent/chat/stream/route.ts) 中集成，数据流如下：

```
POST /api/agent/chat/stream
    │
    ├─ 1. 加载 analysisContext (Step 4)
    │
    ├─ 2. 构建 cacheKey = buildCacheKey(userMessage, intent, projectId, threadId)
    │
    ├─ 3. cacheEntry = semanticCache.get(cacheKey)
    │      │
    │      ├─ HIT → 模拟流式输出 → 返回（跳过 Agent 管线）
    │      │
    │      └─ MISS → 继续执行 Agent 管线
    │
    ├─ 4. 注入 analysisContext 到 AgentState
    │
    ├─ 5. 执行 Agent 管线（streamAgent）
    │
    ├─ 6. semanticCache.set(cacheKey, { responseContent, displayContent, ... })
    │
    └─ 7. saveAnalysisContext(threadId, analysisContext)
```

#### 缓存命中时的模拟流式输出

当缓存命中时，不能让前端感知到"瞬间出结果"（用户体验差，且可能触发前端 loading 状态异常），需要模拟正常的 SSE token 流。采用**自适应延迟分片**算法：

```typescript
// stream/route.ts 缓存命中分支
if (cacheEntry) {
  // SSE: 标记缓存来源（前端可展示"⚡ 缓存响应"）
  controller.enqueue(encoder.encode(JSON.stringify({
    type: "cache_hit",
    sourceTraceId: cacheEntry.sourceTraceId,
    cachedAt: cacheEntry.createdAt.toISOString(),
  }) + "\n"))

  // 自适应延迟模拟流式分片输出
  const chunkSize = 3                    // 每个 token 事件包含 3 个字符
  const tokens = splitIntoTokens(cacheEntry.responseContent, chunkSize)
  const totalTokens = tokens.length
  const targetTotalMs = 1500             // 目标总耗时 1.5s
  const delayPerToken = Math.max(5, Math.floor(targetTotalMs / totalTokens))

  for (let i = 0; i < tokens.length; i++) {
    controller.enqueue(encoder.encode(JSON.stringify({
      type: "token", content: tokens[i],
    }) + "\n"))
    if (i < tokens.length - 1) {
      await sleep(delayPerToken)
    }
  }

  // 推送结构化数据（与正常流程一致）
  controller.enqueue(encoder.encode(JSON.stringify({
    type: "structured_output",
    data: cacheEntry.displayContent,
  }) + "\n"))

  controller.close()
  return
}
```

**设计要点**：
- `targetTotalMs = 1500`：上限 1.5 秒，确保用户体验不过慢
- `Math.max(5, ...)`：每个分片至少 5ms 间隔，避免视觉闪烁
- `chunkSize = 3`：每个 token 事件推送 3 字符，模拟真实 LLM 逐 token 输出
- 缓存命中时仍推送 `structured_output` 事件，前端展示逻辑与正常流程一致

### 5.4 KnowledgeIndexer 集成 Generation 递增

在 [knowledge-indexer.ts](file:///home/xmm/ai/farm-agent/src/services/knowledge-indexer.ts) 索引完成后加一行调用：

```typescript
// 索引逻辑...
await this.completeIndexing(documentId)

// 新增：递增全局 kbGeneration，使所有旧缓存条目在下次查询时自动过期
bumpKbGeneration()
```

### 5.5 变更点

| 文件 | 操作 | 具体改动 |
|------|------|---------|
| [src/services/semantic-cache.ts](file:///home/xmm/ai/farm-agent/src/services/semantic-cache.ts) | **新建** | `SimpleSemanticCache` 类 + `buildCacheKey` + `bumpKbGeneration` |
| [src/app/api/agent/chat/stream/route.ts](file:///home/xmm/ai/farm-agent/src/app/api/agent/chat/stream/route.ts) | 修改 | 缓存键构建 + 缓存查询/存储 + 命中模拟流式输出 |
| [src/services/knowledge-indexer.ts](file:///home/xmm/ai/farm-agent/src/services/knowledge-indexer.ts) | 修改 | 索引完成后调用 `bumpKbGeneration()` |

### 5.6 验证

| 验证项 | 方法 |
|--------|------|
| 缓存命中 | 发送同一问题两次 → 第一次走完整管线，第二次 SSE 首事件为 `cache_hit` |
| 缓存过期(TTL) | 等待超过 TTL 后再次发送 → 重新走完整管线 |
| 缓存过期(Generation) | 上传新文档后再次发送相同问题 → `kbGeneration` 不匹配使旧条目被淘汰 |
| 模拟流式 | 缓存命中时 token 事件分片推送，延迟在 500ms-1500ms 之间 |
| LRU 淘汰 | 填充超过 200 条缓存后，最旧的条目被逐出 |

---

## Step 6: 汇聚点 — stream/route.ts 完整改造

[stream/route.ts](file:///home/xmm/ai/farm-agent/src/app/api/agent/chat/stream/route.ts) 是本计划所有 Step 的汇聚点。改造后的完整流程如下：

```
POST /api/agent/chat/stream
    │
    ├─ 0. 获取 thread / project / user 信息（与当前一致）
    │
    ├─ 1. 加载分析上下文
    │      const analysisCtx = await getAnalysisContext(threadId)
    │
    ├─ 2. 构建语义缓存键
    │      const cacheKey = buildCacheKey(userMessage, intent, projectId, threadId)
    │
    ├─ 3. 查询缓存
    │      const cached = semanticCache.get(cacheKey)
    │      if (cached) → 模拟流式输出 → return
    │
    ├─ 4. 注入分析上下文到 AgentState
    │      state.analysisContext = analysisCtx
    │
    ├─ 5. 执行 Agent 管线
    │      const result = await streamAgent(state)
    │
    ├─ 6. 写入语义缓存
    │      semanticCache.set(cacheKey, {
    │        responseContent: result.responseContent,
    │        displayContent: result.displayContent,
    │        createdAt: new Date(),
    │        ttl: CACHE_TTL[intent] || CACHE_TTL.default,
    │        kbGeneration: getKbGeneration(),
    │        sourceTraceId: result.traceId,
    │        intent,
    │      })
    │
    ├─ 7. 持久化分析上下文
    │      await saveAnalysisContext(threadId, analysisCtx)
    │
    └─ 8. 持久化聊天消息（与当前一致）
```

### 与传统聊天管线的区别

- **缓存优先**：在 Agent 管线启动前先查缓存（L3 语义缓存），命中直接返回
- **分析上下文注入**：每轮从 DB 加载 AnalysisContext，注入 AgentState
- **分析上下文回写**：每轮结束后将 AnalysisContext（含新的 activeExperts 和 runtimeInputs）写回 DB
- **缓存回写**：每轮结束后将 LLM 产出写入缓存，供下次命中

---

## Step 7: 审计数据回流 → 策略演化

Step 1-6 建立了规则嵌入（策略注册、分析专家、缓存、stream 汇聚），但如果所有参数都是常量，系统上线后就死在那里不动了。Step 7 的目标是：**系统运行中从自己的审计数据里学习参数。**

### 7.1 核心机制

每一步不做"革命式重构"，而是在现有路径上增加采集点和回流点：

```
系统运行
  │
  ├─→ 每轮管线结束时采集路径质量 → AnalysisContext.turnHistory
  ├─→ 语义缓存过期重新运行后对比新旧结论 → cache-ttl-stats.json
  ├─→ 下载请求记录格式偏好 → ChatThread.metadata.downloadHistory
  └─→ 下次策略裁决时读取累积指标 → 参数从常量 → 学习值
```

### 7.2 三条演化回路

#### 回路一：语义缓存 TTL 自主学习

缓存写入时记录 `verdictConfidence`。过期后 LLM 重新运行，与旧 `verdictConfidence` 对比：
- 相同（±5%）→ TTL 上调（浪费了一次 LLM 调用，说明 TTL 太短）
- 不同 → TTL 不变或下调（数据确实变了，缓存过期合理）

学习数据存在 `logs/cache-ttl-stats.json`。每次适应后记录 AuditLog.extra。

#### 回路二：下载格式偏好学习

`inferDefaultFormat` 按专家类型推导默认格式（规则写死），但实际用户行为可能与规则不同。在 `report-generator.ts` 中添加 `learnFormatPreference()`：
- 同一场景（同一组专家 + 同一地块）下载记录 ≥ 5 条
- 最高频格式占比 > 60% → 学习为该场景的偏好
- 偏好 > 规则

下载记录存在 `ChatThread.metadata.downloadHistory` 中。

#### 回路三：多维度执行度 — 裁决层自检

最关键的一条。不是"置信度下降就报警"，而是 4 个独立维度的信号组合成一个可解释的复合裁决。

**四个 MetricDescriptor 检测器**（完整算法见 farm-agent 方案文档 Step 6 回路三）：

| 维度 | 算法 | 样本门槛 | 修正方向 |
|------|------|---------|---------|
| 置信度轨迹 | 线性回归 β 斜率 | ≥5 轮 | β < -3 → augment_prompt |
| 证据覆盖率 | 连续 3 轮递减 + 低于全局均值 ×0.5 | ≥3 轮 | relax_evidence_filter |
| 追问率 | followUpCount>0 占比 | ≥5 轮 | ≥40% → activate_expert（建议 pest_risk） |
| 置信度波动率 | 标准差 σ | ≥5 轮 | σ > 15% → augment_prompt（细化维度） |

**复合裁决**：`assessExecutionQuality(history, activeExperts, baselines, region)` — 逐维度检测 → 按 severity × priority 加权评分 → 合并多信号为单一 StrategyAdjustment。

**全局基准**：`buildMetricBaselines()` — 从所有 ChatThread 的 turnHistory 聚合每个 `expertId:region` 组合的均值、标准差、证据量、追问率。

所有调整记录到 AuditLog.extra: `{ action: "EXECUTION_QUALITY_ASSESSED", signals: [...], adjustment: {...} }`。

**实现文件**：`src/services/path-metrics.ts`（新建），在 `resolveResponseStrategy` 调用 `assessExecutionQuality()`。完整代码见 farm-agent 方案文档 Step 6 回路三。

### 7.3 为什么不改 Prisma Schema

所有演化数据走 `ChatThread.metadata` Json 字段（`turnHistory`、`downloadHistory`），TTL 统计走文件日志。后续需要索引/聚合查询时再做 Schema 变更。

### 7.4 文件变更

| 文件 | 操作 |
|------|------|
| `src/services/path-metrics.ts` | **新建** |
| `src/services/cache-ttl-stats.ts` | **新建** |
| `src/services/report-generator.ts` | 修改：`inferDefaultFormat` + `learnFormatPreference` |
| `src/agents/response-strategy.ts` | 修改：`resolveResponseStrategy` + `assessExecutionQuality`（多维度执行度复合裁决） |
| `src/services/analysis-context.ts` | 修改：AnalysisContext + `AnalysisTurnRecord` + `appendTurnRecord` |
| `src/app/api/agent/chat/stream/route.ts` | 修改：每轮结束采集 turnHistory；读写 downloadHistory；启动时异步构建 MetricBaselines |
| `src/app/api/agent/chat/threads/[threadId]/messages/[messageId]/report/route.ts` | 修改：下载时记录 DownloadRecord |

---

## Step 8: 三层审计管线（L1 开发审计 + L2 运行时审计 + L3 控制台）

Step 7 建立了采集和演化回路，但 **Layer 2 运行时审计在生产环境是缺失的**——现有 `agent-audit-logger.ts` 只写 console + 文件（文件仅在 dev 开启），不写 `AuditLog` DB 表。生产环境 `NODE_ENV=production` 时，`AuditLog` 表为空，前端无法查询"谁在什么时候做了什么"。

Step 8 补齐这个缺口：升级现有 `agent-audit-logger.ts` 使其成为真正的 Layer 2 运行时审计（始终写 AuditLog 表），同时新建 `debug-tracer.ts` 作为 Layer 1 开发审计（仅 dev 启用，节点级详细 trace + 微调数据导出），Layer 3 控制台日志保持不变。

### 8.1 三层职责边界

```
                         ┌────────────────────────────────────────────┐
                         │          agent-audit-logger.ts              │
                         │          (Layer 1 + Layer 2 + Layer 3)      │
                         │                                            │
   Layer 1 (dev only)    │  console + file  →  per-node 细节          │
   ──────────────────    │  debug-tracer.ts →  logs/debug/ + API      │
                         │                                            │
   Layer 2 (always on)   │  writeAuditLog() →  AuditLog 表            │
   ──────────────────    │  高层事件: CHAT_REQUEST/RESPONSE/ERROR      │
                         │            STRATEGY_MATCHED                 │
                         │            EXECUTION_QUALITY                │
                         │            CACHE_HIT/MISS/SET/EVICT         │
                         │                                            │
   Layer 3 (LOG_LEVEL)   │  console.log (所有 audit 函数都走)          │
   ──────────────────    │                                            │
                         └────────────────────────────────────────────┘
```

| 层次 | 谁需要 | 写什么 | 写到哪 | 开关 |
|------|-------|--------|--------|------|
| **L1 开发审计** | AI 助手 + 开发者 | 每节点的 input/output/裁决 | `logs/debug/` 文件 + Debug API | `NODE_ENV=development` |
| **L2 运行时审计** | UI 组件 + 最终用户 | 请求/响应/策略匹配/执行质量/缓存操作 | `AuditLog` DB 表 | **始终开启** |
| **L3 控制台** | 开发者 | 所有 audit 事件 | `console.log` | `LOG_LEVEL` |

**关键原则**：L1 节点级细节 ≠ L2 业务事件。L2 只记录"谁在什么时候做了什么"，不记录"intention 节点的 rawOutput 是什么"。后者是 L1（dev trace）的职责。

### 8.2 Layer 2：升级 agent-audit-logger.ts（始终写 AuditLog 表）

**这不是新建文件——是升级现有文件。**

现有 `agent-audit-logger.ts` 只有两个通道：`console.log` + `writeToFile()`（文件仅在 dev 开启）。升级后新增第三个通道：`writeAuditLog()` → `prisma.auditLog.create()`。

#### 8.2.1 新增基础设施

```typescript
// src/lib/agent-audit-logger.ts — 新增部分

import { prisma } from "@/lib/prisma"

// 模块级上下文（stream/route.ts 在每个请求前设置）
let currentUserId: string | undefined
let currentTraceId: string | undefined

export function setAuditContext(userId: string, traceId: string) {
  currentUserId = userId
  currentTraceId = traceId
}

export function clearAuditContext() {
  currentUserId = undefined
  currentTraceId = undefined
}

// Layer 2 DB 写入（fire-and-forget，不阻塞管线）
async function writeAuditLog(
  action: string,
  targetType: string,
  targetId: string,
  extra?: Record<string, unknown>,
  reason?: string
): Promise<void> {
  if (!currentUserId) return
  try {
    await prisma.auditLog.create({
      data: {
        userId: currentUserId,
        action,
        targetType,
        targetId: targetId.slice(0, 255),
        traceId: currentTraceId,
        afterState: extra ? (JSON.parse(JSON.stringify(extra)) as Record<string, unknown>) : undefined,
        reason,
      },
    })
  } catch (error) {
    console.error("[AGENT-AUDIT] Failed to write AuditLog to DB:", error)
  }
}
```

#### 8.2.2 升级现有函数：三通道输出

三个核心函数从双通道（console + file）升级为三通道（console + file + DB）：

| 函数 | 原有通道 | 新增 Layer 2 写入 | AuditLog.targetType | AuditLog.action |
|------|---------|------------------|---------------------|-----------------|
| `agentAuditRequest()` | console + file | ✅ | `AGENT_SESSION` | `CHAT_REQUEST` |
| `agentAuditResponse()` | console + file | ✅ | `AGENT_SESSION` | `CHAT_RESPONSE` |
| `agentAuditError()` | console + file | ✅ | `AGENT_SESSION` | `CHAT_ERROR` |

**节点级函数（`agentAuditNodeStart/End/Error`、`agentAuditLLMCall/Error`、`agentAuditRoute`、`agentAuditRetrieval`）不写 AuditLog 表**——这些是 Layer 1 开发审计的粒度，写在 `logs/agent/agent-audit.log` 文件里（dev only）。

#### 8.2.3 新增 Layer 2 专用函数

```typescript
// 策略匹配审计 — 记录哪个 descriptor 获胜
export function agentAuditStrategy(
  strategyId: string,
  thinkingLevel: string,
  intent: string,
  candidateCount: number,
  extra?: Record<string, unknown>
)

// 执行质量审计 — 记录 4 维度检测结果
export function agentAuditExecutionQuality(
  signals: Array<{ metric: string; severity: number; detail: string }>,
  compositeScore: number,
  adjustment?: Record<string, unknown>
)

// 缓存操作审计 — 记录每次缓存命中/未命中/写入/淘汰
export function agentAuditCacheOperation(
  operation: "hit" | "miss" | "set" | "evict",
  cacheKey: string,
  extra?: Record<string, unknown>
)
```

#### 8.2.4 stream/route.ts 集成

```typescript
// stream/route.ts — 请求开始时
import { setAuditContext, clearAuditContext } from "@/lib/agent-audit-logger"

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  const userId = session.user.id
  const traceId = generateTraceId()

  // Layer 2 上下文注入（后续所有 agentAudit* 调用自动携带 userId/traceId）
  setAuditContext(userId, traceId)

  try {
    // ... Agent 管线执行
    // agentAuditStrategy() 在 response.ts 中调用
    // agentAuditExecutionQuality() 在 path-metrics.ts 中调用
    // agentAuditCacheOperation() 在 semantic-cache.ts 中调用
  } finally {
    clearAuditContext()
  }
}
```

#### 8.2.5 生产环境验证

```
生产环境 (NODE_ENV=production) 运行后：

  AuditLog 表查询:
  SELECT * FROM AuditLog WHERE targetType = 'AGENT_SESSION' ORDER BY createdAt DESC;

  预期结果:
  ┌──────────────────────────────────────────────────────────────────┐
  │ action=CHAT_REQUEST    targetId=thread-xxx    afterState={...}    │
  │ action=STRATEGY_MATCHED targetId=deep:analysis afterState={...}   │
  │ action=CACHE_MISS       targetId=abc123:xyz... afterState={...}   │
  │ action=CACHE_SET        targetId=abc123:xyz... afterState={...}   │
  │ action=EXECUTION_QUALITY targetId=quality-score:85 afterState={...}│
  │ action=CHAT_RESPONSE    targetId=thread-xxx    afterState={...}   │
  └──────────────────────────────────────────────────────────────────┘

  通过 traceId 可完整还原一次请求的所有业务事件：
  query_audit_logs({ traceId: "trace-abc123" })
  → CHAT_REQUEST → STRATEGY_MATCHED → CACHE_MISS → ... → CHAT_RESPONSE
```

### 8.3 Layer 1：Debug Trace（仅 dev 启用）

Debug Trace 单条可达 10-50KB，用文件日志为主 + API 按需加载。仅在 `NODE_ENV=development` 时激活。

#### 8.3.1 Debug Trace 数据结构

一条 per-message trace 包含所有管线节点的输入、输出和裁决过程。核心字段：

| 节点 | 记录内容 |
|------|---------|
| intention | prompt + rawOutput + parsed intent/thinkingLevel |
| retrieval | expertEvidenceFilters + results（含 chunkId/reliability/relevance） |
| reasoning | prompt（含 expert promptTemplate + evidence）+ rawOutput + parsed |
| verdict | verdictResult（conclusion/confidence/risks/reasoningPath） |
| response-strategy | matchedDescriptor + allCandidates + modifications + finalStrategy |
| response | prompt + rawOutput + displayContent.sections |
| execution-quality | 4 个 metric signals + compositeScore + adjustment |

外加汇总（totalLatency/totalTokens/confidence/cacheHit）和微调标签（quality="excellent"/"good"/"acceptable"/"poor"）。

完整 `DebugTrace` 接口定义见 farm-agent 方案文档 Step 7.2。

#### 8.3.2 写入通道

| 通道 | 格式 | 启用条件 |
|------|------|---------|
| 文件日志 | `logs/debug/{threadId}/{messageIndex:03d}-{role}-{messageId}.json` | `NODE_ENV=development` |
| API | `GET /api/agent/chat/threads/{threadId}/debug` | `NODE_ENV=development` |
| console | `[DEBUG-TRACE] messageId=xxx intent=analysis confidence=78%` | `NODE_ENV=development` |

**不再通过 AuditLog 表写入**——AuditLog 表是 Layer 2 运行时审计的通道，Layer 1 debug trace 走独立的文件/API 通道，职责分离清晰。

### 8.4 微调数据导出

API 支持 `format=fine-tuning`，从 `logs/debug/` 文件中读取完整 trace 并转换为微调训练数据集：

```
GET /api/agent/chat/threads/{threadId}/debug?format=fine-tuning

返回:
[
  {
    "instruction": "你是一个农业分析智能体...",
    "input": "邗江区种水稻，帮我分析一下",
    "output": "邗江区水稻主栽建议南粳9108...",
    "quality": "good",
    "metadata": {
      "confidence": 78, "followUpCount": 2,
      "strategy": "deep:analysis", "experts": ["crop_compare", "roi_analysis"]
    }
  }
]
```

**筛选规则**（自动应用）：
- `followUpCount > 0` → 排除
- `confidence < 50` → 排除
- chat 意图 → 排除
- `confidence >= 90 && followUpCount = 0` → quality="excellent"
- `confidence >= 75 && followUpCount = 0` → quality="good"
- `strategyAdjusted = true` → quality="acceptable"

### 8.5 文件变更

| 文件 | 操作 | 层次 |
|------|------|------|
| `src/lib/agent-audit-logger.ts` | **修改（升级）** | L1+L2+L3 | 新增 `import { prisma }` + `setAuditContext/clearAuditContext` + `writeAuditLog()`；`agentAuditRequest/Response/Error` 新增 DB 通道；新增 `agentAuditStrategy/ExecutionQuality/CacheOperation` |
| `src/services/debug-tracer.ts` | **新建** | L1 | `DebugTrace` 类型 + `captureNode()` + `captureSummary()` + `exportFineTuningData()`（`NODE_ENV=development` 时激活） |
| `src/app/api/agent/chat/stream/route.ts` | **修改** | L1+L2 | 调用 `setAuditContext(userId, traceId)` 注入 L2 上下文；每个节点完成事件调用 `captureNode()`（L1）；管线完成后调用 `captureSummary()`（L1） |
| `src/app/api/agent/chat/threads/[threadId]/debug/route.ts` | **新建** | L1 | GET 端点（format=json/fine-tuning，仅在 dev 环境启用） |
| `src/agents/nodes/response.ts` | **修改** | L2 | `resolveResponseStrategy()` 后调用 `agentAuditStrategy()` |
| `src/services/path-metrics.ts` | **修改** | L2 | `assessExecutionQuality()` 后调用 `agentAuditExecutionQuality()` |
| `src/services/semantic-cache.ts` | **修改** | L2 | 每次 `get/set/evict` 调用 `agentAuditCacheOperation()` |

### 8.6 验证

| 验证项 | 方法 | 通过标准 |
|--------|------|---------|
| **Layer 2: AuditLog 写入（生产）** | 设置 `NODE_ENV=production`，发送消息 → 查询 AuditLog 表 | AuditLog 表有 CHAT_REQUEST/STRATEGY_MATCHED/CHAT_RESPONSE 记录 |
| **Layer 2: traceId 串联** | `query_audit_logs({ traceId })` | 同一请求的所有 AuditLog 记录共享相同 traceId |
| **Layer 2: 环境无关** | `NODE_ENV=production` + 发送消息 | AuditLog 表仍有记录（不依赖 NODE_ENV） |
| **Layer 1: trace 写入** | `NODE_ENV=development` → 发送消息 → 检查日志目录 | `logs/debug/{threadId}/` 下有 JSON 文件 |
| **Layer 1: 生产关闭** | `NODE_ENV=production` → 发送消息 → 检查日志目录 | `logs/debug/` 无新文件（debug-tracer 整体跳过） |
| **Layer 1: trace 完整性** | GET /debug?messageId=xxx | 包含所有 9 个 node trace |
| **微调导出** | GET /debug?format=fine-tuning | prompt/response 对 + quality 标签 |
| **质量筛选** | 导出后检查 | followUpCount>0/confidence<50 的消息被排除 |
| **策略审计** | 分析类消息 → 查询 AuditLog WHERE action='STRATEGY_MATCHED' | targetId 为匹配到的 descriptor id（如 "deep:analysis"） |
| **执行度审计** | 多轮对话（≥5轮） → 查询 AuditLog WHERE action='EXECUTION_QUALITY' | afterState 含 signals 数组和 compositeScore |
| **缓存审计** | 相同问题二次发送 → 查询 AuditLog | 第一次 CACHE_MISS + CACHE_SET，第二次 CACHE_HIT |

---

## 八、验证清单

### 8.1 类型收敛

| 验证项 | 方法 | 通过标准 |
|--------|------|---------|
| 零类型错误 | `npx tsc --noEmit` | 无类型错误 |
| Evidence 无重复定义 | grep "interface Evidence" src/ | 仅在 `src/types/evidence.ts` 中出现一次 |
| EvidenceRef 可用 | `npx tsc --noEmit` | 所有使用 EvidenceRef 的文件编译通过 |

### 8.2 thinkingLevel

| 验证项 | 方法 | 通过标准 |
|--------|------|---------|
| fast 通道 | 发送"你好" | SSE 事件序列: intention → response（无 retrieval/reasoning/verdict） |
| deep 通道 | 发送"水稻育秧步骤" | SSE 事件序列: intention → retrieval → reasoning → verdict → response |
| 回复长度控制 | 分析回复内容 | fast 回复 < 100 tokens |

### 8.3 ResponseStrategy

| 验证项 | 方法 | 通过标准 |
|--------|------|---------|
| fast 策略 | "你好" 回复 | system prompt 含"1-2句话"约束，sections 仅含 conclusion |
| deep 策略 | "制定开发计划" 回复 | system prompt 含"结构化表达"约束，sections 包含多个类型 |
| evidence_digest | 有非先验证据时 | 回复末尾有 "基于X条证据" 摘要行 |

### 8.4 分析专家模式

| 验证项 | 方法 | 通过标准 |
|--------|------|---------|
| 注册表 | 运行时读取 `ANALYSIS_EXPERTS` | 含3个专家，每个有四属性 |
| 专家激活 | 注入 `activeExperts=["crop_compare","roi_analysis"]` | reasoning prompt 含两专家 promptTemplate |
| 跨轮记忆 | 第1轮激活 → 刷新 → 第2轮 | activeExperts 保持 |
| RAG 过滤 | activeExperts 含 roi_analysis | retrieval 仅检索匹配 evidenceFilter 的文档 |
| 输出合并 | activeExperts 有多个 | DisplayContent.sections 含各专家对应的 type |

### 8.5 语义缓存

| 验证项 | 方法 | 通过标准 |
|--------|------|---------|
| 命中 | 同问题二次发送 | SSE 首事件为 `cache_hit`，无 Agent 管线事件 |
| 过期(TTL) | 超时后重发 | 走完整管线 |
| 过期(Generation) | 上传新文档后重发 | 走完整管线 |
| 模拟流式 | 缓存命中时观察 | token 事件分片，总耗时 0.5-1.5s |
| LRU 淘汰 | 填充 > 200 条 | 最旧条目被逐出 |

### 8.6 审计数据回流与策略演化

| 验证项 | 方法 | 通过标准 |
|--------|------|---------|
| turnHistory 采集 | 每轮管线结束后 dump analysisContext | turnHistory 长度 = 总轮数 |
| TTL 自主学习 | 同场景 3 次过期后结论相同 | TTL 上调 20%，AuditLog 含 adaptation 记录 |
| 下载格式偏好 | 同场景 PDF 占 8/10 | inferDefaultFormat 返回 PDF 而非规则默认 MD |
| 策略降级预警 | 连续 3 轮同专家置信度下降（78%→65%→58%） | promptHint 追加"信息缺口"；activeExperts 预激活 pest_risk |
| 演化可回滚 | 删除 metadata 字段或 cache-ttl-stats.json | 系统回退到初始常量 |

### 8.7 三层审计管线

| 验证项 | 方法 | 通过标准 |
|--------|------|---------|
| **L2: AuditLog 写入（生产）** | 设置 `NODE_ENV=production`，发送消息 → 查询 AuditLog 表 | AuditLog 表有 CHAT_REQUEST/STRATEGY_MATCHED/CHAT_RESPONSE 记录 |
| **L2: traceId 串联** | `query_audit_logs({ traceId })` | 同一请求的所有 AuditLog 记录共享相同 traceId |
| **L2: 环境无关** | `NODE_ENV=production` + 发送消息 | AuditLog 表仍有记录 |
| **L2: 策略审计** | 分析类消息 → 查询 AuditLog WHERE action='STRATEGY_MATCHED' | targetId 为匹配到的 descriptor id |
| **L2: 节点函数不写 DB** | 发送消息后查询 AuditLog | 无 NODE_START/NODE_END/LLM_CALL 等记录 |
| **L1: trace 写入** | `NODE_ENV=development` → 发送消息 → 检查日志目录 | `logs/debug/{threadId}/` 下有 JSON 文件 |
| **L1: 生产关闭** | `NODE_ENV=production` → 检查日志目录 | `logs/debug/` 无新文件 |
| **L1: trace 完整性** | GET /debug?messageId=xxx | 包含所有 9 个 node trace |
| **微调导出** | GET /debug?format=fine-tuning | prompt/response 对 + quality 标签 |
| **质量筛选** | 导出后检查 | followUpCount>0/confidence<50 的消息被排除 |
| **文件排序** | `ls logs/debug/{threadId}/` | 按 messageIndex 升序 |
| **缓存审计** | 相同问题二次发送 → 查询 AuditLog | CACHE_MISS + CACHE_SET（第1次），CACHE_HIT（第2次） |
| **执行度审计** | 多轮对话（≥5轮）→ 查询 AuditLog | afterState 含 signals + compositeScore |

---

## 九、文件变更清单

| # | 文件 | 操作 | Step | 说明 |
|---|------|------|------|------|
| 1 | [src/types/evidence.ts](file:///home/xmm/ai/farm-agent/src/types/evidence.ts) | 修改 | 1 | Evidence 加 chunkId/expandable/detailUrl/score；新建 EvidenceRef + EvidenceSummary |
| 2 | [src/agents/state.ts](file:///home/xmm/ai/farm-agent/src/agents/state.ts) | 修改 | 1+2+4 | 删除内联 Evidence；CurrentTask 加 thinkingLevel；新增 analysisContext |
| 3 | [src/agents/prompts/types.ts](file:///home/xmm/ai/farm-agent/src/agents/prompts/types.ts) | 修改 | 1+2 | 内联 evidence 替换为 EvidenceRef[]；CurrentTask 加 thinkingLevel |
| 4 | [src/agents/nodes/interaction-point-detection.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/interaction-point-detection.ts) | 修改 | 1 | evidence 引用替换 |
| 5 | [src/agents/prompts/interaction-point-detection.ts](file:///home/xmm/ai/farm-agent/src/agents/prompts/interaction-point-detection.ts) | 修改 | 1 | evidence 引用替换 |
| 6 | [src/agents/nodes/retrieval.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/retrieval.ts) | 修改 | 1+4 | 填充 chunkId；合并 activeExperts evidenceFilter |
| 7 | [src/agents/nodes/intention.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/intention.ts) | 修改 | 2 | 输出 thinkingLevel |
| 8 | [src/agents/edges/conditional.ts](file:///home/xmm/ai/farm-agent/src/agents/edges/conditional.ts) | 修改 | 2 | routeByIntent 按 thinkingLevel 分流 |
| 9 | [src/agents/response-strategy.ts](file:///home/xmm/ai/farm-agent/src/agents/response-strategy.ts) | **新建** | 3+7 | StrategyDescriptor 注册表 + resolveResponseStrategy(ctx) + detectStrategyDegradation |
| 10 | [src/agents/nodes/response.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/response.ts) | 修改 | 3+4 | 使用 resolveResponseStrategy；合并 activeExperts outputSections |
| 11 | [src/agents/types.ts](file:///home/xmm/ai/farm-agent/src/agents/types.ts) | 修改 | 3 | DisplayContent sections 联合类型新增 `"evidence_digest"` |
| 12 | [src/agents/experts/registry.ts](file:///home/xmm/ai/farm-agent/src/agents/experts/registry.ts) | **新建** | 4 | AnalysisExpert + ANALYSIS_EXPERTS |
| 13 | [src/services/analysis-context.ts](file:///home/xmm/ai/farm-agent/src/services/analysis-context.ts) | **新建** | 4+7 | AnalysisContext + AnalysisTurnRecord 类型 + CRUD + appendTurnRecord |
| 14 | [src/services/report-generator.ts](file:///home/xmm/ai/farm-agent/src/services/report-generator.ts) | **新建** | 4+7 | generateReport + 4 格式生成器 + learnFormatPreference |
| 15 | [src/agents/nodes/reasoning.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/reasoning.ts) | 修改 | 4 | 拼接专家 promptTemplate + 注入 runtimeInputs |
| 16 | [src/services/semantic-cache.ts](file:///home/xmm/ai/farm-agent/src/services/semantic-cache.ts) | **新建** | 5+7 | SimpleSemanticCache + buildCacheKey + bumpKbGeneration + TTL 自主学习钩子 |
| 17 | [src/services/cache-ttl-stats.ts](file:///home/xmm/ai/farm-agent/src/services/cache-ttl-stats.ts) | **新建** | 5+7 | TtlStats 读写 + adaptCacheTtl() |
| 18 | [src/services/knowledge-indexer.ts](file:///home/xmm/ai/farm-agent/src/services/knowledge-indexer.ts) | 修改 | 5 | 索引完成后调用 bumpKbGeneration() |
| 19 | [src/services/path-metrics.ts](file:///home/xmm/ai/farm-agent/src/services/path-metrics.ts) | **新建** | 7 | MetricDescriptor 注册表（4 检测器）+ assessExecutionQuality 复合裁决 + buildMetricBaselines |
| 20 | [src/app/api/agent/chat/stream/route.ts](file:///home/xmm/ai/farm-agent/src/app/api/agent/chat/stream/route.ts) | 修改 | 4+5+6+7 | 加载/存储 analysisContext + 缓存查询/存储 + 缓存命中模拟流式 + turnHistory 采集 + downloadHistory 读写 |
| 21 | [src/app/api/agent/chat/threads/[threadId]/messages/[messageId]/report/route.ts](file:///home/xmm/ai/farm-agent/src/app/api/agent/chat/threads/[threadId]/messages/[messageId]/report/route.ts) | **新建** | 4+7 | 多格式报告下载 + 下载记录写入 |
| 22 | [src/lib/agent-audit-logger.ts](file:///home/xmm/ai/farm-agent/src/lib/agent-audit-logger.ts) | **修改（升级）** | 8 | 新增 `import { prisma }` + `setAuditContext/clearAuditContext` + `writeAuditLog()`；`agentAuditRequest/Response/Error` 新增 DB 通道；新增 `agentAuditStrategy/ExecutionQuality/CacheOperation` |
| 23 | [src/services/debug-tracer.ts](file:///home/xmm/ai/farm-agent/src/services/debug-tracer.ts) | **新建** | 8 | DebugTrace 类型 + `captureNode()` + `captureSummary()` + `exportFineTuningData()`（仅 dev 启用） |
| 24 | [src/app/api/agent/chat/threads/[threadId]/debug/route.ts](file:///home/xmm/ai/farm-agent/src/app/api/agent/chat/threads/[threadId]/debug/route.ts) | **新建** | 8 | Debug 面板 API + 微调数据导出（仅 dev 启用） |
| 25 | [src/agents/nodes/response.ts](file:///home/xmm/ai/farm-agent/src/agents/nodes/response.ts) | 修改 | 8 | `resolveResponseStrategy()` 后调用 `agentAuditStrategy()` |
| 26 | [src/services/path-metrics.ts](file:///home/xmm/ai/farm-agent/src/services/path-metrics.ts) | 修改 | 8 | `assessExecutionQuality()` 后调用 `agentAuditExecutionQuality()` |
| 27 | [src/services/semantic-cache.ts](file:///home/xmm/ai/farm-agent/src/services/semantic-cache.ts) | 修改 | 8 | 每次 `get/set/evict` 调用 `agentAuditCacheOperation()` |

---

## 十、执行顺序建议

依赖关系图：

```
Step 1 (类型收敛) ─────────────────────────┐
                                           │
Step 2 (thinkingLevel) ────────────────────┤
                                           ├──→ Step 3 (ResponseStrategy)
                                           │
Step 4 (分析专家模式) ─────────────────────┤
    │                                      │
    └──→ Step 3 (expertSections 合并)
                                           │
Step 5 (语义缓存) ─────────────────────────┤
                                           │
Step 6 (stream/route.ts 汇聚) ─────────────┘
    │
    ├──→ Step 7 (审计数据回流 → 演化闭环)
    │
    └──→ Step 8 (三层审计管线)
           ├── 8.1 L2: agent-audit-logger.ts 升级（始终写 AuditLog 表）
           ├── 8.2 L1: debug-tracer.ts（仅 dev 启用）
           └── 8.3 微调数据导出
```

**推荐执行顺序**：

1. **Step 1 先做**（类型收敛是所有后续步骤的基础）
2. **Step 2 可并行**
3. **Step 3 + Step 4 可并行**
4. **Step 5 + Step 6 紧随**（stream/route.ts 汇聚，依赖 Step 4 analysisContext + Step 5 缓存）
5. **Step 7 紧随 Step 6**（所有采集点在 Step 4/5/6 中已埋好钩子，Step 7 只添加学习逻辑）
6. **Step 8 L2 优先于 L1**——先升级 agent-audit-logger.ts 补齐生产环境 AuditLog 写入，再做 debug-tracer（L1 仅 dev 启用，不阻塞核心功能）

---

## 附录：ADD-7 审计策略

| 文件 | targetType | action | beforeState | afterState |
|-----|-----------|--------|------------|-----------|
| `src/types/evidence.ts` | TYPE | EVIDENCE_TYPE_UNIFIED | 两套 Evidence 定义 | 统一 Evidence + EvidenceRef + EvidenceSummary |
| `src/agents/state.ts` | AGENT_STATE | STATE_TYPE_CLEANED | 内联 Evidence 重复定义 | 引用统一类型；新增 analysisContext |
| `src/agents/response-strategy.ts` | AGENT_STRATEGY | STRATEGY_DESCRIPTOR_REGISTRY | 三固定分支 + 字符串 key 查找 + INTENT_FALLBACK | StrategyDescriptor 自声明对象 + registry + 遍历裁决 + 修饰器管道 |
| `src/agents/experts/registry.ts` | AGENT_NODE | EXPERT_REGISTRY_CREATED | 无分析专家 | AnalysisExpert + ANALYSIS_EXPERTS |
| `src/services/analysis-context.ts` | SERVICE | ANALYSIS_CONTEXT_CREATED | 无跨轮分析记忆 | AnalysisContext CRUD |
| `src/services/semantic-cache.ts` | SERVICE | SEMANTIC_CACHE_CREATED | 无语义缓存 | LRU+TTL+Generation 缓存 + TTL 自主学习 |
| `src/services/cache-ttl-stats.ts` | SERVICE | CACHE_TTL_STATS_CREATED | 无TTL学习 | TtlStats 读写 + adaptCacheTtl() |
| `src/services/path-metrics.ts` | SERVICE | PATH_METRICS_CREATED | 无执行度指标 | MetricDescriptor 注册表（4 检测器）+ 复合裁决 + 全局基准 |
| `src/services/report-generator.ts` | SERVICE | REPORT_GENERATOR_CREATED | 无报告服务 | 4 格式生成器 + learnFormatPreference |
| `src/agents/edges/conditional.ts` | AGENT_EDGE | THINKING_LEVEL_ROUTING | 所有意图走 retrieval | fast→response / deep→retrieval |
| `src/app/api/agent/chat/stream/route.ts` | API_ROUTE | STREAM_PIPELINE_ENHANCED | 无缓存/上下文注入 | 缓存命中+分析上下文+turnHistory采集+debug trace 钩子 |
| `src/app/api/agent/chat/threads/[threadId]/messages/[messageId]/report/route.ts` | API_ROUTE | REPORT_DOWNLOAD_API | 无下载能力 | 多格式报告下载 + 格式偏好学习 |
| `src/services/debug-tracer.ts` | SERVICE | DEBUG_TRACER_CREATED | 无管线 trace 采集 | DebugTrace 完整采集 + 微调数据导出（仅 dev） |
| `src/app/api/agent/chat/threads/[threadId]/debug/route.ts` | API_ROUTE | DEBUG_PANEL_API | 无 Debug 面板 | 按 thread/message 查询 trace + fine-tuning 格式导出（仅 dev） |
| `src/lib/agent-audit-logger.ts` | AUDIT_LOGGER | AUDIT_LOGGER_LAYER2_UPGRADE | 双通道（console+file），无 AuditLog DB 写入 | 三通道（console+file+AuditLog DB），Layer 2 始终开启 |
| `src/agents/nodes/response.ts` | AGENT_NODE | RESPONSE_STRATEGY_AUDIT | 策略匹配无 AuditLog 记录 | resolveResponseStrategy 后调用 agentAuditStrategy |
| `src/services/path-metrics.ts` | SERVICE | EXECUTION_QUALITY_AUDIT | 执行度评估无 AuditLog 记录 | assessExecutionQuality 后调用 agentAuditExecutionQuality |
| `src/services/semantic-cache.ts` | SERVICE | SEMANTIC_CACHE_AUDIT | 缓存操作无 AuditLog 记录 | get/set/evict 时调用 agentAuditCacheOperation |
