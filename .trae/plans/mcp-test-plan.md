# MCP 服务器测试规划（v2 — 以真实 Bug 为试金石）

## 规划背景

### 发现 Bug

聊天功能存在数据丢失：聊天记录能正常显示**对话列表**，但重新加载历史对话后，AI 响应的**结构化数据**（证据链、推理路径、置信度分析、裁决详情等）丢失了。用户消息和 AI 文本内容能恢复，但 AI 输出的丰富结构化信息在历史中不可见。

### Bug 根因分析

从数据链路看，有两个可能的断裂点：

```
Agent 运行 → API 返回结构化数据 → 保存到数据库 → 历史加载 → UI 渲染
                                     ↑                   ↑
                                断裂点1              断裂点2
                            (保存时丢数据)        (加载/渲染时丢数据)
```

**断裂点 1**：`addMessage(threadId, "ASSISTANT", content, metadata, traceId)` 的 `metadata` 字段是否包含了完整结构化数据？`saveChainTrace` 保存的链路追踪数据在重新加载时是否被读取？

**断裂点 2**：`chat-message.tsx` 只渲染 `content` 文本，完全不处理 `metadata` 中的结构化数据（证据链、推理路径等）。

### 本规划的目标

**双重验证**：一方面作为 MCP 服务器的真实测试案例，证明 MCP 工具能有效诊断和修复实际 Bug；另一方面修复聊天数据丢失问题，让产品功能完整。

---

## 一、总体架构

### 1.1 验证方法论

以真实 Bug 作为 MCP 服务器是否"符合预期"的核心度量标准：

```
MCP 工具帮助诊断 Bug ──→ 修复代码 ──→ MCP 工具帮助验证修复
        │                           │
        ▼                           ▼
  1. get_db_schema 查模型        check_phase_symmetry
  2. get_project_context 查结构  check_failure_path
  3. get_audit_logger_pattern    generate_audit_logger(如需)
```

### 1.2 测试层级

```
           ┌───────────────────────────────────────┐
           │    真实 Bug 修复验证 (E2E)              │
           │  验证: 结构化数据 保存→加载→渲染 全链路  │
           ├───────────────────────────────────────┤
           │    AI 工作流调用链测试                    │
           │  验证: 6 个 MCP 工具能辅助 AI 完成修复   │
           ├───────────────────────────────────────┤
           │    单工具功能测试                        │
           │  验证: 每个工具入参/出参/边界条件正确     │
           ├───────────────────────────────────────┤
           │    MCP 协议层合规测试                    │
           │  验证: JSON-RPC 2.0, tools/list, error │
           └───────────────────────────────────────┘
```

---

## 二、Bug 诊断链路

### 2.1 诊断步骤

使用 MCP 工具调查 Bug 根因：

| 步骤 | MCP 工具 | 预期发现 |
|------|---------|----------|
| 1 | `get_db_schema(ChatMessage)` | 确认 ChatMessage 字段：content(text), metadata(Json?), traceId(string) — 暂缺结构化数据专用字段 |
| 2 | `get_db_schema(ChainTraceRecord)` | 确认链路追踪表的结构，能否关联到消息 |
| 3 | `get_project_context(scope:structure)` | 确认 chat-message.tsx / streaming-message.tsx 的组件结构 |
| 4 | `get_audit_logger_pattern(chat-persistence)` | 观察持久化时的审计日志，验证消息保存时的数据完整性 |
| 5 | **人工分析**: `chat/route.ts` 中 `addMessage` 调用 | 检查 `metadata` 参数传递了哪些数据 |
| 6 | **人工分析**: `messages/route.ts` 中 GET 响应 | 检查返回数据是否包含 `metadata` |
| 7 | **人工分析**: `chat-message.tsx` 渲染逻辑 | 确认 UI 只渲染 `content`，忽略 `metadata` |

### 2.2 诊断结论

预期结论：**断裂点 2 是主因** — 数据结构化保存完整（metadata 有数据），但 UI 组件不渲染。同时可能伴随断裂点 1 的部分问题（部分结构化数据未传入 metadata）。

---

## 三、修复方案

### 3.1 修复范围

| 文件 | 修改内容 | 优先级 |
|------|---------|--------|
| `src/components/chat/chat-message.tsx` | 新增结构化数据渲染（证据链、推理路径、置信度等） | P0 |
| `src/components/chat/streaming-message.tsx` | 同名渲染支持（流式完成后的静态显示） | P0 |
| `src/app/api/agent/chat/threads/[threadId]/messages/route.ts` | 确保 `metadata` 和 `traceId` 在响应中完整透传 | P1 |
| `src/services/chat-persistence.ts` addMessage | 确保 `metadata` 包含完整结构化数据（evidence, reasoningPath, verdict 等） | P1 |

### 3.2 AI 调用 MCP 工具修复流程

```
Step 1: get_db_schema(ChatMessage)
        → 了解 ChatMessage 数据结构，确认 metadata 字段

Step 2: get_project_context(scope:structure)
        → 确认 chat 相关组件位置和文件结构

Step 3: 分析 chat-message.tsx
        → 发现 UI 不渲染 structured data

Step 4: 修复 chat-message.tsx
        → 添加证据链/推理路径/置信度渲染

Step 5: check_phase_symmetry(修复后的代码)
        → 验证新加的审计逻辑阶段对称

Step 6: check_failure_path(修复后的代码)  
        → 验证 catch 块审计信息密度
```

---

## 四、测试用例

### 4.1 协议层测试（5 个）— 与 v1 相同

| # | 用例 | 输入 | 预期 |
|---|------|------|------|
| P1 | `tools/list` 返回工具列表 | `{"method":"tools/list"}` | 6 个工具，含 name/description/inputSchema |
| P2 | `tools/call` 未知工具 | `{"params":{"name":"unknown"}}` | isError: true |
| P3 | 缺少必填参数 | `{"params":{"name":"check_phase_symmetry","arguments":{}}}` | isError |
| P4 | 非法方法名 | `{"method":"invalid"}` | error 响应 |
| P5 | 格式错误 JSON | `非法json` | 不崩溃 |

### 4.2 工具功能测试（18 个）— 与 v1 相同

| 工具 | 用例数 |
|------|--------|
| `get_project_context` | T1 ~ T3: all / structure / rules |
| `get_db_schema` | T4 ~ T6: 全模型 / 指定模型 / 不存在模型 |
| `get_audit_logger_pattern` | T7 ~ T9: kb / agent / 无效域 |
| `check_phase_symmetry` | T10 ~ T12: 对称 / 不对称 / 空代码 |
| `check_failure_path` | T13 ~ T15: 有审计 / 无审计 / 无catch |
| `generate_audit_logger` | T16 ~ T18: 完整 / 缺参数 / 语法检查 |

### 4.3 真实 Bug 修复验证（3 个场景）— ★ 核心测试

#### 场景 W1：诊断 Bug — 验证 MCP 工具能辅助定位问题

**前置**：无（纯工具调用）

| 步骤 | 操作 | MCP 工具 | 验证点 |
|------|------|---------|--------|
| 1.1 | 查询 ChatMessage 模型 | `get_db_schema(ChatMessage)` | 返回包含 content / metadata / traceId 字段 |
| 1.2 | 查询 ChainTraceRecord 模型 | `get_db_schema(ChainTraceRecord)` | 返回字段定义，确认与 traceId 的关联 |
| 1.3 | 获取 chat 组件结构 | `get_project_context(scope:structure)` | 返回中包含 chat-message.tsx / streaming-message.tsx |
| **诊断结论** | 对比 DB 字段与 UI 组件能力 | — | 综合判断: 数据存了但 UI 没渲染 |

**通过标准**：MCP 工具返回的信息完整、准确，能够支撑开发者做出"数据存了但 UI 没渲染"的判断。

#### 场景 W2：修复 Bug — 验证 MCP 工具辅助编码和校验

**前置**：W1 完成

| 步骤 | 操作 | MCP 工具 | 验证点 |
|------|------|---------|--------|
| 2.1 | 生成审计日志器(如需要新增) | `generate_audit_logger(...)` | 生成完整 TypeScript 代码 |
| 2.2 | 修复 chat-message.tsx（新增结构化渲染） | — | 代码包含证据链/推理路径渲染逻辑 |
| 2.3 | 验证阶段对称性 | `check_phase_symmetry(修复后代码)` | Start=End，标记对称 ✅ |
| 2.4 | 验证失败路径审计 | `check_failure_path(修复后代码)` | catch 块信息密度充足 ✅ |

**通过标准**：
- 生成的审计日志器通过 `tsc --noEmit` 检查
- `check_phase_symmetry` 报告完全对称
- `check_failure_path` 报告所有 catch 块合规

#### 场景 W3：验证修复 — 端到端数据完整性验证

**前置**：W2 修复已应用，项目可运行

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 3.1 | 向数据库插入一条包含完整结构化数据的模拟消息 | 模拟 `ChatMessage` 记录含 `metadata: {evidence, reasoningPath, verdict}` |
| 3.2 | 调用 `GET /api/agent/chat/threads/{threadId}/messages` | 返回的 `metadata` 字段与插入数据一致 |
| 3.3 | 前端渲染验证（组件测试） | `chat-message.tsx` 渲染出证据链面板/推理路径/置信度 |

**通过标准**：
- API 返回的结构化数据完整无损（evidence.length > 0, reasoningPath 存在）
- 前端组件渲染不崩溃，结构化数据可视化显示

---

## 五、测试脚本结构

### 5.1 文件清单

| 文件 | 内容 | 行数估计 |
|------|------|---------|
| `scripts/test-mcp-server.sh` | 快速健康检查（验证 MCP 启动和 6 工具注册） | ~30 |
| `scripts/test-mcp-server.ts` | 主测试脚本 | ~400 |
| `scripts/test-chat-data-integrity.ts` | 聊天数据完整性专项测试（模拟数据 → API → 验证） | ~150 |

### 5.2 主测试脚本核心结构

```typescript
// scripts/test-mcp-server.ts

interface MCPRequest { jsonrpc: "2.0"; id: number; method: string; params?: any }
interface MCPResponse { jsonrpc: "2.0"; id: number; result?: any; error?: any }

interface TestCase {
  id: string           // "P1", "T1", "W1-1.1" 等
  name: string
  category: "protocol" | "tool" | "workflow"
  run: (call: (method: string, params?: any) => Promise<MCPResponse>) => Promise<{
    pass: boolean; detail: string; actual?: string; expected?: string
  }>
}

// 运行器
class MCPTestRunner {
  private proc: ChildProcess
  private readline: ReadLine
  private nextId = 1
  private results: { id: string; name: string; pass: boolean; detail: string }[] = []

  async start(): Promise<void> { /* spawn + wait for "[ADD-MCP]" signal */ }
  async call(method: string, params?: any): Promise<MCPResponse> { /* write stdin + read stdout */ }
  async runTests(cases: TestCase[]): Promise<void> { /* sequential run + report */ }
  async stop(): Promise<void> { /* kill child */ }
}

// 测试用例实现示例
const p1: TestCase = {
  id: "P1", name: "tools/list 返回 6 个工具", category: "protocol",
  run: async (call) => {
    const res = await call("tools/list")
    const tools = res.result?.tools
    if (!tools || tools.length !== 6) return fail(`工具数=${tools?.length}, 预期=6`)
    const names = tools.map(t => t.name)
    const expectedNames = [
      "get_project_context", "get_db_schema", "get_audit_logger_pattern",
      "check_phase_symmetry", "check_failure_path", "generate_audit_logger",
    ]
    const missing = expectedNames.filter(n => !names.includes(n))
    if (missing.length > 0) return fail(`缺少工具: ${missing.join(", ")}`)
    return pass()
  }
}

// Workflow: 诊断 Bug - 查询 ChatMessage 模型
const w1_1: TestCase = {
  id: "W1-1", name: "诊断: get_db_schema(ChatMessage)", category: "workflow",
  run: async (call) => {
    const res = await call("tools/call", {
      name: "get_db_schema", arguments: { model: "ChatMessage" }
    })
    const text = res.result?.content?.[0]?.text || ""
    if (!text.includes("content")) return fail("缺少 content 字段")
    if (!text.includes("metadata")) return fail("缺少 metadata 字段(Json 用于存结构化数据)")
    if (!text.includes("traceId")) return fail("缺少 traceId 字段")
    return pass(`字段完整: ${text.split("\n").filter(l => l.includes("字段") || l.startsWith("  ")).join(", ")}`)
  }
}
```

### 5.3 聊天数据完整性专项测试

```typescript
// scripts/test-chat-data-integrity.ts
// 不依赖 MCP 协议，直接测试修复后的数据链路

interface ExpectedStructuredData {
  evidence: Array<{ chunkId: string; content: string; score: number }>
  reasoningPath?: string[]
  verdict?: { type: string; confidence: number; detail: string }
}

async function testDataIntegrity() {
  // 1. 模拟结构化数据
  const structuredData: ExpectedStructuredData = {
    evidence: [
      { chunkId: "c1", content: "证据内容1", score: 0.95 },
      { chunkId: "c2", content: "证据内容2", score: 0.87 },
    ],
    reasoningPath: ["分析需求", "检索知识库", "匹配证据", "生成结论"],
    verdict: { type: "prioritization", confidence: 0.92, detail: "高优先级任务" },
  }

  // 2. 模拟保存（调用 ChatPersistenceService.addMessage 或直接写 DB）
  // ...

  // 3. 模拟加载（调用 GET /api/agent/chat/threads/{threadId}/messages）
  // ...

  // 4. 验证数据结构完整
  // assert(loaded.metadata.evidence.length === 2)
  // assert(loaded.metadata.reasoningPath.length === 4)
  // assert(loaded.metadata.verdict.confidence === 0.92)
  
  // 5. 组件渲染验证（JSDOM 渲染 chat-message.tsx）
  // assert(rendered.querySelector('.evidence-chain-panel') !== null)
  // assert(rendered.querySelector('.reasoning-path') !== null)
}
```

---

## 六、验收标准

### 6.1 MCP 协议层

- [ ] P1-P5 全部通过（5/5）

### 6.2 MCP 工具层

- [ ] T1-T18 通过率 ≥ 16/18

### 6.3 真实 Bug 修复验证（★ 关键验收）

- [ ] **W1（诊断）**：MCP 工具返回的信息能正确支撑"数据结构完整、UI 渲染缺失"的诊断结论
- [ ] **W2（修复）**：修复代码通过 `check_phase_symmetry` 和 `check_failure_path` 校验
- [ ] **W3（数据完整性）**：
  - [ ] API 返回的 `metadata.evidence` 数组长度 ≥ 1
  - [ ] API 返回的 `metadata.reasoningPath` 存在且有内容
  - [ ] API 返回的 `metadata.verdict` 包含 `type`、`confidence`、`detail`
  - [ ] 前端组件渲染不崩溃

### 6.4 通过率总要求

| 层级 | 用例数 | 必须通过 |
|------|--------|----------|
| Protocol | 5 | 5/5 |
| Tool | 18 | ≥ 16/18 |
| Workflow（真实 Bug） | 3 场景，~12 子步骤 | 全部 |

---

## 七、实施步骤

### Step 1：创建快速健康检查脚本

- 创建 `scripts/test-mcp-server.sh`
- 验证 MCP 启动 → `tools/list` → 6 工具 → `tools/call get_project_context`

### Step 2：创建主测试脚本

- 实现 `MCPTestRunner` 类（子进程管理 + stdio RPC）
- 实现 P1-P5 协议测试
- 实现 T1-T18 工具功能测试
- 实现 W1-W3 真实 Bug 场景测试

### Step 3：创建聊天数据完整性专项测试

- 创建 `scripts/test-chat-data-integrity.ts`
- 模拟结构化数据 → 验证持久化链路
- 验证 UI 渲染逻辑

### Step 4：集成到 package.json

```json
{
  "test:mcp": "npx tsx scripts/test-mcp-server.ts",
  "test:mcp:quick": "bash scripts/test-mcp-server.sh",
  "test:chat:integrity": "npx tsx scripts/test-chat-data-integrity.ts"
}
```

### Step 5：运行验证

- 运行健康检查
- 运行全部 23 个基础用例 + 3 个真实 Bug 场景
- 运行聊天数据完整性专项测试

---

## 八、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| stdio 子进程启动时序导致首个请求失败 | P1 误报失败 | 等待 `[ADD-MCP]` 信号后再发请求 |
| 真实 Bug 修复涉及多个文件需要同步修改 | W2 验证步骤复杂 | 每个修复步骤独立验证，分步提交 |
| 数据库连接不可用（W3 需要真实 DB） | 数据完整性测试跳过 | 提供 mock/prisma 内存模式 fallback |
| 结构化数据格式不规范（无统一的 Schema） | W3 断言波动 | 定义 `StructuredMessageMetadata` 类型作为 Truth |

---

*本规划文档版本: v2.0*
*作者: 印明 (yìnmíng) — wujixmm@gmail.com*
*创建日期: 2026-05-13*
