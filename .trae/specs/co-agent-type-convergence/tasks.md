# Tasks: 基础层 — 类型收敛 + thinkingLevel 路由

- [ ] Task 1: 统一 Evidence 类型定义
  - [ ] 修改 `src/types/evidence.ts`：Evidence 接口新增 `chunkId`/`expandable`/`detailUrl`/`score` 字段；新增 `EvidenceRef` 和 `EvidenceSummary` 接口
  - [ ] 验证：`npx tsc --noEmit` 零类型错误

- [ ] Task 2: 消除内联 Evidence 重复定义
  - [ ] 修改 `src/agents/state.ts`：删除 L33-L45 内联 Evidence 定义，改为 `import { Evidence } from "@/types/evidence"`；`CurrentTask` 新增 `thinkingLevel?: "fast" | "deep"`
  - [ ] 修改 `src/agents/prompts/types.ts`：所有内联 evidence 类型替换为 `EvidenceRef[]`；`CurrentTask` 类型新增 `thinkingLevel`
  - [ ] 修改 `src/agents/nodes/interaction-point-detection.ts`：evidence 引用替换为新的统一类型
  - [ ] 修改 `src/agents/prompts/interaction-point-detection.ts`：evidence 引用替换为新的统一类型
  - [ ] 验证：`grep "interface Evidence" src/ -r` 仅在 `src/types/evidence.ts` 中出现一次

- [ ] Task 3: 实现 thinkingLevel 路由
  - [ ] 修改 `src/agents/nodes/intention.ts`：intention 输出时设置 `currentTask.thinkingLevel`（chat → "fast"，其余 → "deep"）
  - [ ] 修改 `src/agents/edges/conditional.ts`：`routeByIntent` 按 thinkingLevel 分流
  - [ ] 验证：发送"你好" → fast 通道；发送"水稻育秧步骤" → deep 通道

- [ ] Task 4: 填充 chunkId
  - [ ] 修改 `src/agents/nodes/retrieval.ts`：产出证据时填充 `chunkId` 字段
  - [ ] 验证：发送需要 RAG 的查询 → evidenceChain 中证据含 chunkId

- [ ] Task 5: 全局验证
  - [ ] 验证1：`npx tsc --noEmit` 零类型错误
  - [ ] 验证2：fast 通道 SSE 事件序列不含 retrieval/reasoning/verdict
  - [ ] 验证3：deep 通道 SSE 事件序列含完整 6 节点
  - [ ] 验证4：fast 回复 < 100 tokens

# Task Dependencies

- Task 2 依赖 Task 1（需要统一类型定义）
- Task 3 依赖 Task 2（需要 thinkingLevel 类型）
- Task 4 依赖 Task 1（需要 chunkId 字段）
- Task 5 依赖 Task 1-4 全部完成
