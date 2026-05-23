# 修复聊天UI并添加RAG知识库管理Tab Spec

## Why
当前聊天输入控件存在多个UI问题：双层边框、按钮组未一行展示、上传功能不完整。同时，系统需要支持RAG知识库管理，让用户能够上传和管理文档用于AI推理。

## What Changes
- **修复 ChatContainer 边框问题**：移除外层 Card 边框，让输入区域自然融入底部
- **修复按钮组布局**：快捷按钮和文件上传按钮在同一行展示
- **完善文件上传功能**：附件和图片按钮分别调用不同的文件选择器，支持实际文件上传
- **新增 RAG 知识库管理 Tab**：在左侧 Tab 添加"知识库"，支持文档上传、列表展示、删除

## Impact
- Affected components: `ChatContainer`, `ChatPanel`, `page.tsx`, `QuickActionBar`
- New components: `KnowledgeBasePanel`
- Affected stores: `ChatStore`

## ADDED Requirements

### Requirement: 无边框输入区域
The system SHALL provide a chat input area that:
- Has no outer border or card shadow
- Uses a single subtle background color
- Occupies the full width naturally

### Requirement: 单行按钮组
The system SHALL display all action buttons in a single row:
- Quick action buttons (推理/模板分类)
- File upload buttons (附件/图片)
- All buttons aligned horizontally with proper spacing

### Requirement: 完整文件上传功能
The system SHALL support:
- Attachment upload for documents (PDF, DOC, TXT, MD)
- Image upload for pictures (PNG, JPG, GIF)
- File preview and remove before sending
- Actual file upload to server/API

### Requirement: RAG知识库管理Tab
The system SHALL provide a Knowledge Base tab that:
- Displays uploaded documents list
- Supports document upload (drag & drop or click)
- Shows document status (processing, ready, error)
- Allows document deletion
- Integrates with existing Chroma vector database

## MODIFIED Requirements

### Requirement: Tab导航
**Current**: 项目管理、任务管理 (2个Tab)
**New**: 项目管理、任务管理、知识库 (3个Tab)

## REMOVED Requirements
None
