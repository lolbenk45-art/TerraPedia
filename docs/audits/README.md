# 审计报告

本目录保存需要长期追溯、可 review、可提交的审计报告。审计文档应给出结论、证据、风险和后续建议，不替代执行计划。

## 子目录

- `structure/`：项目结构、目录边界、文件治理审计。

## 当前入口

- [数据与证据兼容矩阵](./data-evidence-compatibility-matrix.md)：记录 `data/**` 和 `reports/**` 的职责、消费者、移动就绪度和验证命令。

## 落位规则

- 结论性 Markdown 报告放这里。
- 可直接执行的修复计划放 `docs/plans/`，项目级里程碑和历史计划放 `project-plan/`。
- 项目状态、决策日志和迁移记录放 `docs/project-management/`。
- 大体量 JSON、CSV、日志优先放 `task/<task>/data/` 或 `reports/runtime/`。
- 可重新生成的本地运行报告不要放这里。
