# farm-agent 第3轮 Spec / Handoff Review

## Review 元信息

- **Review 对象**:
  - `.trae/specs/co-agent-expert-registry/spec.md`
  - `.trae/specs/co-agent-expert-registry/tasks.md`
  - `.trae/specs/co-agent-expert-registry/checklist.md`
  - `.trae/documents/co-agent-conversation-handoff.md` 的 `<第3轮>` 章节
  - `.trae/documents/co-agent-simplified-v1.md` Step 4.2-4.4（父 Plan 参考）
- **Review 范围**: 第3轮领域上下文闭包：分析专家注册表 + AnalysisContext 跨轮持久化
- **Review 时间**: 2026-05-25
- **结论级别**: 方向正确，但存在若干需要修正的问题

---

## 1. 总体结论

第3轮 spec、tasks、checklist 和 handoff 的整体方向正确，目标是把 `co-agent-simplified-v1.md` 的 Step 4.2-4.4 中分析专家注册表和跨轮 AnalysisContext 持久化机制建立为基础基础设施。它明确了本轮只建立专家与上下文存储，不消费专家能力，与第4轮（管线消费）有清晰的原子边界。

当前第3轮文档已经具备较好的执行基础，仍存在以下需要收敛的问题（其中高优先级第1项已修正）：

1. ~~✅ 已修正：父 Plan L16 表述~~（采用方案 B）
2. Handoff 恢复指南严重不完整，未对齐第1轮/第2轮已建立的模板。
3. `AnalysisExpert.outputSections` 使用 `risks`（复数），但实际 DisplayContent 协议为 `risk`（单数）。
4. `ChatThread.metadata` 已存在 `auditData` 写入路径，spec 未说明 `analysisContext` 如何共存。
5. `activateExpert` 未定义无效 expertId 的防御行为。
6. `conversationContext` 与新增 `analysisContext` 的关系未明确。
7. tasks.md 中 `stream/route.ts` "首次修改"表述不准确。
8. spec 标记为纯新增，但 AnalysisExpert.outputSections 对上游 ResponseStrategy.sections 存在隐式耦合。

~~原列的 3.5（第1.5轮恢复关键词缺失）和 3.6（state.ts 递进修改风险）经验证不成立——handoff 已通过恢复流程和轮次依赖链覆盖。~~

这些问题不影响第3轮架构方向，但会影响后续第4轮消费的一致性和轮次间类型兼容。建议在执行第3轮代码前完成修正。

---

## 2. 正向评价

### 2.1 第3轮原子边界清晰

第3轮明确只覆盖：

```text
AnalysisExpert 接口 + ANALYSIS_EXPERTS 注册表
AnalysisContext + AnalysisTurnRecord + CRUD
AgentState 新增 analysisContext
stream/route.ts 请求前加载 / 请求后保存 AnalysisContext
```

并显式禁止：

```text
修改 Prisma Schema
修改前端组件
修改 retrieval/reasoning/response 以消费专家能力（第4轮职责）
覆盖或重构已有 stream-bus / SSE 事件总线逻辑
```

这符合原子事务拆分原则，防止第3轮越界实现第4轮管线消费。

### 2.2 AnalysisExpert 注册表设计合理

spec 定义的 `AnalysisExpert` 接口包含完整属性链：

```typescript
id, label, domain, description,
inputSchema（key/label/required）,
outputSections,
promptTemplate,
evidenceFilter?,
reportFormats
```

其中 `outputSections` 定义了专家产出的 section 类型，`promptTemplate` 定义了推理维度指令片段，`evidenceFilter` 定义了 RAG 检索条件。这些属性为第4轮的管线消费（retrieval 按 evidenceFilter 过滤、reasoning 注入 promptTemplate、response 合并 outputSections）提供了完整的输入接口。

### 2.3 AnalysisContext 跨轮记忆设计正确

核心设计使用 `ChatThread.metadata.analysisContext`（Prisma Json 字段）做持久化，不改 Schema。这避免了数据库迁移的复杂性，也符合"先迭代后标准化"的工程节奏。

跨轮记忆的语义清晰：

```text
activeExperts：用户已激活的专家（含激活时间戳），跨轮保持
runtimeInputs：实时参数变量（地块/作物/季节），覆盖式更新
turnHistory：每轮管线的诊断记录，供第6轮演化回路使用
```

### 2.4 spec Scenario 覆盖关键边界

spec 包含了 5 个 Scenario，覆盖了：
- 注册表可用性
- 跨轮激活保持
- expert 去重
- runtimeInput 覆盖更新
- CRUD 函数定义

这些 Scenario 为实现和验证提供了明确的验收标准。

### 2.5 CRUD 函数签名完整

spec 定义了 6 个函数：

```typescript
getAnalysisContext(threadId)      // 加载
saveAnalysisContext(threadId, ctx) // 持久化
activateExpert(ctx, expertId)     // 激活（去重）
deactivateExpert(ctx, expertId)   // 停用
updateRuntimeInput(ctx, key, value, label) // 更新参数
appendTurnRecord(ctx, record)     // 追加诊断记录
```

函数职责单一，返回值均为 `AnalysisContext`（或 Promise 包装），方便函数式组合。

### 2.6 与第1轮、第2轮的边界划分正确

spec 明确列出了上游依赖：
- `EvidenceRef / EvidenceSummary` 可用（第1轮）
- `CurrentTask.thinkingLevel` 可用（第1轮）
- `src/agents/response-strategy.ts` 存在（第2轮）
- `src/agents/nodes/response.ts` 已消费策略裁决（第2轮）
- `DisplayContent.sections` 已支持 evidence_digest / action_steps / timeline（第2轮）

且本轮不消费任何专家能力，不修改 retrieval/reasoning/response 节点。这有助于保持轮次间的清晰边界。

---

## 3. 需要修正的问题

### 3.1 父 Plan co-agent-simplified-v1.md 第16行"简化分支"表述有误导风险（高优先级）

父 Plan `co-agent-simplified-v1.md` 第16行写道：

```text
当前仓库 (`farm-agent`) 是 team-coordinator-agent 的简化分支，保留核心六节点决策管线
```

**实际背景**：`team-coordinator-agent` 是完整功能仓库，`farm-agent` 是新开的独立仓库——功能范围上相对精简（去掉了 worldline/L0-L4/VerdictRegistry/CapabilityModel 等功能），但代码质量标准完全一致。

**风险**：AI 执行者看到"简化分支"后，可能误解为"代码实现也可以简化/缩水"，这与 `禁止简化代码实现` 的项目核心约束直接冲突。整个 Plan 和所有轮次的 spec 也反复强调"禁止简化代码实现"，如果头部表述与此矛盾，AI 会产生认知混乱。

建议修正为以下任一方案：

**方案 A（推荐）**：直接去除误导词，强调独立性：

```text
当前仓库 (`farm-agent`) 是独立仓库，保留核心六节点决策管线。与 team-coordinator-agent 共享相同的代码质量标准，功能范围上未包含 worldline/L0-L4/VerdictRegistry/CapabilityModel 等模块。
```

**方案 B**：如确需体现"相对 team-coordinator-agent 功能范围缩小"这一事实，明确区分"功能范围简化"和"代码质量"：

```text
farm-agent 相比 team-coordinator-agent 功能范围有所精简（不含 worldline/L0-L4/VerdictRegistry/CapabilityModel），保留核心六节点决策管线。代码实现质量要求与 team-coordinator-agent 完全一致，禁止任何形式的简化实现。
```

> **注意**：此问题已在 2026-05-25 修正（采用方案 B）。第3轮 spec 中建议额外增加显式约束：`禁止因"精简"表述而降低代码实现质量`。

### 3.2 Handoff 恢复指南严重不完整，未对齐第1轮/第2轮已建立的模板（高优先级）

第1轮和第2轮 AI 已在 handoff 中建立了完善的开发日志恢复指南模板，包含三层恢复通道。但第3轮 handoff 的"恢复上下文的方法"和"ADD-7 恢复关键词"章节严重缩水，对比如下：

| 恢复能力 | 第1轮 | 第2轮 | **第3轮（当前）** |
|---------|:--:|:--:|:--:|
| MCP 一键汇总查询 | ✅ `ROUND1_TYPE_CONVERGENCE_COMPLETED` | ✅ `RESPONSE_STRATEGY` | ❌ |
| 逐文件 targetId 查询 | ✅ 9 条 action → 文件映射 | ✅ 含每条返回什么、afterState 含什么 | ❌ |
| 逐 action keyword 查询 | ✅ | ✅ | ⚠️ 仅 2 个模糊 keyword，且不覆盖 state.ts / route.ts |
| 恢复顺序建议 | ❌ | ✅ 6 步 | ❌ |
| SQL 手动验证 | ✅ 含完整 SQL | ❌ | ❌ |
| 轮次完成汇总 action | ✅ `ROUND1_TYPE_CONVERGENCE_COMPLETED` | ✅（keyword 替代） | ❌ |
| 恢复判定标准 | ✅ 时间窗口 + checklist 状态 | ✅ 端到端验证清单 | ❌ |
| 给后续 AI 助手的操作说明 | ✅ "直接复制粘贴调用" | ✅ "直接复制粘贴调用即可" | ❌ |

**具体缺失：**

1. **缺少"给后续 AI 助手的说明"** — 第2轮 handoff L380 明确写了"以下每个 `query_audit_logs(...)` 都是 MCP 工具调用，AI 助手直接复制粘贴这些参数调用工具即可"，第3轮没有。

2. **缺少逐文件 targetId 查询映射** — 第3轮涉及 4 个文件（2 新建 + 2 修改），恢复指南中应有：

```text
query_audit_logs({ targetId: "src/agents/experts/registry.ts" })
→ 返回：EXPERT_REGISTRY_CREATED。beforeState 为空（新建），afterState 包含 AnalysisExpert 接口设计和 3 个专家配置。

query_audit_logs({ targetId: "src/services/analysis-context.ts" })
→ 返回：ANALYSIS_CONTEXT_CREATED。beforeState 为空（新建），afterState 包含 AnalysisContext 类型设计和 CRUD 函数签名。

query_audit_logs({ targetId: "src/agents/state.ts" })
→ 返回3条：STATE_TYPE_CLEANED（第1轮）+ THINKING_LEVEL_ASSIGNED（第1轮）+ AGENT_STATE_ANALYSIS_CONTEXT_ADDED（第3轮）。需要能区分各自归属。

query_audit_logs({ targetId: "src/app/api/agent/chat/stream/route.ts" })
→ 返回多条：traceId 写入 + stream-bus 改造 + STREAM_ROUTE_ANALYSIS_CONTEXT_LOADED（第3轮）。需要能区分各自归属。
```

3. **缺少一键汇总 keyword** — 第2轮可用 `RESPONSE_STRATEGY` 一键拉全部 8 条，第3轮应有类似汇总 keyword（如 `ANALYSIS_CONTEXT` 或 `ROUND3_EXPERT_CONTEXT`）。

4. **缺少轮次完成标记 action** — 第1轮有 `ROUND1_TYPE_CONVERGENCE_COMPLETED`，第1.5轮有 `ROUND1_5_CORE_BASELINE_COMPLETED`。第3轮 handoff 完成后也应记录一个 `ROUND3_EXPERT_CONTEXT_COMPLETED` 汇总 action。

5. **缺少恢复顺序建议** — 第2轮有清晰的 6 步恢复顺序，第3轮应有：

```text
1. session-init SKILL（强制前置）
2. query_audit_logs({})                              → 查看最近所有操作
3. query_audit_logs({ keyword: "ROUND3_EXPERT" })     → 看第3轮所有记录
4. read ".trae/specs/co-agent-expert-registry/spec.md"
5. read ".trae/specs/co-agent-expert-registry/tasks.md"
6. read ".trae/specs/co-agent-expert-registry/checklist.md"
```

6. **"完成后记录 ADD-7 审计"** 只有 2 个 action，实际应是 4 个文件级 action + 1 个汇总 action + 文档变更：

| 文件 | 操作 | action |
|------|------|--------|
| `src/agents/experts/registry.ts` | 新建 | `EXPERT_REGISTRY_CREATED` |
| `src/services/analysis-context.ts` | 新建 | `ANALYSIS_CONTEXT_CREATED` |
| `src/agents/state.ts` | 修改 | `AGENT_STATE_ANALYSIS_CONTEXT_ADDED` |
| `src/app/api/agent/chat/stream/route.ts` | 修改 | `STREAM_ROUTE_ANALYSIS_CONTEXT_LOADED` |
| doc 文档同步 | 修改 | `DOC_UPDATED` × 3（spec.md / tasks.md / checklist.md） |
| 汇总 | — | `ROUND3_EXPERT_CONTEXT_COMPLETED` |

**建议**：第3轮 handoff 的恢复指南应完全对齐第2轮模板（L378-L480），在代码执行完成后由第3轮 AI 补全上述缺失项。

### 3.3 AnalysisExpert.outputSections 使用 `risks` 而非 `risk`（高优先级）

spec.md 第36行定义 `outputSections`：

```typescript
outputSections: Array<"conclusion" | "confidence" | "risks" | "evidence" | "reasoning">
```

但 round-2 review 第3.3条已明确指出：DisplayContent 协议中的 section type 是 `"risk"`（单数），不是 `"risks"`（复数）。round-2 的实现应当已将 `risks` 统一修正为 `risk`。

第3轮的 `AnalysisExpert.outputSections` 将在第4轮通过修饰器管道合并到 `ResponseStrategy.sections`，如果两边类型不一致（一边 `risks`，一边 `risk`），会导致以下问题之一：

1. TypeScript 类型检查不通过。
2. 前端渲染器收到 `risks` section type 但无法识别，降级为空渲染。

建议将所有 section type 字面量统一为 DisplayContent 协议中的单数形式 `"risk"`。

### 3.4 ChatThread.metadata 已有 auditData 写入路径，未说明与 analysisContext 如何共存（高优先级）

当前代码库中 `stream/route.ts` 已存在以下逻辑：

```typescript
// L287: chatPersistence.saveAuditData(threadId, auditData)
```

`chatPersistence.saveAuditData` 将 `auditData` 写入 `ChatThread.metadata`。如果 `saveAnalysisContext` 直接覆盖 `metadata`，会导致 auditData 丢失。

spec 和 tasks 中均未提及此共存问题。建议补充：

```text
saveAnalysisContext 必须读取现有 ChatThread.metadata，
仅更新 metadata.analysisContext 字段，
保留已有的 auditData 和其他 metadata 字段。
```

实现上需要先读取现有 metadata，浅合并 analysisContext，再写回。

### 3.5 ✅ 已验证：第1.5轮已正确覆盖

原 Review 担心第3轮 handoff 恢复关键词缺少第1.5轮验证。**经验证不成立**：

- 第3轮 handoff L503 `query_audit_logs({ keyword: "CORE_STREAM_ROUTE_JSON_FIXED" })` — 第1.5轮核心 action
- L504 `确认第1轮、第1.5轮和第2轮全部完成` — 显式要求验证第1.5轮
- 第1.5轮 handoff L256-262 已列出全部 6 个 ADD-7 恢复关键词

第1.5轮在 handoff 中的恢复路径已完整覆盖，无需补充。

### 3.6 ✅ 已验证：递进修改风险已被轮次依赖链覆盖

原 Review 担心 `state.ts` 在第1轮和第3轮均为修改目标，若第1轮未完成直接进入第3轮会产生冲突。**经验证不成立**：

- 第3轮 handoff 恢复流程要求 `确认第1轮、第1.5轮和第2轮全部完成`（L504）
- 每轮是原子工程事务：前序未完成则当前轮次不具备启动条件
- 第1轮 handoff 已明确 `state.ts` 的改动内容（L89），第3轮 AI 执行前会先验证
- 轮次依赖链（1→1.5→2→3）本身即递进修改的保障机制

handoff 已通过恢复流程间接覆盖此风险，无需额外标记。

### 3.7 activateExpert 未定义无效 expertId 的防御行为（中优先级）

spec 定义了 `activateExpert(ctx, expertId: string): AnalysisContext` 并指出"对 expertId 去重"，但未说明当 `expertId` 不在 `ANALYSIS_EXPERTS` 注册表中时应如何处理。

建议补充：

```text
activateExpert 必须先验证 expertId 是否存在于 ANALYSIS_EXPERTS 中。
无效 expertId：返回原 ctx 不变（静默忽略），或抛出可恢复错误。
推荐静默忽略 + console.warn，避免因前端传入无效值导致 Agent 管线中断。
```

### 3.8 conversationContext 与新增 analysisContext 的关系未明确（中优先级）

当前 stream/route.ts 已有 `conversationContext: { traceId, modelConfig }` 通过 AgentState 传递。第3轮新增 `analysisContext` 作为 AgentState 的独立字段。

两者职责可能存在混淆：`conversationContext` 用于传递元数据（traceId、modelConfig），`analysisContext` 用于跨轮分析记忆。如果未来新增字段同时涉及元数据和分析记忆，开发者可能不确定该放入哪个字段。

建议 spec 中补充字段职责说明：

```text
conversationContext: Record<string, unknown>  — 当前请求级别的元数据（traceId, modelConfig 等）
analysisContext: AnalysisContext | null         — 跨轮持久化的分析记忆（activeExperts, runtimeInputs, turnHistory）

两者职责不重叠：conversationContext 生命周期为单次请求，analysisContext 生命周期为整个 thread。
```

### 3.9 tasks.md 中 stream/route.ts "首次修改"表述不准确（中优先级）

tasks.md 第73行：

```text
⚠️ state.ts 第1轮和第2轮已改过，做增量编辑。stream/route.ts 首次修改...
```

`stream/route.ts` 在审计日志中已被多次修改（traceId 写入、流式事件总线改造）。"首次修改"仅在 7 轮计划的上下文中成立，容易让 AI 执行者误以为该文件从未被编辑过，简化对已有逻辑的保护。

建议改为：

```text
stream/route.ts 在前序工作中已被修改（traceId、stream-bus），本轮只做 analysisContext 加载/保存，不修改已有的流式事件总线逻辑。
```

### 3.10 spec 标记为纯新增，但 AnalysisExpert.outputSections 对上游存在隐式耦合（中优先级）

spec 的 MODIFIED/REMOVED Requirements 均为"无（纯新增基础设施）"，但 `AnalysisExpert.outputSections` 的类型与 round-2 中 `ResponseStrategy.sections` 的类型存在隐式耦合。

建议 spec 中增加一个显式的兼容性约束：

```text
AnalysisExpert.outputSections 的联合类型成员必须是 ResponseStrategy.sections 联合类型的子集。
第4轮消费时，通过修饰器管道合并 outputSections 到 strategy.sections，类型不兼容时编译器报错。
```

---

## 4. 低优先级观察

### 4.1 checklist 缺少 stream/route.ts 修改后不影响已有逻辑的验证项

checklist 中 stream/route.ts 的验证只有"发送消息后 ChatThread.metadata 含 analysisContext 数据"，缺少"已有 stream-bus / SSE 事件总线逻辑未被破坏"的明确验证项。建议补充一条：

```text
- [ ] stream/route.ts 修改后，SSE token 流式输出、stream-bus 事件推送、auditData 写入均正常
```

### 4.2 AnalysisTurnRecord 定位为第6轮演化回路使用，但字段在本轮定义

`AnalysisTurnRecord` 包含 `verdictConfidence`、`evidenceCount`、`followUpCount` 等字段，这些字段的值需要在管线执行后才能填充。如果第3轮只定义结构不写入数据，自然没问题。但 tasks.md 中 `appendTurnRecord` 的实现可能会为如何获取这些字段值而困惑。

建议在 tasks.md 中明确：

```text
appendTurnRecord 本轮实现函数体，允许 turnHistory 写入，
但调用方在第6轮才接入（演化回路消费 turnHistory）。
```

### 4.3 AnalysisExpert 初始 3 个专家缺少土壤评估、气象影响等常见农业分析维度

spec 要求初始 3 个专家：crop_compare / roi_analysis / pest_risk。这是合理的起步数量，但 `domain` 字段只有"种植"和"经济"出现，"管收"出现了但只有 pest_risk 一个专家。后续可按需扩展，不在本轮阻塞。

---

## 5. 越界检查

本次第3轮文档整体没有明显越界，核心内容仍属于领域上下文闭包：

```text
AnalysisExpert 接口 + ANALYSIS_EXPERTS 注册表
AnalysisContext + AnalysisTurnRecord 类型
getAnalysisContext / saveAnalysisContext / activateExpert / deactivateExpert / updateRuntimeInput / appendTurnRecord
AgentState 新增 analysisContext
stream/route.ts 加载/保存 AnalysisContext
```

没有看到第3轮提前实现：

```text
retrieval 按 evidenceFilter 过滤（第4轮）
reasoning 注入 promptTemplate（第4轮）
response 合并 outputSections（第4轮）
report-generator 服务（第4轮）
semantic cache（第5轮）
path metrics（第6轮）
```

但以下位置存在潜在越界风险，需要通过 spec 修正约束：

```text
AnalysisTurnRecord 字段（verdictConfidence 等）可能诱导在第3轮实现管线采集逻辑（第6轮职责）
reportFormats 字段可能诱导在第3轮实现报告生成服务（第4轮职责）
stream/route.ts 修改可能意外覆盖已有的 auditData 写入路径
```

只要补充上述边界说明，第3轮仍可保持原子事务完整性。

---

## 6. 建议修正优先级

### 高优先级

1. **✅ 已修正 co-agent-simplified-v1.md L16** — 采用方案 B，区分"功能范围精简"与"代码质量标准完全一致"。
2. **Handoff 恢复指南对齐第1轮/第2轮模板** — 补全：逐文件 targetId 查询映射、一键汇总 keyword（如 `ROUND3_EXPERT`）、轮次完成标记 action（`ROUND3_EXPERT_CONTEXT_COMPLETED`）、恢复顺序建议、给后续 AI 的操作说明。完成后 ADD-7 审计从 2 个 action 补齐为 4 文件级 + 1 汇总 + 3 文档。
3. **AnalysisExpert.outputSections 中 `risks` → `risk`** — 与 round-2 已修正的 DisplayContent 协议保持一致。
4. **补充 ChatThread.metadata 共存策略** — saveAnalysisContext 必须保留已有 auditData，不能覆盖。

### 中优先级

5. **activateExpert 补充无效 expertId 防御说明** — 静默忽略 + console.warn。
6. **conversationContext 与 analysisContext 职责边界说明**。
7. **tasks.md "首次修改"表述修正** — stream/route.ts 已被多次修改。
8. **spec 补充 outputSections 与 ResponseStrategy.sections 类型兼容性约束**。

### 低优先级

9. **checklist 补充 stream/route.ts 已有逻辑不被破坏的验证项**。
10. **明确 appendTurnRecord 调用方归属第6轮**。

---

## 7. 最终建议

第3轮 spec/tasks/checklist/handoff 可以作为执行基础，但建议先完成上述修正（至少高优先级 5 项），再让代码执行 AI 开始修改源代码。

推荐执行顺序：

```text
先修正 co-agent-simplified-v1.md L16 事实错误
  ↓
修正 spec 的 section type 一致性（risks → risk）
  ↓
补齐 handoff ADD-7 action（2→4）和恢复关键词
  ↓
补充 ChatThread.metadata 共存策略说明
  ↓
复查 handoff / spec / tasks / checklist 的一致性
  ↓
再进入第3轮代码修改
  ↓
新建 experts/registry.ts
  ↓
新建 services/analysis-context.ts
  ↓
修改 agents/state.ts（增量添加 analysisContext）
  ↓
修改 stream/route.ts（增量添加 analysisContext 加载/保存，保留已有 auditData）
  ↓
逐文件 record_dev_operation
  ↓
用 query_audit_logs 回查第3轮 4 个 action
```

第3轮完成的判定不应只看 `npx tsc --noEmit`，还必须确认：

```text
ANALYSIS_EXPERTS 含 3 个专家，每个有五属性 + reportFormats
getAnalysisContext / saveAnalysisContext 正确读写 ChatThread.metadata
activateExpert 去重 + 无效 expertId 防御
跨轮激活保持（第1轮激活2个 → 第2轮加载仍为2个）
state.ts 递进修改不破坏第1轮变更
stream/route.ts 已有 auditData 写入未被覆盖
SSE 流式输出 / stream-bus 事件不变
ADD-7 审计 action 完整落库（4 个 action）
```

---

## 附录：与 Round 1 / Round 2 Review 的交叉关联

| 交叉问题 | Round 1 Review | Round 2 Review | Round 3 当前 |
|---------|---------------|---------------|-------------|
| 类型文件路径一致性 | `src/agents/types.ts` vs `types/` 目录 | `src/agents/types.ts` vs `types/structured-output.ts` | N/A（本轮不涉及新增 section 类型） |
| section type `risks` vs `risk` | N/A | 已指出应使用 `risk`（单数） | **再次出现 `risks`，需修正** |
| ADD-7 action 不完整 | Handoff 仅 3 个 action，实际 8 个 | Handoff 仅 2 个 action，checklist 含更多 | **Handoff 仅 2 个 action，且恢复指南整体缺失（缺 targetId 映射、一键汇总、恢复顺序、完成标记）** |
| 恢复关键词不一致 | 缺少 interaction 相关 action | N/A | ✅ 已验证：第1.5轮恢复路径已覆盖（`CORE_STREAM_ROUTE_JSON_FIXED` + "确认第1.5轮全部完成"） |
| Prisma Schema 错误修改风险 | 无 | 无 | 有（ChatThread.metadata 覆盖风险） |
| 轮次依赖声明不完整 | N/A | N/A | ✅ 已验证：轮次依赖链（1→1.5→2→3）通过恢复流程保障递进修改 |
| 父 Plan 事实错误 | co-agent 表述 → farm-agent | N/A | **co-agent-simplified-v1.md L16 "简化分支"表述易让 AI 误降低代码质量，建议区分"功能范围简化"与"代码质量标准"** |

从交叉关联可见，**section type `risks` → `risk`** 是全链路一致性问题（从 Round 2 到 Round 7 都需要统一），**ADD-7 action 不完整** 是 handoff 模板的系统性问题（每轮都需要补齐文件级 action），建议将这两个问题纳入 Handoff 模板中统一修正。
