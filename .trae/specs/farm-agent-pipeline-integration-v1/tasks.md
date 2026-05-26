# Tasks: 领域集成 — 管线消费 + 报告服务

## Preconditions

- [ ] 已执行 `session-init` SKILL
- [ ] 已执行 `add-paradigm` SKILL（Step 0 文档先行）
- [ ] 上游第1-3轮 ADD-7 审计记录存在（`query_audit_logs({ sinceMinutes: 2880, keyword: "ANALYSIS_CONTEXT_CREATED" })`）
- [ ] `npx tsc --noEmit` 在上游完成后通过

## Forbidden

- 禁止修改 Prisma Schema（`prisma/schema.prisma`）
- 禁止修改前端组件（React/Vue 组件文件）
- 禁止覆盖或重构已有 stream-bus / SSE 事件总线逻辑
- 禁止简化代码实现，一切以代码高质量为衡量标准
- 禁止硬套 Mongo 风格 filter 到 ChromaDB（先读现有 ChromaDB 查询封装 API 签名）
- 禁止报告 API 凭空假设 ChatMessage 数据结构（先读现有消息持久化结构）

- [ ] Task 1: 改造 retrieval 节点支持专家过滤
  - [ ] 修改 `src/agents/nodes/retrieval.ts`
  - [ ] 当 analysisContext.activeExperts 非空时：收集各专家的 evidenceFilter 并合并
  - [ ] 合并后的过滤条件传给 ChromaDB 检索
  - [ ] 当 activeExperts 为空时：行为不变
  - [ ] 验证：激活 roi_analysis → retrieval 仅检索"市场行情"+"经济数据"来源文档

- [ ] Task 2: 改造 reasoning 节点支持专家维度
  - [ ] 修改 `src/agents/nodes/reasoning.ts`
  - [ ] 当 activeExperts 非空时：从 ANALYSIS_EXPERTS 取各专家 promptTemplate + 注入 runtimeInputs
  - [ ] 拼接为 `[分析上下文 - 已激活 N 个分析专家]` 块
  - [ ] 当 activeExperts 为空时：行为不变
  - [ ] 验证：激活 crop_compare + roi_analysis → reasoning prompt 含两专家独立分析维度块

- [ ] Task 3: 改造 response 节点支持专家 section 合并
  - [ ] 修改 `src/agents/nodes/response.ts`
  - [ ] 合并所有 activeExperts 的 outputSections 并集去重
  - [ ] 将合并结果传给 ResponseStrategy 的修饰器管道（已在第2轮实现）
  - [ ] 验证：激活多专家 → DisplayContent.sections 含各专家对应的 type

- [ ] Task 4: 新建报告生成服务
  - [ ] 新建 `src/services/report-generator.ts`
  - [ ] 定义 `ReportFormat`、`ReportResult` 类型
  - [ ] 实现 `generateReport(structured, analysisContext, format?)` — 主入口
  - [ ] 实现 `generateMarkdown()` — 拼接结构化 Agent 响应
  - [ ] 实现 `generatePdf()` — MD → HTML → PDF（使用 pdfmake）
  - [ ] 实现 `generateDocx()` — 使用 docx 库按 section 构建
  - [ ] 实现 `generateXlsx()` — 使用 exceljs 构建 3 Sheet（概要/详情/证据明细）
  - [ ] 实现 `inferDefaultFormat(activeExperts)` — 按专家推导默认格式
  - [ ] 实现 `buildReportMarkdown()` — 通用 Markdown 模板（MD/PDF/DOCX 共享）
  - [ ] 验证：调用 generateReport 返回各格式正确 Buffer

- [ ] Task 5: 新建报告下载 API
  - [ ] 新建 `src/app/api/agent/chat/threads/[threadId]/messages/[messageId]/report/route.ts`
  - [ ] GET handler：解析 format query param → 加载消息 → 生成报告 → 返回文件
  - [ ] 设置正确的 Content-Type 和 Content-Disposition 响应头
  - [ ] 不指定 format 时按 inferDefaultFormat 推导
  - [ ] 验证：GET /report?format=md 返回 Markdown；?format=xlsx 返回 Excel

- [ ] Task 6: 安装依赖
  - [ ] 修改 `package.json`：新增 dependecy `docx`、`exceljs`、`pdfmake`
  - [ ] 执行 `npm install`
  - [ ] 验证：`npx tsc --noEmit` 零类型错误

# Task Dependencies

- Task 1-3 依赖第3轮（ANALYSIS_EXPERTS + AnalysisContext）
- Task 2 依赖第2轮（ResponseStrategy 修饰器管道）
- Task 3 依赖 Task 2（需要 outputSections 合并结果）
- Task 4-5 可并行于 Task 1-3
- Task 6 可并行于所有 Task（仅安装依赖）

## Verification

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`（如项目已配置）
- 当前 spec `checklist.md` 全部通过
- 当前对话 ADD-7 `record_dev_operation` 已逐文件记录
- `npm install` 成功（无冲突）

## 对话启动（将此段粘贴给新的 LLM 对话）

你在执行 farm-agent 改进的 **第4轮**（领域集成 — 管线消费 + 报告服务）。上游第1-3轮已完成类型基础、裁决层、分析专家注册表、AnalysisContext。

**启动步骤（按顺序）：**
1. 执行 `session-init` SKILL → `query_audit_logs({ sinceMinutes: 2880 })` 确认第1-3轮完成
2. 执行 `add-paradigm` SKILL
3. 先读现有 ChromaDB 查询封装 API、ChatMessage 持久化结构
4. 阅读 `specs/co-agent-pipeline-integration/spec.md`
5. 按本文档 tasks.md 顺序执行。建议先保证 md/xlsx 可用，再实现 pdf/docx

**文件清单（2新建+4修改）：**
`retrieval.ts`(改) / `reasoning.ts`(改) / `response.ts`(改) / `report-generator.ts`(新) / `report/route.ts`(新) / `package.json`(改)

**⚠️ retrieval.ts 第1轮已改过，reasoning.ts/response.ts 首次修改或第2轮已改过——做增量编辑。**
**⚠️ ChromaDB filter 不能硬套 Mongo 风格，先读现有封装。**

**关键提醒：** 对话已开 3/5，完成后立即 record_dev_operation。
