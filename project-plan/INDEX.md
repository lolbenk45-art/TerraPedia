# Project Plan Index

本索引用来减少 `project-plan/` 历史文档噪音。`project-plan/` 是项目级源头：SOP、项目总览、长期里程碑、当前项目计划和历史项目计划归这里管理。

## 当前规则

- 新的项目级长期计划放入 `project-plan/active/`。
- 已完成、已废弃、只做参考的计划放入 `project-plan/archive/`。
- 任务级执行计划优先放入 `docs/plans/`。
- 审计结论放 `docs/audits/`，项目状态和迁移记录放 `docs/project-management/`，运行流程放 `docs/runbooks/`。
- 本地过程材料放入 `task/`，不要作为最终决策来源。

## 当前仍应优先参考

- `00_协作开发标准流程.md`
- `00_项目总览.md`
- `03_架构设计.md`
- `04_开发工作流.md`
- `10_文档体系.md`
- `TerraPedia_relation_replace_local_issue_log_2026-04-25.md`：仍被 relation/item cutover 后续计划引用，暂留根目录。

## 已整理区域

- 2026-05-14：根目录下已完成的 dated milestone、执行记录、旧 V1.0 文档已归档到 `archive/2026-03/`、`archive/2026-04/`、`archive/v1/`。
- 根目录只保留当前优先参考文档、基础项目规则、`INDEX.md` 和仍被后续计划引用的活跃 issue log。

## 待整理区域

- `plan-/` 是历史 legacy cluster，禁止批量移动；如需整理，必须另开计划、先做引用审计、一次只处理明确子集。
- `archive/` 内历史正文可能保留旧绝对路径或旧根目录引用；除非它们影响当前入口索引或当前可执行指引，不批量改写历史记录。

## 新增文档要求

新增计划前先判断：

1. 是否是项目级长期计划。如果是，放 `project-plan/active/`。
2. 是否是任务级执行计划。如果是，放 `docs/plans/`。
3. 是否只是过程记录。如果是，放 `task/<date>_<topic>/docs/`。
4. 是否是历史资料整理。如果涉及 `project-plan/plan-/**` 或 `project-plan/archive/**` 正文，默认只更新索引和面包屑，不批量改写正文路径。
