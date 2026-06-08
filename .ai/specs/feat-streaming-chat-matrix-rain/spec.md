# Streaming 聊天 + 矩阵雨字符源替换 Spec

## Why

1. **当前聊天是同步 JSON 响应**：`handleSend` 发 POST → 等待完整 `response.json()` → 才显示结果，用户体验差，大响应有明显等待感
2. **矩阵雨永远在用随机片假名**：`MatrixRainBackground` idle 时也在显示，且字符源是固定的 `ｱｲｳｴｵ...`，与聊天内容无关
3. **缺乏 streaming 专属的 ADD 审计日志**：需要符合项目规范的审计日志器追踪 streaming 过程中的事件

## What Changes

- **新增 SSE 流式端点** `/api/agent/chat/stream`：使用已存在的 `streamAgent()` 替代 `runAgent()`，通过 `ReadableStream` 逐 token 推送
- **前端改造 `handleSend`**：改用 `response.body.getReader()` 消费 SSE 流，逐 chunk 追加到消息缓存
- **Store 新增流式状态**：`streamCharPool` 环形缓冲区、`currentStreamContent` 实时内容
- **矩阵雨字符源替换**：`MatrixRainBackground` 从流式响应的真实字符中取材，idle 时完全隐藏
- **新增 ADD 审计日志器**：`stream-chat-logger` 覆盖 streaming 全生命周期
- **对 `agentAuditLLMCall` 进行增强**：支持记录 streaming 过程中的 token 级耗时

## Impact

- Affected code:
  - `src/app/api/agent/chat/stream/route.ts` — **新建** SSE 流式端点
  - `src/components/chat/chat-panel.tsx` — `handleSend` 流式消费 + 错误处理
  - `src/stores/chat-store.ts` — 新增 `streamCharPool`、`currentStreamContent`、`appendStreamChar`、`clearStreamCharPool`
  - `src/components/chat/status-indicator.tsx` — `MatrixRainBackground` 接收字符池 prop，idle 隐藏
  - `src/constants/thread-status.ts` — 可选：矩阵雨背景的 opacity/idle 隐藏配置
  - `src/lib/stream-chat-logger.ts` — **新建** 流式聊天审计日志器
- ADD 合规：生成新的 ADD 审计日志器 + check_phase_symmetry + check_failure_path

---

## ADDED Requirements

### Requirement: SSE 流式聊天端点

系统 SHALL 在 `/api/agent/chat/stream` 提供 SSE (Server-Sent Events) 端点，逐 token 推送 LLM 生成内容。

#### Scenario: 正常流式响应
- **WHEN** 客户端 POST 相同请求体到 `/api/agent/chat/stream`
- **THEN** 响应 SHALL 使用 `text/event-stream` Content-Type
- **THEN** 每一帧 SHALL 推送 `data: {"token": "xxx"}\n\n` 格式的事件
- **THEN** 推送完成后 SHALL 发送 `data: [DONE]\n\n` 终止信号

#### Scenario: 流式过程中错误
- **WHEN** 流式过程中 LLM 或 agent 抛出异常
- **THEN** 端点 SHALL 发送 `data: {"error": "message"}\n\n` 事件
- **THEN** 随后 SHALL 发送 `data: [DONE]\n\n` 终止信号

### Requirement: 前端流式消费

系统 SHALL 在前端使用 `ReadableStream` 消费 SSE 流，逐 chunk 更新 UI。

#### Scenario: 流式接收并显示
- **WHEN** `handleSend` 收到 SSE 流式响应
- **THEN** 逐 chunk 读取 `response.body.getReader()`
- **THEN** 每个 token 追加到当前 assistant 消息的 `content` 中
- **THEN** 每个 token 拆分为字符后 push 到 `streamCharPool`
- **THEN** 完成后重置 streaming 状态，持久化完整的 assistant 消息

#### Scenario: 流式过程中报错
- **WHEN** 流式过程中收到 `{"error": "..."}` 事件
- **THEN** 设置 `threadStatus = "error"`
- **THEN** 在消息中显示错误信息
- **THEN** 清空 `streamCharPool`

### Requirement: 矩阵雨取流式字符

系统 SHALL 在 streaming 时使用流式响应的真实字符作为矩阵雨字符源。

#### Scenario: streaming 时
- **WHEN** `threadStatus === "streaming"` 且 `streamCharPool.length > 0`
- **THEN** `MatrixRainBackground` 从 `streamCharPool` 中随机取字符绘制
- **THEN** 字符颜色跟随状态（绿色）

#### Scenario: idle 时
- **WHEN** `threadStatus === "idle"`
- **THEN** `MatrixRainBackground` 的 canvas SHALL 隐藏（`display: none` 或空 clearRect）
- **THEN** `streamCharPool` 为空

#### Scenario: 开始 streaming（字符池为空）
- **WHEN** `threadStatus` 从 `idle` 切换为 `streaming`
- **THEN** `MatrixRainBackground` 显示，使用 `MATRIX_RAIN_CHARS` 作为后备字符
- **THEN** 一旦 `streamCharPool` 有字符，立即切换使用真实字符

### Requirement: 新增 Stream Chat 审计日志器

系统 SHALL 新增符合项目模式的 streaming 审计日志器，覆盖流式聊天全生命周期。

#### Scenario: 审计日志记录
- **WHEN** 流式请求开始
- **THEN** SHALL 记录 `STREAM_START` 事件，包含 `threadId`, `model`, `messageCount`
- **WHEN** 每个 token 到达
- **THEN** SHALL 记录 `TOKEN_CHUNK` 事件（采样率 1/5，避免日志洪泛），包含 `chunkLength`, `position`
- **WHEN** 流式完成
- **THEN** SHALL 记录 `STREAM_DONE` 事件，包含 `totalTokens`, `durationMs`, `charactersReceived`
- **WHEN** 流式失败
- **THEN** SHALL 记录 `STREAM_FAIL` 事件，包含 `error`, `tokensBeforeError`, `durationMs`

---

## MODIFIED Requirements

### Requirement: ChatStore 流式状态

- 新增 `streamCharPool: string[]` — 最多 200 字符的环形缓冲区
- 新增 `currentStreamContent: string` — 当前正在流式接收的完整内容
- 新增 `appendStreamChar(char: string)` — 添加单个字符到池
- 新增 `clearStreamCharPool()` — 清空池
- 新增 `setCurrentStreamContent(content: string)` — 设置当前流内容

### Requirement: chat-panel.tsx handleSend

将当前 `const data = await response.json()` 改为 SSE 流式消费：
- `response.ok` 检查保留
- `response.body.getReader()` 逐块读取
- 按 `\n\n` 分割 SSE 事件
- 解析 `data: {...}` 行
- token 追加到 store 的消息 content
- 每个 token 拆字符 → `appendStreamChar`

---

## REMOVED Requirements

(无删除)
