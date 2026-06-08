# {需求域名}-{核心内容}-plan-v{版本号}

## PLAN 元信息

- **Plan 名称**: {英文名}-{序号}
- **启动时间**: {ISO 时间戳}
- **主导 AI**: {AI 助手标识}
- **关联文档**:
  - Execution: `.trae/plans/{需求域名}-{核心内容}-execution-v{版本}.md`
  - Handoff: `.trae/plans/{需求域名}-{核心内容}-handoff-v{版本}.md`
  - Review: `.trae/reviews/{需求域名}-review-v{版本}.md`
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| path/to/file.ts | COMPONENT | COMPONENT_CREATED | 描述改前状态 | 描述改后状态 | 待实施 |

---

## 一、背景与目标

### 1.1 问题现状

### 1.2 目标

---

## 二、方案选型（如有多个候选方案）

### 2.1 候选方案对比

| 方案 | 因素1 | 因素2 | 因素3 | 结论 |
|------|-------|-------|-------|------|
| A: xxx | | | | |
| B: xxx | | | | |

### 2.2 选型理由

---

## 三、架构设计

---

## 四、实施步骤 + 依赖图

```
Task 1 ──┐
          │ 可并行
Task 2 ──┘
          │
          ▼
Task 3 ──┐
Task 4 ──┤ 可并行
Task 5 ──┘
          │
          ▼
Task 6 (编译/测试)
```

### Step 0: 文档先行

### Step N: ...

---

## 五、验收标准

- [ ] 标准1
- [ ] 标准2

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| Execution | `.trae/plans/...` |
| Handoff | `.trae/plans/...` |
| Review | `.trae/reviews/...` |
| Spec | `.trae/specs/{name}/spec.md` |
| Tasks | `.trae/specs/{name}/tasks.md` |
| Checklist | `.trae/specs/{name}/checklist.md` |
