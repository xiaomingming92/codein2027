# 增强聊天输入控件 Spec

## Why
当前聊天输入控件使用简单的 `<Input>` 组件，功能单一，不支持多行文本、文件上传等现代 AI 聊天应用的标准交互模式。参考豆包等主流 AI 产品，需要一个支持多模态输入（文本+文件）的富文本输入区域。

## What Changes
- **重构 ChatContainer 底部输入区域**：将 `<Input>` 替换为 `<textarea>` 支持多行输入
- **添加文件上传控件组**：支持图片、文档等文件上传按钮
- **添加快捷功能按钮**：如快捷指令、模板选择等
- **优化布局结构**：输入框+功能按钮组+发送按钮的合理布局

## Impact
- Affected components: `ChatContainer`, `ChatInput`, `ChatPanel`
- Affected stores: `ChatStore`（可能需要扩展文件上传状态）

## ADDED Requirements

### Requirement: 多行文本输入
The system SHALL provide a `<textarea>` based input that:
- Supports multi-line text input with auto-resize
- Handles Enter key for new line, Ctrl+Enter for send
- Has a max-height limit with scroll when exceeded

### Requirement: 文件上传控件组
The system SHALL provide a file upload button group that:
- Displays upload button with file type icons
- Supports image, document, and generic file uploads
- Shows uploaded file list with remove option
- Integrates with existing API for file handling

### Requirement: 快捷功能按钮
The system SHALL provide quick action buttons that:
- Display common shortcuts (e.g., "快捷", "模板")
- Are context-aware based on current page
- Can be configured per project/task

## MODIFIED Requirements

### Requirement: ChatContainer Layout
**Current**: Single line `<Input>` with send button
**New**: 
- Top: Message list area
- Bottom: 
  - Row 1: Quick action buttons + file upload buttons
  - Row 2: `<textarea>` input + send button

## REMOVED Requirements
None
