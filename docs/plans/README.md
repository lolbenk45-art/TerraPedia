# 执行计划

本目录保存已经确认、准备执行或正在执行的任务级计划。计划应能直接指导一个有限任务的实施、验收和回滚判断。

## 和其他目录的区别

- `docs/plans/`：当前任务可执行计划。
- `project-plan/active/`：项目级里程碑和长期计划。
- `project-plan/archive/`：历史计划。
- `project-plan/plan-/`：历史 legacy cluster，禁止批量移动；如需处理必须单独计划和引用审计。
- `task/`：本地过程上下文，不保存最终决策。

## 边界

- 新增 task-level plan 放这里，必须包含目标、范围、执行步骤和验证方式。
- 项目级 SOP、总览、长期 milestone 仍归 `project-plan/`。
- 审计结论放 `docs/audits/`，运行手册放 `docs/runbooks/`，项目状态和迁移记录放 `docs/project-management/`。

## 命名建议

```text
YYYY-MM-DD_english-slug_中文标题.md
```
