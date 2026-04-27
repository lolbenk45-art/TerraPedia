# Project Plan Index

本索引用来减少 `project-plan/` 历史文档噪音。

## 当前规则

- 新的项目级长期计划放入 `project-plan/active/`。
- 已完成、已废弃、只做参考的计划放入 `project-plan/archive/`。
- 任务级执行计划优先放入 `docs/plans/`。
- 本地过程材料放入 `task/`，不要作为最终决策来源。

## 当前仍应优先参考

- `00_协作开发标准流程.md`
- `00_项目总览.md`
- `03_架构设计.md`
- `04_开发工作流.md`
- `10_文档体系.md`

## 待整理区域

- 根目录下大量 `TerraPedia_M*_*.md` 文件需要逐步判定是 active 还是 archive。
- `plan-/` 是历史批次计划聚集区，暂不批量移动，避免制造大 diff。

## 新增文档要求

新增计划前先判断：

1. 是否是项目级长期计划。如果是，放 `project-plan/active/`。
2. 是否是任务级执行计划。如果是，放 `docs/plans/`。
3. 是否只是过程记录。如果是，放 `task/<date>_<topic>/docs/`。
