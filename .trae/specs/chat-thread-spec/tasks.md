# Tasks: 聊天实例管理功能

## Task 1: 修复 ChatContainer 类型兼容 [P0]
- [ ] `chat-container.tsx` 的 `Message` 接口增加 `timestamp?: string`
- [ ] 验证 `messages.map` 不再报错

## Task 2: 支持会话标题编辑 [P1]
- [ ] `chat-thread-tab.tsx` 增加双击编辑模式
- [ ] 双击标题 → 显示 input → Enter/失焦保存 → Escape 取消
- [ ] 标题最大 50 字符

## Task 3: 创建聊天实例管理文档 [P2]
- [ ] 新建 `docs/CHAT-THREAD-MANAGEMENT.md`
- [ ] 覆盖: 架构设计、数据模型、状态管理、交互操作、API、持久化、故障排查

## Task 4: 更新架构文档 [P2]
- [ ] `docs/RAG-KNOWLEDGE-BASE.md` 补充 threadId 说明

## Task 5: 更新 README [P2]
- [ ] `README.md` 补充聊天管理功能说明和文档引用
