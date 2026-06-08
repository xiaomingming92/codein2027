# 修复聊天结构化数据丢失 Bug — 可审计修复方案

## 一、Bug 根因

### 数据链路逐段验证

经过全链路代码调查和用户实测确认：

```
Agent 执行 → result.structuredResponse (含证据链/推理/置信度/风险)
  → chat/route.ts: addMessage(metadata=structuredResponse) 
  → PostgreSQL ChatMessage.metadata = Json ✅ 保存完整

刷新页面：
  → GET /api/agent/chat/threads/{threadId}/messages
  → API 返回 { id, role, content, metadata, traceId, createdAt } ✅ API 正确
  → chat-store.ts loadThreadMessages() 只提取 role/content/createdAt
  → metadata 被丢弃 ❌ 这就是 Bug 所在
  
最终：
  → chat-message.tsx 只拿到 content 
  → 结构化数据无法渲染
  → 用户看到的只有文本"效率翻倍..."，证据链/推理/置信度/风险全部消失
```

### 涉及文件

| 文件 | 问题 | 修改？ |
|------|------|--------|
| `src/stores/chat-store.ts` | `Message` 类型缺 `structuredData`；`loadThreadMessages` 丢弃 `metadata` | ✅ 改 |
| `src/components/chat/chat-message.tsx` | 不渲染 `structuredData` | ✅ 改 |
| `src/app/api/agent/chat/threads/[threadId]/messages/route.ts` | API 已正确返回 `metadata` | ❌ 不改（已验证正确） |

---

## 二、修复步骤（3 个文件）

### Step 1：扩展 chat-store.ts 的 Message 类型

在 `src/stores/chat-store.ts` 中：

```typescript
// 文件顶部添加 import
import type { StructuredAgentResponse } from "@/agents/types"

// Message 接口新增 structuredData 字段
export interface Message {
  role: "user" | "assistant" | "system"
  content: string
  name?: string
  timestamp?: string
  structuredData?: StructuredAgentResponse
}
```

### Step 2：修复 chat-store.ts 的 loadThreadMessages

将 `loadThreadMessages` 方法中的 map 改为透传 metadata：

```typescript
// 当前 — 有 Bug
const messages: Message[] = msgsData.data.map(
  (m: { role: string; content: string; createdAt: string }) => ({
    role: m.role as Message["role"],
    content: m.content,
    timestamp: m.createdAt,
  })
)

// 修复后
const messages: Message[] = msgsData.data.map(
  (m: { role: string; content: string; metadata?: unknown; createdAt: string }) => ({
    role: m.role as Message["role"],
    content: m.content,
    timestamp: m.createdAt,
    structuredData: m.metadata as StructuredAgentResponse | undefined,
  })
)
```

### Step 3：修复 chat-message.tsx 渲染结构化数据

```typescript
// 新增 import
import { StructuredResponseRenderer } from "@/components/chat/structured-response-renderer"
import type { StructuredAgentResponse } from "@/agents/types"

// props 新增 structuredData
interface ChatMessageProps {
  role: "user" | "assistant" | "system"
  content: string
  name?: string
  timestamp?: string
  structuredData?: StructuredAgentResponse
  className?: string
}

// 组件逻辑：assistant + 有 structuredData → 用 StructuredResponseRenderer 渲染
// 其余情况保持原逻辑不变
```

---

## 三、如何审计这个修复（ADD 原则验证）

作为人类，你可以通过以下方式检查修复是否遵循了 ADD 原则：

### 3.1 使用 MCP 工具审计（最推荐）

修复完成后，依次运行以下 MCP 工具：

```bash
# 1. 审计：检查阶段标记对称性（ADD-2）
echo '{"method":"tools/call","params":{"name":"check_phase_symmetry","arguments":{"code":"$(cat src/stores/chat-store.ts)"}}}' \
  | npx tsx .trae/scripts/mcp-server.ts

# 2. 审计：检查失败路径（ADD-6）
echo '{"method":"tools/call","params":{"name":"check_failure_path","arguments":{"code":"$(cat src/components/chat/chat-message.tsx)"}}}' \
  | npx tsx .trae/scripts/mcp-server.ts
```

### 3.2 人工审计步骤

| # | 审计项 | 对应 ADD | 操作 |
|---|--------|----------|------|
| 1 | **Message 类型变更** | ADD-1：可观测性优先 | 确认新字段 `structuredData?` 是可选类型，不破坏现有接口 |
| 2 | **loadThreadMessages 修改** | ADD-3：最小可观测单元 | 确认每个消息的 metadata 独立透传，不做批量聚合 |
| 3 | **chat-message.tsx 分支** | ADD-2：阶段对称 | `if (structuredData)` 分支有渲染，`else` 分支保持原逻辑，不存在不对称 |
| 4 | **错误路径** | ADD-6：失败路径等价 | `structuredData` 为 undefined 时回退到纯文本渲染，不崩溃 |
| 5 | **编译检查** | 项目约束 | `npx tsc --noEmit` 零错误 |

### 3.3 审计后验证清单

- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run test:mcp` 全部通过（验证 MCP 工具本身）
- [ ] **用户手动测试**：发送问题 → 确认结构化数据展示 → **刷新页面** → 确认结构化数据仍然展示
- [ ] **切换线程**：切换到另一个线程 → 再切回来 → 确认结构化数据保留

### 3.4 为什么这是 ADD 实践

因为整个修复过程：

1. **ADD-1 可观测性优先**：先调查数据库里 metadata 存了什么、API 返回了什么，再动手改代码
2. **ADD-3 最小可观测单元**：精确到每个消息的 metadata 独立加载，不是批量读写
3. **ADD-6 失败路径等价**：`structuredData` 不存在时优雅降级为纯文本，不崩溃
4. **审计数据验证**：用 `test-chat-data-integrity.ts` 验证数据链路完整性

---

## 四、验证方法

### 4.1 编译验证

```bash
npx tsc --noEmit
```
预期：零错误

### 4.2 MCP 工具验证

```bash
npm run test:mcp
```
预期：29/29 通过

### 4.3 手动交互验证

1. 发送："展示农机智能体效率翻倍的证据"
2. ✅ 界面显示：文本 + 证据链面板 + 推理路径 + 置信度 + 风险提示
3. **刷新页面**（F5）
4. ✅ 历史对话的结构化数据完整展示：证据链展开/收起、推理步骤、置信度条形图、风险提示全部可见
5. 切换线程再切回来
6. ✅ 数据仍然保留

---

## 五、影响范围

| 影响 | 说明 |
|------|------|
| 修改文件 | 2 个：`chat-store.ts`, `chat-message.tsx` |
| 确认文件 | 1 个：`messages/route.ts`（已验证不需改） |
| 新增 import | `StructuredAgentResponse`, `StructuredResponseRenderer` |
| 向后兼容 | 是，`structuredData` 是可选字段，现有消息不受影响 |

---

*本规划版本: v2.0 — 含可审计验证方案*
*作者: 印明 (yìnmíng) — wujixmm@gmail.com*
*创建日期: 2026-05-13*
