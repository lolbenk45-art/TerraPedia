# TerraPedia 仓库目录整理第二轮设计稿
- Date: `2026-04-12`
- Scope: `repo-root / reports / scripts/dev / scripts/data / back`
- Status: `draft-for-review`
- Direction: `归位 + 防回潮`

## 1. 背景与目标

第一轮整理已经把仓库根目录收敛到核心目录与入口文件，但 `reports/` 仍然承担了过多不同类型的输出，且部分脚本默认仍把结果直接写到 `reports/` 根目录。这样会导致两个问题：

- 现有目录会再次变乱，整理结果不可持续。
- 某些消费报告的代码只认旧位置，后续目录下沉后可能读不到文件。

本轮目标不是重写整个仓库文档体系，而是在不打断现有开发的前提下，完成一轮“可持续”的目录整顿：

- 把 `reports/` 根目录的散落文件收进固定子目录。
- 修正会继续向 `reports/` 根目录写文件的脚本默认输出。
- 让消费报告的后端代码兼容新的目录落点。
- 把明显的本地工作缓存排除出版本控制噪音。

本轮成功的标志是：

- 仓库根目录继续保持极简。
- `reports/` 顶层只保留少量稳定分类目录。
- benchmark 与 town NPC 报告不会再默认回流到 `reports/` 根目录。
- 管理端读取 town NPC maintenance 报告的能力不因目录调整而失效。
- `git status --short` 不再被 `.superpowers/` 污染。

## 2. 本次范围

本轮只覆盖以下内容：

- `reports/` 根目录的现有散落文件与临时目录归位。
- `scripts/dev/benchmark-read-api.ps1` 的默认输出目录调整。
- `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py` 的默认 snapshot 输出目录调整。
- `back/src/main/java/com/terraria/skills/controller/AdminTownNpcMaintenanceController.java` 的报告发现逻辑兼容。
- `.gitignore` 对 `.superpowers/` 的忽略规则补齐。

## 3. 不在本次范围

以下内容明确不在本轮内：

- `back`、`front`、`data-query-app` 业务源码目录结构重组。
- `project-plan/plan-` 历史文档树重编目。
- 所有历史报告命名规范统一重写。
- 数据脚本体系全面重构。
- 新增数据库表、配置文件格式或运行时协议。

说明：

- 本轮优先处理“明显错位且会继续回潮”的目录问题。
- 历史文档与大规模报告治理另开专题更合理，本轮不顺手扩大范围。

## 4. 当前状态诊断

### 4.1 仓库根目录现状

第一轮之后，仓库根目录已经只剩核心项目目录与入口文件，这部分状态是健康的。当前主要噪音不再来自根目录，而是来自 `reports/` 与本地缓存目录。

### 4.2 `reports/` 现状

当前 `reports/` 根目录同时混放了多种性质完全不同的文件：

- API benchmark 报告
- wiki / import / sync / audit JSON
- 接受性验证产物
- 运行时 stdout / stderr 日志
- 临时样本与临时目录
- 分析型 Markdown

这种平铺结构的问题不是“看起来乱”，而是后续脚本默认仍会继续往根目录写，导致任何一次整理都只是短期收益。

### 4.3 默认输出路径现状

已确认的两个回潮来源：

- `scripts/dev/benchmark-read-api.ps1` 默认输出到 `reports/`
- `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py` 默认 snapshot 输出到 `reports/`

这两个入口如果不改，`reports/` 根目录会持续增长。

### 4.4 报告消费侧现状

`AdminTownNpcMaintenanceController` 当前优先读取 `data/generated/wiki-town-npc-maintenance.latest.json`，如果不存在，则只扫描 `reports/` 根目录下第一层文件来找 `wiki-town-npc-maintenance-*.json` 和 `wiki-town-npc-import-*.json`。

这意味着：

- 一旦 town NPC 相关快照被收进子目录，当前管理端逻辑可能无法再发现它们。
- 目录治理不能只移动文件，必须同步修正报告发现逻辑。

### 4.5 本地缓存现状

`.superpowers/` 当前出现在仓库内，内容明显属于本地 brainstorming 产物与截图缓存，而不是项目源码。它不应继续出现在版本控制候选范围中。

## 5. 最终方案概览

本轮采用“局部分层 + 入口修正 + 消费兼容”的方案。

核心原则：

- 根目录继续保持极简，不新增新的顶层工作目录。
- `reports/` 只保留稳定分类目录，不再直接承接散落输出文件。
- 只修正已经确认会回潮的默认输出入口，不做全仓库脚本大扫除。
- 后端报告发现逻辑改成对 `reports/` 目录递归查找，以降低后续再分层时的脆弱性。

## 6. 目录规范

本轮完成后，`reports/` 顶层目标结构如下：

- `reports/local-start/`
  - 本地三端启动日志、pid、stderr/stdout
- `reports/runtime/`
  - 手工截图、崩溃日志、人工采样运行产物
- `reports/benchmarks/api-read/`
  - API 读性能基准 JSON / Markdown
- `reports/data-sync/analysis/`
  - 数据链路分析、流程总结、wiki 同步说明类 Markdown
- `reports/data-sync/imports/`
  - import / sync / coverage / refresh / suppression / consolidation 等结构化 JSON
- `reports/data-sync/wiki/`
  - town NPC maintenance / import 相关 wiki 快照
- `reports/data-sync/acceptance/`
  - 接受性验证产物，如 `multi-recipe-acceptance-*`
- `reports/tmp/`
  - `tmp-*` 文件与 `tmp-*` 目录

说明：

- `reports/local-start/` 与 `reports/runtime/` 已存在，本轮保持语义不变。
- `reports/data-sync/wiki/` 是为 town NPC maintenance 与 import 报告留出的稳定归档位。
- `reports/tmp/` 保留临时性，不把临时文件伪装成正式归档。

## 7. 现有文件迁移规则

### 7.1 Benchmark

以下文件迁移到 `reports/benchmarks/api-read/`：

- `api-read-perf-*.json`
- `api-read-perf-*.md`

### 7.2 Data Sync Analysis

以下分析型 Markdown 迁移到 `reports/data-sync/analysis/`：

- `wiki-*-summary-*.md`
- `wiki-zh-recipe-pages-*.md`
- `wiki-zh-recipe-sync-implementation-summary-*.md`
- `data-structure-library-analysis-*.md`
- `terrapedia-extracted-data-fullchain-analysis-*.md`

### 7.3 Data Sync Imports

以下结构化 JSON 迁移到 `reports/data-sync/imports/`：

- `boss-loot-import-*.json`
- `normal-npc-loot-import-*.json`
- `recipe-provider-*.json`
- `wiki-armorsetbonuses-refresh-*.json`
- `wiki-shimmer-db-import-*.json`
- `wiki-zh-recipe-import-*.json`
- `wiki-zh-recipe-source-coverage-*.json`
- `wiki-zh-recipe-sync-summary-*.json`
- `workflow-*.json`

### 7.4 Data Sync Wiki

以下 town NPC 相关快照迁移到 `reports/data-sync/wiki/`：

- `wiki-town-npc-maintenance-*.json`
- `wiki-town-npc-import-*.json`

### 7.5 Acceptance

以下文件迁移到 `reports/data-sync/acceptance/`：

- `multi-recipe-acceptance-*.json`
- `multi-recipe-acceptance-*.md`
- `multi-recipe-acceptance-*.csv`

### 7.6 Runtime Manual

以下手工运行日志迁移到 `reports/runtime/manual/`：

- `backend-run.stdout.log`
- `backend-run.stderr.log`

### 7.7 Temporary

以下临时产物迁移到 `reports/tmp/`：

- `tmp-*` 文件
- `tmp-*` 目录

## 8. 脚本默认输出调整

### 8.1 `benchmark-read-api.ps1`

默认输出目录从：

- `reports`

调整为：

- `reports/benchmarks/api-read`

要求：

- 仍允许通过参数覆盖 `-OutputDir`
- 若用户显式传入 `-OutputDir`，以显式参数为准
- 无显式参数时，脚本自动创建新的默认目录

### 8.2 `fetch-wiki-town-npc-maintenance.py`

默认 snapshot 输出目录从：

- `reports/wiki-town-npc-maintenance-<timestamp>.json`

调整为：

- `reports/data-sync/wiki/wiki-town-npc-maintenance-<timestamp>.json`

要求：

- `--snapshot-output` 仍保留最高优先级
- `data/generated/wiki-town-npc-maintenance.latest.json` 的 latest 输出位置保持不变
- 只有 snapshot 的默认归档位置发生变化

## 9. 后端兼容策略

`AdminTownNpcMaintenanceController` 的报告发现逻辑调整为以下顺序：

1. 优先读取 `data/generated/<latest-file>`
2. 若 latest 文件不存在，则在 `reports/` 下递归搜索所有常规文件
3. 过滤出满足前缀与后缀规则的快照文件
4. 以最后修改时间取最新一份

适用对象：

- `wiki-town-npc-maintenance.latest.json`
- `wiki-town-npc-import.latest.json`
- 对应的 snapshot 前缀文件

这样处理后：

- town NPC 相关快照可以稳定下沉到 `reports/data-sync/wiki/`
- 后续若 `reports/` 下继续细分层级，不需要再次回改控制器

## 10. 版本控制策略

`.gitignore` 补充：

- `.superpowers/`

目的：

- 明确该目录属于本地工作缓存，不属于项目交付物
- 避免 brainstorming 截图与中间产物继续污染 `git status`

本轮不新增对 `docs/`、`project-plan/`、`data/` 的额外忽略规则。

## 11. 实施顺序

本轮实施顺序固定如下：

1. 新建 `reports/` 目标子目录
2. 调整 `.gitignore`
3. 调整 `benchmark-read-api.ps1` 默认输出目录
4. 调整 `fetch-wiki-town-npc-maintenance.py` 默认 snapshot 输出目录
5. 调整 `AdminTownNpcMaintenanceController` 的递归查找逻辑
6. 迁移现有 `reports/` 根目录文件与临时目录
7. 验证目录结果与引用结果

这样安排的原因是：

- 先修入口，再搬历史文件，避免刚搬完又被新脚本写回旧位置
- 先修消费逻辑，再迁移 town NPC 快照，避免管理端读取瞬间失效

## 12. 风险与约束

### 12.1 主要风险

- 文件分类规则过度激进，导致个别历史报告被放错类目
- 控制器递归查找若实现不谨慎，可能误扫非目标文件或带来不必要的 I/O
- 当前工作树已存在大量未提交改动，目录整理必须避免碰到无关业务文件

### 12.2 应对策略

- 迁移只按高置信度命名前缀执行，不做模糊猜测
- 控制器只在 `reports/` 下递归查找常规文件，并继续按前缀/后缀严格过滤
- 不触碰 `back` / `front` / `data-query-app` 的其他未提交文件

## 13. 验证方式

本轮最低验证要求如下：

- 重新列出仓库根目录，确认未新增新的顶层噪音
- 重新列出 `reports/` 顶层，确认只剩分类目录
- 检查 benchmark 脚本默认输出路径文本
- 检查 town NPC 抓取脚本默认 snapshot 路径文本
- 检查后端控制器的报告发现逻辑已支持递归查找
- 运行 `git status --short`，确认 `.superpowers/` 不再继续作为未跟踪目录出现

本轮不要求启动整套本地服务，也不要求执行全量业务测试；目标是目录治理与路径兼容，不是功能开发闭环。
