# Tasks: 领域集成 — 管线消费 + 报告服务

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
