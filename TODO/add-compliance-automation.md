# ADD 合规自动化体系 — 从 Spec 到 Git Hook 的统一执行框架

## 纲领

ADD 范式当前依赖 **MCP 工具 + AI 自觉调用** 来维持合规性。这在单人开发场景下可行，但在以下场景会产生结构性断裂：

- **多人协作**：其他开发者不通过 AI 写代码，MCP 工具对他们不可见
- **CI/CD**：流水线没有 ADD 合规检查节点，不合规代码可以合并
- **跨工具链**：不同 IDE 对 MCP 支持不同，合规检查被环境绑定

**本文档提出 ADD 合规自动化的三层模型**，将合规约束从 "AI 在对话中提醒" 下沉为 "不可绕过的工具链卡点"。

---

## 合规三层模型

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ADD 合规自动化三层模型                           │
│                                                                      │
│  ╔═════════════════════════════════════════════════════════════════╗ │
│  ║  第一层：Spec 定义层（规范性来源）                                ║ │
│  ║  .ai/specs/co-agent-{闭包}/                                   ║ │
│  ║  ┌──────────┐ ┌──────────┐ ┌──────────┐                        ║ │
│  ║  │ spec.md  │ │ tasks.md │ │checklist │  ← 定义"该做什么"        ║ │
│  ║  └────┬─────┘ └────┬─────┘ └────┬─────┘                        ║ │
│  ║       │             │            │                               ║ │
│  ║       ▼             ▼            ▼                               ║ │
│  ║  本轮原子边界    原子任务拆解    逐项验收清单                       ║ │
│  ╚═══════════════════╤══════════════════════════════════════════════╝ │
│                      │ 引用/映射                                     │
│                      ▼                                               │
│  ╔═════════════════════════════════════════════════════════════════╗ │
│  ║  第二层：自动化执行层（不可绕过的卡点）                            ║ │
│  ║                                                                  ║ │
│  ║  ┌─────────────────┐     ┌──────────────────────────────┐      ║ │
│  ║  │ Lint 规则        │     │ Git Hooks                    │      ║ │
│  ║  │ eslint-plugin-   │     │ Husky + lint-staged          │      ║ │
│  ║  │ add-audit        │     │                              │      ║ │
│  ║  ├─────────────────┤     ├──────────────────────────────┤      ║ │
│  ║  │ phase-symmetry   │     │ Gate 1: 文档对齐             │      ║ │
│  ║  │ failure-path-dens│     │ Gate 2: 审计完整             │      ║ │
│  ║  │ no-bare-catch    │     │ Gate 3: 代码合规 (lint+tsc)  │      ║ │
│  ║  └─────────────────┘     └──────────────────────────────┘      ║ │
│  ║      检查时机: save/lint            检查时机: git commit         ║ │
│  ║      检查粒度: 逐文件规则            检查粒度: 整个 diff          ║ │
│  ╚═════════════════════════════════════════════════════════════════╝ │
│                      │                                               │
│                      ▼                                               │
│  ╔═════════════════════════════════════════════════════════════════╗ │
│  ║  第三层：运行时代理层（AI 编码时辅助 + 跨会话恢复）                ║ │
│  ║                                                                  ║ │
│  ║  ┌─────────────────┐     ┌──────────────────────────────┐      ║ │
│  ║  │ MCP 编码辅助     │     │ 审计持久化                    │      ║ │
│  ║  │ check_phase_sym..│     │ record_dev_operation         │      ║ │
│  ║  │ check_failure....│     │ query_audit_logs (稀疏推理)   │      ║ │
│  ║  │ generate_audit...│     │ AuditLog 表 (运行时审计)      │      ║ │
│  ║  └─────────────────┘     └──────────────────────────────┘      ║ │
│  ║      需要在 AI 对话中执行            DB 持久化，跨会话可查         ║ │
│  ╚═════════════════════════════════════════════════════════════════╝ │
│                                                                      │
│  三层关系：                                                          │
│  Spec 定义 "该检查什么" → Lint/Hook 保证 "一定会检查"                 │
│  → MCP/DB 保证 "检查结果可持久化 + 跨会话可恢复"                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Spec → Lint → Hook 对等映射表

每一轮 Spec 的 checklist 中，每个 ADD 约束都应有对应的 lint 规则和 git hook gate。以下为完整映射：

### 核心映射

| ADD 规则 | Spec 中的表述（checklist 条目） | Lint 规则 | Hook Gate | 说明 |
|---------|-------------------------------|-----------|-----------|------|
| ADD-0.1 文档先行 | "本轮涉及的文件已在 PLAN 审计策略表中声明" | — | Gate 1: check-add-doc | 静态文档检查不由 lint 处理 |
| ADD-1 审计基础设施优先 | "AuditPhase 枚举已定义 / 审计日志器先于业务逻辑实现" | — | Gate 2: check-add-audit | 检查 diff 中是否有审计调用 |
| ADD-2 阶段标记对称 | "所有 phase 的 Start/End 配对正确" | `phase-symmetry` (error) | Gate 3 | lint 自动检测，hook 拦截 |
| ADD-3 最小可观测单元 | "循环体内每次迭代都有审计记录" | — | — | 运行时检查，暂不自动化 |
| ADD-4 三通道输出 | "每个审计点输出 console + file + DB" | — | — | 运行时检查，暂不自动化 |
| ADD-5 审计数据回写 DB | "metadata.lastDevAudit 已写入" | — | — | 运行时检查 |
| ADD-6 失败路径等价审计 | "catch 块 extra 字段数 ≥ try 块" | `failure-path-info-density` (warn) | Gate 3 | lint warn，hook 不拦截但报告 |
| ADD-6 禁止空 catch | "无空 catch / 仅有 console.error 的 catch" | `no-bare-catch` (error) | Gate 3 | 直接拦截 |
| ADD-7 开发操作审计 | "逐文件 record_dev_operation 调用存在" | — | Gate 2: check-add-audit | 检查 diff 中审计调用 |

### 现有 Spec 对照

以已完成和进行中的 farm-agent spec 为例：

| Spec 目录 | 涉及 ADD 规则 | 当前覆盖状态 |
|-----------|-------------|------------|
| `co-agent-type-convergence` | ADD-2, ADD-7 | ❌ 无 lint 规则约束，依赖 MCP 手动检查 |
| `co-agent-response-strategy` | ADD-2, ADD-7 | ❌ 同上 |
| `co-agent-expert-registry` | ADD-2, ADD-7 | ❌ 同上 |
| `co-agent-pipeline-integration` | ADD-2, ADD-6, ADD-7 | ❌ 同上 |
| `co-agent-semantic-cache` | ADD-2, ADD-6, ADD-7 | ❌ 同上 |
| `co-agent-evolution-loop` | ADD-2, ADD-6, ADD-7 | ❌ 同上 |
| `co-agent-audit-pipeline` | ADD-2, ADD-4, ADD-5, ADD-6, ADD-7 | ❌ 同上 |

> 每一轮的 spec.md 定义了边界、tasks.md 拆解了任务、checklist.md 列举了验收项，但没有自动化手段确保每条验收项在提交前被检查——这就是第二层（自动化执行层）要填补的空白。

---

## 实施路线图

### 阶段一：`eslint-plugin-add-audit`（Lint 层）

**子项目 1：基础脚手架**（S）

- [ ] 初始化 `packages/eslint-plugin-add-audit/`（本项目 monorepo 内）或独立仓库
- [ ] 配置 vitest + `@typescript-eslint/rule-tester` 测试框架
- [ ] 搭建 `recommended` / `strict` 两套 presets

**子项目 2：规则 `add-audit/phase-symmetry`（L）**

对应 ADD-2，映射到 Spec checklist 中 "所有 phase 的 Start/End 配对正确"。

| 维度 | 定义 |
|------|------|
| 检查对象 | 所有 `auditPhaseStart("PHASE_NAME")` 和 `auditPhaseEnd("PHASE_NAME")` 调用 |
| 判定逻辑 | 按 phase 名分组计数，Start != End → 报错 |
| 严重级别 | `error`（recommended 配置） |
| 配置选项 | `ignoredPhases: string[]`、`allowSingleSide: boolean` |
| AST 依赖 | `CallExpression`（@typescript-eslint parser） |

**子项目 3：规则 `add-audit/failure-path-info-density`（L）**

对应 ADD-6，映射到 Spec checklist 中 "catch 块 extra 字段数 ≥ try 块"。

| 维度 | 定义 |
|------|------|
| 检查对象 | 每个 `TryStatement` 节点中的 try/catch 对 |
| 判定逻辑 | catch 块 `extra:` 字段数 + 审计调用信号 ≥ try 块 `extra:` 字段数 |
| 严重级别 | `warn`（recommended 配置，不阻塞提交但标记风险） |
| 配置选项 | `minExtraFields: number`、`allowRethrow: boolean` |
| AST 依赖 | `TryStatement`（ESTree） |

**子项目 4：规则 `add-audit/no-bare-catch`（S）**

对应 ADD-6 增强，映射到 Spec checklist 中 "无空 catch / 仅有 console.error 的 catch"。

| 维度 | 定义 |
|------|------|
| 检查对象 | 所有 `CatchClause` 节点 |
| 判定逻辑 | catch 体为空、仅有 `console.error(error)`、或有 `// TODO` 但无审计调用 → 报错 |
| 严重级别 | `error`（recommended 配置） |

**子项目 5：文档 & 发布**（M）

- [ ] README（中英双语，每个规则含 bad/good 示例）
- [ ] 每个规则的 Spec checklist → lint rule 映射表
- [ ] npm 发布：`eslint-plugin-add-audit`
- [ ] 本项目 README 技术文档区添加链接

---

### 阶段二：ADD Git Hook 体系（提交前闭环）

**子项目 6：Husky + lint-staged 脚手架**（S）

- [ ] 安装 `husky` + `lint-staged`
- [ ] 配置 `.husky/pre-commit`
- [ ] 配置 `lint-staged` 文件过滤

**子项目 7：Gate 1 — `scripts/check-add-doc.mjs`**（M）

| 维度 | 定义 |
|------|------|
| 对应 ADD 规则 | ADD-0.1 |
| 对应 Spec 检查项 | "本轮涉及的文件已在 PLAN 审计策略表中声明" |
| 检查逻辑 | `git diff --cached --name-only` → 按文件类型映射到文档目录 → 检查 diff 中是否包含对应文档变更 → 查 PLAN 审计策略表是否有豁免声明 |
| 不通过策略 | 默认 `warn`（不阻塞），`STRICT_DOC_CHECK=1` 时 `error`（阻塞） |

**子项目 8：Gate 2 — `scripts/check-add-audit.mjs`**（M）

| 维度 | 定义 |
|------|------|
| 对应 ADD 规则 | ADD-7 |
| 对应 Spec 检查项 | "逐文件 record_dev_operation 调用存在" |
| 检查逻辑 | `git diff --cached` 内容 → 搜索 `record_dev_operation` 或 `audit*` 调用 → 纯文档 diff 跳过 |
| 不通过策略 | 有业务代码变更但无审计调用 → `error`（阻塞） |

**子项目 9：统一报告脚本 `scripts/check-add-gates.mjs`**（M）

三关合并为单一入口，输出格式化报告：

```bash
$ git commit -m "feat: add expert registry"

═══ ADD 提交前检查报告 ═══

✅ Gate 1 文档: PLAN 声明覆盖所有变更文件
✅ Gate 2 审计: 检测到 3 处 ADD-7 审计调用
✅ Gate 3 代码: eslint 通过 / tsc 通过

═══ 3/3 通过，允许提交 ═══
```

失败示例：

```bash
$ git commit -m "fix: quick hotfix"

═══ ADD 提交前检查报告 ═══

✅ Gate 1 文档: 通过（仅涉及 Bug 修复，跳过文档检查）
❌ Gate 2 审计: 未检测到审计调用
   → src/agents/response-strategy.ts 第42行新增逻辑缺少审计埋点
❌ Gate 3 代码: eslint 不通过
   → add-audit/failure-path-info-density: catch 块信息密度不足
   → add-audit/phase-symmetry: Phase "KB_SYNC" 缺少 End

═══ 1/3 通过，提交被拒绝 ═══
```

**子项目 10：CI 集成**（S）

- [ ] GitHub Actions workflow：PR 时自动运行三关
- [ ] 失败时在 PR 评论区输出报告
- [ ] Badge：`[![ADD Gates](https://img.shields.io/badge/ADD-Gates-passing-brightgreen)]()`

**子项目 11：安全阀设计**

| 跳过方式 | 用途 | 风险级别 |
|----------|------|---------|
| `SKIP_DOC_CHECK=1` | 纯重构、无行为变更 | 低 |
| `SKIP_AUDIT_CHECK=1` | CI 脚本触发的自动提交 | 中 |
| `SKIP_ADD_GATES=1` | 一次性全部跳过 | 高（仅维护者） |
| `git commit --no-verify` | 紧急热修复 | 高（仅维护者） |

---

## 最终目标态：Spec 与自动化工具双向链接

完成后，每个 `.ai/specs/co-agent-*/checklist.md` 文件将具备以下结构：

```markdown
# Checklist: co-agent-type-convergence

## 代码合规（Lint 自动检查）
- [ ] `add-audit/phase-symmetry` ← 所有 phase Start/End 对称
- [ ] `add-audit/no-bare-catch` ← 无空 catch 块

## 审计完整（Git Hook 自动检查）  
- [ ] Gate 2: 逐文件 ADD-7 审计调用存在

## 文档对齐（Git Hook 自动检查）
- [ ] Gate 1: 变更文件在 PLAN 审计策略表中声明

## 手动验证
- [ ] npx tsc --noEmit 通过
- [ ] npm run test 通过
- [ ] fast/deep SSE 行为正确
```

**自动化程度**：10 条 checklist 中 6 条由工具链自动检查，只有 4 条需要人类/AI 手动验证。

---

## 技术可行性

| 检查层 | 实现方式 | 外部依赖 | 当前状态 |
|--------|---------|---------|---------|
| Lint 规则 | ESLint plugin (TypeScript AST) | `@typescript-eslint/parser` | 逻辑可直译现有 MCP 实现（[mcp-server.ts:L324-L450](file:///home/xmm/ai/农业智能体/codein2027/.ai/scripts/mcp-server.ts#L324-L450)） |
| Gate 1 文档 | `git diff --cached` + 路径规则映射 | 无 | 需实现 |
| Gate 2 审计 | `git diff --cached` + 正则匹配 | 无 | 需实现 |
| Gate 3 代码 | `eslint` + `npx tsc --noEmit` | eslint-plugin-add-audit（阶段一产物） | 需实现 |
| CI 集成 | GitHub Actions | 无 | 需配置 |

全部不依赖数据库、不依赖 MCP 服务器、不依赖特定 IDE。

---

## 开源协作说明

`eslint-plugin-add-audit` 和 `check-add-gates` 是 ADD 范式的**核心公共资产**。它们将范式约束从 "MCP 工具内部调用" 转换为 "任何项目都能用的标准工具链"。

欢迎 PR。优先从阶段一的子项目 2（phase-symmetry）开始。
