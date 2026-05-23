# Tasks: 裁决层 — ResponseStrategy 集中管理

- [ ] Task 1: 新建 response-strategy.ts 模块
  - [ ] 定义 `ThinkingLevel`、`ResponseStrategy`、`StrategyContext`、`StrategyDescriptor` 类型
  - [ ] 创建 `registry: StrategyDescriptor[]` 数组
  - [ ] 实现 `register(descriptor)` 函数
  - [ ] 注册 8 个策略（fast:chat + deep:analysis/planning/decision/question/creation/modification + deep:fallback）
  - [ ] 实现 `resolveResponseStrategy(ctx)`：遍历 registry → filter(matches) → sort(priority) → 修饰器管道
  - [ ] 实现修饰器1（activeExperts outputSections 合并）
  - [ ] 实现修饰器2（evidence_digest 运行时降级）
  - [ ] 验证：单元测试调用 resolveResponseStrategy 确认各意图匹配正确

- [ ] Task 2: 改造 response.ts 使用策略裁决
  - [ ] 修改 `src/agents/nodes/response.ts`：构建 StrategyContext → 调用 resolveResponseStrategy
  - [ ] `buildStreamingTextPrompt` 在 system prompt 末尾追加 strategy.promptHint
  - [ ] `buildDisplayFromState` 按 strategy.sections 过滤生成 section
  - [ ] 删除硬编码三段分支逻辑
  - [ ] 验证：每种意图产出的 sections/promptHint/maxTokens 符合 spec 要求

- [ ] Task 3: 扩展 DisplayContent.sections 联合类型
  - [ ] 修改 `src/agents/types.ts`：sections 联合类型新增 `"evidence_digest"` / `"action_steps"` / `"timeline"`
  - [ ] 验证：`npx tsc --noEmit` 零类型错误

- [ ] Task 4: 端到端验证
  - [ ] fast 回复（你好）→ ≤2 句话，无证据/推理 section
  - [ ] analysis 回复 → sections 含 conclusion + evidence + reasoning + confidence + risks
  - [ ] planning 回复 → sections 含 action_steps + timeline，不含 evidence_digest
  - [ ] question 回复 → sections 含 evidence_digest，不含 reasoning
  - [ ] catch-all → 未定义意图回退到 deep:fallback

# Task Dependencies

- Task 2 依赖 Task 1（需要 resolveResponseStrategy 函数）
- Task 3 可并行于 Task 1-2
- Task 4 依赖 Task 1-3 全部完成
