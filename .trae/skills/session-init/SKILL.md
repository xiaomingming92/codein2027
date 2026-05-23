---
name: "session-init"
description: "会话上下文恢复（稀疏推理）。每次新对话启动时，必须执行本 SKILL 恢复之前的开发上下文。这是 AI 助手的强制性初始化流程，不可跳过。"
---

# 会话初始化：稀疏推理上下文恢复

## 为什么必须执行本 SKILL

每次新对话启动时，AI 助手对之前的开发活动处于"零知识"状态。
通过查询 `AuditLog` 表，可以稀疏地恢复之前的开发脉络。

**不执行本 SKILL 的后果**：
- 无法知道之前改了什么代码
- 无法知道 API 合约发生了什么变化
- 可能做出冲突的修改
- 需要用户重复说明历史背景

---

## Step 0：前置条件检查

在执行本 SKILL 之前，确保：

- [ ] `query_audit_logs` MCP 工具可用（MCP Server 已连接）
- [ ] `record_dev_operation` MCP 工具可用
- [ ] `get_project_context` MCP 工具可用
- [ ] 数据库正在运行（`npm run db:status`）

如果 MCP 工具不可用，**必须提示用户先启动 MCP Server**，不能跳过。

---

## Step 1：查询开发操作审计日志

调用 `query_audit_logs` 工具，按以下优先级组合查询：

### 1.1 查最近 2 小时的全部记录（快速恢复）

```
query_audit_logs({})
```

**预期产出**：
- 最近的全部开发操作列表（action, targetType, targetId, beforeState, afterState）
- 如果非空 → 直接进入 Step 2
- 如果为空 → 进入 1.2

### 1.2 如果 1.1 为空，放宽时间范围

```
query_audit_logs({ sinceMinutes: 1440 })   // 最近 24 小时
```

### 1.3 如果仍然为空，按目标类型查询

```
query_audit_logs({ targetType: "API_ROUTE" })
query_audit_logs({ targetType: "COMPONENT" })
query_audit_logs({ targetType: "SCHEMA" })
```

---

## Step 2：分析审计日志推断上下文

根据 Step 1 返回的审计记录，分析：

### 2.1 推断进行中的工作

| 审计记录特征 | 推断 |
|-------------|------|
| 最近有 `API_PAGINATION_ENABLED` | 文档列表分页功能正在进行中 |
| 最近有 `COMPONENT_VIRTUAL_LIST_ADDED` | 虚拟列表渲染正在实施 |
| 最近有 `SCHEMA_FIELD_ADDED` | 数据库 Schema 刚被修改 |
| 最近有 `DEPENDENCY_ADDED` | 新依赖已安装 |

### 2.2 推断文件改动范围

```
根据 action 推断：
  targetType=API_ROUTE  → 检查 src/app/api/ 下对应文件
  targetType=COMPONENT  → 检查 src/components/ 下对应文件
  targetType=SCHEMA     → 检查 prisma/schema.prisma
  targetType=DEPENDENCY → 检查 package.json
  targetType=DOC        → 检查 docs/ 下对应文档文件
```

### 2.3 推断下一个待办项

查看计划文件 [PLAN.md](file:///home/xmm/ai/农业智能体/team-coordinator-agent/PLAN.md)（如果存在）：

```markdown
## PLAN 元信息
- **Plan 名称**: {plan-name}
- **ADD-7 审计策略**: {列表，状态为"待记录"的项是下一步要做的事}
```

---

## Step 3：构建上下文摘要

将 Step 2 的分析结果整理成以下格式：

```markdown
## 🔄 稀疏推理上下文恢复

**检测到的开发活动**：
- 正在进行的 Plan: `{plan-name}` (如果有)
- 已修改的文件: {file1}, {file2}, ...
- 已完成的改动: {action1}, {action2}, ...
- 待完成的改动: {action3}, {action4}, ...

**建议下一步**：
- {根据审计记录和 PLAN 推断的下一步操作}
```

将此摘要作为当前会话的「上下文基准」告知用户。

---

## Step 4：开始正常对话

上下文恢复完成后，进入正常的 ADD 流程：
- 如果用户提出需求 → 按 `add-paradigm` SKILL 执行
- 如果用户要求修改 → 按 `add-paradigm` SKILL 执行
- 修改完成后 → 调用 `record_dev_operation` 记录

---

## 本 SKILL 的执行检查清单

- [ ] Step 1: 已调用 `query_audit_logs({})`（任何查询维度）
- [ ] Step 2: 已分析审计日志推断上下文
- [ ] Step 3: 已构建上下文摘要
- [ ] Step 4: 已向用户展示恢复的上下文
