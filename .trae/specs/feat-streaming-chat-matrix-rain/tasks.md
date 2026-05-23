# Tasks

- [x] Task 1: 使用 MCP `generate_audit_logger` 生成 stream-chat 审计日志器
  - [x] 调用 `mcp_add-dev-tools_generate_audit_logger` 生成 `stream-chat-logger.ts`
  - [x] 阶段枚举：`STREAM_START, TOKEN_CHUNK, STREAM_DONE, STREAM_FAIL`
  - [x] 验证生成的文件符合项目模式（三通道输出：console + file + 数据库回写模板）

- [x] Task 2: 创建 `/api/agent/chat/stream` SSE 端点
  - [x] 新建 `src/app/api/agent/chat/stream/route.ts`
  - [x] 复用现有 route.ts 的请求解析、模型配置、持久化逻辑
  - [x] 用 `streamAgent()` 替代 `runAgent()`，消费 agent.stream() 输出
  - [x] 使用 `ReadableStream` + `TextEncoder` 输出 `text/event-stream`
  - [x] 格式：`data: {"token":"xxx"}\n\n`，完成后 `data: {"done":true,...}\n\n`
  - [x] 错误时发送 `data: {"error":"xxx"}\n\n`
  - [x] 加入 stream-chat-logger 审计调用

- [x] Task 3: ChatStore 新增流式状态 + actions
  - [x] 新增 `streamCharPool: string[]`（最大 200 字符环形缓冲区）
  - [x] 新增 `currentStreamContent: string`
  - [x] 新增 `appendStreamChar(char: string)` action
  - [x] 新增 `clearStreamCharPool()` action
  - [x] 新增 `setCurrentStreamContent(content: string)` action
  - [x] 新增 `useActiveStreamCharPool` / `useActiveStreamContent` hooks

- [x] Task 4: 改造 `handleSend` 为 SSE 消费
  - [x] 使用 `/api/agent/chat/stream` 端点
  - [x] 用 `response.body.getReader()` 逐块读取
  - [x] 按 `\n\n` 分割 SSE 事件，解析 `data:` 行
  - [x] token 追加到本地 fullContent + `appendStreamChar` 拆字
  - [x] 遇到 done 事件后添加完整 assistant 消息
  - [x] 遇到 error 事件 → `setThreadStatus("error")`
  - [x] worldLine 生成逻辑保留

- [x] Task 5: MatrixRainBackground 使用 streamCharPool + idle 隐藏
  - [x] 新增 `charPool?: string[]` prop
  - [x] idle 状态时 canvas `display: none`
  - [x] streaming 时从 charPool 随机取字符绘制（有数据时）
  - [x] streaming 且 charPool 为空时用 `MATRIX_RAIN_CHARS` 后备
  - [x] `chat-panel.tsx` 传入 `streamCharPool` 到 `MatrixRainBackground`

- [x] Task 6: 编译验证 + ADD 合规检查
  - [x] `npx tsc --noEmit` 零错误（相关文件）
  - [x] `mcp_add-dev-tools_check_phase_symmetry` 通过
  - [x] `mcp_add-dev-tools_check_failure_path` 通过

# Task Dependencies
- [Task 1] 独立，最先执行 ✅
- [Task 2] 依赖 [Task 1]（需要日志器）✅
- [Task 3] 独立，并行于 [Task 2] ✅
- [Task 4] 依赖 [Task 2]、[Task 3] ✅
- [Task 5] 依赖 [Task 3]（需要 streamCharPool）✅
- [Task 6] 依赖全部完成 ✅
