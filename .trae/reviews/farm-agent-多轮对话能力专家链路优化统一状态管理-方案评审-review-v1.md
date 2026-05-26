# farm-agent 方案 Review

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

farm-agent 方案整体方向正确，架构拆分具备可执行性。方案将类型基础、路由分流、响应裁决、分析专家、管线消费、报告服务、语义缓存、演化闭环和三层审计拆成多个相对独立的交付单元，能够降低一次性大改带来的上下文过载风险。

当前最主要的问题不是功能设计本身，而是文档之间存在版本漂移与边界冲突。如果不先收敛这些冲突，后续分对话执行时容易出现实现分叉，尤其集中在领域集成和三层审计阶段。

推荐处理方式：以 `co-agent-simplified-v1-execution-plan.md` 的 7 轮原子事务拓扑为拆分基准，并以 `co-agent-conversation-handoff.md` 的 7 轮交接手册作为执行入口。7 轮拆分不是为了增加流程，而是为了保证每个业务原子闭包都能独立提交、验证、审计和恢复。

---

## 2. 方案优点

### 2.1 拆分粒度合理

方案没有把 20 多个文件的改动压进一次实现，而是按依赖关系拆分为基础层、裁决层、领域集成、缓存演化、审计管线几个阶段。这个拆分方式能显著降低后续实现中的冲突概率。

### 2.2 依赖拓扑清晰

当前 7 轮原子事务拓扑比较明确：

```text
第1轮：基础闭包：类型收敛 + thinkingLevel 路由
  ↓
第2轮：响应裁决闭包：ResponseStrategy registry + response 集成
  ↓
第3轮：领域上下文闭包：ExpertRegistry + AnalysisContext
  ↓
第4轮：领域消费闭包：专家管线消费 + 报告服务
  ↓
第5轮：语义缓存闭包：semantic-cache + kbGeneration + cache_hit SSE
  ↓
第6轮：演化闭环闭包：path-metrics + TTL 自适应 + turnHistory
  ↓
第7轮：三层审计管线闭包：L2 AuditLog + L1 debug trace
```

这个顺序不仅符合工程依赖，也符合业务原子事务边界：先统一类型，再建立响应裁决，再建立领域上下文，再让专家能力进入管线，随后分别完成缓存闭包、演化闭环和审计闭包。

### 2.3 每轮具备独立验收标准

每个对话都给出了明确的验证标准。例如：

- 第1轮验证 Evidence 唯一定义、fast/deep 路由分流、TypeScript 编译通过。
- 第2轮验证策略裁决、sections/promptHint/maxTokens 输出符合预期。
- 第3轮验证专家注册表、AnalysisContext 读写和跨轮 activeExperts 保持。
- 第4轮验证专家过滤、reasoning prompt 注入、报告格式生成和默认格式推导。
- 第5轮验证 cache hit、kbGeneration 淘汰和缓存命中模拟流式。
- 第6轮验证 turnHistory 采集、TTL 自适应和路径质量信号。
- 第7轮验证 L2 AuditLog、traceId 串联、L1 debug trace、微调导出。

这有利于每轮独立收敛。

### 2.4 后端优先的边界比较稳

主 Plan 明确不优先改前端、不引入 worldline/L0-L4/VerdictRegistry/CapabilityModel，不修改 Prisma Schema。这个边界能避免简化版演变成完整平台重构。

### 2.5 AnalysisContext 使用 metadata 是合理取舍

将分析上下文写入 `ChatThread.metadata`，避免新增 Prisma 模型，符合简化版目标。该设计对跨轮保存 `activeExperts`、`runtimeInputs`、`turnHistory` 足够使用。

---

## 3. 关键问题

### 3.1 执行计划与交接手册必须统一为 7 轮原子事务

此前 `co-agent-simplified-v1-execution-plan.md` 使用 7 轮拆分，而 `co-agent-conversation-handoff.md` 使用 5 对话拆分。复核后确认：5 对话版本虽然减少上下文切换，但合并了不同业务原子闭包，容易造成事务边界不清。

| 原子闭包 | 7 轮版本 | 5 对话压缩后的风险 |
|------|----------|----------------|
| 响应裁决闭包 | 第 2 轮 | 与领域上下文闭包混在一起，审计 action 和验证标准混杂 |
| 领域上下文闭包 | 第 3 轮 | 与 ResponseStrategy 共享同一轮但业务语义不同 |
| 领域消费闭包 | 第 4 轮 | 保持独立，风险可控 |
| 语义缓存闭包 | 第 5 轮 | 与演化闭环混在一起，缓存未稳定时就接入学习逻辑 |
| 演化闭环闭包 | 第 6 轮 | 与缓存闭包共享 stream/route.ts，容易出现半成品 hook |
| 审计管线闭包 | 第 7 轮 | 必须保持最后独立执行 |

建议以 7 轮原子事务版本为准，因为它保证每轮都是可提交、可验证、可审计、可恢复的工程功能闭包。

建议修正：

- 保留 `co-agent-simplified-v1-execution-plan.md` 作为原子事务拓扑权威；
- 将 `co-agent-conversation-handoff.md` 改为 7 轮交接手册；
- 在所有后续 specs/tasks/checklist 中使用“第N轮”而不是“对话N”作为执行编号。

### 3.2 主 Plan 的“不做报告服务”与第4轮报告服务冲突

主 Plan 中的边界说明包含“不做独立的分析报告模板引擎”，但第4轮明确要求：

- 新建 `src/services/report-generator.ts`
- 新建报告下载 API
- 增加 `docx`、`exceljs`、`pdfmake`
- 支持 `md|pdf|docx|xlsx`

这会导致执行者误判报告服务是否应该实现。

建议修正为：

> 不做复杂报告模板引擎，但实现轻量级 `report-generator` 服务，基于现有消息内容、DisplayContent 和 AnalysisContext 生成 md/pdf/docx/xlsx 下载结果。

这样既保留主 Plan 的简化边界，也不否定第4轮的交付内容。

### 3.3 三层审计边界与旧 traceId 规则存在冲突

交接手册第7轮要求：

- L2 运行时审计写高层事件到 AuditLog。
- 节点级 `NODE_START/NODE_END/LLM_CALL` 不写 DB，只写 console/file 或进入 L1 debug trace。

但项目历史规则中的 traceId 章节曾要求 Agent 节点事件写入 AuditLog。这和三层审计的新边界冲突。

从架构角度，应采用第7轮的新边界：

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

### 3.4 第7轮容易把 L1 与 L2 混在一起

`agent-audit-logger.ts` 是历史混合式日志器。第7轮要求对它“修改升级”，这可以接受，但必须防止它继续膨胀成万能日志器。

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

## 4. 各轮原子事务评审

### 4.1 第1轮：基础闭包

第1轮是所有后续工作的地基，必须单独执行并单独验证。

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

### 4.2 第2轮：响应裁决闭包

ResponseStrategy 应单独成轮，因为它的原子目标是替换 response.ts 的硬编码分支，并建立自声明策略裁决机制。

核心价值：

- 将 response.ts 中硬编码三段分支替换为 StrategyDescriptor registry。
- 将 sections、promptHint、maxTokens 等回复策略集中管理。
- 为后续专家 outputSections 修饰器提供裁决入口。

主要风险：

- 策略注册表退化为 switch/case。
- response.ts 同时承载过多后续专家逻辑。
- DisplayContent.sections 扩展不完整导致类型不闭合。

### 4.3 第3轮：领域上下文闭包

ExpertRegistry 与 AnalysisContext 应单独成轮，因为它们解决的是“专家是什么、激活状态存在哪里、跨轮如何恢复”，不是回复策略裁决。

核心价值：

- 建立 `ANALYSIS_EXPERTS` 注册表。
- 建立 AnalysisContext 跨轮记忆。
- 将 activeExperts/runtimeInputs/turnHistory 写入 ChatThread.metadata。

主要风险：

- `stream/route.ts` 历史改动较多，接入 AnalysisContext 时不能覆盖已有流式事件总线逻辑。
- `ChatThread.metadata` 读写必须做类型守卫，不能假设 metadata 永远是对象。

### 4.4 第4轮：领域消费闭包

第4轮是第一个高风险业务消费阶段，因为它跨越 retrieval、reasoning、response、service、API route 和 package.json。

核心价值：

- activeExperts 参与 RAG evidenceFilter。
- activeExperts 参与 reasoning prompt 维度注入。
- activeExperts 参与 response sections 合并。
- 提供报告下载 API。

主要风险：

- 新增 `docx/exceljs/pdfmake` 会改变依赖树。
- 报告 API 不能凭空假设 ChatMessage 数据结构。
- retrieval 的 ChromaDB filter 能力需要依据现有客户端实际 API 实现。

### 4.5 第5轮：语义缓存闭包

SemanticCache 应单独成轮，因为它解决的是“结果复用、TTL、LRU、kbGeneration 淘汰和 cache_hit SSE”，不是策略演化。

核心价值：

- 相同问题复用缓存，降低 LLM 调用成本。
- kbGeneration 变更后惰性淘汰缓存。
- cache_hit 时模拟流式输出，保持前端体验一致。

主要风险：

- 缓存 key 如果不包含 activeExperts，会出现跨专家误命中。
- 缓存 key 如果不包含 kbGeneration，会出现知识库更新后仍返回旧答案。
- 本轮不能留下空 hook；导出的 TTL 数据结构必须有真实行为。

建议缓存 key 至少包含：

```text
normalizedQuery + intent + sorted(activeExperts) + kbGeneration
```

### 4.6 第6轮：演化闭环闭包

EvolutionLoop 应单独成轮，因为它消费缓存、AnalysisContext 和 ResponseStrategy 的运行数据，目标是形成策略自适应闭环。

核心价值：

- 从 turnHistory 和 path metrics 中学习策略调整信号。
- 根据缓存过期后的结果稳定性调整 TTL。
- 为 ResponseStrategy 提供 execution quality 信号。

主要风险：

- 与缓存闭包合并会导致缓存尚未稳定就接入学习逻辑。
- `stream/route.ts` 同时承载缓存与演化逻辑时容易出现职责混杂。
- TTL 自适应如果没有上下限，会导致缓存过长或过短。

### 4.7 第7轮：三层审计管线闭包

第7轮放在最后是正确的。只有业务路径稳定后，审计点才知道应该挂在哪里。

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

建议先做一个文档收敛补丁，再开始第1轮实现。

### 5.1 文档收敛补丁

需要修正：

1. `co-agent-conversation-handoff.md`
   - 同步为 7 轮原子事务交接手册，与 execution-plan 的 7 轮拓扑一致。
2. `co-agent-simplified-v1.md`
   - 修正报告服务边界说明。
3. `co-agent-audit-pipeline/spec.md`
   - 明确 Step 8 采用新三层边界，覆盖旧节点级 DB 写入策略。
4. 各 `tasks.md` / `checklist.md`
   - 增加前置条件、禁止项、验证命令，并使用第N轮编号。

### 5.2 代码执行顺序

文档收敛后，按以下顺序执行：

```text
第1轮 → 第2轮 → 第3轮 → 第4轮 → 第5轮 → 第6轮 → 第7轮
```

每一轮完成后必须：

- 运行 `npx tsc --noEmit`。
- 按 checklist 验证。
- 调用 `record_dev_operation` 记录 ADD-7 审计。
- 在进入下一对话前查询相关审计日志确认上游完成。

---

## 6. 推荐增加的统一执行约束

建议在每个 farm-agent spec 的 `tasks.md` 中增加如下章节。

### Preconditions

```markdown
## Preconditions

- 已执行 session-init SKILL。
- 已执行 add-paradigm SKILL。
- 上游轮次对应 ADD-7 审计记录存在。
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
- 当前轮次要求的 ADD-7 record_dev_operation 已记录
```

---

## 7. 最终建议

该方案可以作为后续 farm-agent演进的执行基准，但应先完成文档收敛。当前最需要修正的是：

1. 统一为 7 轮原子事务拆分。
2. 明确轻量报告服务是否属于计划范围。
3. 明确三层审计中的 L1/L2 边界，避免节点级事件继续污染生产 AuditLog。
4. 在 specs 中补充禁止项和验证项，防止后续轮次误改前端、Schema 或 stream-bus。

完成上述修正后，再从第1轮开始实施，整体风险可控。