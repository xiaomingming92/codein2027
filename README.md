<div align="center">

# codein2027
## ADD 自主驱动开发范式 | Autonomous Driven Development
### 全球首个哲学驱动 · 长周期AI自主开发工程化实现

[![GitHub Stars](https://img.shields.io/github/stars/xiaomingming92/codein2027)](https://github.com/xiaomingming92/codein2027)
[![License](https://img.shields.io/badge/License-MIT%2BADD-blue)](./LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/xiaomingming92/codein2027/commits/main)](https://github.com/xiaomingming92/codein2027)
[![Runtime](https://img.shields.io/badge/Runtime-Docker%2FPodman%2FNode.js-green)]()

---
### 📢 首创官方声明
**ADD (Autonomous Driven Development) 自主驱动开发范式 由 xiaomingming92 于 2026年5月 全球首创，并完成业内首个端到端工程化落地。**
本仓库为 ADD 范式**唯一原始官方实现**，所有衍生项目、产品、功能、理论引用，均需严格标注来源。

</div>

---

## 一、项目简介
本项目并非普通 AI 代码补全工具、单点智能体 Demo，而是一套**以原创哲学体系为顶层核心**的新一代软件开发范式。

当前主流 AI 编程工具（Cursor、Devin、Copilot 等）普遍存在致命短板：**严格绑定单次会话生命周期**，对话关闭/刷新后上下文永久丢失，无法支撑大中型项目长周期迭代；同时存在决策逻辑分散、AI 生成黑盒、缺少企业级合规治理等问题。

ADD 范式彻底打破会话边界，重新定义人机协作开发模式：
> 人类仅负责定义业务目标，AI 智能体集群承接全流程技术交付；支持**跨轮次、跨对话、跨设备**永续接续开发，搭载集中裁决、全链路审计、代码自迭代三大核心能力，完全适配个人开发与企业级合规场景。

项目已完成 **3轮独立完整对话迭代验证**，全流程跑通长周期开发链路，充分证明本范式的可行性、稳定性与工程价值。

---

## 二、ADD 范式三层核心哲学（项目灵魂，不可分割）
整套代码架构、工作流、规则逻辑均基于以下原创三层嵌套哲学设计，由底层安全底座逐层向上延伸至体系进化能力：

### 1. 底层：可信决策论（安全合规底座）
核心规则：**证据驱动、集中裁决、全链路可审计**
- 所有技术/业务决策统一收敛至独立裁决层，杜绝逻辑碎片化；
- 代码与方案生成强制依托企业知识库可信证据，限制模型随机输出；
- 全流程节点、证据链、决策记录、异常日志永久存储，完整溯源，满足企业合规要求。

### 2. 中层：跨时空连续存续论（长周期开发内核）
核心规则：**任务状态永续、断点无缝接续**
- 以唯一 `task_id` 绑定项目全量数据（代码快照、证据链、裁决记录、迭代历史）；
- 任务状态与会话完全解耦，间隔任意时长、更换设备/对话均可无损接续开发；
- 支持多轮累积式递进决策，自动汇总历史修改与需求，无需重复复述上下文。

### 3. 顶层：代码本体自迭代演化论（范式进化动力，TTS 自我迭代）
核心规则：**工程产物自主反思、自检、重构、升级**
- 系统主动扫描代码缺陷、架构冗余、性能隐患，依据内置规则自主优化；
- 底层工作流、裁决规则、调度逻辑可基于实战数据动态调优；
- 实现体系内生进化，区别于传统静态工具。

---

## 三、核心能力
| 能力模块 | 功能说明 | 行业差异化优势 |
| ---- | ---- | ---- |
| 集中裁决层 | 统一收敛全流程决策，多智能体交叉校验 | 决策标准化、可管控，解决逻辑散落问题，既能够为后续多Agent 联合治理提供边界和规则。更重要的是<big>让人类能够以更高抽象层直接操纵复杂系统</big> |
| 全链路审计追踪 | 节点快照、路由决策、证据链、异常日志全量记录 | 开发流程完全白盒化，适配企业合规审计 |
| 跨会话接续开发 | 任务状态持久化，脱离会话限制断点续做 | 根治传统AI「单次会话失忆」痛点 |
| 证据驱动生成 | RAG 知识库前置约束，输出遵循企业编码规范 | 提升代码质量，规避模型无依据随机生成 |
| 多智能体协同 | 基于 LangGraph 角色化分工，拆解复杂开发任务 | 支撑中大型项目全流程交付 |
| 代码自迭代 | 自主查错、重构、版本优化与架构升级 | 具备自我进化能力，形成长期技术壁垒 |

### 标准工作流
`意图识别 → 证据检索 → 推理规划 → 交互点检测 → 集中裁决 → 结果响应`
- 核心枢纽：**裁决层（verdict）**，负责全流程决策与质量校验；
- 观测体系：`ChainTracer` 链式追踪 + 异步非阻塞审计日志；
- 存储体系：任务全局状态持久化，与会话生命周期解耦。

---

## 四、技术栈
- 全栈框架：Next.js + TypeScript
- 智能体编排：LangGraph / LangChain
- 向量检索(RAG)：ChromaDB
- 数据存储：PostgreSQL（业务数据、审计日志、任务状态）
- 容器化部署：Docker / Podman

---

## 五、快速部署 & 运行
### 环境要求
- Docker 或 Podman
- Node.js >= 18
- 可正常访问大模型接口（支持主流公有/私有化大模型）

### 启动步骤
```bash
# 1. 克隆代码仓库
git clone https://github.com/xiaomingming92/codein2027.git
cd codein2027

# 2. 启动数据库、向量库容器服务
# Docker 环境
npm run db:start
# Podman 环境
npm run podman:db:start

# 3. 安装依赖并启动项目
npm install
npm run dev
本项目的 agent 源码是
# 农业智能体

基于 Next.js 的农业智能体团队协调系统，集成 RAG 知识库、LangGraph Agent 工作流和多智能体协作。

## 快速开始

### 前置条件

- Node.js 18+
- PostgreSQL (通过 Podman/Docker 运行，自动检测，Podman 优先)
- ChromaDB (通过 Podman/Docker 运行，自动检测，Podman 优先)
- `.env.development` 文件（已配置数据库连接、LLM 密钥等）

### 安装与启动

```bash
# 安装依赖
npm install

# 一键启动（自动检测 Podman/Docker → 启动 PostgreSQL + ChromaDB → 生成 Prisma Client → 迁移 → 初始化）
npm run dev
```

打开 http://localhost:3000 查看应用。

> **跨平台支持**：所有脚本自动检测操作系统（macOS / Linux / Windows）和容器运行时（**Podman 优先 > Docker**）。
> - macOS / Linux：使用 `scripts/*.sh`
> - Windows：使用 `scripts/*.bat`

### 基础设施管理

```bash
npm run db:start    # 启动 PostgreSQL + ChromaDB（自动检测 Podman/Docker）
npm run db:stop     # 停止基础设施
npm run db:status   # 查看运行状态
npm run db:ensure   # 完整初始化：容器检查 → Prisma 生成 → 迁移 → 初始化数据
```

## 知识库管理

```bash
npm run kb:sync          # 同步知识库 (扫描 docs/*/knowledge/ → 向量化)
npm run kb:reset         # 重置知识库 (清空向量库 → 重新同步)
npm run kb:logs          # 查看知识库审计日志 (最近 100 行)
npm run kb:logs:clear    # 清空知识库日志
npm run kb:export        # 导出知识库
npm run kb:import        # 导入知识库
```

## Agent 诊断

```bash
npm run agent:diagnose   # 一键诊断 LLM/ChromaDB/PostgreSQL 连通性
npm run agent:logs       # 查看 Agent 审计日志 (最近 100 行)
npm run agent:logs:clear # 清空 Agent 日志
```

## 技术文档

- [团队协同智能体规划说明书](docs/团队协作智能体/knowledge/00-需求/《团队协同智能体规划说明书》.md) - 产品定位、功能需求、用户角色、实施计划
- [团队协同智能体技术架构说明书](docs/团队协作智能体/knowledge/01-架构/《团队协同智能体技术架构说明书》.md) - 系统分层、证据链推理、LangGraph 工程化、裁决层设计
- [RAG 知识库系统技术文档](docs/团队协作智能体/knowledge/01-架构/《RAG知识库系统技术文档》.md) - 完整的 RAG 数据流转、分层设计、触发流程、日志查看、ChromaDB 配置、SQL 查询等
- [聊天实例管理文档](docs/团队协作智能体/knowledge/01-架构/《聊天实例管理技术文档》.md) - 多会话管理、竞态条件防护、交互操作、API 接口、故障排查
- [开发操作审计存档规范](docs/团队协作智能体/knowledge/02-规范/《开发操作审计存档规范》.md) - 代码改动自动存档到 PostgreSQL 的数据流、写入规范、查询示例、跨会话上下文恢复
- [ADD可审计开发范式案例参考](docs/团队协作智能体/knowledge/02-规范/《ADD可审计开发范式案例参考》.md) - ADD 范式起源、聊天持久化实施、ChainTracer 接入、RAG 检索修复

## 技术栈

- **前端**: Next.js 16 + React 19 + Tailwind CSS + Radix UI
- **后端**: Next.js API Routes + Prisma ORM
- **向量数据库**: ChromaDB (DirectChromaClient HTTP 直连)
- **关系数据库**: PostgreSQL
- **LLM**: 阿里云百炼 (qwen-vl-plus) + LangGraph Agent
- **Embedding**: text-embedding-v4 (阿里云百炼)
- **文档解析**: mammoth (DOCX) + pdf-parse + tesseract.js (OCR)
