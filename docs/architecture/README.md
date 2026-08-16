# 架构文档

本目录保存当前仍有效的架构规则、结构设计和工程约束。这里记录“系统如何组织和约束”，不保存任务执行计划、项目状态日报或历史项目计划。

## 当前入口

- [项目结构 v2 基线](./project-structure-v2.md)：物理迁移后的顶层边界、目标树、退役入口和 no-recreate/no-write 规则。
- [Deployable components](./deployable-components.md)：apps、services、packages、pipelines、platform 和 agent 的运行时边界与依赖方向。
- [项目结构迁移 inventory](../audits/structure/project-structure-inventory-2026-08-16.md)：2026-08-16 的目录职责、状态与引用计数快照。
- [项目结构重设计方案](./project-structure-redesign-2026-04-27.md)：历史设计记录，当前规则以 v2 基线为准。
- [文件创建与目录落位规则](./file-placement-rules.md)
- [数据与证据边界](./data-evidence-boundaries.md)
- [前端导航组件架构](./frontend/navigation-components.md)：旧前台导航文档迁移后的当前架构入口。

## 落位规则

- 当前有效的结构规则、边界定义、目录职责和跨模块约束放在这里。
- 任务级执行计划放 `docs/plans/`，项目级长期计划和 SOP 放 `docs/project-governance/`。
- 已过期的架构讨论不要继续放这里，应迁入 `docs/project-governance/archive/` 或保留在原历史位置并由索引标注。
- 临时分析先放 `task/<date>_<topic>/docs/`，确认后再提升到本目录。
