# TerraPedia Current Status

## Date

2026-09-26

## Canonical ingestion continuation (2026-09-26, current)

已按新增 A6 两表授权完成一次真实受控发布：224条属性+290条效果，覆盖223/233个
Armor成员；数据库全量 after-set、前后台 Ninja 样本字段一致，上游来源未改动。
决策 `armor-secondary-a6-20260926-01` 已消耗，不可重放。相关测试1588/1588。
07:06:30Z preflight：scheduler disabled、任务/claims0/0、reconciler healthy，H8/epoch未变。

但运行态语义检查发现历史上游133条属性部位不符、181条效果部位不符、114条分职业
暴击记录错误标为all。全链路仍未完成；当前阻塞为计划A6.3的新来源/maint/relation
修复授权（不是重复申请已批准的两表投影范围）。10个缺来源成员仍排除；图片证据、
Buff/Shimmer及自然tick验收仍待完成。详见当前devlog及2026-09-26子任务。

## Canonical ingestion continuation (2026-09-24/25, historical)

用户已授权有界 Armor/Buff/Shimmer 修复；当前仍在实现与验证阶段，未完成自动入库。
Armor projection-only 与 Buff 不可执行候选/写入拦截已通过独立复审；Armor landing
来源时间/修订号修复通过；A2.1维持层35/35、A2.2关系候选99/99，来源身份及
模块时间文本/日历问题均已修复；四文件独立规格与质量复审均通过。
投影依赖绑定和执行器尚未完成。2026-09-25 已新增未注册的 Armor 锁定事务核心：
在同一 MySQL 事务内锁定两个 Armor landing 分区、Owner/server/fence 与目标行，
锁后重派生，按真实 insertId 做回执和投影主键绑定，并对 commit 未知进入恢复路径；
TDD 及相关 Node22 回归为 1581/1581。该核心没有 relation ID-independent 组合、持久化
journal/packet/API 适配，也未注册或执行业务 DML，不能视为自动入库完成。
Node22 整合验证为1509通过、0失败、1项既有 Shimmer 跳过；未执行本轮业务写入。

11:21 CST 管理 API200：scheduler disabled、任务/claims0/0、reconciler healthy、
H8/epoch未变；MySQL只读核对无 fresh decision 或活跃 fence。八域 readiness blocked。
P0：完成 Armor A2 候选与完整执行器，补全 source_evidence 分区和图片来源证据
（175张 maint 图片均缺修订号，1张缺缓存，不能沿用为 fresh evidence）；
P1：Buff完整链及Shimmer跨owner分区；P2：真实变化/API验收及另行授权的持续运行。
当前H8只覆盖旧local Armor表；复合模块/图片探针及精确策略迁移是自动接线前置条件，
不能通过扩大旧packet或复用no-op报告绕过。详见Sep24 ownership execution devlog。
以下日期检查点为历史，不能覆盖本节状态。

## Scheduler continuation (2026-09-22, historical)

The standing local authorization register is active. Fresh H8 readback matches;
L2 reauthorization decisions 66–73 and projectiles scheduler decision 74 were
consumed serially with unique MySQL readback. A natural Retry-41 dispatched only
projectiles; it failed before apply on an immutable artifact path retained from
Retry-39. Control is false; readback confirms no active work/fences and unchanged
1111 projectile rows/1110 images. Retry identities remain non-reusable.

The plan now separates mechanism/no-op, real API-visible mutation and sustained
operation. Armor public projection and Buff relation ownership need canonical
publication; Shimmer imports touch undeclared auxiliary tables and are now
contained by a reviewed pre-write scope guard. Node tests after that guard were
1004/1004; fresh focused Java scheduler/policy/supervisor tests are 420/420.

Current engineering work separates content-level DB deduplication from
attempt-specific immutable artifacts, without weakening ownership or replay
protection. No further live window is permitted until repair/review/fresh gates;
next cadence is no earlier than 2026-09-22T11:49:30Z. Eight-domain and unattended
service acceptance remain open. See
`docs/devlog/entries/2026-09-22-automation-ingestion-plan-repair.md`.

Earlier dated checkpoints below are history; their service-down, no-authorization
and no-tick descriptions do not override this continuation.

## Scheduler Preparation Gate (2026-09-03)

The eight-domain L2 promotion chain is closed at
`edc40b4fe702aa11b9ec03d2d49ff9448d6eeb09`. The live policy set is H8
`sha256:e425764ed673f1d16bdbc7b3511cff10f1f090f8276dbfdf7aaf04f9a5ae4df0`,
with all eight eligible domains `v2/L2/ACTIVE`; the independent global readback
is `sha256:34af46aacb92d171c232128712c47641cbb3882a689ae0fd18195302184445e0`.

The scheduler Preparation Gate remains a code-only checkpoint. Its safety
contracts cover source-probe failure, transaction compensation and durable
alerts, row-level L2 diff/fence evidence, authorization freshness, and the
cleanup-uncertain runtime fence. The Java V2 producer source-identity repair is
approved by independent specification and code-quality review: focused Maven is
`312/312`, including Redis retry `61/61`. The Node automatic runner, evidence,
and acknowledgement chain is `965/965` in the full automation suite, with the
latest source-dispatch target suite at `210/210`. The monitor-state reader now
binds an ordinary repository file through no-follow descriptor access and
identity rechecks, while initial Supplementary reader failure publishes terminal
`source-identity` progress. Fresh Node specification review approved this
repair, and the independent code-quality re-review also approved it. A fresh
coordinator full Node automation rerun passed `965/965`, and the focused Java
  producer rerun passed `312/312`. The source-dispatch child is closed in
  checkpoint `6341f8f0`. Phase 0 and all runtime stages remain blocked until a
  fresh readback and separate authorization exist.

No fresh scheduler preflight, scheduler control write, sweep, source refresh,
crawler/import, or business-table mutation has occurred. The prior checkpoint
observed MySQL `13306`, Redis `6380`, and backend `18102`, but a fresh restart
attempt on 2026-09-06 stopped at the canonical read-only MySQL TCP preflight;
all three service ports are currently unavailable. The existing MySQL datadir
and runtime directory require administrator ownership, and this session has no
non-interactive sudo. After MySQL and the stack recover, this worktree's Redis
DB 14 still requires a fresh state-store-boundary readback; no reset or state
copy is authorized. A fresh Phase 0 readback and an independent ADMIN/Owner
authorization are required before any live activation.

Phase 1 evidence inventory is fresh and complete: the linked ingestion
worktree revalidated `185` untracked files as `131/45/4/4/1`; the current
catalog helper suite is `20/20`, and the private retry-02 catalog is `0600`
with SHA `sha256:1e4bd9b5a8d596f962799aba4ff0dc5863ee22d5baa10153f686eb8ec0d2704e`.
The historical catalog path was preserved because the helper correctly refused
to overwrite it.

All dated sections below are retained historical checkpoints and do not override
the Scheduler Preparation Gate state above.

## Eight-Domain L2 Readiness (2026-08-28, historical)

The exact eight-domain default ceiling was registered under
`user://conversation/2026-08-28/eight-domain-default-l2-ceiling`. Immutable
r12 evidence at
`reports/runtime/local-data-chain-closure/20260828/l2-readiness/20260828-064652-phase2-readonly-r12/`
has `32/32` passing domain panels, cross-DB `9 pass / 1 warning / 0 blocker`,
relation-health `0 blocker / 1 warning`, database-bound acceptance `19/19`, and
an HTTP `200` V2 preflight with zero live attempts/claims and a healthy
reconciler.

Each target domain now has one registered immutable `v2/L2` policy-version row,
but every effective policy remains `v1/L1/ACTIVE`. The r12 adapter readback
qualifies zero committed L1 runs for every domain, and full reconciliation is
still absent. No L2 proposal, packet, permit, `L2_PROMOTION` decision, scheduler
activation, source refresh, crawler/import, or automatic ingestion was
performed. The readiness records remain display-only and cannot be used as
proposal inputs until the separate L1 evidence gate is satisfied.

## Fresh Closure Checkpoint (2026-08-26)

The parent local data-chain closure is `closed` at
`reports/runtime/local-data-chain-closure/20260825/parent-final-1055/closure-index.json`.
The standard local stack is reachable on MySQL `13306`, Backend `18091`, Public
`5177`, Admin `3004`, and Redis `6380`. Read-only continuation checks passed:
local preflight, core smoke `OK: true`, acceptance `19/19`, NPC source coverage
`762/762`, NPC domain-chain blockers `0`, and NPC closure smoke `pass`.
Cross-DB and relation-health each retain one warning with blocking `0`.

Current image lineage is `7/7 ready` when bound to the current authorized Item
origin-normalization evidence. The generic acceptance image step omits that
binding and reports `6/7` without failing its schema-only check; this is a
validation-harness gap, not a new data-chain blocker. A fresh API parity replay
was stopped by HTTP `429` with zero retries; the final independent `418/418`
parity evidence remains authoritative. No new DML, permit, external request,
cleanup, staging, commit, or push is authorized for this closed lane.

All sections below dated before 2026-08-26 are retained historical checkpoints;
they do not override this closed-parent disposition.

## Fresh Closure Checkpoint (2026-08-24)

The maintained local stack is live on MySQL `13306`, Redis `6380`, backend
`18091`, public `5177`, and admin `3004`. Fresh local stack smoke passes `5/5`;
the prior four HTTP 429 failures were caused by overlap with the completed fast
NPC API audit and did not require another MySQL restart.

Boss current source-chain/API readback and parity pass, and Shimmer is
`COMPLETED/COMMITTED` at generation `9`. Core smoke passes; cross-DB and
relation health have blocking `0`. Maven passes 1573 tests, Admin full test
passes 413 unit tests plus typecheck/build, and Public check passes. Quality
automation is `189/189`, while domain acceptance remains `46/47` because the
canonical NPC readiness input is absent.

The parent closure remains blocked by five blocker groups containing ten
independent roots: Item source has no accepted rows; canonical NPC input is
missing; six NPC loot identities have flattened-vs-template chance-text drift;
image lineage is ready for only `2/7` entity types across five separate image
owners; and both Boss owner-05 and Shimmer owner-06 lack exact changed-row
closeout metadata. The authoritative index is
`reports/runtime/local-data-chain-closure/20260824/fresh-042509/closure-index.json`.

## Remaining-Chain Checkpoint (2026-08-22)

The operator-started MySQL/local stack is available on the loopback ports. The
fresh read-only run `090736-remaining-chain-r2` records NPC/domain/runtime
closure pass, Projectile no-op relation preview, cross-DB `10/10`, Biome `47`
managed icons, image lineage `7/7`, and local smoke `5/5`. Item source remains
blocked by explicit quarantine and duplicate lanes (`522` policy candidates,
`1295` dry-run duplicates, `311` potential inserts); no proposal, permit, or
apply was created. Local-core compatibility still has documented projection
drift in items/NPCs/bosses, and the full quality gate remains `323/328` because
five historical authorization fixtures are absent. The parent closure remains
active and no release or production claim is implied.

The formal remediation plan is
`docs/superpowers/plans/2026-08-22-remaining-closure-remediation.md`. It
requires hermetic test-fixture repair before any data write, then separate
governed Item-source and projection-parity operations with fresh freezes and
authorization. It does not permit reconstruction of historical authorization
artifacts, direct SQL, or broad relation rebuilds.

## Current Phase

Scheduler retry-artifact repair after a bounded natural canary. The parent
data-chain closure and L2 promotion remain historical completed milestones,
not proof of recurring end-to-end automatic ingestion. Control is disabled;
no scheduler or data-chain apply is active.

## Current State

Code-style authority: `docs/project-governance/current/CURRENT_CODE_STYLE.md`
and the root `.editorconfig` are the active baseline; formatter and linter
adoption remains staged.

Root governance files `03`, `04`, and `07-12` were removed from the current tree on 2026-07-10. Do not recreate removed root governance files; use Git history only for audit or rollback.

- Item-image lineage is `6131/6131/6131/6131`; the current exact projection
  apply froze 6,131 existing rows and changed 332 image values.
- Fresh image source lineage is `2/7` ready. Buffs and Bosses pass; Items,
  NPCs, Projectiles, Armor sets, and Biomes are blocked by their exact report
  reasons. Biome has 7 managed projection paths and 40 legacy-origin URLs.
  Older `7/7` and the superseded `3/7` evidence are historical and do not
  override the fresh run.
- Shimmer generation/import is complete at generation `9`. Domain acceptance
  is `46 pass / 0 warning / 1 blocked`; the blocked panel is derived from the
  missing canonical NPC input. Cross-DB and relation health have blocking `0`.
- NPC decision `canonical-npc-t2-cutover-verification-20260806-admin-02`
  completed with `noWrite=true` and `T2_CUTOVER_VERIFIED`. The database snapshot
  was unchanged and no authorization permit remains.
- The three item-group inputs and standardized NPC input are canonical source
  contracts. The generated NPC bridge remains retired.
- Two independent `biomes` L1 applies are committed. Policy is
  `biomes v1 L2/ACTIVE` with one L2 decision and one bounded scheduler
  eligibility decision; there is no circuit, active attempt, or reservation.
- A historical full Bash gate passed: backend `1523` tests with zero failures/errors and
  10 explicit skips, public `39/39`, admin `405/405`, and isolated E2E run
  `5588e137a806de4a2dd417fe8319954d` with outcome and cleanup both passed.
- Cleanup readback found no disposable E2E database, Redis DB 15 state, runner
  listener, retained permit, scheduler daemon, or crawler process.
- Isolated Scheduler T1 run `npc-t1-crawler-v2-auto-ingestion-20260809-04`
  passed with a real scheduled recorded-Recipe tick, two lease renewals,
  restart adopt/reject, lease-loss reap, matching `947/1256/1015` Recipe and
  relation readback, and independent cleanup to zero. This evidence is local
  acceptance only; formal Scheduler V2 automation remains disabled.
- Preparation Tasks 1-3 are implemented: the backend exposes a read-only
  `GET /admin/crawler-monitor/v2/automation/preflight`, the Node collector
  binds disabled/changed-only control, zero attempts/claims, reconciler health,
  epoch/namespace, domain evidence, T1 hash, and code hashes, and the proposal
  builder rejects representative current-state constants and byte drift.
  No real preflight artifact was generated because no backend listener was
  available; starting one would cross the no-daemon/formal-store boundary.

## Current Gate Boundary

This is local readiness evidence, not release or production-deployment
authority. Scheduler activation records bounded eligibility only; the standing
register separately permits the listed local natural canaries and registered
crawler/import work. It does not authorize a new recurring daemon. Monitor projections remain
read-only and `notGateEvidence=true`.

Formal Scheduler enablement preparation must use a fresh read-only preflight
and current-hash proposal before a separate ADMIN request. No prior T1 report,
eligible-domain result, or consumed decision authorizes a production mutation.

## Current Risks

- Crawler monitor and resume/recovery reliability remains the main P1 area.
- Release, staging, a new sustained-operation controller, push, merge, and
  worktree cleanup require separate decisions. Local listed canaries/source
  work remain covered by the standing register and their fresh technical gates.
- A proposal built from representative control values is not production-ready;
  it must bind a fresh observed disabled/changed-only state, zero activity,
  reconciler health, epoch/namespace, readiness, and code/report hashes.
- The preparation implementation is now fail-closed for evidence paths outside
  the repository and for code bundle bytes changed after preflight. A future
  request still requires a fresh local read-only GET and owner decision.
  Retry-41 and earlier generated/consumed proposal, request and packet chains
  are immutable history, not permission for the next window.
- Current companion docs and gate evidence must remain synchronized with future
  workflow, API, runtime, and data-chain changes.
- A code checkpoint and passing contract tests do not prove a natural
  source-change-to-database run. Keep the scheduler disabled until a fresh
  authorization, state-store boundary, and live canary pass all readbacks.

## Priorities

- P0: keep spec, devlog, project status, and risk records synchronized.
- P1: stabilize crawler monitor state, interruption handling, and resume/recovery.
- P2: continue homepage aggregation and public UI quality only after P1 control
  points are stable.

## Next Actions

- Finish the retry-artifact repair, independent reviews and full automation
  regression, then refresh Phase 0 with the current dual-root V2 boundary.
- Near the next due natural cadence, generate a fresh bounded ADMIN/Owner
  packet under the standing register; verify its exact latest decision before
  enabling only projectiles, then restore disabled and read back terminal state.
- Preserve all consumed operation identities and immutable evidence.
- Rerun relevant runtime/backend/frontend/data gates before release, staging,
  or public-readiness claims.
