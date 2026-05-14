# Documentation

本目录保存当前仍有效、需要长期追溯的项目文档。`docs/` 是按文档职责分类的长期知识库，不是项目级计划的唯一事实源，也不保存一次性过程上下文。

## 子目录

- `architecture/`：架构设计、目录结构、文件落位规则；入口见 [architecture/README.md](./architecture/README.md)。
- `audits/`：长期保留的审计报告；入口见 [audits/README.md](./audits/README.md)。
- `plans/`：任务级执行计划；入口见 [plans/README.md](./plans/README.md)。
- `project-management/`：项目状态、决策、风险和迁移记录；入口见 [project-management/README.md](./project-management/README.md)。
- `runbooks/`：可重复执行的运行和排障手册；入口见 [runbooks/README.md](./runbooks/README.md)。
- `research/`：调研材料。
- `superpowers/`：Superpowers 工作流产出的规格和计划。

## 规则

- 项目级长期计划、SOP、总览和历史项目计划归 `project-plan/` 管理。
- 任务级、可执行、可验收的计划放 `docs/plans/`。
- 临时过程材料先放 `task/`。
- 可重新生成的运行输出放 `reports/runtime/`。
- 最终规则、计划、审计结论应提升到 `docs/`。

## 迁移入口

- 前端迁移计划、批次摘要和日志工具已从 `front/migration/**` 移至 [project-management/frontend-migration/](./project-management/frontend-migration/)。
- 前端导航组件文档已从 `front/src/components/README_NAVIGATION.md` 移至 [architecture/frontend/navigation-components.md](./architecture/frontend/navigation-components.md)。
