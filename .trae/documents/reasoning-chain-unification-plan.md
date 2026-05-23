# 推理链统一与强化实施计划

## PLAN 元信息
- **Plan 名称**: reasoning-chain-unification-v1
- **启动时间**: 2026-05-14T08:00:00+08:00
- **主导 AI**: Claude (via Trae IDE)
- **ADD-7 审计策略**: 见文末附录

---

## 一、优先级论证

### 1.1 四功能对比

| 功能 | 当前成熟度 | 依赖项 | 被依赖情况 |
|------|-----------|--------|------------|
| **推理链** | 架构存在但断裂 | 无 | 被人物派发依赖 |
| 人员维护 | 15%（仅认证） | 无 | 被人物派发依赖 |
| 人物派发 | 10%（仅Tool） | 推理链、人员维护 | 无（终末功能） |

### 1.2 推理链作为最高优先级的理由

1. **架构基础性**：推理链是 Agent 的"大脑"，人物派发的智能调度依赖推理结果
2. **当前架构债务最重**：LLM推理（`reasoningNode`）与规则引擎（`EvidenceChainReasoningEngine`）两套体系各自独立运行，从未融合
3. **低垂果实高**：ChainTrace 和 Verdict 的 Prisma 表已建、全链路追踪器已实现，但从未写入数据库——仅需补齐持久化调用即可见效
4. **审计真空最大**：推理引擎完全无审计日志，违反 ADD-1~ADD-6 所有核心原则
5. **阻断下游**：risks 字段硬编码为空数组、Verdict 表无写入逻辑——直接导致人物派发无法获得有意义的裁决数据

---

## 二、问题清单（现状审查结论）

### 2.1 阻断级问题（P0）

| 编号 | 问题 | 位置 |
|------|------|------|
| D1 | LLM 推理与规则引擎未统一调度 | reasoningNode vs reasoningEngine |
| D2 | reasoningNode 不调用 reasoningEngine | [reasoning.ts](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/agents/nodes/reasoning.ts) |
| D3 | 推理结果 risks 硬编码为空数组 | [reasoning.ts:L90](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/agents/nodes/reasoning.ts#L90) |
| D13 | ChainTrace 未持久化到 DB | [chat/stream/route.ts](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/app/api/agent/chat/stream/route.ts) |
| D14 | Verdict 表有定义但无写入代码 | schema.prisma + 无对应 service |

### 2.2 高优先级问题（P1）

| 编号 | 问题 | 位置 |
|------|------|------|
| D4 | ReasoningOutput 缺少 risks 字段 | [reasoning.ts prompt](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/agents/prompts/reasoning.ts) |
| D6 | reasoningNode 忽略 retrievalContext | [reasoning.ts](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/agents/nodes/reasoning.ts) |
| D7 | 证据链缺失 economic/history 来源 | [retrieval.ts](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/agents/nodes/retrieval.ts) |
| D9 | chainTrace 前端无消费 | 前端 SSE done 事件处理 |
| D17 | 推理链缺少 ADD 结构化的阶段审计 | reasoningNode + reasoningEngine |
| D18 | reasoningEngine 完全无审计日志器 | [reasoning-engine.ts](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/services/reasoning-engine.ts) |

### 2.3 中等优先级问题（P2）

| 编号 | 问题 | 位置 |
|------|------|------|
| D5 | reasoningNode 的审计 phase 参数不规范 | [reasoning.ts](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/agents/nodes/reasoning.ts) |
| D8 | evidence source 类型不匹配 | retrieval vs reasoningEngine |
| D10 | 推理路径面板与证据面板间无联动 | reasoning-path-panel + evidence-chain-panel |
| D16 | ModelParamSnapshot 未实际填充 | [verdict.ts](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/agents/nodes/verdict.ts) |

---

## 三、实施步骤（ADD 范式 7 步）

### Step 0：审计阶段定义

为推理链定义 `ReasoningAuditPhase` 枚举：

```typescript
type ReasoningAuditPhase =
  // 推理引擎阶段
  | "REASONING_ENGINE_START"
  | "EVIDENCE_COLLECT"
  | "EVIDENCE_EVALUATE"
  | "MULTI_STEP_REASONING"
  | "CONCLUSION_GENERATE"
  | "REASONING_ENGINE_DONE"
  | "REASONING_ENGINE_FAIL"
  // 推理节点阶段（Agent Node）
  | "REASONING_NODE_START"
  | "LLM_REASONING_INVOKE"
  | "REASONING_RESULT_PARSE"
  | "REASONING_VALIDATE"
  | "REASONING_NODE_DONE"
  | "REASONING_NODE_FAIL"
  // 持久化阶段
  | "VERDICT_PERSIST_START"
  | "VERDICT_PERSIST_SAVE"
  | "VERDICT_PERSIST_DONE"
  | "VERDICT_PERSIST_FAIL"
  | "CHAINTRACE_PERSIST_START"
  | "CHAINTRACE_PERSIST_SAVE"
  | "CHAINTRACE_PERSIST_DONE"
  | "CHAINTRACE_PERSIST_FAIL"
  // 融合阶段
  | "REASONING_ORCHESTRATION_START"
  | "LLM_REASONING_RUN"
  | "ENGINE_REASONING_RUN"
  | "RESULT_MERGE"
  | "REASONING_ORCHESTRATION_DONE"
```

定义 `ReasoningAuditData` 类型：

```typescript
interface ReasoningAuditData {
  // 证据收集
  evidenceCollectCount: number
  evidenceSources: string[]
  evidenceCollectDurationMs: number

  // 证据评估
  evidenceEvaluateCount: number
  avgRelevance: number
  avgReliability: number

  // 推理步骤
  reasoningStepCount: number
  reasoningTraceCount: number

  // 结论
  finalConfidence: number
  riskCount: number
  actionCount: number

  // 融合
  llmConfidence: number
  engineConfidence: number
  mergeStrategy: string
}
```

### Step 1：审计基础设施实现

#### 1.1 创建 `src/lib/reasoning-audit-logger.ts`

使用 MCP 工具 `generate_audit_logger` 生成，参数：
- domain: `reasoning`
- phases: `REASONING_ENGINE_START,EVIDENCE_COLLECT,EVIDENCE_EVALUATE,MULTI_STEP_REASONING,CONCLUSION_GENERATE,REASONING_ENGINE_DONE,REASONING_ENGINE_FAIL,REASONING_NODE_START,LLM_REASONING_INVOKE,REASONING_RESULT_PARSE,REASONING_VALIDATE,REASONING_NODE_DONE,REASONING_NODE_FAIL,VERDICT_PERSIST_START,VERDICT_PERSIST_SAVE,VERDICT_PERSIST_DONE,VERDICT_PERSIST_FAIL,CHAINTRACE_PERSIST_START,CHAINTRACE_PERSIST_SAVE,CHAINTRACE_PERSIST_DONE,CHAINTRACE_PERSIST_FAIL,REASONING_ORCHESTRATION_START,LLM_REASONING_RUN,ENGINE_REASONING_RUN,RESULT_MERGE,REASONING_ORCHESTRATION_DONE`
- prefix: `REASONING-AUDIT`

与现有 `audit-logger.ts` 和 `agent-audit-logger.ts` 同构：
- `PREFIX`: `[REASONING-AUDIT]`
- `LOG_DIR`: `logs/reasoning/`
- 三函数：`reasoningAudit()` / `reasoningAuditPhaseStart()` / `reasoningAuditPhaseEnd()`
- 读写函数：`readRecentReasoningLogs()` / `clearReasoningLogs()`

#### 1.2 Prisma Schema 变更

确保以下模型定义完整（已存在但需验证）：

```prisma
model ChainTraceRecord {
  id                  String   @id @default(cuid())
  threadId            String
  thread              ChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  traceId             String   @unique
  trigger             Json
  nodes               Json
  evidenceDiff        Json
  worldLineSnapshots  Json
  modelParamSnapshots Json
  totalDurationMs     Int?
  createdAt           DateTime @default(now())
}

model Verdict {
  id              String   @id @default(cuid())
  chatMessageId   String?  // 关联到 ChatMessage
  type            String
  query           String
  conclusion      Json
  evidenceChain   Json
  reasoningPath   Json
  confidence      Json
  traces          Json
  createdAt       DateTime @default(now())
}
```

若需调整字段，运行 `npx prisma db push`。

### Step 2：业务逻辑实现与审计植入

#### 2.1 统一推理编排器（核心融合）

创建 `src/services/reasoning-orchestrator.ts`：

```
┌─────────────────────────────────────────────────────┐
│              ReasoningOrchestrator                    │
│                                                      │
│  reason(input) ─┬── ① LLM推理 ──→ llmResult         │
│                 │    (reasoningNode 的 Prompt 调用)   │
│                 │                                    │
│                 ├── ② 规则引擎推理 ──→ engineResult   │
│                 │    (EvidenceChainReasoningEngine)   │
│                 │                                    │
│                 └── ③ 结果融合 ──→ mergedResult      │
│                      (置信度加权 + 证据交叉验证)       │
└─────────────────────────────────────────────────────┘
```

关键设计：
- 双路并行推理（LLM + 规则引擎）
- 融合策略：LLM 置信度 0.6 + 引擎置信度 0.4 加权（可配置）
- 风险清单合并去重（LLM输出风险 + 引擎生成风险）
- 每个步骤植入 `reasoningAuditPhaseStart/End`

#### 2.2 修复 reasoningNode

将 [reasoning.ts](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/agents/nodes/reasoning.ts) 改为调用 `ReasoningOrchestrator`：

- 移除硬编码 `risks: []`，改为从 orchestrator 获得
- 消费 `state.retrievalContext`（不仅限于 `state.evidenceChain`）
- 使用专用审计阶段标记（`REASONING_NODE_START` 等）

#### 2.3 修复 Reasoning Prompt

扩展 [reasoning.ts prompt](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/agents/prompts/reasoning.ts)：

- `ReasoningOutput` 新增 `risks: RiskItem[]` 字段
- Prompt 中包含风险识别指令
- Prompt 中包含 economic/history 等扩展来源的证据处理指令

#### 2.4 植入 reasoningEngine 审计点

为 [reasoning-engine.ts](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/services/reasoning-engine.ts) 的每个方法植入审计：

- `collectEvidences()` → `EVIDENCE_COLLECT` phase
- `evaluateEvidences()` → `EVIDENCE_EVALUATE` phase
- `multiStepReasoning()` → `MULTI_STEP_REASONING` phase
- `generateConclusion()` → `CONCLUSION_GENERATE` phase
- 所有方法添加 catch 块的等价审计

#### 2.5 ChainTrace 数据库持久化

在 [chat/stream/route.ts](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/app/api/agent/chat/stream/route.ts) 中：

```typescript
// SSE done 事件发送后，持久化 chainTrace
if (chainTrace) {
  reasoningAuditPhaseStart("CHAINTRACE_PERSIST_START", traceId)
  try {
    await prisma.chainTraceRecord.create({
      data: {
        threadId,
        traceId,
        trigger: chainTrace.trigger,
        nodes: chainTrace.nodes,
        evidenceDiff: chainTrace.evidenceDiff,
        worldLineSnapshots: chainTrace.worldLineSnapshots,
        modelParamSnapshots: chainTrace.modelParamSnapshots,
        totalDurationMs: chainTrace.totalDurationMs,
      }
    })
    reasoningAuditPhaseEnd("CHAINTRACE_PERSIST_DONE", traceId)
  } catch (error) {
    reasoningAudit("CHAINTRACE_PERSIST_FAIL", "链追踪持久化失败", { traceId, error: String(error) })
  }
}
```

#### 2.6 Verdict 持久化

在 reasoningNode 或 orchestrator 输出裁决后，持久化到 Verdict 表：

```typescript
reasoningAuditPhaseStart("VERDICT_PERSIST_START", verdictType)
try {
  await prisma.verdict.create({
    data: {
      type: verdict.type,
      query: verdict.query,
      conclusion: verdict.conclusion,
      evidenceChain: verdict.evidenceChain,
      reasoningPath: verdict.reasoningPath,
      confidence: verdict.confidence,
      traces: verdict.traces,
    }
  })
  reasoningAuditPhaseEnd("VERDICT_PERSIST_DONE", verdict.id)
} catch (error) {
  reasoningAudit("VERDICT_PERSIST_FAIL", "裁决持久化失败", { ... })
}
```

在 chat stream API 中，将 verdictId 回写到 ChatMessage.metadata。

#### 2.7 证据来源类型统一

统一 retrieval 节点和 reasoningEngine 的证据 source 类型：

```typescript
type EvidenceSource =
  | 'knowledge'       // 知识库文档
  | 'project_context' // 项目上下文
  | 'task'            // 任务数据
  | 'economic'        // 经济数据
  | 'history'         // 历史推理
  | 'sensor'          // IoT 感知数据
  | 'keywords'        // 关键词匹配
```

### Step 3：审计数据验证

1. **阶段标记对称性检查**：用 `check_phase_symmetry` 验证所有 `reasoningAuditPhaseStart/End` 配对
2. **失败路径信息密度检查**：用 `check_failure_path` 验证 catch 块审计信息完整性
3. **三通道输出检查**：确认 console、文件(`logs/reasoning/`)、数据库三通道都有输出
4. **最小可观测单元检查**：验证 EVIDENCE_COLLECT 记录每条证据的来源和耗时

### Step 3.5：AI 自动合规检查

调用 MCP 工具 `check_phase_symmetry` 和 `check_failure_path` 自动检查合规性。

### Step 4-6：迭代验证与收敛

收敛条件：
- 审计日志无 FAIL/ERROR 记录
- 阶段标记完全对称
- 最小可观测单元数据完整
- ChainTraceRecord 表有持久化数据
- Verdict 表有持久化数据
- risks 字段不再为空
- TypeScript 编译通过

---

##