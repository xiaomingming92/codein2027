# MCP Server 实施规划

## 概述

本规划将现有的 ADD（可审计开发范式）从 **Skill/Rule 软约束** 升级为 **MCP 工具硬约束**。MCP 服务器将规则编码为可调用的工具，让 AI 在编码过程中实时获取项目上下文、验证合规性、生成符合模式的代码。

### 核心收益

| 维度 | 当前（Skill/Rule） | 目标（MCP） |
|------|------------------|-------------|
| 约束性质 | AI 读取后"努力遵守" | AI 调用工具获取确定性结果 |
| 合规验证 | 写完后人工/脚本检查 | 编码中实时检查 |
| 代码生成 | 凭记忆写，可能偏离模式 | 工具返回 100% 合规模板 |
| 上下文负担 | 规则越长越容易被稀释 | 工具注册在协议层，不占上下文 |
| 反馈闭环 | AI 生成 → 人审 → 修改 | AI 调用 → 工具验证 → AI 调整 |

---

## 一、架构设计

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    Trae IDE                          │
│  ┌───────────────────────┐  ┌─────────────────────┐ │
│  │    AI 助手 (Client)    │  │  MCP UI (配置面板)  │ │
│  │  ┌─────────────────┐  │  │                     │ │
│  │  │ Tool Call Engine │  │  │  工具市场/手动配置  │ │
│  │  └────────┬────────┘  │  │                     │ │
│  └───────────┼───────────┘  └─────────────────────┘ │
└──────────────┼──────────────────────────────────────┘
               │ JSON-RPC 2.0 over stdio
               ▼
┌─────────────────────────────────────────────────────┐
│                 MCP Server (Node.js)                  │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Tool Registry                        │ │
│  │                                                   │ │
│  │  ┌──────────────┐  ┌──────────┐  ┌────────────┐  │ │
│  │  │ Context Tools  │  │ Audit   │  │ Code Gen   │  │ │
│  │  │               │  │ Tools   │  │ Tools      │  │ │
│  │  │• project_ctx  │  │• check_ │  │• gen_      │  │ │
│  │  │• db_schema    │  │  phase   │  │  logger    │  │ │
│  │  │• audit_pattern│  │• check_ │  │• gen_      │  │ │
│  │  │               │  │  failure │  │  feature   │  │ │
│  │  └──────────────┘  └──────────┘  └────────────┘  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │           Resource Providers                      │ │
│  │  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │ │
│  │  │FileSystem │  │Prisma     │  │Git/Workspace │  │ │
│  │  │ Reader   │  │ Schema    │  │ Scanner     │  │ │
│  │  └──────────┘  └───────────┘  └──────────────┘  │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 1.2 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| **MCP SDK** | `@modelcontextprotocol/sdk` | Anthropic 官方 SDK，Trae IDE 原生兼容 |
| **运行时** | Node.js 24 + TypeScript | 与项目技术栈一致 |
| **传输方式** | stdio | 本地开发，零网络依赖，启动最快 |
| **工具注册** | 声明式 Registry 模式 | 便于扩展和维护 |
| **配置管理** | `.trae/mcp.json` | Trae IDE 标准配置路径 |

### 1.3 工具分类与定义

所有工具按功能分为三大类：

#### A. 上下文工具（Context Tools）— 消除幻觉

解决 AI "凭记忆写代码"导致的幻觉问题。

| 工具名 | 功能 | 输入 | 输出 |
|--------|------|------|------|
| `get_project_context` | 获取项目结构/约定/技术栈 | `{scope: "structure"\|"rules"\|"all"}` | 结构化的项目信息 |
| `get_db_schema` | 获取 Prisma Schema 定义 | `{model?: string}` | 模型/字段/关系定义 |
| `get_audit_logger_pattern` | 获取指定域的审计日志器代码 | `{domain: string}` | 完整的审计日志器代码 |

#### B. 验证工具（Audit Tools）— 硬约束合规检查

将 ADD-2 ~ ADD-6 规则编码为可执行检查。

| 工具名 | 对应 ADD | 功能 | 输入 | 输出 |
|--------|----------|------|------|------|
| `check_phase_symmetry` | ADD-2 | 验证阶段标记对称性 | `{code: string}` | Start/End 数量及不对称列表 |
| `check_min_unit` | ADD-3 | 验证最小可观测单元完整性 | `{code: string}` | CHUNK 覆盖率报告 |
| `check_failure_path` | ADD-6 | 验证失败路径审计等价 | `{code: string}` | 信息密度对比报告 |
| `check_file_compliance` | ADD-2~6 | 综合合规检查 | `{filePath: string}` | 完整合规报告 |

#### C. 代码生成工具（Code Gen Tools）— 消除模式偏离

从"AI 凭记忆写"变为"AI 调用工具获取 100% 合规代码"。

| 工具名 | 功能 | 输入 | 输出 |
|--------|------|------|------|
| `generate_audit_logger` | 生成完整审计日志器 | `{domain, phases, prefix}` | 完整 TypeScript 代码 |
| `generate_feature_scaffold` | 生成功能骨架（服务+审计+API） | `{featureName, phases}` | 服务层/API/审计器代码 |
| `generate_api_route` | 生成带审计的 API Route | `{routeName, method, feature}` | 完整 API Route 代码 |

---

## 二、文件结构

```
team-coordinator-agent/
├── .trae/
│   ├── mcp.json                    # [新] MCP 服务器配置
│   └── scripts/
│       └── mcp-server.ts           # [新] MCP 服务器主入口（TS 源码）
├── scripts/
│   └── mcp-server.ts               # [新] 编译后的 MCP 服务端逻辑
└── .trae/rules/
    └── project_rules.md            # 现有规则（被 MCP 工具引用）
```

### 为什么在 `.trae/scripts/` 下放源码

- `.trae/mcp.json` 中的 command 需要指向一个可执行文件
- 使用 `tsx` 直接运行 TypeScript 源码，无需编译步骤
- 路径相对 `.trae/` 目录，保持 MCP 配置的路径简洁

### 为什么 `@modelcontextprotocol/sdk` 不放在 dependencies

- MCP 服务器是独立的开发工具，不是应用运行时依赖
- 放在 devDependencies 中，与 eslint、vitest 同级

---

## 三、实施步骤

### Phase 1：基础设施（1 个任务）

**目标**：搭建 MCP 服务器骨架，实现最基本的上下文工具，验证 MCP 链路畅通。

| 步骤 | 内容 | 产出 |
|------|------|------|
| 1.1 | 安装 `@modelcontextprotocol/sdk` | devDependencies 更新 |
| 1.2 | 创建 `.trae/scripts/mcp-server.ts` | MCP Server 骨架（tools/list + tools/call 处理器） |
| 1.3 | 注册 `get_project_context` 工具 | 首个可用的上下文工具 |
| 1.4 | 创建 `.trae/mcp.json` | Trae IDE 加载 MCP 服务器 |
| 1.5 | 验证链路 | AI 助手成功调用并返回结果 |

### Phase 2：验证工具（3 个任务）

**目标**：实现 ADD-2 ~ ADD-6 的硬约束检查工具。

| 步骤 | 内容 | 对应 ADD |
|------|------|----------|
| 2.1 | 实现 `check_phase_symmetry` | ADD-2 |
| 2.2 | 实现 `check_min_unit` + `check_failure_path` | ADD-3, ADD-6 |
| 2.3 | 实现 `check_file_compliance`（综合检查） | ADD-2~6 |

### Phase 3：代码生成工具（2 个任务）

**目标**：消除模式偏离，让 AI 生成 100% 合规的代码。

| 步骤 | 内容 | 收益 |
|------|------|------|
| 3.1 | 实现 `generate_audit_logger` | 审计日志器零偏差 |
| 3.2 | 实现 `generate_feature_scaffold` | 新功能骨架一键生成 |

### Phase 4：审计检查工具（1 个任务）

**目标**：利用项目已有的审计日志器，实现运行时审计数据读取和检查。

| 步骤 | 内容 |
|------|------|
| 4.1 | 实现 `read_audit_logs`（读取日志文件） |
| 4.2 | 实现 `check_audit_compliance`（读取日志并生成合规报告） |

---

## 四、与现有 Skill/Rule 的关系

MCP 不替代现有的 Skill 和 Rule，而是将它们**升级为可执行工具**：

```
Skill（工作流）──── 指导 AI 按 ADD 7 步执行
                      │
                      ├─ Step 1 审计基础设施 → AI 调用 gen_audit_logger 工具
                      ├─ Step 3 审计数据验证 → AI 调用 check_phase_symmetry 等工具
                      ├─ Step 3.5 合规检查   → AI 调用 check_file_compliance 工具
                      └─ Step 4-6 定位/修复   → AI 调用 read_audit_logs 工具

Rule（约束规则）──── 被 MCP 工具编码为代码逻辑
                      │
                      ├─ ADD-2 阶段对称   → check_phase_symmetry 工具
                      ├─ ADD-3 最小单元   → check_min_unit 工具
                      ├─ ADD-4 三通道     → gen_audit_logger 工具（模板含三通道）
                      ├─ ADD-5 数据回写   → gen_audit_logger 工具（模板含 Prisma 回写）
                      └─ ADD-6 失败路径   → check_failure_path 工具
```

---

## 五、验收标准

### 基础设施验收

- [ ] `.trae/mcp.json` 配置正确，Trae IDE 加载 MCP Server 无报错
- [ ] `get_project_context` 工具调用成功，返回合法 JSON
- [ ] `get_db_schema` 工具调用成功，返回 Prisma Schema 结构

### 验证工具验收

- [ ] `check_phase_symmetry` 能正确检测不对称阶段
- [ ] `check_failure_path` 能正确检测信息密度不足的 catch 块
- [ ] `check_file_compliance` 能生成完整合规报告

### 代码生成工具验收

- [ ] `generate_audit_logger` 生成的代码通过 `npx tsc --noEmit`
- [ ] 生成的审计日志器与现有 `audit-logger.ts` 模式一致
- [ ] `generate_feature_scaffold` 生成完整的服务 + 审计 + API 骨架

### 集成验收

- [ ] AI 助手在 Agent Mode 下能自主调用 MCP 工具完成 ADD 合规开发
- [ ] 无需手写审计日志器 — 全部通过工具生成
- [ ] 合规检查从"事后人工审查"变为"编码中实时验证"

---

## 六、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| `@modelcontextprotocol/sdk` 在 Trae 中的兼容性 | 工具注册失败 | 先用官方示例验证，再升级到复杂工具 |
| 文件路径在 MCP Server 中解析问题 | 工具返回空结果 | Server 启动时注入项目绝对路径 |
| `tsx` 启动 MCP Server 性能 | 工具调用延迟 | 工具实现轻量，无网络请求，纯文件读写 |
| 工具参数复杂导致 AI 调用困难 | AI 频繁传错参数 | 设计简洁的输入 Schema，提供合理的默认值 |

---

*本规划文档版本: v1.0*
*创建日期: 2026-05-13*
