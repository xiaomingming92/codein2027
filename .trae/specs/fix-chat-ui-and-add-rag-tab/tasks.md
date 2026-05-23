# Tasks

- [x] Task 1: 修复聊天输入控件UI问题
  - [x] SubTask 1.1: 移除 ChatContainer 外层 Card 边框，改为无边框设计
  - [x] SubTask 1.2: 将快捷按钮和文件上传按钮合并为一行展示
  - [x] SubTask 1.3: 调整整体内边距和间距，使输入区域更紧凑

- [x] Task 2: 完善文件上传功能
  - [x] SubTask 2.1: 分离附件和图片上传按钮，分别调用不同文件选择器
  - [x] SubTask 2.2: 实现文件选择和本地预览
  - [x] SubTask 2.3: 实现文件实际上传API调用
  - [x] SubTask 2.4: 上传成功后显示文件列表，支持删除

- [x] Task 3: 新增RAG知识库管理Tab
  - [x] SubTask 3.1: 在 page.tsx 添加"知识库"Tab
  - [x] SubTask 3.2: 创建 KnowledgeBasePanel 组件
  - [x] SubTask 3.3: 实现文档上传功能（支持拖拽和点击）
  - [x] SubTask 3.4: 实现文档列表展示（名称、状态、时间）
  - [x] SubTask 3.5: 实现文档删除功能
  - [x] SubTask 3.6: 集成 Chroma API 进行文档向量化（模拟）

- [x] Task 4: 集成测试和验证
  - [x] SubTask 4.1: 验证聊天输入区域无边框且布局正常
  - [x] SubTask 4.2: 验证按钮组在一行展示
  - [x] SubTask 4.3: 验证文件上传功能完整
  - [x] SubTask 4.4: 验证知识库Tab正常展示和操作

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 can be parallel with Task 2
- Task 4 depends on Task 2 and Task 3
