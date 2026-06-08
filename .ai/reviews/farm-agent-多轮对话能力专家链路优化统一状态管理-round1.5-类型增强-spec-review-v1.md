# farm-agent 全局 tsc/lint 基线影响 Review

## Review 元信息

- **Review 对象**: 当前全局 `./node_modules/.bin/tsc --noEmit` 与 `npm run lint -- --max-warnings=0` 输出
- **触发背景**: 第1轮基础闭包完成后，全局 tsc/lint 仍存在历史基线错误，需要判断是否影响第2-7轮
- **Review 时间**: 2026-05-25
- **结论级别**: 需要新增第1.5轮核心链路 TS 基线收敛；不建议一次性清理全部 scripts/tests/UI lint

---

## 1. 总体结论

第1轮相关文件没有新增 TypeScript/lint 错误，但全局基线错误中存在若干核心链路错误，会影响第3、5、6、7轮，尤其是 `stream/route.ts`、`agents/index.ts`、`agent-audit-logger.ts`、`stream-bus.ts`。

因此建议在第2轮 ResponseStrategy 前插入一个小型原子事务：

```text
第1.5轮：核心链路 TS 基线收敛
```

第1.5轮只修会反复影响后续轮的核心链路文件，不修 scripts/tests/UI 的全量 lint。

---

## 2. 高风险基线错误

### 2.1 `src/app/api/agent/chat/stream/route.ts`

当前错误：

```text
Record<string, unknown> 不可赋给 Prisma Json
Unexpected any
```

影响轮次：

| 轮次 | 影响 |
|------|------|
| 第3轮 | AnalysisContext 加载/保存 |
| 第5轮 | SemanticCache 接入 |
| 第6轮 | turnHistory 与 TTL 自适应 |
| 第7轮 | setAuditContext / debug trace / L2 audit |

结论：必须在第3轮前修复，建议第1.5轮修。

### 2.2 `src/agents/index.ts`

当前错误：

```text
Record<string, unknown> 不可赋给 Prisma Json
agentAudit unused lint warning
```

影响轮次：

| 轮次 | 影响 |
|------|------|
| 第2轮 | ResponseStrategy 接入后需要 LangGraph 主链路稳定 |
| 第7轮 | wrapNodeWithAudit / traceId / node audit |
| 第8轮 | Global State / Cognitive Event Bus 节点生命周期事件 |

结论：第1.5轮修。

### 2.3 `src/lib/agent-audit-logger.ts`

当前错误：

```text
Record<string, unknown> | undefined 不可赋给 Prisma Json
```

影响轮次：

| 轮次 | 影响 |
|------|------|
| 第7轮 | L2 AuditLog 升级核心文件 |
| 第8轮 | audit state / cognitive event 依据 |

结论：第1.5轮修。

### 2.4 `src/agents/stream-bus.ts`

当前错误：

```text
Function lacks ending return statement
```

影响轮次：

| 轮次 | 影响 |
|------|------|
| 第4轮 | 专家管线消费后的 stream 输出 |
| 第5轮 | cache_hit 模拟流式 |
| 第7轮 | 审计管线观测 stream events |
| 第8轮 | Cognitive Event Bus 演进基础 |

结论：第1.5轮修。

---

## 3. 中风险基线错误

### 3.1 `ModelInfo.multimodal` 缺失

文件：

```text
src/app/api/agent/chat/route.ts
src/app/api/model/test/route.ts
```

影响：第4轮和第8轮会触及模型能力、多模态能力或模型状态。

建议：第4轮前修，若第1.5轮时间允许可顺手修。

### 3.2 `src/agents/tools/impl/project-tools.ts`

当前错误：

```text
ProjectCountOutputTypeSelect 中不存在 documents
```

影响：第8轮 Tool State 统一前需要收敛。

建议：第8轮前修，不纳入第1.5轮必修。

### 3.3 SSE 测试类型

文件：

```text
scripts/test-sse-flow.ts
src/tests/sse-event-flow.test.ts
```

影响：自动化验证 fast/deep SSE 行为会受阻。

建议：如果第2轮需要自动化 SSE 验证，则提前修；否则可作为测试基线单独修。

---

## 4. 低风险或可延后问题

以下不建议混入第1.5轮：

```text
scripts/*.js require 风格 lint
React UI hooks purity lint
knowledge tests / DOMMatrix setup
unused imports 全量清理
```

原因：这些问题横跨 UI、脚本、测试环境，与第2-7轮 Agent 主链路不构成直接阻塞；混入会破坏第1.5轮原子边界。

---

## 5. 第1.5轮原子边界

### 目标

让第2-7轮会反复触碰的核心链路文件不再携带 TypeScript 基线错误。

### 必修文件

```text
src/app/api/agent/chat/stream/route.ts
src/agents/index.ts
src/lib/agent-audit-logger.ts
src/agents/stream-bus.ts
```

### 可选顺手修

```text
src/app/api/agent/chat/route.ts
src/app/api/model/test/route.ts
```

### 禁止事项

- 禁止清理全量 scripts lint
- 禁止重构 React UI hooks
- 禁止修复所有 tests
- 禁止改变第1轮已完成的 Evidence / thinkingLevel 行为
- 禁止引入第2轮 ResponseStrategy

---

## 6. 第1.5轮验收标准

核心链路 TypeScript 验收：

```bash
./node_modules/.bin/tsc --noEmit --pretty false 2>&1 \
  | grep -E "src/app/api/agent/chat/stream/route.ts|src/agents/index.ts|src/lib/agent-audit-logger.ts|src/agents/stream-bus.ts"
```

通过标准：无输出。

核心链路 lint 验收：

```bash
npm run lint -- --max-warnings=0 2>&1 \
  | grep -E "src/app/api/agent/chat/stream/route.ts|src/agents/index.ts|src/lib/agent-audit-logger.ts|src/agents/stream-bus.ts"
```

通过标准：无输出。

全局 tsc/lint 允许仍被 scripts/tests/UI 历史问题阻塞，但第1.5轮目标文件必须无相关错误。

---

## 7. ADD-7 建议 action

```text
CORE_TS_BASELINE_REVIEW_CREATED
CORE_STREAM_ROUTE_JSON_FIXED
CORE_AGENT_INDEX_JSON_FIXED
CORE_AGENT_AUDIT_JSON_FIXED
CORE_STREAM_BUS_RETURN_FIXED
ROUND1_5_CORE_BASELINE_COMPLETED
```

---

## 8. 对后续轮次的要求

- 第2轮开始前必须确认 `ROUND1_TYPE_CONVERGENCE_COMPLETED` 和 `ROUND1_5_CORE_BASELINE_COMPLETED` 均已落库。
- 第3轮开始前必须确认 `CORE_STREAM_ROUTE_JSON_FIXED` 已落库。
- 第7轮开始前必须确认 `CORE_AGENT_AUDIT_JSON_FIXED` 和 `CORE_AGENT_INDEX_JSON_FIXED` 已落库。
- 第8轮开始前必须确认 `CORE_STREAM_BUS_RETURN_FIXED` 已落库。
