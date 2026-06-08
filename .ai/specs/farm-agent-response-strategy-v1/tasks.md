# Tasks: 裁决层 — ResponseStrategy 集中管理

## Preconditions

- [ ] 已执行 `session-init` SKILL
- [ ] 已执行 `add-paradigm` SKILL（Step 0 文档先行）
- [ ] 上游第1轮 ADD-7 审计记录存在（`query_audit_logs({ keyword: "EVIDENCE_TYPE_UNIFIED" })`）
- [ ] 上游第1.5轮核心链路基线审计记录存在（`query_audit_logs({ keyword: "ROUND1_5_CORE_BASELINE_COMPLETED" })`）
- [ ] `npx tsc --noEmit` 在上游相关核心链路完成后通过或已确认剩余错误属于历史基线

## Forbidden

- 禁止修改 Prisma Schema（`prisma/schema.prisma`）
- 禁止修改前端组件（React/Vue 组件文件）
- 禁止覆盖或重构已有 stream-bus / SSE 事件总线逻辑
- 禁止用 switch/case 或 if/else chain 简化 ResponseStrategy registry（保持 descriptor registry 模式）
- 禁止引入 ExpertRegistry / AnalysisContext / activeExperts 持久化 / ChatThread.metadata 读写
- 禁止从 conversationContext 猜测 activeExperts 结构；第2轮 response.ts 必须传 `activeExperts: []`
- 禁止为接入 maxTokens 重构 LLM wrapper；maxTokens 本轮作为策略元数据和 promptHint 约束
- 禁止编造 timeline；无结构化时间数据时不生成 timeline section
- 禁止新增 `"risks"` section type；风险 section 必须继续使用前端协议 `"risk"`
- 禁止新建 `src/agents/types.ts`；DisplayContent 类型只能修改 `src/agents/types/structured-output.ts`
- 禁止简化代码实现，一切以代码高质量为衡量标准

- [ ] Task 1: 新建 response-strategy.ts 模块
  - [ ] 定义 `ThinkingLevel`、`ResponseSectionType`、`ResponseStrategy`、`StrategyActiveExpert`、`StrategyContext`、`StrategyDescriptor` 类型
  - [ ] 创建 `registry: StrategyDescriptor[]` 数组
  - [ ] 实现 `register(descriptor)` 函数
  - [ ] 注册 8 个策略（fast:chat + deep:analysis/planning/decision/question/creation/modification + deep:fallback）
  - [ ] 确认 `deep:fallback` 即 catch-all 兜底，不额外创建第 9 个 catch-all descriptor
  - [ ] 实现 `resolveResponseStrategy(ctx)`：遍历 registry → filter(matches) → sort(priority desc) → pick first → 装饰器管道
  - [ ] 实现装饰器1（activeExperts outputSections 合并且去重，仅消费 ctx 入参，不读取任何外部状态）
  - [ ] 实现装饰器2（hasNonPriorEvidence=false 时关闭 showEvidenceDigest，并从 sections 移除 evidence_digest）
  - [ ] 验证：单元测试调用 resolveResponseStrategy 确认各意图匹配正确

- [ ] Task 2: 新增 response-strategy.test.ts 纯策略单元测试
  - [ ] 新建 `src/agents/response-strategy.test.ts`
  - [ ] 覆盖 fast chat → fast:chat
  - [ ] 覆盖 deep analysis → deep:analysis
  - [ ] 覆盖 deep planning → deep:planning
  - [ ] 覆盖 deep question → deep:question
  - [ ] 覆盖 deep unknown → deep:fallback
  - [ ] 覆盖 priority desc 生效
  - [ ] 覆盖 evidence_digest 无非先验证据时降级
  - [ ] 覆盖 activeExperts outputSections 合并且去重
  - [ ] 验证：新增测试自身类型干净，可单独运行/通过；当前全局 test suite 若有历史基线问题，需区分本轮新增测试与历史失败

- [ ] Task 3: 改造 response.ts 使用策略裁决
  - [ ] 修改 `src/agents/nodes/response.ts`：构建 StrategyContext → 调用 resolveResponseStrategy
  - [ ] response.ts 构造 StrategyContext 时必须使用 `activeExperts: []`，不得从 conversationContext / ChatThread.metadata / AnalysisContext 推断 activeExperts
  - [ ] 基于 evidenceChain 计算 hasNonPriorEvidence，规则以 spec.md 为准
  - [ ] `buildStreamingTextPrompt` 在 system prompt 末尾追加 strategy.promptHint
  - [ ] `buildDisplayFromState` 按 strategy.sections 过滤生成 section
  - [ ] fast/chat 或 greeting 场景也必须经过 resolveResponseStrategy，并生成 conclusion section，不允许 sections=[]
  - [ ] 删除硬编码三段分支中的策略决策职责，但保留流式输出、structuredOutput、traceId、NodeStreamController 和既有审计链路
  - [ ] 验证：每种意图产出的 sections/promptHint/maxTokens 符合 spec 要求

- [ ] Task 4: 扩展 DisplayContent.sections 联合类型
  - [ ] 修改 `src/agents/types/structured-output.ts`：sections 联合类型新增 `"evidence_digest"` / `"action_steps"` / `"timeline"`
  - [ ] 确认未新增 `"risks"`，风险 section 继续使用 `"risk"`
  - [ ] 验证：`npx tsc --noEmit` 中本轮相关类型零错误

- [ ] Task 5: 端到端验证
  - [ ] fast 回复（你好）→ ≤2 句话，sections 仅含 conclusion
  - [ ] analysis 回复 → sections 含 conclusion + evidence + reasoning + confidence + risk
  - [ ] planning 回复 → sections 含 action_steps + timeline（仅当有结构化时间数据），不含 evidence_digest
  - [ ] question 回复 → sections 含 evidence_digest，不含 reasoning
  - [ ] catch-all → 未定义意图回退到 deep:fallback
  - [ ] timeline 无结构化时间数据时不生成，不编造

# Task Dependencies

- Task 2 依赖 Task 1（需要 resolveResponseStrategy 函数）
- Task 3 依赖 Task 1（需要 resolveResponseStrategy 函数）
- Task 4 可并行于 Task 1-3
- Task 5 依赖 Task 1-4 全部完成

## Verification

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`（如项目已配置）
- [ ] `npm run test -- src/agents/response-strategy.test.ts` 或项目支持的等价单测命令
- [ ] 当前 spec `checklist.md` 全部通过
- [ ] 当前轮次 ADD-7 `record_dev_operation` 已逐文件记录

## 对话启动（将此段粘贴给新的 LLM 对话）

你在执行 farm-agent 改进的 **第2轮**（响应裁决闭包）。上游第1轮已完成类型收敛 + thinkingLevel 路由，第1.5轮已完成核心链路 TS/lint 基线收敛。

**启动步骤（按顺序）：**
1. 执行 `session-init` SKILL → 按 handoff 回查第1轮和第1.5轮关键 ADD-7 记录
2. 执行 `add-paradigm` SKILL
3. 阅读 `specs/co-agent-response-strategy/spec.md`
4. 按本 tasks.md 顺序执行

**文件清单：**
- `src/agents/response-strategy.ts`（新建）
- `src/agents/response-strategy.test.ts`（新建）
- `src/agents/nodes/response.ts`（修改）
- `src/agents/types/structured-output.ts`（修改）

**高风险提醒：**
- `src/agents/types.ts` 不存在，不要新建；DisplayContent 类型在 `src/agents/types/structured-output.ts`
- StrategyDescriptor registry 禁止退化为 switch/case 或 if/else chain
- 第2轮 response.ts 必须传 `activeExperts: []`，不得读取 conversationContext / ChatThread.metadata / AnalysisContext 来推断专家
- 第2轮不得引入 ExpertRegistry / AnalysisContext / activeExperts 持久化 / LLM wrapper 重构 / report generator
- 风险 section 使用现有前端协议 `"risk"`，不得新增 `"risks"`

**关键提醒：** 当前执行单位是第2轮原子事务，完成后立即逐文件 record_dev_operation 并 query_audit_logs 回查。
