# farm-agent-layer2-cross-cutting-review-v1

## Review 元信息

- Review 对象:
  - `.trae/specs/farm-agent-layer2-cross-cutting/spec.md`
  - `.trae/specs/farm-agent-layer2-cross-cutting/tasks.md`
  - `.trae/specs/farm-agent-layer2-cross-cutting/checklist.md`
  - `.trae/plans/farm-agent-layer2-cross-cutting-plan-v1.md`
  - `.trae/plans/farm-agent-layer2-cross-cutting-handoff.md`
  - farm-agent 现有 `src/agents/index.ts`（`wrapNodeWithAudit` 实现）
  - farm-agent 现有 `src/lib/agent-audit-logger.ts`（`writeAuditLog` 实现）
- Review 范围: 将 Layer 2 运行时审计方案从 HTTP `withRuntimeAudit()` 包装器修正为 LangChain `BaseCallbackHandler` 回调机制，专门覆盖 Agent 域（LangGraph pipeline）
- Review 时间: 2026-06-03
- Review 类型: 方案方向修正
- 前置阅读: 原 v1 plan（2026-05-29，HTTP 包装器方案）

---

## 1. 问题复现

### 1.1 原方案的问题

原 v1 Plan（2026-05-29）提出用 `withRuntimeAudit()` 高阶函数包装器实现 Layer 2 运行时审计的自动化，继承 milktea 的"自动记录"洞见。该方向在抽象层面是正确的，但在**适用域**上犯了方向错误：

- `withRuntimeAudit()` 的拦截位置是 HTTP 请求/响应（类似 Express 中间件覆盖 `res.json()`）
- Agent 域的执行在 LangGraph pipeline 内部，不经过 HTTP 入口（`stream/route.ts` 只做 HTTP ↔ Agent 的桥接）
- 用 HTTP 包装器覆盖 Agent 域，相当于在错误的层次上做横切——它看不到 pipeline 内部的节点、LLM 调用和 Tool 调用

### 1.2 miltea 贡献的重新定位

milktea 证明的是"Layer 2 可以自动记录"这一可能性——Express 中间件是 miltea 在 Node RuoYi 架构中证明这一点的技术手段，但该**技术手段绑定 Express HTTP 管线**。在 farm-agent 的 Next.js + LangGraph 架构中：

- 知识库 API Route → 适合 HTTP 层横切（独立的后续 Plan）
- Agent LangGraph pipeline → 需要 LangChain 原生回调机制

### 1.3 什么是正确的方案

LangChain 提供了 `BaseCallbackHandler`（`@langchain/core/callbacks/base`），这是 LangGraph 生态系统**官方的、推荐的生命周期钩子机制**。通过注入到 `agent.invoke()/stream()` 的 `config.callbacks` 中：

| 钩子 | 覆盖范围 |
|------|---------|
| `handleChainStart/End/Error` | LangGraph 节点 + 根 pipeline |
| `handleLLMEnd/Error` | 所有 LLM 调用（含 token usage） |
| `handleToolStart/End/Error` | 所有 Tool 调用（含输入/输出） |

这是 LangGraph 的**标准扩展点**，不是 hack。LangChain 文档明确推荐通过 callbacks 实现日志、监控、审计等横切关注点。

---

## 2. 方案对比

### 2.1 原方案（HTTP `withRuntimeAudit()`）vs 新方案（`BaseCallbackHandler`）

| 维度 | HTTP `withRuntimeAudit()` | `BaseCallbackHandler` |
|------|--------------------------|----------------------|
| 拦截位置 | HTTP 请求/响应 | LangGraph 生命周期事件 |
| 覆盖 Agent 域 | ❌ 不覆盖（Agent 不经 HTTP 入口执行） | ✅ 全覆盖（节点 + LLM + Tool） |
| 覆盖知识库域 | ✅ 适用（API Route 的请求/响应） | ❌ 不适用（知识库不走 LangGraph） |
| 改动节点代码 | 不需要 | **不需要** — callback 注入在 `runAgent()/streamAgent()` |
| 覆盖 LLM 调用 | ❌ 看不见 | ✅ `handleLLMEnd` 自动捕获 |
| 覆盖 Tool 调用 | ❌ 看不见 | ✅ `handleToolStart/End/Error` 自动捕获 |
| 零新增依赖 | 是 | 是（`@langchain/core` v1.1.48 已有） |
| LangGraph 标准 | 否 | **是** — 官方扩展机制 |

### 2.2 两个域的分离

```
Agent 域（LangGraph pipeline）
  ├── 横切点：agent.invoke()/stream() 的 config.callbacks
  ├── 技术手段：AuditCallback extends BaseCallbackHandler
  └── 本次 Plan 覆盖 ✅

知识库域（HTTP API Route）
  ├── 横切点：HTTP 请求/响应
  ├── 技术手段：withRuntimeAudit() 或 milktea 风格中间件
  └── 后续独立 Plan（不在本次范围内）
```

---

## 3. 决策结论

**方案 A（`BaseCallbackHandler`）** 是唯一正确的 Agent 域 Layer 2 审计方案：

1. **LangGraph 标准**：`BaseCallbackHandler` 是 LangChain 设计的官方扩展点，不是 hack
2. **全覆盖**：节点 + LLM + Tool 三个层次全部自动覆盖，无需任何手动审计代码
3. **零侵入**：节点文件（`intention.ts`、`retrieval.ts` 等）不需要任何改动
4. **零新增依赖**：`@langchain/core` v1.1.48 已有 `BaseCallbackHandler`
5. **追加不覆盖**：callbacks 数组追加到已有 callbacks 后面，不影响用户自定义 callbacks
6. **traceId 一致性**：与 L1 dev-logger 共享相同 traceId，可跨层关联

**知识库域的 HTTP 层审计不在本次范围内**，作为独立 Plan 后续实施。

---

## 4. 影响评估

### 4.1 受影响文件

| 文件 | 操作 | 影响 |
|------|------|------|
| `src/lib/layer2-callback.ts` | CREATE | 纯新增，不影响现有代码 |
| `src/agents/index.ts` | MODIFY | `runAgent()` 和 `streamAgent()` 新增 ~5 行 callback 注入代码 |
| `src/lib/agent-audit-logger.ts` | MODIFY/REVIEW | 审查兼容性，可能不需要真实改动 |

### 4.2 数据流影响

```
修改前：
  agent.invoke() → pipeline 执行 → 无 L2 审计（仅 L1 wrapNodeWithAudit console+file）

修改后：
  agent.invoke({ callbacks: [auditCallback] }) → pipeline 执行 → 回调自动写入 AuditLog 表
  ↑ 注入点            ↑ 所有事件自动触发              ↑ fire-and-forget
```

### 4.3 回滚风险

| 风险 | 缓解 |
|------|------|
| callback 写入失败 | `.catch()` fire-and-forget，不影响 Agent 响应 |
| 跨请求状态污染 | 每次 `invoke/stream` 创建新 `AuditCallback` 实例 |
| DB 写入过多 | 异步 fire-and-forget 不阻塞 pipeline |
| 与 L1 `auditNodeEvent` DB 写入重复 | 同名 action 但不同来源，可后续合并。当前保留两者不冲突。 |

---

## 5. 建议修正优先级

### 实施前必须确认

- [x] `BaseCallbackHandler` 在 `@langchain/core` v1.1.48 中可用（从 `@langchain/core/callbacks/base` 导入）
- [ ] Task 1 中阅读 `BaseCallbackHandler` 的 TS 类型定义，确认方法签名（如 `handleChainStart` 的参数是否与设计中一致）

### 实施中注意

- [ ] `handleChainStart` 的 `chain.name` 在根调用时可能是 `"RunnableSequence"` 等非节点名，需用 `AGENT_NODE_NAMES` Set 过滤
- [ ] `handleChainEnd` 的 `output` 可能是 `{ messages: [...], ... }`，提取 `outputKeys` 用于审计记录
- [ ] `handleLLMEnd` 的 `tokenUsage` 结构可能因 LLM provider 不同而不同（Ollama vs OpenAI），使用可选链兜底

### 后续 Phase 保留

- [ ] 知识库 API Route 的 HTTP 层 Layer 2 审计（独立 Plan）
- [ ] 装饰器 `@RuntimeAudit` 方案（Service 层）
- [ ] L1 `auditNodeEvent()` 与 L2 callback 的 DB 写入合并/去重
