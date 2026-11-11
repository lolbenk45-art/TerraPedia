# 分支停止与复工交接：feat/automation-domain-buff

## 状态与目标

- 日期：2026-11-11；状态：用户明确停止，保留可恢复快照。负责人：后续由用户指定。
- 用户要求：先保存各分支成果并提交 GitHub，再整理本地分支和工作区；不继续原任务。
- 本记录不表示功能完成、生产验收通过或授权仍有效；不得自动执行旧计划。
- 分支：`feat/automation-domain-buff`；收尾前 HEAD：`59fff90ae056b4093f36ba664e5ae4f4912bb417`；原 upstream：`无`。
- 原工作区：`/home/lolben/TerraPedia/.worktrees/automation-domain-buff`；当前快照 HEAD 请执行 `git rev-parse HEAD`，以 Git 为准。
- 未完成分支之间本次不做业务代码合并。See git for code-level diff details.

## 已观察的成果与变更

- 收尾前历史焦点（仅为历史记录）：Keep production Buff automatic-ingestion acceptance on backend `18105` and Redis `6380/DB15` disabled until a real source delta and fresh authorization. A new 9/9 source probe at 2026-10-11 09:55 CST confirms Buff current/previous/ingested fingerprint `a512db8c...` with `changed=false`; fresh production read-only preflight at 09:58 CST confirms disabled control and zero live work. The latest real current-Wiki source re-crawl and isolated T1 replay passed on Redis DB18 at 17:14 CST, but its artifact explicitly has `production_source_delta=false`; it validates the current source and isolated chain, not production changed-only dispatch. Armor remains owner-isolated on `18104/DB14`; DB16 is retained historical state only.
- 原始变更路径共 1649 个；完整清单、压缩报告哈希与本次验证在 `docs/handoffs/2026-11-11-workspace-stop.inventory.json`。

- `reports/authorization`：1339 个既有变更路径。
- `reports/domain`：174 个既有变更路径。
- `pipelines/relation`：35 个既有变更路径。
- `docs/audits`：27 个既有变更路径。
- `pipelines/fetch`：22 个既有变更路径。
- `pipelines/automation`：14 个既有变更路径。
- `services/catalog-api`：13 个既有变更路径。
- `pipelines/maint`：9 个既有变更路径。
- `docs/superpowers`：4 个既有变更路径。
- `platform/local`：3 个既有变更路径。
- `pipelines/crawler`：2 个既有变更路径。
- `pipelines/landing`：2 个既有变更路径。
- `docs/project-management`：1 个既有变更路径。
- `pipelines/monitor`：1 个既有变更路径。

既有最近提交：

- `59fff90a fix(buff): restore local runtime acceptance APIs`
- `a277e3bb feat(buff): isolate current source replay on Redis DB18`
- `0f69b305 feat(buff): add manual isolated automation window`
- `42f49ede docs(automation): define Buff manual test window`
- `0a23fab3 fix(buff): persist canonical recovery journal`
- `564bfdfa fix(buff): enforce manifest pin before transaction`

源码复工入口：

- `pipelines/automation/automatic-domain-operation-contract.mjs`
- `pipelines/automation/automatic-domain-operation-contract.test.mjs`
- `pipelines/automation/buff-authorization-binding.test.mjs`
- `pipelines/automation/build-canonical-cutover-authorization.mjs`
- `pipelines/automation/build-canonical-cutover-authorization.test.mjs`
- `pipelines/automation/canonical-operation-catalog.mjs`
- `pipelines/automation/canonical-operation-execution-manifest.mjs`
- `pipelines/automation/canonical-operation-execution-manifest.test.mjs`
- `pipelines/automation/run-base-domain-automatic-operation.mjs`
- `pipelines/automation/run-base-domain-automatic-operation.test.mjs`
- `pipelines/automation/run-live-automation-acceptance.mjs`
- `pipelines/automation/run-live-automation-acceptance.test.mjs`
- `pipelines/crawler/src/domains/npc-parser.mjs`
- `pipelines/crawler/tests/npc-parser.test.mjs`
- `pipelines/fetch/buff-immunity-page-parser.mjs`
- `pipelines/fetch/buff-immunity-page-parser.test.mjs`
- `pipelines/fetch/fetch-wiki-buffs-resume.test.mjs`
- `pipelines/fetch/fetch-wiki-buffs.mjs`
- `pipelines/fetch/fetch-wiki-buffs.test.mjs`
- `pipelines/fetch/refresh-buff-page-evidence-batch.test.mjs`
- `pipelines/landing/buff-bounded-landing-mutation.mjs`
- `pipelines/landing/buff-bounded-landing-mutation.test.mjs`
- `pipelines/monitor/crawler-queue-v2-scheduler-lifecycle.mjs`
- `pipelines/relation/buff-canonical-full-chain.mjs`
- `pipelines/relation/buff-canonical-full-chain.test.mjs`
- `pipelines/relation/buff-canonical-recovery-journal-adapter.mjs`
- `pipelines/relation/buff-canonical-recovery-journal.mjs`
- `pipelines/relation/buff-canonical-recovery-journal.test.mjs`
- `pipelines/relation/buff-canonical-transaction-executor.mjs`
- `pipelines/relation/buff-canonical-transaction-executor.test.mjs`
- `pipelines/relation/buff-source-applicability.mjs`
- `pipelines/relation/buff-source-applicability.test.mjs`
- `pipelines/relation/run-buff-canonical-ingestion.mjs`
- `pipelines/relation/run-buff-canonical-ingestion.test.mjs`
- `pipelines/relation/secondary-relation-processor.mjs`
- `pipelines/relation/secondary-relation-processor.test.mjs`
- `pipelines/relation/sync-buffs-to-relation.mjs`
- `pipelines/relation/sync-buffs-to-relation.test.mjs`
- `platform/local/quality-gate.sh`
- `platform/local/run-user-auth-e2e.sh`
- `platform/local/run-user-auth-e2e.test.mjs`
- `services/catalog-api/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- `services/catalog-api/src/main/java/com/terraria/skills/dto/CrawlerQueueV2CutoverRequestDTO.java`
- `services/catalog-api/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
- `services/catalog-api/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStore.java`

## 计划、历史证据与未完成项

- 完整旧交接索引：`docs/devlog/archive/2026-11-11/feat--automation-domain-buff-current-before-stop.md`。这是停止前的历史快照，不再是当前执行入口。
- 原有条目保留了历史验证、阻塞、复审和风险。本次仅以用户停止原因关闭仍开放的条目，不宣称解决其中问题。
- 本分支可见的业务状态与授权可能早已过期；当前运行态、数据库计数和集成正确性尚未重新验证。

- `docs/audits/2026-09-30-buff-missing-immunity-sample-review.md`
- `docs/audits/2026-09-30-buff-npc-page-direction-fixture.md`
- `docs/audits/2026-09-30-buff-npcinfo-evidence.md`
- `docs/audits/2026-09-30-buff-page-evidence-diagnosis.md`
- `docs/audits/2026-10-01-buff-iteminfo-semantic-capture.md`
- `docs/audits/2026-10-01-buff-partial-contract-review.md`
- `docs/audits/2026-10-03-buff-npc-variant-immunity.md`
- `docs/audits/2026-10-03-buff-npc-variant-insource-discovery.md`
- `docs/audits/2026-10-03-buff-npc-variant-scope-contract.md`
- `docs/audits/2026-10-05-buff-new-id-insert-candidate.md`
- `docs/audits/2026-10-05-buff-new-id-insert-contract.md`
- `docs/audits/2026-10-05-buff-new-id-source-capture.md`
- `docs/audits/2026-10-05-buff-secondary-identity-lineage.md`
- `docs/audits/2026-10-05-buff-variant-empty-scope-candidate.md`
- `docs/audits/2026-10-05-buff-variant-empty-scope-evidence.md`
- `docs/audits/2026-10-05-buff-variant-repeated-id-empty-scope.md`
- `docs/audits/2026-10-06-buff-insert-candidate-refresh.md`
- `docs/audits/2026-10-06-buff-item-1340-source-disposition.md`
- `docs/audits/2026-10-06-buff-item-maint-insert-core.md`
- `docs/audits/2026-10-06-buff-item-maint-readiness.md`
- `docs/audits/2026-10-06-buff-npc-secondary-apply.md`
- `docs/audits/2026-10-06-buff-npc-secondary-candidate.md`
- `docs/audits/2026-10-06-buff-npc-secondary-identity-discovery.md`
- `docs/audits/2026-10-06-buff-npc-secondary-identity-scope-94.md`
- `docs/audits/2026-10-06-buff-npc-secondary-variant-scope-65.md`

停止前开放条目（最近 12 个；完整列表见 inventory）：

- `docs/devlog/entries/2026-08-22-local-remaining-data-chain-closure-plan.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-08-23-remaining-closure-item-decision-checklist.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-08-31-automation-scheduler-activation-handoff.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-19-automation-scheduler-authorization-list.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-22-automation-ingestion-plan-repair.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-24-armor-frozen-candidate-continuation.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-24-canonical-ownership-execution.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-26-armor-secondary-projection-continuation.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-27-armor-image-cache-continuation.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-28-armor-source-semantics-continuation.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-29-automation-domain-buff.md`（停止前状态：`active`）
- `docs/devlog/entries/2026-09-29-buff-bounded-landing-contract.md`（停止前状态：`blocked`）

## 本次验证与限制

- `git diff --check` / 暂存后 `git diff --cached --check` 在提交前执行并记录到本地操作日志。
- 修改的 JavaScript 语法检查：86 个；JSON 解析：1513 个。
- 未运行完整功能测试、Maven 全量回归、前端构建、数据库写入、爬虫或 scheduler；这是停止快照，不是发布。
- 本次语法/JSON 检查未发现失败。

## 本地证据与大型文件恢复

- 原工作区的非重建型忽略文件、配置和 `.local` 证据，在移除工作区前单独校验保存至主目录 `.local/tmp/workspace-closeout-20261111/preserved-worktrees/feat--automation-domain-buff/`；这些含机器状态的文件不上传 GitHub。
- 已压缩的大型报告：0 份；原路径、gzip 路径、原始 SHA-256 见 inventory。复工需要原 JSON 时，在对应分支执行 `gzip -dk <报告.json.gz>`，再核对清单中的 SHA-256。
- 运行日志保存在上述本地目录；GitHub 分支提供源码、文档、非敏感可提交报告及压缩报告，不能替代本地配置和数据库。
- MySQL 仅处理主目录 `.local/tmp/mysql-full-recrawl-20261013`：目标 `D:\Mysql\TerriaData`；最终归档结果见 main 分支清理交接。其他主目录 `.local` 内容保留。
- GitHub 实际推送与远端哈希核对结果，以 main 分支的总交接及本地结果清单为准；本文件生成时不预先宣称已推送。

## 安全复工步骤

1. `git fetch origin`，然后 `git worktree add .worktrees/resume-feat--automation-domain-buff -b resume/feat--automation-domain-buff origin/feat/automation-domain-buff`。
2. 阅读 `AGENTS.md`、current spec、workflow、本文件、inventory 和历史索引；明确用户的新目标后创建 active devlog。
3. 按需恢复已压缩报告和本地配置；不要复制过期 token、permit、决策或 Redis/MySQL 状态到正式运行环境。
4. 重新检查分支差异、依赖、运行进程、数据库目标及历史未解决问题；先做对应最小测试，再考虑集成或执行。
5. 任何数据库写入、scheduler/crawler 启动和旧决策重放均需重新满足现行授权门禁。
