# 领域集成 — 管线消费 + 报告服务 Spec

## Why

分析专家注册表和 AnalysisContext 已建立（第3轮），但管线节点（retrieval/reasoning/response）尚未消费这些基础设施。需要让各节点感知 activeExperts，实现按专家过滤 RAG 检索、按专家维度推理、按专家合并输出 section。同时需要报告下载能力，支持 MD/PDF/DOCX/XLSX 四种格式，不同专家默认推荐不同格式。

## What Changes

- retrieval 节点：合并 activeExperts 的 evidenceFilter 为 ChromaDB 检索条件
- reasoning 节点：从 ANALYSIS_EXPERTS 取各激活专家的 promptTemplate + 注入 runtimeInputs
- response 节点：合并 activeExperts 的 outputSections 并集去重 → 传给 ResponseStrategy 修饰器管道
- 新建 `src/services/report-generator.ts`：4 格式报告生成器 + 默认格式推导
- 新建 `report/route.ts`：多格式报告下载 API
- `package.json` 新增依赖

## Impact

- Affected specs: 无
- Affected code: `src/agents/nodes/retrieval.ts`, `src/agents/nodes/reasoning.ts`, `src/agents/nodes/response.ts`, `src/services/report-generator.ts`（新建）, `src/app/api/agent/chat/threads/[threadId]/messages/[messageId]/report/route.ts`（新建）, `package.json`
- 父 Plan: [co-agent-simplified-v1.md](../../documents/co-agent-simplified-v1.md)
- 依赖: 第2轮(裁决层) + 第3轮(领域基础设施)
- 后续依赖: 第5轮(语义缓存) + 第6轮(演化闭环)

## ADDED Requirements

### Requirement: retrieval 节点按专家过滤

retrieval 节点 SHALL 在 analysisContext.activeExperts 非空时，收集所有激活专家的 evidenceFilter 并合并为 ChromaDB 检索条件。

#### Scenario: 单专家过滤
- **WHEN** activeExperts = [{ expertId: "roi_analysis" }]
- **THEN** ChromaDB 检索条件 = { source: { $in: ["市场行情", "经济数据"] } }

#### Scenario: 多专家过滤合并
- **WHEN** activeExperts = [{ expertId: "crop_compare" }, { expertId: "roi_analysis" }]
- **THEN** ChromaDB 检索条件 = { source: { $in: ["种植技术", "市场行情", "经济数据"] } }

#### Scenario: 无激活专家
- **WHEN** activeExperts 为空
- **THEN** retrieval 节点行为不变（走默认检索逻辑）

### Requirement: reasoning 节点按专家维度推理

reasoning 节点 SHALL 在 activeExperts 非空时，追加 `[分析上下文 - 已激活 N 个分析专家]` 块到 prompt，包含每个激活专家的 promptTemplate + runtimeInputs。

#### Scenario: 多专家推理维度
- **WHEN** activeExperts 含 crop_compare + roi_analysis
- **THEN** prompt 含两个独立分析维度块（作物对比分析 + ROI 测算）

### Requirement: response 节点合并专家 outputSections

response 节点 SHALL 合并所有 activeExperts 的 outputSections 并集去重，传给 ResponseStrategy 的修饰器管道（修饰器1）。

### Requirement: 多格式报告生成

系统 SHALL 提供 `generateReport()` 函数，支持 MD / PDF / DOCX / XLSX 四种格式。

#### Scenario: 格式与 MIME 映射
- **WHEN** format="md"
- **THEN** Content-Type = "text/markdown; charset=utf-8"
- **WHEN** format="xlsx"
- **THEN** Content-Type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

#### Scenario: 默认格式推导
- **WHEN** 仅 roi_analysis 激活 AND 未指定 format
- **THEN** 默认返回 xlsx
- **WHEN** 仅 crop_compare 或 pest_risk 激活 AND 未指定 format
- **THEN** 默认返回 md
- **WHEN** 多种类专家混合激活 AND 未指定 format
- **THEN** 默认返回 pdf

### Requirement: 报告下载 API

系统 SHALL 提供 `GET /api/agent/chat/threads/{threadId}/messages/{messageId}/report?format=md|pdf|docx|xlsx` 端点，从 ChatMessage.structuredResponse 加载结构化数据，调用 generateReport() 生成文件，返回正确的 Content-Type 和 Content-Disposition 响应头。

#### Scenario: 消息无结构化响应
- **WHEN** 指定消息无 structuredResponse
- **THEN** 返回 404

## MODIFIED Requirements

无（管线节点行为增强，保持无专家时的向后兼容）

## REMOVED Requirements

无
