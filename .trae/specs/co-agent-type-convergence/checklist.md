# Checklist: 基础层 — 类型收敛 + thinkingLevel 路由

- [ ] Evidence 接口在 `src/types/evidence.ts` 中唯一定义，含 chunkId/expandable/detailUrl/score 字段
- [ ] EvidenceRef 和 EvidenceSummary 接口已定义并可 import
- [ ] `state.ts` 不再内联定义 Evidence，改为 import 统一类型
- [ ] `prompts/types.ts` 中内联 evidence 全部替换为 EvidenceRef[]
- [ ] `interaction-point-detection.ts` 和对应的 prompt 文件使用新统一类型
- [ ] `CurrentTask` 接口含 thinkingLevel 字段（"fast" | "deep"）
- [ ] intention 节点输出 thinkingLevel：chat → "fast"
- [ ] routeByIntent 按 thinkingLevel 分流
- [ ] retrieval 节点填充 chunkId
- [ ] `npx tsc --noEmit` 零类型错误
- [ ] grep "interface Evidence" src/ -r 仅在 evidence.ts 中出现一次
- [ ] 发送"你好" → SSE 事件序列无 retrieval/reasoning/verdict
- [ ] 发送"水稻育秧步骤" → SSE 事件序列含完整 6 节点
- [ ] fast 回复 < 100 tokens
