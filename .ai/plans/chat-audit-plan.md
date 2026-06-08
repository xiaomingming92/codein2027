# Chat 接口可审计化计划

## 问题分析

当前 chat 接口 (`/api/agent/chat`) 返回 `net::ERR_ADDRESS_UNREACHABLE`，但调试是黑盒：
- API 路由层只有 `console.error`，无结构化日志
- 5 个 Agent 节点（intention → retrieval → reasoning → verdict → response）无审计日志
- LLM 调用无耗时/错误记录
- 前端只显示 "抱歉，发生了错误"，无诊断信息
- 无法判断失败发生在哪一层（网络？LLM？ChromaDB？JSON解析？）

## 实施计划

### 步骤 1: 创建 Agent 审计日志模块

**文件**: `src/lib/agent-audit-logger.ts`

复用 `audit-logger.ts` 的文件日志基础设施，但使用独立前缀和阶段：

```
[AGENT-AUDIT] [ISO时间] [阶段] 详情 | {JSON}
```

阶段定义：
- `CHAT_REQUEST` - 请求进入
- `CHAT_RESPONSE` - 响应返回
- `CHAT_ERROR` - 请求失败
- `LLM_CALL` - LLM 调用开始/结束（含耗时、模型、token）
- `LLM_ERROR` - LLM 调用失败
- `NODE_START` - 节点开始执行
- `NODE_END` - 节点执行完成
- `NODE_ERROR` - 节点执行失败
- `ROUTE` - 条件路由决策
- `RETRIEVAL_RESULT` - 检索结果摘要

日志文件: `logs/agent/agent-audit.log`

### 步骤 2: 植入 API 路由层审计

**文件**: `src/app/api/agent/chat/route.ts`

- 请求进入时记录: threadId, messages数量, 用户消息摘要
- 成功时记录: 响应消息数量, verdict类型, 总耗时
- 失败时记录: 错误类型, 错误消息, 堆栈摘要

**文件**: `src/app/api/agent/stream/route.ts`

- 同上，增加 SSE 流式事件日志

### 步骤 3: 植入 Agent 工作流审计

**文件**: `src/agents/index.ts`

- `runAgent()` / `streamAgent()` 入口记录请求和响应
- 每个节点执行前后记录 `NODE_START` / `NODE_END`（含耗时）

### 步骤 4: 植入各节点审计

**文件**: `src/agents/nodes/intention.ts`
- 记录: 输入消息摘要, LLM返回的意图, 解析是否成功

**文件**: `src/agents/nodes/retrieval.ts`
- 记录: 查询关键词, ChromaDB返回结果数, 证据链数量

**文件**: `src/agents/nodes/reasoning.ts`
- 记录: 证据数量, LLM推理耗时, 置信度

**文件**: `src/agents/nodes/verdict.ts`
- 记录: 裁决类型, 置信度, 风险数量

**文件**: `src/agents/nodes/response.ts`
- 记录: 响应内容长度, 是否调用LLM

### 步骤 5: 植入 LLM 调用审计

**文件**: `src/lib/llm/index.ts`

- `getLLM()` 创建实例时记录: provider, model, baseURL
- 包装 `invoke()` 调用，记录: 调用耗时, 输入长度, 输出长度, 错误

### 步骤 6: 植入条件路由审计

**文件**: `src/agents/edges/conditional.ts`

- `routeByIntent()`: 记录意图和路由目标
- `routeByVerdictType()`: 记录裁决类型和路由目标

### 步骤 7: 添加 CLI 命令和诊断脚本

**文件**: `package.json`
- `agent:logs` - 查看 agent 审计日志
- `agent:logs:clear` - 清空日志
- `agent:diagnose` - 诊断 LLM/ChromaDB 连通性

**文件**: `scripts/agent-diagnose.ts`
- 测试 LLM API 连通性（发送简单 prompt）
- 测试 ChromaDB 连通性（heartbeat + count）
- 测试数据库连通性（简单查询）
- 输出当前配置信息

### 步骤 8: 更新文档

**文件**: `docs/RAG-KNOWLEDGE-BASE.md`
- 补充 Agent 审计日志章节
- 补充 agent:logs / agent:diagnose 命令
- 补充 Agent 层故障排查指南

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/agent-audit-logger.ts` | 新建 | Agent 审计日志模块 |
| `src/app/api/agent/chat/route.ts` | 修改 | 添加请求/响应/错误审计 |
| `src/app/api/agent/stream/route.ts` | 修改 | 添加流式请求/错误审计 |
| `src/agents/index.ts` | 修改 | 添加工作流入口/出口审计 |
| `src/agents/nodes/intention.ts` | 修改 | 添加意图识别审计 |
| `src/agents/nodes/retrieval.ts` | 修改 | 添加检索审计 |
| `src/agents/nodes/reasoning.ts` | 修改 | 添加推理审计 |
| `src/agents/nodes/verdict.ts` | 修改 | 添加裁决审计 |
| `src/agents/nodes/response.ts` | 修改 | 添加响应审计 |
| `src/agents/edges/conditional.ts` | 修改 | 添加路由决策审计 |
| `src/lib/llm/index.ts` | 修改 | 添加 LLM 调用审计 |
| `scripts/agent-diagnose.ts` | 新建 | 诊断脚本 |
| `package.json` | 修改 | 添加 agent:logs / agent:diagnose 命令 |
| `.env.development` | 修改 | 添加 AGENT_LOG_DIR 等变量 |
| `.gitignore` | 修改 | 添加 logs/agent/ |
| `docs/RAG-KNOWLEDGE-BASE.md` | 修改 | 补充 Agent 审计文档 |
