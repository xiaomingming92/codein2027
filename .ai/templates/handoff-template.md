# Handoff 模板

本项目提供两种 Handoff 模板，根据变更复杂度选择：

| 模板 | 文件 | 适用场景 |
|------|------|---------|
| **单轮 Handoff** | [handoff-single-round-template.md](./handoff-single-round-template.md) | 单轮变更：Bug 修复、单次 API 改动、基础设施调整 |
| **多轮 Handoff** | [handoff-multi-round-template.md](./handoff-multi-round-template.md) | 多轮原子事务：管线演进、多阶段架构重构 |

规则详情见 `.trae/rules/project_rules.md` → ADD-8 → Handoff 文件格式要求。
