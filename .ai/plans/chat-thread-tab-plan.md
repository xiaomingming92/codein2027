# 聊天列表管理 Tab 计划

## 目标

在 `chat-panel.tsx` 头部上方新增聊天列表管理区域，支持多会话（thread）的新增、切换、删除。

## 当前状态

- `chat-store.ts` 已有 `threadId` 字段，但仅支持单会话
- `ChatRequest` DTO 已支持 `threadId` 可选字段
- API 层已支持 `threadId` 自动生成和传递
- LangGraph `MemorySaver` 已按 `thread_id` 持久化对话状态
- 项目已有 `Tabs`、`ScrollArea`、`Button`、`Badge` 等 UI 组件

## 设计方案

### 布局

```
┌──────────────────────────────────────────────────┐
│  [对话1: 水稻种植方案]  [对话2: 病虫害分析]  [×]      │  ← 聊天 Tab 列表（新增） [+ 新对话] ← 头部（改造）
├──────────────────────────────────────────────────┤
│ 智能助手  [就绪]                                   │ 
├──────────────────────────────────────────────────┤
├──────────────────────────────────────────────────┤
│                                                  │
│  聊天消息区域                                      │  ← 现有 ChatContainer
│                                                  │
├──────────────────────────────────────────────────┤
│  输入框 + 发送按钮                                 │  ← 现有 ChatContainer
└──────────────────────────────────────────────────┘
```

### 数据模型

```typescript
interface Thread {
  id: string              // threadId, UUID
  title: string           // 自动取首条消息前20字
  messages: Message[]     // 该会话的消息列表
  createdAt: string       // 创建时间
  updatedAt: string       // 最后更新时间
}
```

### 状态管理改造

`chat-store.ts` 新增：
- `threads: Thread[]` — 所有会话列表
- `activeThreadId: string | null` — 当前激活的会话ID
- `createThread()` — 创建新会话
- `switchThread(threadId)` — 切换会话
- `deleteThread(threadId)` — 删除会话
- `updateThreadTitle(threadId, title)` — 更新会话标题
- `addMessageToThread(threadId, message)` — 向指定会话添加消息

## 实施步骤

### 步骤 1: 改造 chat-store.ts

扩展 Zustand store，新增多会话管理：
- 新增 `Thread` 接口和 `threads` 数组
- `createThread()`: 生成 UUID，创建空会话，切换为当前会话
- `switchThread(threadId)`: 切换 `activeThreadId`，加载对应会话的 `messages`
- `deleteThread(threadId)`: 删除会话，若删除的是当前会话则切换到最近的或创建新的
- `addMessage()` 改为写入 `activeThread` 的消息列表
- 兼容现有的 `messages` getter（返回当前活跃会话的消息）

### 步骤 2: 创建 chat-thread-tab 组件

新建 `src/components/chat/chat-thread-tab.tsx`：
- 渲染横向滚动的 Tab 列表
- 每个 Tab 显示会话标题（首条消息前20字）
- 当前活跃 Tab 高亮
- 点击切换会话
- 每个 Tab 右侧有删除按钮（×）
- 最左侧有 "+ 新对话" 按钮

### 步骤 3: 改造 chat-panel.tsx

- 头部增加 "+ 新对话" 按钮
- 头部下方插入 `ChatThreadTab` 组件
- `handleSend` 中传递 `threadId` 给 API
- API 响应后更新 `threadId` 到 store
- 切换会话时清空/恢复对应消息

### 步骤 4: 更新 ChatResponse DTO

`agent.dto.ts` 的 `ChatResponse.data` 新增 `threadId` 字段（已在前一步修复中完成）。

### 步骤 5: 验证

- 新建对话 → 生成新 threadId → 发送消息 → 切换到另一个对话 → 再切回 → 消息保留
- 删除对话 → 自动切换到其他对话
- 删除最后一个对话 → 自动创建新对话

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/stores/chat-store.ts` | 修改 | 新增 Thread 接口、多会话管理方法 |
| `src/components/chat/chat-thread-tab.tsx` | 新建 | 聊天 Tab 列表组件 |
| `src/components/chat/chat-panel.tsx` | 修改 | 集成 Tab 列表、传递 threadId |
| `src/dto/agent.dto.ts` | 修改 | ChatResponse 新增 threadId（已完成） |
