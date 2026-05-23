# Tasks

## Phase 1: 修复 Error

- [x] Task 1.1: 修复 chat-panel.tsx 中的 `any` 类型
  - [x] SubTask 1.1.1: 找到第 46 行使用 any 的位置，替换为具体类型

- [x] Task 1.2: 修复 chat-panel.tsx 中的未转义引号
  - [x] SubTask 1.2.1: 找到第 100 行的 `""` 引号，替换为 `&quot;`

- [x] Task 1.3: 修复 chat-store.ts 中的 `any` 类型
  - [x] SubTask 1.3.1: 找到第 21 行使用 any 的位置，替换为具体类型

## Phase 2: 清理 Warning（可选）

- [x] Task 2.1: 清理 knowledge-base-panel.tsx 中的 unused vars
  - [x] SubTask 2.1.1: 移除或使用 `isUploading` 状态
  - [x] SubTask 2.1.2: 为 Image 组件添加 aria-hidden 属性

- [x] Task 2.2: 清理 knowledge-sync.ts 中的 unused 常量
  - [x] SubTask 2.2.1: 移除或导出 KNOWLEDGE_DIRS_GLOB

- [x] Task 2.3: 清理其他文件的 unused imports/vars
  - [x] SubTask 2.3.1: 检查并清理其他文件的 warnings（可选）
