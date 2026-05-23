# 农业智能体 - 团队协调系统

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
