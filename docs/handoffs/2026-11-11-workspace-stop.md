# 分支停止与复工交接：ops/recrawl-armor-20261013

## 状态与目标

- 日期：2026-11-11；状态：用户明确停止，保留可恢复快照。负责人：后续由用户指定。
- 用户要求：先保存各分支成果并提交 GitHub，再整理本地分支和工作区；不继续原任务。
- 本记录不表示功能完成、生产验收通过或授权仍有效；不得自动执行旧计划。
- 分支：`ops/recrawl-armor-20261013`；收尾前 HEAD：`7fd4e8f90c4c65fc15cfafc15a7e5e5abfc9358d`；原 upstream：`无`。
- 原工作区：`/home/lolben/TerraPedia/.worktrees/recrawl-armor-20261013`；当前快照 HEAD 请执行 `git rev-parse HEAD`，以 Git 为准。
- 未完成分支之间本次不做业务代码合并。See git for code-level diff details.

## 已观察的成果与变更

- 收尾前历史焦点（仅为历史记录）：Armor and Buff automation code is integrated. Production automatic-ingestion acceptance remains disabled until each domain has a real source delta and fresh exact authorization. Buff's latest current-Wiki replay passed on isolated Redis DB18 with `production_source_delta=false`; Armor remains owner-isolated on `18104/DB14` with its source/binding gates closed. No production scheduler or formal table write was performed by this merge.
- 原始变更路径共 6 个；完整清单、压缩报告哈希与本次验证在 `docs/handoffs/2026-11-11-workspace-stop.inventory.json`。

- `pipelines/automation`：4 个既有变更路径。
- `data/generated`：1 个既有变更路径。
- `data/standardized`：1 个既有变更路径。

既有最近提交：

- `7fd4e8f9 fix(armor): accept live attribute headers`
- `844c3668 Merge branch 'feat/automation-domain-shimmer'`
- `4481cae3 docs(devlog): record Buff integration checkpoint`
- `4e8ebbb3 chore(automation): integrate Buff domain lane`
- `67536d30 chore(automation): integrate Armor domain lane`
- `59fff90a fix(buff): restore local runtime acceptance APIs`

源码复工入口：

- `pipelines/automation/automation-database-contract.mjs`
- `pipelines/automation/automation-database-contract.test.mjs`
- `pipelines/automation/mysql-automation-acceptance-adapter.mjs`
- `pipelines/automation/run-live-automation-acceptance.mjs`

## 计划、历史证据与未完成项

- 完整旧交接索引：`docs/devlog/archive/2026-11-11/ops--recrawl-armor-20261013-current-before-stop.md`。这是停止前的历史快照，不再是当前执行入口。
- 原有条目保留了历史验证、阻塞、复审和风险。本次仅以用户停止原因关闭仍开放的条目，不宣称解决其中问题。
- 本分支可见的业务状态与授权可能早已过期；当前运行态、数据库计数和集成正确性尚未重新验证。

- 按历史 current 索引与原有条目定位；不将旧计划视为继续执行授权。

停止前开放条目（最近 12 个；完整列表见 inventory）：

- `docs/devlog/entries/2026-09-22-automation-ingestion-plan-repair.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-24-armor-frozen-candidate-continuation.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-24-canonical-ownership-execution.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-26-armor-secondary-projection-continuation.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-27-armor-image-cache-continuation.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-28-armor-source-semantics-continuation.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-29-armor-qualified-cell-diagnostics.md`（停止前状态：`ready-for-commit`）
- `docs/devlog/entries/2026-09-29-armor-set-source-evidence-contract.md`（停止前状态：`ready-for-commit`）
- `docs/devlog/entries/2026-09-29-automation-domain-buff.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-29-automation-domain-shimmer-runtime-preflight.md`（停止前状态：`blocked`）
- `docs/devlog/entries/2026-09-29-buff-bounded-landing-contract.md`（停止前状态：`blocked`）
- `docs/devlog/entries/2026-09-30-armor-closure-gap-audit.md`（停止前状态：`active`）

## 本次验证与限制

- `git diff --check` / 暂存后 `git diff --cached --check` 在提交前执行并记录到本地操作日志。
- 修改的 JavaScript 语法检查：4 个；JSON 解析：2 个。
- 未运行完整功能测试、Maven 全量回归、前端构建、数据库写入、爬虫或 scheduler；这是停止快照，不是发布。
- 本次语法/JSON 检查未发现失败。

## 本地证据与大型文件恢复

- 原工作区的非重建型忽略文件、配置和 `.local` 证据，在移除工作区前单独校验保存至主目录 `.local/tmp/workspace-closeout-20261111/preserved-worktrees/ops--recrawl-armor-20261013/`；这些含机器状态的文件不上传 GitHub。
- 已压缩的大型报告：0 份；原路径、gzip 路径、原始 SHA-256 见 inventory。复工需要原 JSON 时，在对应分支执行 `gzip -dk <报告.json.gz>`，再核对清单中的 SHA-256。
- 运行日志保存在上述本地目录；GitHub 分支提供源码、文档、非敏感可提交报告及压缩报告，不能替代本地配置和数据库。
- MySQL 仅处理主目录 `.local/tmp/mysql-full-recrawl-20261013`：目标 `D:\Mysql\TerriaData`；最终归档结果见 main 分支清理交接。其他主目录 `.local` 内容保留。
- GitHub 实际推送与远端哈希核对结果，以 main 分支的总交接及本地结果清单为准；本文件生成时不预先宣称已推送。

## 安全复工步骤

1. `git fetch origin`，然后 `git worktree add .worktrees/resume-ops--recrawl-armor-20261013 -b resume/ops--recrawl-armor-20261013 origin/ops/recrawl-armor-20261013`。
2. 阅读 `AGENTS.md`、current spec、workflow、本文件、inventory 和历史索引；明确用户的新目标后创建 active devlog。
3. 按需恢复已压缩报告和本地配置；不要复制过期 token、permit、决策或 Redis/MySQL 状态到正式运行环境。
4. 重新检查分支差异、依赖、运行进程、数据库目标及历史未解决问题；先做对应最小测试，再考虑集成或执行。
5. 任何数据库写入、scheduler/crawler 启动和旧决策重放均需重新满足现行授权门禁。
