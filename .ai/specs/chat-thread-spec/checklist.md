# Checklist: 聊天实例管理功能

## 运行时验证

- [ ] 聊天面板正常加载，无 TypeScript 编译错误
- [ ] 新建对话 → 生成新 Tab → 切换到空会话
- [ ] 发送消息 → Tab 标题自动更新为首条消息摘要
- [ ] 双击 Tab 标题 → 进入编辑模式 → 修改标题 → Enter 保存
- [ ] 双击 Tab 标题 → Escape 取消编辑
- [ ] 点击 Tab 切换会话 → 消息正确切换
- [ ] 删除 Tab → 自动切换到相邻对话
- [ ] 删除最后一个 Tab → 自动创建新对话
- [ ] threadId 正确传递给 API → LangGraph 对话状态持久化
- [ ] 聊天过程中切换tab,要确保正在聊天的内容不会渲染到其他聊天实例里, 

## 文档验证

- [ ] `docs/CHAT-THREAD-MANAGEMENT.md` 存在且内容完整
- [ ] `docs/RAG-KNOWLEDGE-BASE.md` 包含 threadId 说明
- [ ] `README.md` 包含聊天管理功能说明和文档引用

## 代码质量

- [ ] 所有修改文件零 TypeScript 错误
- [ ] 无未使用的导入
- [ ] 代码风格与项目一致

