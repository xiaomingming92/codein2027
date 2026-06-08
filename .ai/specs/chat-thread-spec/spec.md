# Spec: 聊天实例管理功能

## 1. 概述

为聊天面板增加多会话（Thread）管理功能，支持新建、切换、删除、重命名会话，修复类型兼容问题，并补充完整的架构文档和用户文档。

## 2. 问题清单

### P0 - 运行时错误
- `ChatContainer` 的 `Message` 接口缺少 `timestamp` 字段，与 `useActiveMessages()` 返回类型不兼容，导致 `messages.map` 报错

### P1 - 功能缺失
- 会话标题不支持双击修改
- 缺少聊天实例管理文档

### P2 - 文档缺失
- 架构文档未更新多会话设计
- README 未提及聊天管理功能
- 无专门的聊天实例管理文档

## 3. 功能规格

### 3.1 会话标题编辑

- 双击 Tab 标题进入编辑模式
- 编辑模式下显示 `<input>` 替代文本
- Enter 或失焦保存修改
- Escape 取消编辑
- 标题最大长度 50 字符，超出截断

### 3.2 类型兼容修复

- `ChatContainer` 的 `Message` 接口增加 `timestamp?: string`
- 确保所有消息传递路径类型一致

## 4. 文档规格

### 4.1 聊天实例管理文档

文件路径: `docs/CHAT-THREAD-MANAGEMENT.md`

内容覆盖:
- 多会话架构设计
- Thread 数据模型
- 状态管理（Zustand store）
- 交互操作说明
- API 接口（threadId 传递）
- LangGraph MemorySaver 对话持久化
- 故障排查

### 4.2 架构文档更新

文件路径: `docs/RAG-KNOWLEDGE-BASE.md`

补充:
- 第 3.2 节 RAG 检索流程中 threadId 的作用
- Agent 审计日志中 threadId 追踪

### 4.3 README 更新

文件路径: `README.md`

补充:
- 聊天管理功能说明
- 引用聊天实例管理文档

## 5. 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/chat/chat-container.tsx` | 修改 | Message 接口增加 timestamp |
| `src/components/chat/chat-thread-tab.tsx` | 修改 | 支持双击编辑标题 |
| `docs/CHAT-THREAD-MANAGEMENT.md` | 新建 | 聊天实例管理文档 |
| `docs/RAG-KNOWLEDGE-BASE.md` | 修改 | 补充 threadId 相关说明 |
| `README.md` | 修改 | 补充聊天管理功能说明 |
