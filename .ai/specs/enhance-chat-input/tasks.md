# Tasks

- [x] Task 1: 重构 ChatContainer 输入区域为 textarea + 功能按钮组布局
  - [x] SubTask 1.1: 将 `<Input>` 替换为 `<textarea>` 支持多行和自动高度
  - [x] SubTask 1.2: 添加快捷功能按钮行（快捷、模板等）
  - [x] SubTask 1.3: 添加文件上传按钮组（图片、文档上传）
  - [x] SubTask 1.4: 调整发送按钮位置和样式
- [x] Task 2: 实现文件上传功能
  - [x] SubTask 2.1: 创建文件上传组件 `FileUploadButton`
  - [x] SubTask 2.2: 实现文件选择和预览逻辑
  - [x] SubTask 2.3: 集成到 ChatStore 管理上传文件状态
  - [x] SubTask 2.4: 修改 API 调用支持文件附件
- [x] Task 3: 实现快捷功能按钮
  - [x] SubTask 3.1: 创建快捷按钮组件 `QuickActionBar`
  - [x] SubTask 3.2: 实现按钮点击触发对应功能
  - [x] SubTask 3.3: 支持上下文感知的按钮展示（推理/模板分类）
- [x] Task 4: 集成测试和验证
  - [x] SubTask 4.1: 验证多行输入和发送功能正常
  - [x] SubTask 4.2: 验证文件上传和显示正常
  - [x] SubTask 4.3: 验证快捷按钮功能正常
  - [x] SubTask 4.4: 验证整体布局无样式问题

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 2 and Task 3
