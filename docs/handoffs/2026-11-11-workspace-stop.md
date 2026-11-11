# 分支停止与复工交接：feat/automation-domain-armor

## 状态与目标

- 日期：2026-11-11；状态：用户明确停止，保留可恢复快照。负责人：后续由用户指定。
- 用户要求：先保存各分支成果并提交 GitHub，再整理本地分支和工作区；不继续原任务。
- 本记录不表示功能完成、生产验收通过或授权仍有效；不得自动执行旧计划。
- 分支：`feat/automation-domain-armor`；收尾前 HEAD：`36c9299d70d535c1ab3341afd9dd444d358be01c`；原 upstream：`无`。
- 原工作区：`/home/lolben/TerraPedia/.worktrees/automation-domain-armor`；当前快照 HEAD 请执行 `git rev-parse HEAD`，以 Git 为准。
- 未完成分支之间本次不做业务代码合并。See git for code-level diff details.

## 已观察的成果与变更

- 收尾前历史焦点（仅为历史记录）：Armor scheduler durable-state recovery and disabled control configuration are confirmed on 18104/DB14. The real Armor T1 isolated acceptance now passes against run-derived local/maint/relation schemas with DB13 cleanup verified. Buff is managed separately on 18105/DB15. The next production Armor gate remains a real source change and a fresh exact binding/authorization scope.
- 原始变更路径共 570 个；完整清单、压缩报告哈希与本次验证在 `docs/handoffs/2026-11-11-workspace-stop.inventory.json`。

- `reports/authorization`：568 个既有变更路径。
- `reports/domain`：1 个既有变更路径。

既有最近提交：

- `36c9299d feat(armor): harden automatic ingestion and isolated chain`
- `6d7921cf docs(armor): reject legacy image substitutes`
- `c41858e3 docs(armor): block incomplete image landing promotion`
- `9a8dc093 fix(armor): bind image set denominator to module evidence`
- `5a31e6d8 fix(armor): reject duplicate Shroomite set effects`
- `6c195143 fix(armor): enforce versioned Shroomite semantics`

源码复工入口：

- 本次快照没有未提交源码路径；查看下列既有提交。

## 计划、历史证据与未完成项

- 完整旧交接索引：`docs/devlog/archive/2026-11-11/feat--automation-domain-armor-current-before-stop.md`。这是停止前的历史快照，不再是当前执行入口。
- 原有条目保留了历史验证、阻塞、复审和风险。本次仅以用户停止原因关闭仍开放的条目，不宣称解决其中问题。
- 本分支可见的业务状态与授权可能早已过期；当前运行态、数据库计数和集成正确性尚未重新验证。

- 按历史 current 索引与原有条目定位；不将旧计划视为继续执行授权。

停止前开放条目（最近 12 个；完整列表见 inventory）：

- `docs/devlog/entries/2026-08-23-remaining-closure-item-decision-checklist.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-08-31-automation-scheduler-activation-handoff.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-19-automation-scheduler-authorization-list.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-22-automation-ingestion-plan-repair.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-24-armor-frozen-candidate-continuation.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-24-canonical-ownership-execution.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-26-armor-secondary-projection-continuation.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-27-armor-image-cache-continuation.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-28-armor-source-semantics-continuation.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-29-armor-qualified-cell-diagnostics.md`（停止前状态：`ready-for-commit`）
- `docs/devlog/entries/2026-09-29-armor-set-source-evidence-contract.md`（停止前状态：`ready-for-commit`）
- `docs/devlog/entries/2026-09-30-armor-closure-gap-audit.md`（停止前状态：`active`）

## 本次验证与限制

- `git diff --check` / 暂存后 `git diff --cached --check` 在提交前执行并记录到本地操作日志。
- 修改的 JavaScript 语法检查：0 个；JSON 解析：568 个。
- 未运行完整功能测试、Maven 全量回归、前端构建、数据库写入、爬虫或 scheduler；这是停止快照，不是发布。
- 本次语法/JSON 检查未发现失败。

## 本地证据与大型文件恢复

- 原工作区的非重建型忽略文件、配置和 `.local` 证据，在移除工作区前单独校验保存至主目录 `.local/tmp/workspace-closeout-20261111/preserved-worktrees/feat--automation-domain-armor/`；这些含机器状态的文件不上传 GitHub。
- 已压缩的大型报告：21 份；原路径、gzip 路径、原始 SHA-256 见 inventory。复工需要原 JSON 时，在对应分支执行 `gzip -dk <报告.json.gz>`，再核对清单中的 SHA-256。
- 运行日志保存在上述本地目录；GitHub 分支提供源码、文档、非敏感可提交报告及压缩报告，不能替代本地配置和数据库。
- MySQL 仅处理主目录 `.local/tmp/mysql-full-recrawl-20261013`：目标 `D:\Mysql\TerriaData`；最终归档结果见 main 分支清理交接。其他主目录 `.local` 内容保留。
- GitHub 实际推送与远端哈希核对结果，以 main 分支的总交接及本地结果清单为准；本文件生成时不预先宣称已推送。

## 安全复工步骤

1. `git fetch origin`，然后 `git worktree add .worktrees/resume-feat--automation-domain-armor -b resume/feat--automation-domain-armor origin/feat/automation-domain-armor`。
2. 阅读 `AGENTS.md`、current spec、workflow、本文件、inventory 和历史索引；明确用户的新目标后创建 active devlog。
3. 按需恢复已压缩报告和本地配置；不要复制过期 token、permit、决策或 Redis/MySQL 状态到正式运行环境。
4. 重新检查分支差异、依赖、运行进程、数据库目标及历史未解决问题；先做对应最小测试，再考虑集成或执行。
5. 任何数据库写入、scheduler/crawler 启动和旧决策重放均需重新满足现行授权门禁。
