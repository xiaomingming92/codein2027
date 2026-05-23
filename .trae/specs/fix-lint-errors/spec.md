# 修复 Lint 错误 Spec

## Why

当前项目存在 4 个 ESLint error 和 35 个 warning，需要修复以保证代码质量和构建通过。

## What Changes

* 修复 4 个 error（2 个 `any` 类型，2 个未转义引号）

* 清理 35 个 unused var warning（可选，但建议修复）

## Impact

* Affected code:

  * `src/components/chat/chat-panel.tsx`

  * `src/stores/chat-store.ts`

  * 其他文件的 unused var warnings

## MODIFIED Requirements

### Requirement: 修复 ESLint Error

#### Scenario: 修复 any 类型

* **WHEN** 代码中使用 `any` 类型

* **THEN** 使用具体类型替代（如 `unknown`、`Record<string, unknown>`）

#### Scenario: 修复未转义引号

* **WHEN** JSX 中使用中文引号 `"`

* **THEN** 使用 `&quot;` 或 `&ldquo;` / `&rdquo;` 转义

## REMOVED Requirements

* 清理 unused vars（添加 `_` 前缀或删除未使用的导入/变量）

