# co-agent 简化版方案 Review

## Review 元信息

- **Review 文档**: `co-agent-simplified-v1-review.md`
- **Review 对象**:
  - `.trae/documents/co-agent-simplified-v1.md`
  - `.trae/documents/co-agent-simplified-v1-execution-plan.md`
  - `.trae/documents/co-agent-conversation-handoff.md`
  - `.trae/specs/co-agent-*`
- **目标仓库**: `/home/xmm/ai/farm-agent`
- **Review 时间**: 2026-05-23
- **结论级别**: 可执行，但建议先完成文档收敛后再进入代码实现

---

## 1. 总体结论

co-agent 简化版方案整体方向正确，架构拆分具备可执行性。方案将类型基础、路由分流、响应裁决、分析专家、管线消费、报告服务、语义缓存、演化闭环和三层审计拆成多个相对独立的交付单元，能够降低一次性大改带来的上下文过载风险。

当前最主要的问题不是功能设计本身，而是文档之间存在版本漂移与边界冲突。如果不先收敛这些冲突，后续分对话执行时容易出现实现分叉，尤其集中在领域集成和三层审计阶段。

推荐处理方式：以 `co-agent-conversation-handoff.md` 的 5 对话拆分为执行基准，先修正执行计划、报告服务边界和审计边界说明，再从对话 1 开始实施。

---

## 2. 方案优点

### 2.1 拆分粒度合理

方案没有把 20 多个文件的改动压进一次实现，而是按依赖关系拆分为基础层、裁决层、领域集成、缓存演化、审计管线几个阶段。这个拆分方式能显著降低后续实现中的冲突概率。

### 2.2 依赖拓扑清晰

当前交接手册中的依赖关系比较明确：

```text
对话1：类型收敛 + thinkingLevel 路由
  ↓
对话2：ResponseStrategy + 专家注册表 + AnalysisContext
  ↓
对话3：专家管线消费 + 报告服务
  ↓
对话4：语义缓存 + 演化闭环
  ↓
对话5：三层审计管线
```

这个顺序符合工程依赖：先统一类型，再建立策略与上下文，再消费专家能力，最后补齐缓存、演化和审计。

### 2.3 每轮具备独立验收标准

每个对话都给出了明确的验证标准。例如：

- 对话 1 验证 Evidence 唯一定义、fast/deep 路由分流、TypeScript 编译通过。
- 对话 2 验证策略裁决、专家注册表、AnalysisContext 读写。
- 对话 3 验证专家过滤、报告格式生成、默认格式推导。
- 对话 4 验证 cache hit、kbGeneration 淘汰、turnHistory 采集、TTL 自适应。
- 对话 5 验证 L2 AuditLog、traceId 串联、L1 debug trace、微调导出。

这有利于每轮独立收敛。

### 2.4 后端优先的边界比较稳

主 Plan 明确不优先改前端、不引入 worldline/L0-L4/VerdictRegistry/CapabilityModel，不修改 Prisma Schema。这个边界能避免简化版演变成完整平台重构。

### 2.5 AnalysisContext 使用 metadata 是合理取舍

将分析上下文写入 `ChatThread.metadata`，避免新增 Prisma 模型，符合简化版目标。该设计对跨轮保存 `activeExperts`、`runtimeInputs`、`turnHistory` 足够使用。

---

## 3. 关键问题

### 3.1 执行计划为 7 轮，交接手册为 5 对话

`co-agent-simplified-v1-execution-plan.md` 使用 7 轮拆分，而 `co-agent-conversation-handoff.md` 使用 5 对话拆分。两者不是简单命名差异，而是实际合并了若干阶段：

| 模块 | 7 轮版本 | 5 对话版本 |
|------|----------|------------|
| 裁决层 | 第 2 轮 | 对话 2 |
| 领域基础设施 | 第 3 轮 | 对话 2 |
| 领域集成 | 第 4 轮 | 对话 3 |
| 语义缓存 | 第 5 轮 | 对话 4 |
| 演化闭环 | 第 6 轮 | 对话 4 |
| 审计管线 | 第 7 轮 | 对话 5 |

建议以 5 对话版本为准，因为它减少中间态，并且交接手册已经明确了每个对话的上下文恢复方式、文件清单和审计 action。

建议修正：

- 将执行计划同步为 5 对话版；或
- 在执行计划顶部标记 7 轮版本为历史拆分，仅保留为设计参考；或
- 明确 `co-agent-conversation-handoff.md` 是唯一执行入口。

### 3.2 主 Plan 的“不做报告服务”与对话 3 冲突

主 Plan 中的边界说明包含“不做独立的分析报告模板引擎”，但对话 3 明确要求：

- 新建 `src/services/report-generator.ts`
- 新建报告下载 API
- 增加 `docx`、`exceljs`、`pdfmake`
- 支持 `md|pdf|docx|xlsx`

这会导致执行者误判报告服务是否应该实现。

建议修正为：

> 不做复杂报告模板引擎，但实现轻量级 `report-generator` 服务，基于现有消息内容、DisplayContent 和 AnalysisContext 生成 md/pdf/docx/xlsx 下载结果。

这样既保留主 Plan 的简化边界，也不否定对话 3 的交付内容。

### 3.3 三层审计边界与旧 traceId 规则存在冲突

交接手册对话 5 要求：

- L2 运行时审计写高层事件到 AuditLog。
- 节点级 `NODE_START/NODE_END/LLM_CALL` 不写 DB，只写 console/file 或进入 L1 debug trace。

但项目历史规则中的 traceId 章节曾要求 Agent 节点事件写入 AuditLog。这和三层审计的新边界冲突。

从架构角度，应采用对话 5 的新边界：

| 层次 | 内容 | 是否写 AuditLog |
|------|------|----------------|
| L1 开发审计 | 节点输入输出、prompt、rawOutput、策略候选、debug trace | 否，写 debug 文件 |
| L2 运行时审计 | CHAT_REQUEST、STRATEGY_MATCHED、EXECUTION_QUALITY、CACHE_*、CHAT_RESPONSE、CHAT_ERROR | 是 |
| L3 控制台日志 | 开发即时观察 | 否 |

原因：生产 AuditLog 面向 UI 和最终用户，不适合记录高频节点级内部细节，否则会造成表膨胀、查询噪音和隐私风险。

建议修正：

- 在 `co-agent-audit-pipeline` spec 中声明 Step 8 覆盖旧节点级 DB 写入策略。
- 明确节点级 trace 迁移为 L1 debug trace。
- L2 仅保留业务和策略层高价值事件。

### 3.4 对话 5 容易把 L1 与 L2 混在一起

`agent-audit-logger.ts` 是历史混合式日志器。对话 5 要求对它“修改升级”，这可以接受，但必须防止它继续膨胀成万能日志器。

推荐边界：

```text
src/lib/agent-audit-logger.ts
  - L2: agentAuditRequest
  - L2: agentAuditResponse
  - L2: agentAuditError
  - L2: agentAuditStrategy
  - L2: agentAuditExecutionQuality
  - L2: agentAuditCacheOperation
  - 兼容旧函数：NodeStart/End/Route/Retrieval 仍只做 console/file，不写 AuditLog

src/services/debug-tracer.ts
  - L1: development only
  - 节点级输入输出
  - prompt/rawOutput/parsed result
  - strategy candidates
  - execution quality signals
  - 写 logs/debug/{threadId}/...
```

---

## 4. 各对话评审

### 4.1 对话 1：基础层

对话 1 是所有后续工作的地基，必须单独执行并单独验证。

核心价值：

- 消除 Evidence 重复定义。
- 引入 EvidenceRef 和 EvidenceSummary。
- 给 CurrentTask 增加 `thinkingLevel?: "fast" | "deep"`。
- chat 意图直通 response，跳过 RAG/推理/裁决。

主要风险：

- Evidence 类型收敛可能影响 prompts、retrieval、interaction-point-detection 多处引用。
- `grep "interface Evidence"` 容易误伤 `EvidenceRef` 和 `EvidenceSummary`。

建议验证命令改为：

```bash
npx tsc --noEmit
grep -R "interface Evidence " src/
```

### 4.2 对话 2：裁决层 + 领域基础设施

将 ResponseStrategy 与 AnalysisContext/Expert Registry 合并到同一对话可以接受，因为二者都依赖对话 1，但彼此并不强耦合。

核心价值：

- 将 response.ts 中硬编码三段分支替换为自声明策略描述符。
- 建立 `ANALYSIS_EXPERTS` 注册表。
- 建立 AnalysisContext 跨轮记忆。
- 为对话 3 的专家管线消费提供基础。

主要风险：

- `stream/route.ts` 历史改动较多，合并 AnalysisContext 时不能覆盖已有流式事件总线逻辑。
- `ChatThread.metadata` 读写必须做类型守卫，不能假设 metadata 永远是对象。
- 策略注册表不应退化为 switch/case。

建议：

- `resolveResponseStrategy` 保持 descriptor registry 模式。
- AnalysisContext CRUD 函数集中处理 metadata merge。
- 对话 2 完成后必须运行 `npx tsc --noEmit`。

### 4.3 对话 3：领域集成 + 报告服务

对话 3 是第一个高风险阶段，因为它跨越 retrieval、reasoning、response、service、API route 和 package.json。

核心价值：

- activeExperts 参与 RAG evidenceFilter。
- activeExperts 参与 reasoning prompt 维度注入。
- activeExperts 参与 response sections 合并。
- 提供报告下载 API。

主要风险：

- 新增 `docx/exceljs/pdfmake` 会改变依赖树。
- 报告 API 不能凭空假设 ChatMessage 数据结构。
- retrieval 的 ChromaDB filter 能力需要依据现有客户端实际 API 实现，不能硬套 Mongo 风格 filter。

建议：

- 实施前先检查现有 `package.json`、message 持久化结构、ChromaDB 查询封装。
- 如果 pdf/docx/xlsx 生成能力复杂，应保证 md/xlsx 先可用，再实现 pdf/docx。
- `inferDefaultFormat` 必须与 `learnFormatPreference` 的后续演化闭环兼容。

### 4.4 对话 4：语义缓存 + 演化闭环

缓存和演化闭环合并是合理的，因为 TTL 自适应、turnHistory、path metrics 都需要共享上下文。

核心价值：

- 相同问题复用缓存，降低 LLM 调用成本。
- kbGeneration 变更后惰性淘汰缓存。
- 从 turnHistory 和 path metrics 中学习策略调整信号。

主要风险：

- 缓存 key 如果不包含 activeExperts，会出现跨专家误命中。
- 缓存 key 如果不包含 kbGeneration，会出现知识库更新后仍返回旧答案。
- TTL 自适应如果没有边界，会导致缓存过长或过短。

建议缓存 key 至少包含：

```text
normalizedQuery + intent + sorted(activeExperts) + kbGeneration
```

建议 TTL 自适应包含上下限，例如：

```text
minTtl <= adaptedTtl <= maxTtl
```

### 4.5 对话 5：三层审计管线

对话 5 放在最后是正确的。只有业务路径稳定后，审计点才知道应该挂在哪里。

核心价值：

- 生产 AuditLog 不再为空。
- traceId 能串联高层运行时事件。
- dev 环境具备节点级 debug trace。
- 可导出微调训练数据。

主要风险：

- L1/L2 边界混淆。
- async streaming 中 audit context 泄漏或丢失。
- `clearAuditContext()` 如果没有放在 finally，会污染后续请求。
- 生产环境误写 debug trace 文件。

建议优先级：

1. 先完成 L2 高层 AuditLog。
2. 再完成 traceId 串联。
3. 再完成 L1 debug trace。
4. 最后完成 fine-tuning export。

---

## 5. 推荐执行顺序

建议先做一个文档收敛补丁，再开始对话 1 实现。

### 5.1 文档收敛补丁

需要修正：

1. `co-agent-simplified-v1-execution-plan.md`
   - 同步为 5 对话版；或标记 7 轮版已废弃。
2. `co-agent-simplified-v1.md`
   - 修正报告服务边界说明。
3. `co-agent-audit-pipeline/spec.md`
   - 明确 Step 8 采用新三层边界，覆盖旧节点级 DB 写入策略。
4. 各 `tasks.md` / `checklist.md`
   - 增加前置条件、禁止项、验证命令。

### 5.2 代码执行顺序

文档收敛后，按以下顺序执行：

```text
对话1 → 对话2 → 对话3 → 对话4 → 对话5
```

每个对话完成后必须：

- 运行 `npx tsc --noEmit`。
- 按 checklist 验证。
- 调用 `record_dev_operation` 记录 ADD-7 审计。
- 在进入下一对话前查询相关审计日志确认上游完成。

---

## 6. 推荐增加的统一执行约束

建议在每个 co-agent spec 的 `tasks.md` 中增加如下章节。

### Preconditions

```markdown
## Preconditions

- 已执行 session-init SKILL。
- 已执行 add-paradigm SKILL。
- 上游对话对应 ADD-7 审计记录存在。
- `npx tsc --noEmit` 在上游完成后通过。
```

### Forbidden

```markdown
## Forbidden

- 禁止修改 Prisma Schema，除非当前 spec 明确要求。
- 禁止修改前端组件，除非当前 spec 明确要求。
- 禁止覆盖已有 stream-bus 逻辑。
- 禁止将节点级 debug trace 写入生产 AuditLog。
- 禁止用 switch/case 简化 ResponseStrategy registry。
```

### Verification

```markdown
## Verification

- `npx tsc --noEmit`
- `npm run lint`
- 当前 spec checklist 全部通过
- 当前对话要求的 ADD-7 record_dev_operation 已记录
```

---

## 7. 最终建议

该方案可以作为后续 co-agent 简化版演进的执行基准，但应先完成文档收敛。当前最需要修正的是：

1. 统一 7 轮与 5 对话拆分。
2. 明确轻量报告服务是否属于计划范围。
3. 明确三层审计中的 L1/L2 边界，避免节点级事件继续污染生产 AuditLog。
4. 在 specs 中补充禁止项和验证项，防止后续对话误改前端、Schema 或 stream-bus。

完成上述修正后，再从对话 1 开始实施，整体风险可控。