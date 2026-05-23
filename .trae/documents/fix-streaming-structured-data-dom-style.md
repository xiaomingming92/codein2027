# 流式输出结构化数据 DOM 样式丢失 + 文本重复修复计划

## 一、问题根因

### 问题 A：结构化数据 DOM 样式丢失

流式输出结束后，消息中的结构化数据 section（证据链、建议行动、风险提示、置信度）以纯文本形式渲染，丢失了对应的专用 DOM 组件样式。

**数据链路追踪**：

```
response.ts 构建完整 structuredResponse（含 evidenceChain/reasoningPath/verdict/interactionPoint/displayContent）
  → emitStreamEvent({ type: "structured_update", data: { displayContent } })   ← 只发送了 displayContent！
  → SSE 推送到前端
  → chat-panel.tsx: updateLastAssistantStructuredData(targetThreadId, parsed.data)
  → message.structuredData = { displayContent: {...} }                         ← 只有 displayContent
  → StructuredResponseRenderer 渲染:
    → evidenceChain = undefined → if (section.type === "evidence" && evidenceChain) → false → 纯文本回退
    → verdict = undefined       → if (section.type === "confidence" && verdict) → false → 纯文本回退
    → verdict = undefined       → if (section.type === "risk" && verdict) → false → 纯文本回退
    → 所有结构化 section 回退到默认纯文本渲染 <p>{section.content}</p>          ← DOM 样式丢失！
```

**核心矛盾**：`response.ts` 第 177-190 行已构建完整 `structuredResponse`，但第 192-195 行 `structured_update` 事件只传了 `{ displayContent }`。

### 问题 B：GUI 文本重复显示

流式输出结束后，用户看到回复文本出现两次：

```
您好！关于您输入的"1"...          ← displayContent.summary 渲染

回复                              ← conclusion section title

您好！关于您输入的"1"...          ← conclusion section.content 再次渲染

证据链 / 建议行动 / 风险提示 / 置信度
```

**数据链路追踪**：

```
buildDisplayFromState() 构建:
  displayContent.summary = streamedText.trim()          ← 完整回复文本
  sections[0] = {
    type: "conclusion",
    title: "回复",
    content: streamedText.trim(),                       ← 同样的完整回复文本！
    dataRef: "streamed",
  }

StructuredResponseRenderer 渲染:
  <p>{displayContent.summary}</p>                       ← 第一次渲染文本
  sections.map(section => <SectionRenderer>)            ← 第二次渲染同一文本
```

**根因**：`displayContent.summary` 和 `sections[0]`（type: "conclusion", dataRef: "streamed"）包含完全相同的文本内容。

### 问题 C：中间节点 structured_update 污染上一轮消息

中间节点（retrieval、reasoning、verdict）在当前轮 assistant 消息创建之前发射 `structured_update`，`updateLastAssistantStructuredData` 会错误更新上一轮 assistant 消息的 `structuredData`。

---

## 二、修复方案

### Fix 1: response.ts — 发送完整 structuredResponse（P0）

**文件**: `src/agents/nodes/response.ts`

**当前代码**（第 192-195 行）：
```typescript
emitStreamEvent(traceId, {
  type: "structured_update",
  data: { displayContent },
})
```

**修改为**：
```typescript
emitStreamEvent(traceId, {
  type: "structured_update",
  data: {
    evidenceChain: structuredResponse.evidenceChain,
    reasoningPath: structuredResponse.reasoningPath,
    verdict: structuredResponse.verdict,
    interactionPoint: structuredResponse.interactionPoint,
    worldLines: structuredResponse.worldLines,
    displayContent: structuredResponse.displayContent,
  },
})
```

**原理**：`structuredResponse` 在第 177-190 行已构建完毕，字段格式与 `StructuredAgentResponse` 类型完全匹配（camelCase），可直接传给 `StructuredResponseRenderer` 渲染。

### Fix 2: response.ts — 消除 displayContent.summary 与 conclusion section 的文本重复（P0）

**文件**: `src/agents/nodes/response.ts` — `buildDisplayFromState` 函数

**当前代码**：
```typescript
sections.push({
  type: "conclusion",
  title: "回复",
  content: streamedText.trim(),
  expandable: false,
  dataRef: "streamed",
})
```

**修改方案**：删除此 "conclusion" section。`displayContent.summary` 已承担展示回复文本的职责，无需再添加一个内容完全相同的 section。

**修改后 `buildDisplayFromState` 逻辑**：
```typescript
function buildDisplayFromState(...): DisplayContent {
  const sections: DisplayContent["sections"] = []

  // 不再添加 type: "conclusion" / dataRef: "streamed" 的 section
  // displayContent.summary 已负责展示流式回复文本

  if (evidenceChain.evidences.length > 0) {
    sections.push({
      type: "evidence",
      title: "证据链",
      content: evidenceChain.evidences.map((e) => `[${e.source}] ${e.content.slice(0, 100)}`).join("\n"),
      expandable: true,
      dataRef: "evidenceChain",
    })
  }

  // ... 剩余 sections 不变（建议行动、风险提示、置信度、交互点）
  
  return { summary: streamedText.trim(), sections }
}
```

**原理**：从数据源消除重复，比在渲染器中过滤更可靠。

### Fix 3: chat-panel.tsx — 防止中间节点 structured_update 污染上一轮消息（P1）

**文件**: `src/components/chat/chat-panel.tsx`

**当前代码**（约第 227-232 行）：
```typescript
if (parsed.type === "structured_update") {
  updateLastAssistantStructuredData(targetThreadId, parsed.data as Record<string, unknown>)
  if (parsed.data.reasoningPath?.steps) {
    setStreamingReasoningSteps(parsed.data.reasoningPath.steps)
  }
}
```

**修改为**：
```typescript
if (parsed.type === "structured_update") {
  if (hasFirstToken) {
    updateLastAssistantStructuredData(targetThreadId, parsed.data as Record<string, unknown>)
  }
  if (parsed.data.reasoningPath?.steps) {
    setStreamingReasoningSteps(parsed.data.reasoningPath.steps)
  }
  if (parsed.data.evidenceChain && !hasFirstToken) {
    setStreamingEvidenceFromStructured(parsed.data.evidenceChain)
  }
  if (parsed.data.verdict && !hasFirstToken) {
    setStreamingVerdict(parsed.data.verdict)
  }
}
```

**原理**：`hasFirstToken` 标志当前轮 assistant 消息已创建。中间节点发射的 `structured_update` 在 `hasFirstToken` 之前到达时，不更新 `structuredData`（防止污染上一轮），但仍更新流式 UI 状态。

### Fix 4: chat-store.ts — 新增 Store 方法（P1）

**文件**: `src/stores/chat-store.ts`

新增方法：
```typescript
setStreamingEvidenceFromStructured: (evidenceChain: Record<string, unknown>) => void
setStreamingVerdict: (verdict: Record<string, unknown>) => void
```

`setStreamingEvidenceFromStructured` 实现：
- 从 `evidenceChain.evidences` 中提取 `id/source/type/relevance/summary` 构建 `StreamingEvidence[]`
- 仅在当前 `streamingEvidence` 中不存在相同 id 时追加（去重，避免与 `evidence_found` 事件重复）

`setStreamingVerdict` 实现：
- 从 verdict 数据构建状态文字（如 `"裁决完成, 置信度 85%"`)
- 更新 `streamingStatus`

---

## 三、修复步骤（按依赖顺序）

| Step | 文件 | 改动 | 优先级 | ADD targetType |
|------|------|------|--------|---------------|
| 1 | `src/agents/nodes/response.ts` | `structured_update` 事件 data 扩展为完整 structuredResponse 字段 | P0 | COMPONENT |
| 2 | `src/agents/nodes/response.ts` | `buildDisplayFromState` 删除重复的 conclusion section | P0 | COMPONENT |
| 3 | `src/stores/chat-store.ts` | 新增 `setStreamingEvidenceFromStructured`、`setStreamingVerdict` 方法 | P1 | COMPONENT |
| 4 | `src/components/chat/chat-panel.tsx` | `structured_update` handler 增加 `hasFirstToken` 守卫 + 流式状态更新 | P1 | COMPONENT |
| 5 | 全链路验证 | 发消息 → 确认无文本重复 + EvidenceChainPanel/RiskDetailPanel/ConfidenceBreakdown 正确渲染 | P0 | - |

---

## 四、验证方法

### 4.1 编译验证

```bash
npx tsc --noEmit
```

### 4.2 手动交互验证

1. 发送消息（如 "1"）
2. ✅ 确认回复文本只出现一次（不重复）
3. ✅ 确认流式结束后：
   - 证据链 → EvidenceChainPanel 渲染（可折叠、可靠性/关联性进度条、查看原文按钮）
   - 建议行动 → 正确渲染
   - 风险提示 → RiskDetailPanel 渲染（LOW/MEDIUM/HIGH 标签、概率、影响）
   - 置信度 → ConfidenceBreakdown 渲染（进度条、分解因子、折扣详情）
4. ✅ 刷新页面 → 结构化数据仍然完整渲染
5. ✅ 发送第二条消息 → 确认上一轮结构化数据不被损坏

### 4.3 ADD 审计验证

每个 Step 完成后调用 `record_dev_operation`。

---

## 五、影响范围

| 影响 | 说明 |
|------|------|
| 修改文件 | 4 个：response.ts, chat-store.ts, chat-panel.tsx（structured-response-renderer.tsx 不需修改） |
| 新增方法 | 2 个：setStreamingEvidenceFromStructured, setStreamingVerdict |
| 向后兼容 | 是，structured_update 事件格式扩展，旧字段不变 |
| 文本重复 | Fix 2 从数据源消除，不依赖渲染器过滤 |

---

*本规划版本: v2.0*
*创建日期: 2026-05-15*
