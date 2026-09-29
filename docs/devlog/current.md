# Current Devlog

Last updated: 2026-09-29 16:20 CST by Codex

Active branch: `feat/supplementary-domains-readiness` (primary worktree)

## Active L2 Execution Continuation

- Entry: `entries/2026-08-27-eight-domain-l2-execution-continuation.md`; owner: Codex; status: `active`; branch: `feat/supplementary-domains-readiness`; worktree: `/home/lolben/TerraPedia`; parent: `entries/2026-08-26-l2-readiness-handoff.md`; blocked-by: formal adapter qualification for Items, Projectiles, and Shimmer (historical same-policy source-artifact drift), followed by domain-scoped Owner promotion and an independent scheduler decision.
- Current phase: contract repair and the serial evidence-repair pass are complete. Twenty-four fresh current-policy L1 run artifacts (three per domain, with Shimmer using `shimmer_l1_20260829_serial01_retry01` after a fail-closed pre-DB path error) passed direct artifact/DB-chain verification, and every run includes full transaction-bound reconciliation. The governed Shimmer planner now receives the caller worktree root explicitly and rejects traversal, duplicate-separator, backslash, absolute, and mismatched-generation manifest paths before loading; the focused reviewer re-check is green. The immutable Phase 2 root remains `reports/runtime/local-data-chain-closure/20260828/l2-readiness/20260828-064652-phase2-readonly-r12/`.
- Ceiling registration: the exact user approval `user://conversation/2026-08-28/eight-domain-default-l2-ceiling` was consumed once for the eight domain-owned immutable `v2/L2` policy-version rows. Independent readback proves the artifact, pending result, post-commit marker, and database row agree for each domain; it did not change any effective policy.
- Runtime boundary: MySQL `127.0.0.1:13306` UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, Flyway `V60`; Redis `6380` is reachable. The r12 V2 preflight is HTTP `200`, has zero live attempts/claims, a healthy reconciler, unchanged audit watermark, and all eight scheduler-readiness rows `blocked`. V2 control remains `enabled=true`/`changed-only` with no current activation decision; no control write or sweep was run.
- Readiness result: each domain has one registered immutable `L2` ceiling at version `2`, while its effective policy remains `v1/L1/ACTIVE`. The direct evidence chain has three committed/full-reconciliation runs for every domain; the formal adapter independently qualifies `npcs`, `armor_sets`, `buffs`, `audio`, and `bosses` at `3`, while `items`, `projectiles`, and `shimmer` remain fail-closed because older same-policy rows have drifted source artifacts. Per the plan contract, those adapter errors keep those three qualifying counts at zero; no domain is promoted. Target-domain `L2_PROMOTION` decisions remain zero, current scheduler activation decisions remain zero, and no proposal, packet, permit, or scheduler control write was executed.
- Validation: fresh direct artifact/DB-chain audit passed `24/24`; each selected bundle's exact source-byte hash, full reconciliation, terminal progress, and result binding were independently rechecked. The formal adapter read ran in one rolled-back transaction; all eight ceiling registrations independently verified in one rolled-back transaction; V2 preflight GET is `200` with `enabled=true`/`changed-only`, zero live attempts/claims, healthy reconciler, and all eight domains `blocked`; MySQL active attempts/reservations/fences are zero and Flyway is `V60`. Focused governed-runner/operation/preview/reconciliation/manifest tests pass `109/109` (runner-only `11/11`); the reviewer custom malformed-path matrix is also green; `bash ./platform/local/verify-local-stack.sh --skip-front`, Node syntax checks, and `git diff --check` pass.
- Contract handoff: `docs/superpowers/plans/2026-08-26-eight-domain-l2-readiness-and-promotion.md`. The L1 runner now fails closed when full reconciliation lacks a terminal run-local progress artifact and normalizes the verified Shimmer generation pointer to its exact content-addressed manifest path. Historical hash drift is classified as a legacy semantic-JSON-versus-current-byte-hash mismatch: Items, Projectiles, and Shimmer old recorded hashes match semantic JSON but not current file bytes, so no historical row is rewritten or replayed. The next safe action is a separately scoped historical-evidence disposition/repair for the three adapter-blocked domains; do not generate an L2 proposal or change scheduler state beforehand.

## Final Closure (2026-08-25 17:40 CST)

- Parent local data-chain closure is `closed`; final index:
  `reports/runtime/local-data-chain-closure/20260825/parent-final-1055/closure-index.json`.
- Exact Owner approval `owner-npc-loot-duplicate-relation-retirement-20260825-01`
  was consumed once. Relation `1551` was soft-disabled (`1` physical row),
  survivor `609` remained active, and projection `44` plus local row `82353`
  remained unique and active.
- Independent post-retirement readback confirms the API exposes one
  `MiningHelmet` entry with quantity `1` and chance `5%`:
  `parent-final-1055/npc-duplicate-relation-retirement.post-readback.json`.
- NPC runtime parity is `418/418` pass with `1542` relation/projection/local/API
  rows; NPC closure smoke passes with zero blockers; domain acceptance is
  `47/47 pass`; fresh quality gate passes, including isolated user-auth E2E.
- Cross-DB and relation-health retain one warning each with zero blocking
  checks. Six pre-existing local acquisition rows lack relation/maint trace;
  they are outside this operation and remain unmodified.
- Worktree remains intentionally dirty and `0 staged`; no commit, cleanup,
  reset, checkout-discard, stash, or push was performed.

## Fresh Read-only Continuation (2026-08-26 04:10 CST)

- The closed parent was rechecked without DML, external requests, permit
  consumption, staging, cleanup, reset, stash, commit, or push.
- Local stack preflight passed; Backend actuator is `200`, Public is `200`,
  Admin redirects with `302`, Redis answers `PONG`, and MySQL `13306` is
  reachable. `platform/local/acceptance-test.mjs` completed `19/19` with
  `0` failures and `0` skips.
- Fresh core smoke is `OK: true`; cross-DB is `9 pass / 1 warning / 0
  blocking`; relation health is `0 blocking / 1 warning`; NPC source coverage
  is `762/762`, domain-chain release blockers are `0`, and the NPC closure
  smoke is `pass` with `418` trusted runtime NPCs from the final independent
  parity evidence.
- Direct MySQL readback confirms relation `609` active, relation `1551`
  inactive, projection `44` with one `MiningHelmet` (`1`, `5%`), and local row
  `82353` active with the same quantity/chance.
- Image lineage is `7/7 ready` when the current authorized
  `item-image-origin-evidence.json` is explicitly bound. The generic
  acceptance image step does not pass that evidence path and therefore emits
  a non-blocking `6/7` semantic summary; this is a validation-entry binding
  gap, not a database image-row regression.
- A fresh API parity replay was intentionally fail-closed after the loopback
  API returned HTTP `429` with zero retries. The authoritative independent
  post-retirement parity remains `418/418` in the final closure index; no
  runtime data was changed.

## L2 Readiness Handoff / Phase 2 Recheck (2026-08-26 16:47 CST)

- New handoff entry: `entries/2026-08-26-l2-readiness-handoff.md`.
- The parent local data-chain closure is terminal (`closed`, zero blockers,
  final plan-auditor `pass`), and the eight changed-only domains remain local
  `L1/ACTIVE`: Items, NPCs, Projectiles, Armor Sets, Buffs, Audio, Bosses, and
  Shimmer.
- This handoff prepares L2 only. It does not create or consume an L2 proposal,
  packet, permit, Owner decision, scheduler activation, or database write.
- Read-only matrix: `reports/runtime/local-data-chain-closure/20260826/l2-readiness-matrix.json` (Markdown companion at the same path).
- L2 planning document: `docs/superpowers/plans/2026-08-26-eight-domain-l2-readiness-and-promotion.md`; it defines future per-domain qualification and execution checkpoints only.
- Plan review repaired the source/ownership matrix, landing/maint/relation lineage and DTO sanitization gate, shared NPC/Boss table fence, policy-version gate, legacy L1-run classification, canonical authorization builders, runtime/UI checks, stack lifecycle, relation-health command, identity-less L1 counting, exact field-group/predicate fences, content-addressed reconciliation evidence, post-promotion policy-set hash persistence, proposal-only binding, the formal reconciliation producer, immutable L2 ceiling artifact/registration, content-addressed proposal builder, and authorization data-bundle inclusion. Implementation re-review is green (`145/145` combined Node tests; `33/33` focused Maven tests), but actual Phase 2 evidence and Owner authorization remain runtime blockers.
- All eight domains remain `L1/ACTIVE`; no plan-qualified full reconciliation,
  exact L2 policy ceiling, per-domain Owner promotion, or current separate L2
  scheduler decision is evidenced. The matrix verdict is `BLOCKED` for all
  eight domains. Historical Boss/Shimmer terminal reconciliation is preserved
  but is not counted for the stricter plan gate. Three historical NPC/Armor
  Sets/Buffs bundle files are missing and remain evidence gaps.
- V59 raises the durable minimum L1 gate to three but has not been applied;
  migration execution is a separate approved Flyway maintenance task. The L2
  catalog's ordinary `*.input.json` files remain execution envelopes; real
  proposal and approved policy artifacts must be content-addressed.
- Phase 2 recheck root `reports/runtime/local-data-chain-closure/20260826/l2-readiness/20260826-1554-phase2-recheck/`
  contains `32/32` passing immutable domain panels, cross-DB `9/1/0`, and
  relation-health `0/1` (blocker/warning). All eight domains remain `BLOCKED`:
  the required policy ceiling, three qualifying bundle-bound L1 runs, and
  plan-qualified full reconciliation are still missing; no Owner or scheduler
  decision exists.
- Authenticated scheduler checks on the corrected repository-root backend are
  now `overview=200`, `v2 automation=200`, and `preflight=200`; Redis `6380`
  is `PONG`, live attempts/claims are zero, and all eight readiness panels are
  `blocked`. The persisted V2 control reads `enabled=true`/`changed-only`, but
  its latest activation decision is expired; no control write, sweep, proposal,
  packet, permit, decision, reset, or recovery was called.
- The maintained backend is actually listening on `18091` while the local config
  advertises unreachable `18088`; all authenticated loopback checks explicitly
  used `http://127.0.0.1:18091/api` without changing config.
- The NPC readiness freshness repair was computed read-only first and then
  published at `reports/canonical-migration/canonical-npc-crawler-facts-readiness.json`:
  `T2_CUTOVER_VERIFIED`, generated `2026-08-26T08:36:26.025Z`,
  SHA-256 `sha256:9eda5112bf452f2f97bd452f4d3cc3ba3f07db43d6c1159cdff77979b0ec1169`,
  `writesDatabase=false`.
- Fresh acceptance report `reports/acceptance-test-20260826-083656.json` is
  `19/19` with `0` failures and `0` skips; it supersedes the earlier `18/19`
  report whose only failure was `b1-town_npc` freshness. At the pre-repair
  checkpoint the scheduler blocker was independent: automation and preflight
  returned `409 STATE_STORE_RESET`; the corrected post-repair readback is in
  `## Runtime Boundary Repair` below.
- Final read-only database snapshot confirms all eight target policies remain
  `L1/ACTIVE`, with zero target-domain L2 policy versions or activation decisions,
  zero attempts/reservations, zero active write fences, and Flyway V58 still
  current. `bash ./platform/local/verify-local-stack.sh --skip-front` also passed.

## Runtime Boundary Repair (2026-08-26 17:42 CST)

- Root-resolution regression fixed in `CrawlerQueueV2Configuration`: a backend
  CWD of `services/catalog-api` now discovers `/home/lolben/TerraPedia`, so the
  durable V2 marker and Redis DB3 identity agree. The test was observed red and
  then green (`2/2`).
- Direct `@EnableScheduling` was replaced by a conditional scheduling
  configuration honoring `spring.task.scheduling.enabled`; V2 automation now
  checks read-only scheduler eligibility before source checking or enqueueing.
  Focused Maven validation is `251/251` (monitor `207/207`, policy `33/33`,
  preflight `7/7`, scheduling `2/2`).
- The first controlled restart exposed the old boundary: six terminal failed
  V2 attempts and a source-update report were created before the child runners
  fail-closed on missing fresh scheduler activation. No business-table DML,
  live attempt, epoch reset, recovery, or replay was observed; artifacts remain
  preserved and are not qualifying evidence. A second restart ran beyond one
  polling window with no new attempt/report files, then the temporary backend
  was stopped.

## L2 Readiness Evidence Repair (2026-08-27 06:28 CST)

- The r4 adapter-backed root above supersedes the earlier r2 capture as the
  current read-only evidence root. Its immutable records remain `BLOCKED` for
  all eight domains, with `0` adapter-qualified L1 runs, no L2 policy-version
  rows or promotion decisions, and no current scheduler decision.
- The r4 plan-auditor and chain-auditor reports now record the actual latest
  validation counts: automation `534/534` (`343` workflow + `191` automation),
  readiness producer `6/6`, domain
  panels `32/32`, acceptance `19/19`, cross-DB `9/1/0`, and relation health
  `0/1`. The chain verdict remains `blocked` because policy ceiling, three-run
  full reconciliation, and Owner/scheduler authorization are absent.
- No proposal, packet, permit, decision, migration, reset/recovery, source
  refresh, replay, scheduler control write, or business-table write was run.

## Recently Closed

- **Reresolve candidate evidence archive**; owner: Codex; status: closed; branch: `feat/supplementary-domains-readiness`; entry: `entries/2026-09-29-reresolve-evidence-archive.md`; read-only report preserved with 63 unresolved audits and 43 candidates; no candidate apply or data write; commit SHA pending in final response.

- **Crawler monitor lifecycle and persisted alert notifications**; owner: Codex; status: closed; branch: `feat/supplementary-domains-readiness`; entry: `entries/2026-09-29-crawler-monitor-lifecycle-notification-fix.md`; backend `213/213`, admin notification source `7/7`, and `git diff --check` pass; commit SHA pending in final response.

- **Item source local NPC admission / Item 来源本地 NPC 入库闭环**；owner: Codex；status: closed for the Item lane；branch: `feat/supplementary-domains-readiness`；parent: `entries/2026-08-23-session-handoff-remaining-closure.md` remains blocked only for independent non-Item lanes；attempt: `74fdfa622c308da96af9245facba0fb51752de4609894b5571b9843f25e37da4`；proposal `sha256:d35afe4b0ac1cc3a4eb4daf29fddbde0c1bfcc08fc2c0022ca41bafc9b9e9fe5`；scope `sha256:63cbd03487b7e7a898d5f2b92036e5b7d7ed145aa1ccce845d75781f92fdcdb4`；result: `112` physical changes, independent layer readback `8/8/22/22/21/1/21` plus `9/9` reconciliation, post-admission partition `28 accepted / 1295 duplicate / 283 quarantine / 748 blocked / 0 unclassified`, API and local smoke pass；final evidence and bilingual plan review: `reports/runtime/local-data-chain-closure/20260825/item-source-local-npc-admission/final-0925/`；no staging or commit performed.

- **Two-item Wiki image evidence refresh**; owner: Codex; status: closed;
  branch: `feat/supplementary-domains-readiness`; entry:
  `entries/2026-08-21-two-item-wiki-image-evidence.md`; one serial bounded
  fetch completed `2/2` for `FallenStar` (`75`) and `SeveredHandBanner`
  (`3398`). The evidence corrects the two provenance defects without image-byte
  transfer or database mutation. Source classification is at
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/042354/two-item-wiki-evidence-classification.json`;
  any repair needs a new mutation-only scope and explicit Owner authorization.

- **Project structure professionalization migration**; owner: Codex; status:
  closed; integrated branch: `feat/supplementary-domains-readiness`; source
  branch/worktree: `refactor/project-structure-migration` /
  `/home/lolben/TerraPedia/.worktrees/project-structure-migration`; entry:
  `entries/2026-08-16-project-structure-professionalization.md`; canonical app,
  service, shared package, pipeline, and platform boundaries are migrated with
  one-way legacy symlinks. Focused gates pass; public sitemap and existing data
  baseline drift remain documented variances. Source commits: `be8ffe02`,
  `b5b81385`; integrated commits: `4599eb67`, `e7a3c99d`; alias contract
  follow-up: `32a308ae`; documentation correction: `data/wiki-crawler/README.md`
  now points to `pipelines/crawler`; review repairs also canonicalize the
  authoritative workflow/build defaults and portable PowerShell build paths;
  review repair commit: `322a540f`; timestamp closeout: `9b2d7c53`; second
  review pass synchronized the remaining current governance companions and
  crawler workflow skill.

- **Mixed-agent structure convergence**; owner: Codex; status: closed;
  source branch/worktree: `docs/mixed-agent-structure-convergence` /
  `/home/lolben/TerraPedia/.worktrees/mixed-agent-structure-convergence`;
  fast-forward integrated into `feat/supplementary-domains-readiness` at
  `0db183d3`. The post-integration plugin/handoff checkpoint is `acaf6487`,
  and the archived-summary contract repair passed the focused 20-test structure
  suite; commit SHA pending in final response. The three protected
  Shimmer/authorization paths and 24 local generation files remain unstaged;
  `stash@{0}` remains preserved.

- **手动与自动双路径真实入库验收**；owner: Codex；status: closed；branch:
  `feat/supplementary-domains-readiness`；entry:
  `docs/devlog/entries/2026-08-15-dual-path-domain-ingestion-acceptance.md`；
  Shimmer deterministic probe repair and two natural-sweep acceptance complete;
  commits `a416fe20`, `1623c708`.

- **Shimmer evidence reconciliation**；owner: Codex；status: closed；branch:
  `feat/supplementary-domains-readiness`；entry:
  `docs/devlog/entries/2026-08-16-shimmer-evidence-reconciliation.md`；the
  governed activation bridge and local automatic-L1 idempotent reconciliation
  are verified. The commit scope excludes private generation, authorization,
  and runtime evidence artifacts, which remain preserved locally.

- **附加域 L1 自动化入库**（Shimmer、Audio、Bosses）；owner: Codex；status: closed；branch: `feat/supplementary-domains-readiness`；worktree: `/home/lolben/TerraPedia`；parent: none；dependencies: three first-L1 Owner applies, source-only scheduler preflight, and reviewer re-check complete；contract handoff: `docs/superpowers/specs/2026-08-14-supplementary-domains-l1-automation-design.md`；implementation plan: `docs/superpowers/plans/2026-08-14-supplementary-domains-l1-automation.md`；result: three formal applies completed and scheduler is enabled for changed-only default previews；boundary: `L1/ACTIVE`, one Owner approval per apply, no L2 or Boss loot；commit: `c698a034`. Runtime restart and regenerated scheduler preflight are deferred until the unrelated live Buff task is terminal.
- 已确认的物品、NPC 与文章高保真稿正在正式接入；Item 已在 `8d459fe1` 建立检查点，NPC 已在 `3d9045fa` 建立检查点。Article 最终裁决保留正式 `/articles` 舞台，将搜索上移到 mast、首页最新投稿收敛为 6 篇，并新增无侧栏的四列 `/articles/archive` 承担 12 篇分页与搜索。owner: Codex；status: active；branch: `ux/detail-pages-redesign`；worktree: `/home/lolben/TerraPedia`；parent: none；dependencies: 书面设计复核、实施计划、合同优先实现与用户视觉验收；contract handoff: `docs/superpowers/specs/2026-07-30-article-discovery-archive-split-design.md`，只消费真实 DTO 或明确标注的展示派生值。
- Post-merge acceptance in progress on branch `dev/post-merge-acceptance`
  (from local `main` @ `518d9a0`, 31 commits ahead of origin, unpushed).
- Uncommitted work pending user acceptance: triage-board layout fixes,
  V1-engine warning banner, one-shot V2 cutover script. See
  `entries/2026-07-17-crawler-v2-per-env-activation-guard.md`.
- Admin P0 audit batch is complete (8/8, commits `e6cda9c`..`ad8e9bd`); see
  `entries/2026-07-17-admin-p0-security-batch.md` for verification evidence
  and the three explicit follow-ups (backend @Profile for test-state,
  ItemMapperPreferredImageSqlTest baseline reds, P1 dead-code sweep).

## Active Focus

The Item closure repair is now complete for its owning lane. The canonical
runner committed retry-04 once: `112` physical changes with independent
`8/8/22/22/21/1/21` layer readback and `9/9` reconciliation hash matches.
The permit is absent after consumption, ten admitted Item IDs pass public/admin
source API readback, local smoke is `5/5`, cross-DB is `9 pass / 1 warning / 0
blocking`, relation health has `0 blocking`, and the Boss source-chain audit is
`10/10`. Fresh focused Item-source tests are `34/34`; Maven is `1573 pass / 10
skipped / 0 failures`; Public, Admin, isolated user-auth E2E, and the full
quality gate pass. Post-admission partition evidence records `28 accepted`,
`1295 duplicates`, `283 quarantine`, `748 blocked`, and `0 unclassified`.
The only residual warning is six pre-existing local source rows without
relation trace; no further Item apply is authorized.

The current closure checkpoint is
`reports/runtime/local-data-chain-closure/20260825/parent-final-1055/`.
Armor retry-05 is committed and independently read back `63/63` with exact
proposal hash `sha256:186b03dd074594fc343f29f5dfd2e8fc7589b7f3973bc2f0b1b553c8c417f1f7`.
Fresh domain acceptance is `47/47 pass`, acceptance is `19/19 pass`, cross-DB
is `10/10`, core smoke is `OK: true`, image lineage is `7/7 ready`, and the
complete quality gate exits `0` including isolated user-auth E2E and Admin
`413/413`. Reresolve remains flat at `63 -> 63`; no candidate apply was
authorized. The Item-source lane is closed by retry-04. Boss/Shimmer terminal
metadata is reconciled from immutable binlog evidence, and bound image lineage
is `7/7` ready. NPC canonical readiness now passes after partitioning the 25
`wiki.npc.crawler_fact:*` rows from eight unrelated `local-npc-admission:*`
Item-source rows; no source refresh or database write was required. The parent
is now `closed`: duplicate `UndeadMiner -> MiningHelmet` relation identity
(relation IDs 609 and 1551) was resolved by the exact approved retirement.
No further Item apply or old-permit replay is authorized.

The machine-readable closure index is
`reports/runtime/local-data-chain-closure/20260825/parent-final-1055/closure-index.json`;
the bilingual final blocker detail is `parent-final-1055/residual-blockers.json`
and `.zh.md`. The duplicate relation lane is terminal: operation
`canonical-npc-loot-duplicate-relation-retirement` is `COMPLETED`, relation
`1551` was soft-disabled once, and the final plan-auditor review is `pass`.

Historical continuation details for the earlier `fresh-042509` and `072100`
runs remain in the active closure entry and its indexed artifacts. They are
not the current checkpoint and must not override the final review above. The
current operational boundary is unchanged for the completed lane: no
additional Item operation,
reresolve candidate apply, external request, cleanup, staging, reset, stash, or
commit.

The older crawler/scheduler notes below remain separate open-work context; they
do not override this closure run or its generation-9 Shimmer evidence.

The follow-up `Crawler Auto-Domain Consumption And Resume` task is active on
this branch. It repairs source-manifest consumption and three-attempt checkpoint
recovery for `items`, `npcs`, `projectiles`, `armor_sets`, and `buffs`; the
same changed-only contract now covers `shimmer`, `audio`, and `bosses`. The user
selected the bounded probe design at
`docs/superpowers/specs/2026-08-15-supplementary-domain-source-probes-design.md`;
the written specification is approved and its executable plan is
`docs/superpowers/plans/2026-08-15-supplementary-domain-source-probes.md`.
Task 1 is checkpointed at `9c11c24b` after focused validation and local
contract review; Tasks 2-5 are completed in `f273f5b7`. The task must not add
database/L2/Boss-loot automation.

Execution coordinator: Codex. The user approved the revised complete-Audio
contract in the 2026-08-15 handoff. Task 1 now runs serially in this worktree:
the probe and real Audio L1 action must share complete catalog discovery with
the four governed prefixes, a 600 accepted-file limit, and a 100-page-per-prefix
guard. Tasks 2-5 are complete; Task 6's authenticated read-only scheduler
observation is recorded in the active entry. The earlier WSL recovery confirmed the
session has neither a systemd bus nor a registered `service mysql` entry, but
the operator has since started the existing WSL instance as `mysql`; `127.0.0.1:13306` now
answers a read-only `SELECT 1`. The acknowledgement race found by independent
review is repaired with a manifest lock and atomic replacement, and the fresh
re-review has no Important findings. The repaired stack was restarted for Task
6, observed through authenticated read-only endpoints, and stopped after the
automatic changed-source queue was recorded.

Audio remains fail-closed: historical L1 used one 50-row page per prefix and
recorded `continuationComplete=false` for all four prefixes. Task 1 may not
write a partial manifest or start downloads on a 601st accepted file, unfinished
pagination, or page-guard breach.

Task 1 validation: the focused Node suite covers the supplementary probes,
complete Audio action, and L1 preview command. It proves that a 601st accepted
file, incomplete pagination, or a page guard above 100 fail before manifest
output or downloads. Tasks 2-5 subsequently passed the focused `74`-test Node
and `334`-test Maven suites, including concurrent acknowledgement retention and
post-probe failure coverage. Task 6 observed the restarted scheduler through
read-only endpoints, confirmed no duplicate live attempt, and then stopped the
stack after automatic changed-source previews produced runtime artifacts. No
manual sweep, apply, database write, L2, or Boss-loot command was run; the
all-sources-unchanged runtime case remains a residual acceptance gap.

## Open Work

Entries below dated before the 2026-08-25 09:15 retry-04 closeout are retained
as historical snapshots. Any older `accepted=0` Item-source count is superseded
by the final Item admission evidence at
`reports/runtime/local-data-chain-closure/20260825/item-source-local-npc-admission/final-0925/`
and is not a current blocker.

- **[Historical / Superseded] Fresh continuation / 新鲜继续执行（2026-08-24 16:49 CST）：** status
  `blocked`; owner Codex; branch `feat/supplementary-domains-readiness`;
  parent `entries/2026-08-24-ten-blocker-exact-authorization.md`. Evidence is
  indexed by
  `reports/runtime/local-data-chain-closure/20260824/fresh-163744-armor-final/plan-auditor-review.json`
  (Chinese companion: `.zh.md`). Armor retry-05 is now closed with fresh exact
  authorization, committed 63-row insert-only DML, and independent readback.
  At that checkpoint the remaining roots included Item source `accepted=0` and
  Item projection evidence drift. Retry-04 later closed the Item-source lane;
  only the independent parent lanes remain. No Item operation was performed in
  that historical checkpoint.

- **[Historical / Superseded] Fresh remaining local data-chain closure (2026-08-24 04:25 CST):** status
  `blocked`; latest run root
  `reports/runtime/local-data-chain-closure/20260824/fresh-042509/`. Boss
  source-chain audit now passes by following relation-bound maint/landing keys;
  fresh Boss parity proposal is empty, core smoke passes, cross-DB and
  relation-health both have blocking `0` with one warning each.
  At that checkpoint Item source covered `2354` source rows with
  `accepted=0`, `duplicate=1295`, `quarantine=311`, `blocked=748`, and
  `unclassified=0`; this historical partition is superseded by retry-04. The
  current-generation Shimmer governed L1 run
  `shimmer_l1_20260824closure01` is `COMPLETED`/`COMMITTED`; all four owned
  generations advanced `8 -> 9`, table counts remain `279/248/121/29`, and
  Shimmer readiness passes. Maven is `1573 pass / 10 skipped`; Admin and Public
  pass after Public uses local Playwright Chromium; Admin full test also passes
  `413/413` plus Nuxt build. Quality gate automation is `189/189`, while domain
  acceptance is `46 pass / 0 warning / 1 blocked` due only to missing
  `canonical-npc-apply.input.json`. NPC source coverage passes `762/762`, but
  domain/runtime audits block the same six loot identities. Corrected Biome
  readiness is warning (`7/47` managed, `40` legacy-origin unmanaged); image
  lineage is ready for `2/7`; stack smoke passes `5/5`. Closure index:
  `reports/runtime/local-data-chain-closure/20260824/fresh-042509/closure-index.json`.
  Parent could not close at that checkpoint. Its current remaining groups are
  the independent NPC canonical input/loot identity (2), image ownership (5),
  and Boss/Shimmer operation closeout metadata (2). Preserve zero staged paths
  and the intentionally dirty worktree.

- **[Historical / Superseded] Session handoff: remaining local data-chain closure (2026-08-23):** status
  `blocked`; owner Codex; branch `feat/supplementary-domains-readiness`; worktree
  `/home/lolben/TerraPedia`; entry
  `entries/2026-08-23-session-handoff-remaining-closure.md`; parent
  `entries/2026-08-22-local-remaining-closure-remediation.md`. Item core
  projection parity is closed after classifying five Wiki `旧版` non-PC rows;
  At handoff time Item-source acquisition remained unresolved (`accepted=0`,
  `duplicate=1295`, `quarantine=311`, `blocked=748`); retry-04 is the later
  authoritative closeout. Boss data/parity are current and must not be replayed; its terminal result evidence still requires reconciliation. Shimmer
  current-generation L1 is complete under decision
  `automation-shimmer-first-l1-20260824-owner-06`. Remaining actions belong to
  the NPC canonical input, NPC loot, five image ownership, and Boss/Shimmer
  result-reconciliation lanes; do not fabricate inputs, perform
  direct writes, or reuse permits. Latest evidence and the blocked ten-root
  plan-auditor verdict are under
  `reports/runtime/local-data-chain-closure/20260824/fresh-042509/`.

- **[Historical / Superseded] Remaining local data-chain closure (2026-08-23 16:20 CST):** status `blocked`;
  branch `feat/supplementary-domains-readiness`; formal parity operations are now
  registered as `canonical-item-projection-parity-apply`,
  `canonical-npc-projection-parity-apply`, and
  `canonical-boss-projection-parity-apply`, with fresh domain-scoped proposals
  under `reports/runtime/local-data-chain-closure/20260823/`. Contract and
  authorization/manifest tests pass `74/74`; cross-DB integrity is `10/10` with
  blocking `0`. Fresh core smoke now passes Items after explicit legacy/non-PC
  reclassification; it remains blocked by four Boss pillar rows whose relation
  `boss_title_zh` is null despite Chinese titles in
  `data/generated/wiki-bosses.latest.json`; the independent Item-source
  acquisition lane was later closed by retry-04. No local-to-projection copy or
  new DML was performed at that historical checkpoint.

- **Item image evidence refresh (2026-08-22 04:52 CST):** completed for the
  repaired exact scope. Fresh freeze
  `reports/runtime/local-data-chain-closure/20260822/item-image-evidence-refresh/042958-6129-freeze/freeze.json`
  records relation total `6131`, accepted target `6129`, and exact quarantine
  identities `FallenStar`/`SeveredHandBanner`. Decision-derived attempt
  `reports/authorization/canonical/item-image-projection-apply/8e31d3c6d2e178b1985c05b43efa18a408a84afd98ed2ec6a7fd176eca891026/`
  completed with `changedRowCount=0`, `dmlAttempted=false`, and `6129` readback
  rows. The bound lineage report is `7/7`; readiness remains warning-only
  (Item missing `23`, Item stale `5`, Buff stale `388`, NPC missing `4`).
  No Wiki crawl, external request, image transfer, freshness update, or commit
  occurred. The initial 6131-vs-6129 contradiction is retained as historical
  blocked evidence under `035920-freeze`; the repaired plan now checks this
  boundary before authorization.

- **Active handoff (2026-08-21 04:03 CST):** the local image provenance and
  Buff projection applies are complete and must not be replayed. The parent
  entry records the verified current Git state, stale count discrepancy,
  residual image blockers, and the next safe action:
  `entries/2026-08-17-local-eight-domain-complete-chain.md` under
  `Session Handoff: 2026-08-20 22:08 CST`. The bilingual remaining-image
  repair plans and a report-only freeze are now recorded at
  `docs/superpowers/plans/2026-08-20-remaining-image-repair.md`,
  `docs/superpowers/plans/2026-08-20-remaining-image-repair.zh.md`, and
  `reports/runtime/local-data-chain-closure/20260820/remaining-image-repair/read-only-freeze.json`.
  Freeze scope hash: `sha256:53d499d81b0003bd377f06047357247d5f233bdebaaf3ddefda4af19bd1e00ae`.
  The earlier blocked connectivity record remains historical. A fresh
  `START TRANSACTION READ ONLY` rebaseline now succeeds after restoring the
  loopback MySQL/local stack. The new freeze is recorded at
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/034800/fresh-db-freeze.json`
  with scope hash
  `sha256:a86cfd103710a9933472ebade26c3e832584dc4dcf1526312351aff76ae92bb8`.
  It confirms `23` Item image-row gaps, `2` provenance fallback defects,
  `4` NPC no-image sentinel/test rows, `1` Projectile sentinel, and Biome
  `40` managed plus `7` Wiki fallback URLs with no invalid/missing URL. The
  prior local-evidence issue inventory remains recorded at
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/issue-inventory.json`
  with scope hash
  `sha256:4762c000adfc39865410edc687869bc41780a5c26b8e4db62f990eeebc3907d0`;
  the blocked connectivity record is
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/blocked-fresh-db-freeze.json`.
  Keep the `15` legacy-unowned rows and the `8` `ZH_RECIPE_*` rows quarantined.
  The completed exact two-identity Wiki crawl verified source URL candidates
  for `FallenStar` and `SeveredHandBanner`; details are in
  `entries/2026-08-21-two-item-wiki-image-evidence.md`, frozen at
  `sha256:b386914e31c70935678a58655caa655c188070276aa4d475e94fbdb4d21a6ecd`.
  The new mutation-only repair is now completed through the canonical runner.
  Scope hash `sha256:878a2b3b825a63c618039a531c02e7c363000fa26b6dc6fa9afbf3d294c1c29c`
  covered exactly `FallenStar` (`75`) and `SeveredHandBanner` (`3398`) and 17
  named write columns. Five layer readback and both public item endpoints pass;
  `SeveredHandBanner` now uses managed PNG
  `/terrapedia-images/items/2026/08/21/b32d32580d824b939e3d7323f6f1bed6.png`.
  Four pre-DML/post-readback attempts rolled back automatically; only retry-05
  committed. No permit file remains. The fresh image-lineage audit and final
  local acceptance gate are closed by the Item refresh evidence above; do not
  replay any consumed decision.

- **Local eight-domain complete chain**; owner: Codex; status: active; branch:
  `feat/supplementary-domains-readiness`; worktree: `/home/lolben/TerraPedia`;
  parent: none; dependencies: local MySQL/Redis/backend identity and fresh
  operation-level authorization; contract handoff:
  `docs/superpowers/plans/2026-08-17-local-eight-domain-complete-chain.md`
  and `docs/superpowers/plans/2026-08-17-local-eight-domain-complete-chain.zh.md`;
  closure plan: `docs/superpowers/plans/2026-08-18-local-data-chain-closure.md`
  and `docs/superpowers/plans/2026-08-18-local-data-chain-closure.zh.md`;
  scope: eight base domains are now local `L1/ACTIVE`; next are NPC/Boss loot,
  Item acquisition/source and drop relations, item image lineage, Projectile
  source relations, relation/projection/API parity, and local final gates;
  boundary: serial local-only work, no production, direct SQL, or L2. Chinese relationship map:
  `project-governance/reference/2026-08-17-supplementary-domains-item-source-relation-map.zh.md`.
- **Formal remaining-chain execution plan (2026-08-22 10:31 CST):** owner:
  Codex; status: active; branch: `feat/supplementary-domains-readiness`;
  parent: `entries/2026-08-17-local-eight-domain-complete-chain.md`;
  plan: `docs/superpowers/plans/2026-08-22-local-remaining-data-chain-closure.md`;
  entry: `entries/2026-08-22-local-remaining-data-chain-closure-plan.md`.
  Task 0.1 and fresh read-only preflight completed under
  `reports/runtime/local-data-chain-closure/20260822/remaining-chain/090736-remaining-chain-r2/`.
  Admin `413/413`, public checks, NPC/domain/runtime closure, Projectile no-op,
  image lineage `7/7`, Biome `47/47`, cross-DB `10/10`, and local smoke `5/5`
  pass. Item source remains blocked/quarantined (`522` candidates, `1295`
  duplicates, `311` potential inserts) with no apply. Local-core compatibility
  remains a documented items/NPCs/bosses projection variance; quality gate is
  `323/328` with five missing historical authorization fixtures. Final evidence
  index is under `090736-remaining-chain-r2/final/closure-index.json`. No new
  database write, crawler, import, authorization consumption, permit, staging,
  commit, cleanup, or external request occurred.
- **Remaining closure remediation plan (2026-08-22 10:50 CST):** owner:
  Codex; status: active; branch: `feat/supplementary-domains-readiness`;
  parent: `entries/2026-08-17-local-eight-domain-complete-chain.md`; plan:
  `docs/superpowers/plans/2026-08-22-remaining-closure-remediation.md`;
  entry: `entries/2026-08-22-local-remaining-closure-remediation.md`.
  It fixes hermetic quality fixtures and Admin contract reds before any DML,
  and has now completed fixture isolation, Admin contract repair, and a narrow
  relation-backed parity readback. The post-parity freeze is
  `reports/runtime/local-data-chain-closure/20260822/remaining-remediation/151930-remediation-post-parity/freeze.json`.
  Closure remains blocked by five local-only Item keys, four Boss pillar
  relation rows with missing Chinese title facts, existing domain acceptance
  blockers, and the local Chromium snap timeout; no Item-source operation was
  authorized or applied.
  then partitions Item-source identities and adds exact governed Item-source
  and projection-parity operations. It forbids authorization reconstruction,
  direct SQL, broad relation rebuilds, and reuse of old decision/permit roots.
  Execution is serial and self-repairing by the formal continuation matrix;
  parent closure is conditional on fresh all-green evidence only.
- **Remaining-image read-only rebaseline (2026-08-21 09:13 CST):** owner:
  Codex; status: active; branch: `feat/supplementary-domains-readiness`;
  worktree: `/home/lolben/TerraPedia`; fresh SELECT-only reports are under
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/091317/`.
  The current DB confirms Item `6159/6136` core image coverage, `23` missing
  Item image rows, and `6131` relation image rows whose `projection_items.image`
  values are all non-managed. NPC remains `758/762`, Projectile `1110/1111`,
  Armor `88/88` without managed projection proof, and Biome remains blocked by
  missing maint/relation image tables and projection field. The post-repair Item
  classification records `FallenStar` (`75`) and `SeveredHandBanner` (`3398`) as
  resolved and excludes them from all future scopes; the `15` legacy-unowned and
  `8` `ZH_RECIPE_*` identities remain quarantined.
  Item projection proposal generation is fail-closed because the required prior
  `canonical-item-image-lineage-apply` input/result/snapshot/packet artifacts are
  absent; no proposal, packet, permit, SQL write, or decision replay was made.
- **Item image lineage and projection closure (2026-08-21 09:44 CST):** the
  missing lineage evidence was regenerated from the active 6131-row bundle and
  applied under fresh decision
  `canonical-item-image-lineage-apply-20260821-admin-02`; all four layers
  read back `6131/6131`, with five out-of-scope local `detail` roles preserved.
  A separate Item projection proposal then froze `6131` existing rows and
  `332` changed rows under key-set hash
  `sha256:45631dd4d1de9095f523101e0ebc283233f8e847d87484930e1937c31b4d2359`.
  The exact `projection_items.image`-only apply completed under
  `canonical-item-image-projection-apply-20260821-admin-01`; no INSERT/DELETE,
  source write, local reverse-copy, or external request occurred. Fresh lineage
  evidence with the exact attempt root now reports Items ready and `4/7`
  entity-type image contracts ready. NPC and Projectile projection lanes and
  Biome schema ownership remain open; asset readiness still separately warns
  about 23 quarantined Item gaps and 2119 cached Item rows without original URL
  evidence.
- **Full managed-prefix rebaseline (2026-08-21 09:51 CST):** the prior NPC /
  Projectile not-ready result was a policy-input error: the audit environment
  only included Item prefixes. With the complete managed prefix set, fresh
  lineage evidence at
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/095109-full-policy/`
  reports `6/7` image contracts ready. NPC is `758/758` managed projection
  rows and Projectile is `1110/1110`; no new apply or authorization was needed.
  Biome is the only lineage contract blocker. Asset readiness remains a
  separate warning/blocking surface because of 2119 Item rows without original
  URL evidence and the known sentinel rows.
- **Fresh 13306 image baseline (2026-08-22 02:18 CST):** historical planning
  evidence superseded by the final Item refresh above. Its old managed-count
  snapshot (`5800/6131`, `0/758`, `0/1110`, `0/88`, `7/47`) remains immutable
  evidence only and must not be reused for authorization.
- The read-only `sync-maint-to-relation --apply=false` probe on 2026-08-22
  confirms source image rows exist for NPC/Projectile/Armor, but its apply mode
  is a broad table clear/rebuild and is forbidden for this image-only lane.
  Dedicated canonical projection operations remain the next implementation gap.
- Legacy MinIO origin repair completed locally under scope
  `sha256:50b83b418aaa625fba536d096dc0202ff197b788ec78e77f5ba50689566a50a2`.
  NPC, Projectile, and Armor image lineage now reads `6/7` ready; Item remains
  the sole lineage blocker. Asset freshness warnings remain separate.
- Item origin-only repair completed under scope
  `sha256:282505ce4ca6b2d8348b4bfe71ea28848e87a8ba5d3c7408acf51d3bcb6f5d2a`,
  updating `331` relation and `331` projection URLs. Item coverage is now
  `6131/6131` managed; the fresh canonical evidence binding is completed by
  the `042958-6129-freeze` / `admin-13` attempt recorded above.
- **Biome ownership contract audit (2026-08-21 09:54 CST):** a fresh
  SELECT-only schema/data audit confirms the active Biome set is `47` rows,
  with `40` managed icons and `7` Wiki fallback icons. Only
  `terria_v1_local.biomes` exists; `maint_biome_images`,
  `relation_biome_images`, and `projection_biomes.icon_url` are absent. The
  exact blocker and scope hash are recorded at
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/095414-biome-contract/`.
  No migration, table creation, or data write was attempted.
- **Complete image-chain closure (2026-08-21 10:20 CST):** the independently
  authorized Biome contract operation created and populated `maint_biome_images`,
  `relation_biome_images`, and `projection_biomes` for the exact 47-row local
  snapshot. Decision `canonical-biome-image-contract-apply-20260821-admin-01`
  completed with `47/47/47` readback. The lineage auditor now registers the
  Biome tables and treats the seven documented Wiki fallback icons as allowed
  public fallback, so the final image lineage report is `7/7` ready. Asset
  readiness still separately blocks on 2119 Item rows missing original/source
  fallback evidence and retains 23 quarantined Item rows; no external request
  or image transfer was performed.
- **Fresh image closeout verification (2026-08-21 12:33 CST):** evidence under
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/122523-closure-verified/`
  confirms lineage `7/7` and Biome `47/47/47`. The canonical schema path now
  owns the Biome maint/relation/projection tables, and focused Node tests pass
  `136/136`; focused backend Item/NPC/Biome/image-sanitizer tests pass `69/69`.
  The standard stack was restarted from the ignored complete config and is live
  on `18091/5177/3004`. Public API reads return 200; Items and NPC images pass,
  while seven Wiki-only Biome fallbacks are intentionally suppressed until a
  managed cached copy exists. Asset provenance/freshness remains a separate
  follow-up: 2,119 Item source fallbacks, five Item timestamps, and 388 Buff
  timestamps. The 23 Item plus four NPC and one Projectile missing identities
  remain approved identity-level quarantine.
- **Follow-up entry:** `entries/2026-08-17-local-eight-domain-complete-chain.md`;
  milestone complete: all eight automatic lanes have terminal L1 operation
  records, each domain and the scheduler read back as `L1/ACTIVE`, and
  Items/Projectiles have real local applies (`6131`: `2` updated/`6129` skipped;
  `1111`: `1110` updated/`1` skipped; zero errors). Seven latest progress files
  are terminal; a serial bounded NPC sweep completed all `511` coverage targets
  and the final coverage audit reports `eligibleBatchTargets=0`. The fresh
  source inventory still has `129` group-page variants without per-variant
  extraction, and the loot-chain audit remains blocked with `519` source
  blockers because the crawler evidence has not entered formal canonical
  landing/maint/relation owner phases. Formal owner apply accepts exactly 25
  frozen evidence pairs, but this sweep has no governed target-manifest
  producer for those batches; no manual manifest, DB apply, or owner-fence
  bypass is allowed. Fresh cross-DB evidence remains `9` pass, `0` blocking,
  and one preserved `6056` Item-source lineage warning. Loot, image, and
  relation closure remain open; daemon heartbeat observation still requires a
  secrets-backed canonical restart.

- **Current closure handoff (2026-08-18):** execute the bilingual local-only
  closure plan. The latest runtime parity report is `blocked` with `31`
  blockers (`19` API gaps and `12` duplicate/polluted API rows); the latest
  closure report has `0` domain blockers and `0` open loot audits but retains
  the `31` runtime blockers and a relation-health warning. The plan explicitly
  disables HTTP rate limiting only for a loopback acceptance run and requires
  user approval before any external source request.

  Parallel session coordinator: Codex. Task 0 (loopback fast API and local
  stack manifest contract) is delegated first; Task 1 (read-only evidence
  rebaseline) is delegated after Task 0 review. Agents do not own service
  lifecycle, devlog current-state edits, external requests, crawler/import,
  apply, SQL writes, or commits.

  Task 0 and Task 1 are now complete. Fresh run `20260818-035206` records
  `backend.httpRateLimitEnabled=false`; 50 loopback NPC aggregate reads were
  all `200` with no `429`. Fresh Task 1 evidence is under
  `reports/runtime/local-data-chain-closure/20260818/`: cross-DB `9 pass / 1
  warning / 0 blocking`, NPC coverage/domain pass, runtime parity still `31`
  blockers, closure still blocked only by runtime parity plus relation warning,
  and item-source closure remains read-only. The `113` unextracted group-page
  variants and `432` maint backfill rows recommending `crawl_npc_page` are
  explicitly external-evidence blocked; no request was made. After acceptance,
  the ordinary local stack was restored and manifest run `20260818-040556`
  reports `backend.httpRateLimitEnabled=true`.

- **Closure execution update (2026-08-18 05:12 CST):** Tasks 2-7 have now
  run locally. Fresh parity evidence is
  `reports/runtime/local-data-chain-closure/20260818/npc-loot-runtime-task2-final.json`:
  `418` NPCs, `416` trusted, `0` API gaps, and two canonical duplicate
  blockers (`Clothier/RedHat`, `DyeTrader/DyeTradersScimitar`) preserved as
  data blockers. Focused Spring tests pass `48/48`; Node parity tests pass
  `22/22` including the segmented/duplicate-head fixture. Aggregate loot uses segment IDs while shop/buffs retain
  representative IDs.

  Task 3 remains read-only with `269` candidates, `276` planned duplicates,
  and `0` dry-run source rows. Task 4 correctness/gap closure pass. Task 5
  image lineage is not ready for apply (only bosses contract-ready). Task 6
  Projectile relation readiness passes with `105` unresolved image backfill
  rows as non-blocking. Task 7 closure is blocked only by the two runtime
  duplicates; cross-DB remains `9 pass / 1 warning / 0 blocking` with the
  `6056` acquisition-lineage warning. The stack has been restored to ordinary
  protection (`backend.httpRateLimitEnabled=true`) and final single-request
  smoke returned `200`.

  No crawler, external request, import/apply, relation/loot/image apply, SQL
  write, staging, commit, cleanup, or discard was performed.

- **Duplicate governance audit (2026-08-18):**
  `reports/runtime/local-data-chain-closure/20260818/npc-duplicate-governance-audit.json`
  is `blocked_no_current_exact_authorization` (sha256
  `33d6666bda2e293961dd4d98a45d45e8e868eac988057079711f776b71ea1c84`). No
  current request, packet, frozen bundle, preview, or readback binds the two
  canonical duplicate identities. Historical non-boss/Boss decisions are
  consumed and partition-wide. The exact rows are Clothier relation `623/1543`
  and local `82367/83287`, plus DyeTrader relation `755/1544` and local
  `82499/83288`; each pair has distinct source lineage. No API dedupe, direct
  SQL, broad apply, crawler, or external request is allowed. Closure remains
  `blocked` pending a new exact owner-scope authorization.
  A review-only frozen preview now records the complete candidate scope at
  `reports/runtime/local-data-chain-closure/20260818/npc-duplicate-owner-scope-preview.json`
  (sha256 `8f042c45183e8a80253396c071326a4b635a058d74372d9bb705213c881f5ccf`),
  with `applyAllowed=false` and no selected canonical row. It cannot be dispatched
  until an Owner decision and a new exact authorization exist.

- **Post-quarantine closure verification (2026-08-18):** the exact authorized
  operation completed and read back all eight targeted soft-disables. The
  generated-bundle survivors remain active, and each canonical identity has one
  active local row. Fresh loopback parity is now `418/418` trusted direct loot,
  `0` API gaps, `0` duplicate/polluted rows, and `1542` rows in each relation,
  projection, local, and API stage:
  `reports/runtime/local-data-chain-closure/20260818/post-quarantine/npc-loot-runtime-parity.json`.
  Closure smoke passes with `0` domain/runtime blockers and `0` open loot audits:
  `reports/runtime/local-data-chain-closure/20260818/post-quarantine/npc-loot-closure.json`.
  Relation-health remains warning-only (`21 pass / 1 warning / 6 info / 0
  blocking`) and cross-DB remains `9 pass / 1 warning / 0 blocking`.
  The stack was restarted with ordinary protection; the final manifest reports
  `backend.httpRateLimitEnabled=true`. Basic backend/admin smoke endpoints were
  `200`, while managed-image probing was stopped because the configured image
  origin is unreachable.
  The plan remains active for item-source/image governance and missing
  fail-closed quality-gate fixtures; no external request, crawler, additional
  SQL write, staging, commit, cleanup, or discard occurred.
  A real `sync-maint-to-relation` NPC-scoped `apply=false` dry run against the
  local databases completed through an injected `13306` config; active relation
  readback still has no `1543/1544` rows, confirming precedence did not
  rematerialize the quarantined crawler overlap.

- **Continuation verification (2026-08-18):** fresh NPC/closure/domain Node
  suites pass `107/107`. Lineage/owner-phase contracts pass `17/18`; the one
  failure is the expected fail-closed missing
  `reports/authorization/canonical/canonical-npc-apply.input.json`. The preview
  parses successfully and `git diff --check` remains clean; no staged diff exists.

- **Image and gate recheck (2026-08-18):** compatibility-prefix image evidence
  is `4/7` ready at
  `reports/runtime/local-data-chain-closure/20260818/image-source-lineage-task5-compat-recheck.json`;
  NPC, Boss, Projectile, and Armor are ready, while Item authorization evidence,
  Buff projection values, and Biome lineage remain blocked. The local contract
  gate `bash ./platform/local/quality-gate.sh --skip-front --skip-admin` ran
  `327` tests with `322` pass and `5` fail, all due to absent fail-closed
  governance artifacts (`canonical-item-group-bootstrap.result.json`,
  `canonical-npc-apply.input.json`, and dependent fixture). No artifacts were
  fabricated and no write/apply was run.

- **Item-source treatment recheck (2026-08-18):**
  `reports/runtime/local-data-chain-closure/20260818/item-source-remaining-treatment-task3-recheck.json`
  classifies `292` focused candidates; all `276` planned rows are duplicates
  (`toInsert=0`). Ten projection-required rows remain (CenxsWings plus nine
  Biome rows). CenxsWings has no current maint/relation lineage, so its old
  generated town-NPC import cannot be replayed. No source apply or external
  request was run.

- **Low-pressure external-evidence extension (2026-08-18):** the user now
  permits the bounded Wiki source refresh required by the two previously
  stopped NPC lanes, with the hard condition that it must avoid `429`; a slow
  serial run is preferred to throughput. Coordinator: Codex. One child owns
  only the shared request-gate test-first safety change; a second child owns
  only the read-only target-manifest audit. The coordinator alone owns
  `wiki-sync-progress.latest.json`, detached crawler start, devlog updates,
  and any subsequent audit. The crawler may write raw/normalized files,
  progress, and reports only: no database write, governed relation/import
  apply, SQL, staging, commit, cleanup, or discard is authorized. The external
  scope is variant-specific group-page loot extraction and missing
  per-entity projectile/loot evidence; `CenxsWings`, ordinary Item source
  applies, image downloads, and all non-Wiki domains remain out of scope.

- **External refresh completed (2026-08-18):** request-gate safety was added
  and focused tests pass `14/14`; a `429` now stops immediately and persists
  `Retry-After`. The frozen manifest is
  `reports/runtime/local-data-chain-closure/20260818/external-refresh-target-manifest.json`
  (`sha256:f8fde04e5cd413d2b8bc44444219223b32e961e02b1d376fde8c296a60d17c14`):
  `299` deduplicated pages from `113` group rows and `368` unique current
  candidate keys. The detached serial crawler finished `299/299` with
  `0` observed `429`; terminal progress and all `299` normalized/canonical/audit
  files are under `reports/runtime/local-data-chain-closure/20260818/external-refresh/`.
  Read-only freeze is
  `reports/runtime/local-data-chain-closure/20260818/external-refresh-evidence-freeze.json`
  (`sha256:b2eb6df8053c34e74a6bb40d2a5d0a1e876faf7192c901011910f751e120e259`):
  audits `295 pass / 4 warn / 0 fail`, bridge `0` unmatched and `20` conflict
  samples, bundle `1269` records with `357` open candidates (`116` Item,
  `241` Projectile). `applyAllowed=false`; no DB write or relation/import apply
  has occurred.

- **Bridge conflict repair (2026-08-18):** the 20 recorded bridge conflicts were
  traced to expanded shared-page members retaining page-wide infobox IDs (the
  `Town Slimes` page), not to loot or relation identity conflicts. A regression
  test now gives an expanded `groupMember` unique-name match precedence over
  page-wide auto IDs in `pipelines/crawler/src/bridge/npc-bridge-match.mjs`.
  The targeted bridge recheck under
  `reports/runtime/local-data-chain-closure/20260818/external-refresh/bridge-recheck/`
  reports `306` crawler records, `0` unmatched, and `0` conflict samples;
  bridge/crawler tests pass `41/41`. The original evidence freeze remains
  immutable evidence; no bundle apply or database write occurred.
  The four page warnings are retained as truthful warnings: Cattiva/Foxparks are
  item/minion pages, The Torch God is a domain-separated event reward, and
  Mimics is a multi-infobox group page with scoped loot. None is promoted to an
  ordinary NPC loot relation by this repair.
  A read-only bundle preview at
  `reports/runtime/local-data-chain-closure/20260818/external-refresh/bridge-recheck/npc-relation-owner-scope-preview.json`
  has `1269` records
  (`841` loot, `428` shop) and `357` open candidates (`116` NPC-item,
  `241` NPC-projectile), with scope hash
  `sha256:268049c1a7e63e49fa3a2f0ee45bcd201af75ee3d00aff56dd6bfba6c48b7de7`.
  It names landing/maint/relation/local owner targets but keeps
  `applyAllowed=false`; this is the immutable pre-authorization snapshot. The
  later exact-scope packet is recorded below; no database write has occurred.
  The full crawler test glob is `119/122`; the three failures are pre-existing
  baseline/layout issues (`pipelines/scripts/lib/load-standardized-dataset.mjs`
  missing and two stale Item/Projectile Phase-0 hashes), outside this matcher
  change. The focused bridge/crawler suites remain `41/41`.
  A fresh full NPC parity attempt did not reach a terminal report after roughly
  4.5 minutes and was stopped; a single loopback aggregate smoke still returned
  `200`. The prior post-quarantine `418/418` parity report remains the latest
  complete evidence, with full-rerun stability still open.

- **Authorized exact NPC relation scope (2026-08-18):** user authorization is
  recorded for scope
  `sha256:268049c1a7e63e49fa3a2f0ee45bcd201af75ee3d00aff56dd6bfba6c48b7de7`.
  The governed operation
  `canonical-npc-external-relation-scope-apply` binds the bundle/preview hashes,
  server fingerprint, nine owner targets, and `357` unresolved candidates as
  quarantine-only. Dry-run evidence is
  `reports/runtime/local-data-chain-closure/20260818/external-refresh/bridge-recheck/npc-relation-owner-scope-dry-run.json`;
  request, packet, manifest, owner input, and fingerprint are under
  `reports/authorization/canonical/`. Focused contract/manifest tests pass
  `52/52`. No permit was consumed and no DB write ran: CLI apply remains
  fail-closed until an affected-key handler and readback are registered.

- **Affected-key handler review (2026-08-19):** the concrete one-connection
  writer and exact payload guard are implemented; focused operation/manifest
  tests pass `55/55`, and the maint lookup uses the real schema columns. A
  current manifest/request/packet was regenerated after the code hash changed
  (`packetHash=sha256:b69f03f91d3c5de31bbeca0b4e55f9a6427b2c49ae0baf66b8dc32602fd54ef9`,
  `executionManifestHash=sha256:cb49285959ea1d4d8f3e1a17559009ee7bdd3dbd8b87a56014e4919c22eafa3c`).
  A static replay then found a hard scope mismatch before SQL: the generic
  relation processor resolves only `1090/1269` facts and yields `654` loot / `427`
  shop rows versus the frozen preview's `841/428`; `179` rows are blocked or
  unresolved, mostly pseudo-source bonus buckets and collective mappings. The
  evidence is at
  `reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-static-replay.json`.
  Do not create/consume a permit or apply until an accepted/quarantine
  projection is frozen and separately authorized. MySQL is now reachable and
  the stack is running with a runtime-only fast-local override; no DB write ran.

- **Fresh read-only rebaseline (2026-08-19):** backend health is `UP` with
  `httpRateLimitEnabled=false` only in the local process environment. NPC
  source/domain/closure evidence is green; parity is `418/418` trusted direct,
  `1542` rows per stage, and no 429 with retry count `0`. Cross-DB is `9 pass / 1
  warning` (`6056` local acquisition rows without relation/maint trace), and
  relation health remains warning-only. Projectile relation/image and NPC
  relation readiness pass; item image readiness and six of seven DB image
  lineage entity types remain blocked. Full evidence is under
  `reports/runtime/local-data-chain-closure/20260819/`.

- **Revised accepted/quarantine proposal (2026-08-19):** real maint identity
  replay froze `1071` source facts/details, `655` loot, `408` shop, and `198`
  quarantine facts in
  `reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-accepted-quarantine-projection.json`.
  Its proposal hash is
  `sha256:759c022a34a243ed17c93630727bb07d965b95064ed296740ecdf5d01cc6ca39`;
  it remains no-write. The user must explicitly authorize this revised hash
  before a new packet or permit can be generated.

- **Accepted NPC relation scope apply (2026-08-19):** the user-authorized
  scope `sha256:759c022a34a243ed17c93630727bb07d965b95064ed296740ecdf5d01cc6ca39`
  was applied through the governed operation using decision identity
  `npc-external-relation-scope-20260819-07`. Final result is
  `reports/authorization/canonical/canonical-npc-external-relation-scope-apply.result.json`:
  landing `1`, maint sources `1071`, relation facts/details `1071/1071`, loot
  `655`, shop `408`, local loot/shop `655/408`, crawler facts `0`; quarantine
  `198` remained no-write. No external request or direct SQL was used.
  The post-apply runtime report is blocked by `200` duplicate/polluted NPCs:
  relation still contains old `terrapedia.generated` lineage (`2135` facts,
  `1172` loot, `938` shop) alongside the new `terraria.wiki.gg` lineage
  (`1071/655/408`). Old-lineage cleanup was not authorized and local tables
  lack source lineage, so no cleanup was performed. Post-apply closure remains
  blocked; cross-DB is `9 pass / 1 warning` and relation health is warning-only.
  Stack was restarted with random runtime secrets and ordinary
  `httpRateLimitEnabled=true` after the loopback verification attempt.

- **Push/merge `design/crawler-auto-ingestion-readiness`**: independent owner decision.
- Item request: `reports/authorization/canonical/canonical-crawler-v2-items-t1-acceptance-20260809-07.request.json`; packet `...-20260809-07.packet.json`; status: `AUTHORIZED` and consumed under `canonical-crawler-v2-items-t1-acceptance-20260809-admin-07`.
- Scheduler request: `reports/authorization/canonical/canonical-crawler-v2-scheduler-t1-acceptance-20260809-04.request.json`; packet `...-20260809-04.packet.json`; status: `AUTHORIZED` and consumed once under `canonical-crawler-v2-scheduler-t1-acceptance-20260809-admin-07`.

## Current State

Root governance files `03`, `04`, and `07-12` were removed from the current tree on 2026-07-10. Do not recreate removed root governance files `03`, `04`, or `07-12`; use Git history only for audit or rollback.

- The structure migration is integrated into the primary feature branch. The
  Shimmer data, authorization reports, and unrelated active work remain
  uncommitted and untouched.

- Public-page fidelity rebuild remains active. Item is committed at `8d459fe1`; NPC is committed at `3d9045fa`. The Article split is implemented but uncommitted: `/articles` keeps the production fold with mast search and six non-duplicated latest rows, while `/articles/archive` owns twelve-card search/pagination. Task 7 is now closed: the full static gate, direct-route/SSR-302 proof, the three server-dependent cross-route gates, the twelve-probe three-theme matrix, and the design-system review all pass, and the two compact-card defects found by that review (kicker/date spacing and fallback-cover typography) are repaired under two new contract assertions. Only user visual acceptance remains. No API/data repair is part of it.

- Front P2 merged-result validation passes the full public frontend gate and
  the focused public armor/recipe backend suite (16/16). The source integration
  worktree remains available with two unstaged HTML acceptance auxiliaries.

## Next Agent Start Point

- Closure Tasks 0-7 have been executed locally and remain uncommitted. Start at
  the active closure entry's post-quarantine verification and dated reports.
  Parent-conflict retirement has now soft-disabled the separately authorized
  `84` old-generated relation rows. Fresh runtime evidence still has `37`
  duplicate/polluted NPCs and `4` projection gaps; domain has six count-parity
  blockers. The next safe lanes are read-only classification or a new exact
  authorization for the remaining independent `wiki_gg` lineage/projection
  mismatch; item-source and image governance remain open. Until an explicitly
  approved lane exists, do not run crawler, external requests, import/apply,
  direct SQL writes, broad partition apply, or commit.

- Fresh 2026-08-19 apply evidence is recorded in the active closure entry and
  the accepted-scope result artifact. The exact 655/408 relation lane is
  committed and read back. The separately authorized parent-conflict relation
  lane is also committed and read back; runtime parity remains blocked by the
  independent residual classes and broader image/source closure. Do not infer
  permission to modify those classes from either prior authorization.

  Coordinator-only no-write continuation completed the immutable stale-lineage
  preview. Exact retirable lineage is `terrapedia.generated` plus hash
  `07cd3493...eae8b3`, source key `generated.npc_item_relations_bundle`, and
  maint table `maint_item_sources`; inventory is `2135/2135/1172/938` for
  facts/details/loot/shop. The preview proposes `513` loot, `408` shop, and
  `921/921` facts/details, while quarantining `84` parent conflicts, `1153`
  independent-lineage rows, `1423` unmatched rows, `7` projection gaps, and
  `38` local duplicate tuples. Report:
  `reports/runtime/local-data-chain-closure/20260819/npc-stale-lineage-repair-preview.json`;
  scope hash `sha256:09869c305cb89e5dfd084f5dc01f06d55e7cec9f17a666c1516586e92d87fb5d`.
  The report is fail-closed and no permit/apply/write was performed. Await a
  new exact authorization for this proposed relation/fact/detail scope; the
  previous `sha256:759c...` authorization does not cover it. The user then
  authorized exact scope `sha256:09869c...7fb5d`; governed retirement committed
  `513` loot, `408` shop, `921` facts, and `921` details with `activeTargets=0`
  under decision `canonical-npc-stale-lineage-retirement-20260819-admin-02`.
  Loopback parity after the operation is `362` trusted, `53` duplicate/polluted,
  `3` projection gaps (`56` blockers); closure remains blocked on those residual
  runtime rows. Remaining old generated active rows are outside the authorized
  scope and remain quarantine-only (`1214` facts/details, `659` loot, `530`
  shop). The stack was restored to ordinary rate limiting.

  A read-only residual classification is now frozen at
  `reports/runtime/local-data-chain-closure/20260819/post-stale-lineage/npc-runtime-residual-classification.json`
  (SHA-256 `sha256:c87508e2ac789a78b3cde8fb9fab9f8695347667afddab13dae02fb648386038`).
  It records `136` duplicate identity groups across `53` NPCs: `84` accepted +
  old-generated parent conflicts and `52` accepted + independent `wiki_gg`
  lineage groups. It also records the `3` projection text-identity mismatches,
  with accepted/local/API rows present and no local/API gap. Both duplicate
  classes remain quarantine-only, and projection gaps remain blocked because no
  governed NPC projection operation is bound. Do not infer a new scope from the
  consumed retirement authorization.

  A second read-only preview isolates the `84` accepted + old-generated
  parent-conflict loot relations at
  `reports/runtime/local-data-chain-closure/20260819/post-stale-lineage/npc-stale-lineage-parent-conflict-preview.json`.
  Its output hash is `sha256:ca964ae6746553e8ae39a1cf6c973ae1649e92313d4e11f03b42dd81cf2d6134`;
  exact candidate scope is `sha256:51efc81d854b9ff9bb3bf508e04edc4ac39ac3dab6b3c194d23710fbf697d001`.
  Readback is `84/84` active old loot, facts, details, and accepted survivors;
  those facts have `361` active child relations, so the existing fact/detail
  retirement operation cannot be reused. No relation-only operation or permit
  exists, and no mutation is authorized.

  Parent-conflict scope `sha256:51efc81d854b9ff9bb3bf508e04edc4ac39ac3dab6b3c194d23710fbf697d001` was then authorized through the new relation-only operation
  `canonical-npc-stale-lineage-parent-conflict-retirement`. Final decision was
  `canonical-npc-stale-lineage-parent-conflict-retirement-20260819-admin-03`
  with packet hash `sha256:d7090f5fb13ffd3ab599f7270a1904ec265eb1568f3c9682a3c1a9fcaeff5041`.
  The transaction committed and read back `84` affected relations with
  `activeTargets=0`; result hash is
  `sha256:1cde357d50e976f1e5250299cfc2e2959a65ca37cc45ab9b7d114be66ea0af4d`.
  No facts/details/local/projection or variant rows were written. Two earlier
  contract mismatches failed closed before SQL and are retained as audit
  artifacts.

  Fresh post-apply evidence is under
  `reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/`:
  parity is `418` NPCs, `377` trusted, `37` duplicate/polluted, and `4`
  projection gaps (41 blockers), with stage rows `1600/1542/1600/1600`;
  domain audit retains 6 count-parity blockers; closure remains blocked and
  relation health is warning-only with 0 blocking checks and 0 open loot audits.
  The temporary loopback run completed with no 429 after a one-off startup
  failure caused by a 30-character pre-existing runtime secret; no secret was
  written to disk. The ordinary stack is restored and its manifest records
  `httpRateLimitEnabled=true`. Focused parent-conflict/manifest/catalog tests
  pass `47/47`, authorized-operation suites pass `35/35`, and no crawler,
  external request, additional SQL write, staging, commit, cleanup, or discard
  was performed.

  The separately authorized operation
  `canonical-npc-projection-gap-wiki-gg-variant-retirement` then retired four
  old `wiki_gg` relation rows only (scope
  `sha256:880fa2d9f9b14b3071400cfeac9af4de9e59757843481dbc0d65714c444ae4c8`).
  Readback is `relationLoot=4`, `activeTargets=0`, and
  `activeSurvivors=4`; facts/details, projection, local, and API data were not
  written. Result: `reports/authorization/canonical/canonical-npc-projection-gap-wiki-gg-variant-retirement.result.json`.
  A fresh loopback fast-mode parity rerun has no 429 and reports `418` NPCs,
  `377` trusted-direct, `41` duplicate/polluted, and stage rows
  `1544/1542/1600/1600`. The ordinary stack is restored with
  `httpRateLimitEnabled=true`.

  The residual is not a safe relation-only apply: `59` `wiki_gg` projection
  entries and `73` generated projection entries reference inactive relation
  keys, while local/API rows are lineage-blind. Seven active `wiki_gg` rows
  remain: five have one accepted relation survivor but need projection and
  local reconciliation first; `DesertLamiaLight/MoonMask` has no accepted
  survivor and `IceMimic/SnowballCannon` has two. The independent-variant
  rerun therefore proposes zero rows and quarantines `314` no-survivor rows.
  No scope may be inferred from the consumed operations.

  Fresh read-only item/image evidence: cross-DB is `9 pass / 1 warning / 0
  blocking` (the known `6056` untraced local acquisition rows); relation health
  is `0` blocking / `1` warning. Item-source evidence has `3,730` rows,
  including `1,269` active-source closure rows, `17` raw candidates, one NPC
  relation projection gap, and nine biome projection rows pending. Image
  lineage is ready only for Bosses; image asset readiness remains blocked by
  `2,119` item cache rows with no source/original fallback. The plan stays
  `active/blocked`; next action is a read-only, exact projection/local
  reconciliation preview, not a broad apply.

- **Latest closure verification (2026-08-19 07:51 CST):** the exact residual
  scope `sha256:09869c305cb89e5dfd084f5dc01f06d55e7cec9f17a666c1516586e92d87fb5d`
  was applied through the governed coordinated relation/projection/local
  operation. Relation rows `128/129` and local rows `81872/81873` are retired;
  projections `179/83` use accepted Nazar identities. Fresh parity is
  `418/418` trusted direct, `blockingCount=0`, with `1542` rows in every stage.
  Final closure remains `blocked` only on independent domain evidence
  (`17` `unclassifiedZero`, `releaseBlockingCount=18`,
  `source_coverage_unavailable`); relation health is warning-only with zero
  blocking checks and zero open loot audits. The fast stack was stopped and
  ordinary rate limiting restored; `reports/local-start/run-manifest.json`
  records `backend.httpRateLimitEnabled=true`. Ordinary smoke returned `200`
  for backend Item/category and admin root/proxy endpoints. Managed-image
  probing remains blocked because the configured image origin is unreachable.
  The long-running plan and entry remain `active`; item-source lineage, image
  readiness, and domain evidence are not closed. No commit, staging, stash,
  cleanup, or discard occurred.

- **Image original-URL provenance preview (2026-08-19 10:09 CST):** the
  read-only report
  `reports/runtime/local-data-chain-closure/20260819/post-final/item-image-original-url-provenance-preview.json`
  (SHA-256
  `sha256:dc46a755707d2a33df5e26b227b645a6a33091cb84af26ea4e58e1cc7cf09f82`)
  covers all `2,119` active item image rows missing `original_url`. Shared raw
  item pages and managed cache objects are present for `2,119/2,119`; exact
  local evidence deterministically recovers `2,117` canonical URLs. `FallenStar`
  is a PNG/GIF variant conflict and remains
  `ambiguous_requires_external_verification`; `SeveredHandBanner` has only
  file-title-level evidence and remains `recoverable_from_local_file_title_only`.
  The report is read-only with no external requests, DB writes, apply packet,
  or URL mutation. Landing hashes identify only the landing payload, so image
  readiness remains open pending a separately approved treatment of these two
  rows.

- **Scheme A local-only scope freeze (2026-08-19 12:59 CST):** user selected
  local evidence first. Read-only preview
  `reports/runtime/local-data-chain-closure/20260819/post-final/scheme-a-local-image-scope-preview.json`
  freezes `2,117` exact Item provenance candidates across maint/relation/local
  and `388` Buff projection candidates, excluding `FallenStar` and
  `SeveredHandBanner`; scope is
  `sha256:9e32660f26b5c689b47853f01f1a9dc044b81b52f6fa2751c2ce8abfa7a9060f`.
  The historical Item lineage writer is not reusable because it deletes and
  reinserts all `6,131` identities across four layers. No authorization,
  packet, permit, or write exists for the frozen narrow scope. A dedicated
  patch design or an explicitly approved full-snapshot replacement is required
  before any mutation; Buff projection is a separate one-column operation.

- **Image provenance/projection continuation (2026-08-20):** coordinator is
  Codex. The owner asked to proceed with image closure under Scheme A. The
  narrow implementation plan is
  `docs/superpowers/plans/2026-08-20-local-image-provenance-projection-closure.md`
  and its Chinese counterpart. Scope remains two independent operations only:
  Item provenance for the frozen `2,117` exact candidates and one-column Buff
  projection for `388` rows; `FallenStar` and `SeveredHandBanner` remain
  quarantine. Read-only schema/provenance/catalog audits may run in parallel;
  only the coordinator may edit operation code, registry, reports, or this
  devlog. No current packet, permit, or database-write authorization exists.
  A read-only local MySQL schema check confirms `relation_item_images` stores
  `source_page`, `source_revision_timestamp`, and `original_url`; the planned
  Item patch therefore updates the same three provenance columns in all three
  layers, without schema expansion.

- **Image provenance/projection authorization preparation (2026-08-20):** the
  historical provenance byte hash in the frozen scope
  (`sha256:62952730a4e3646701327902517a17bc1a0cd108e1d1a9c638d677bc750ab0da`)
  differs from the current report (`sha256:dc46a755707d2a33df5e26b227b645a6a33091cb84af26ea4e58e1cc7cf09f82`),
  but a fail-closed reconciliation compares all six consumed values for all
  `2,117` Item identities and reports zero missing, non-exact, invalid, or
  mismatched evidence. The reconciliation report is
  `reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/item-image-provenance-evidence-reconciliation.json`.
  Fresh read-only local-row preflight produced two separate private requests:
  Item provenance scope `sha256:e19e17341f8baa448b3c845796d76cf99c73df711bd2470c051cc111066a4574`,
  request `sha256:05415740af5a7324aa7616850302964b5ee943dfb2ac5a3036b951956f03e853`;
  Buff projection scope `sha256:c59f97b26d293ee18052088597f1cda18354741ec53ef984d0c319a9355e0487`,
  request `sha256:1a495ed25ef2a7946e95e7585eb335724bd807c9a7976071d304b067011de653`.
  Item owns only the exact nine provenance columns over `2,117` rows per
  layer; Buff owns only `projection_buffs.image` over `388` rows. Both
  executors validated with `--apply=false`; 58 focused tests pass. No packet,
  permit, transaction, database write, external request, crawler, staging, or
  commit occurred. The task remains active and paused for explicit, separate
  owner authorization of each request.

- **Image provenance/projection authorization retry (2026-08-20):** before
  packet creation, the two initially authorized requests were correctly
  rejected as technically incomplete: both had `policySetHash=null` and listed
  `policySetHash` in `missingTechnicalFields`. No packet, permit, ledger entry,
  or DML was created. The generator now reads and canonicalizes the current
  local automation policy set for all future image-patch requests. A fresh
  read-only check confirms the current ten-row policy set remains
  `sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`
  and the local server fingerprint is unchanged. The original input, preview,
  and execution manifests remain preserved; two no-overwrite retry requests
  bind the same Item/Buff scopes plus that policy set: Item request
  `sha256:d01e85e23d81e0c00b96d3f6215fb634f22103329b47624f0eee335308b70d38`,
  Buff request
  `sha256:f8d44a6496019f009ba75b30689b322f3ab5f553978f3e56526a8724df925957`.
  Both have `missingTechnicalFields=[]`; fresh separate owner authorization is
  mandatory because the prior exact request hashes cannot transfer to a new
  technical identity. Generator tests pass `6/6`. The broad canonical
  authorization suite has 12 pre-existing failures from stale operation-count
  and retired-path assertions plus incomplete projection fixture copying; it is
  not used as apply evidence. Task remains active and blocked solely at the new
  owner-authorization gate.

- **Image provenance/projection runner repair and retry (2026-08-20):** the
  Item `retry-01` packet was signed and dispatched, then stopped before any
  mutation because the child executor received only the packet's server
  fingerprint hash and compared it as though it were a UUID. The generic
  runner had already verified the real fingerprint but did not propagate it;
  its decision identity
  `canonical-item-image-provenance-patch-20260820-admin-01` is consequently
  consumed without a permit, result, or database transaction. Buff was not
  signed or dispatched. The repair passes the canonical fingerprint object
  through a controlled child environment value, requires the child to match its
  hash against the packet, then compares its UUID to MySQL. Focused
  context/runner/manifest/Item/Buff/generator validation passes `95/95`.
  Fresh read-only preflight confirms all `2117` Item and `388` Buff rows still
  match their original before-state. New code-bound retry requests await fresh
  exact authorization: Item
  `sha256:b9e8d8cd587fa40a3c27a6417251e7db6a127a48b536a18da145f3b5a6bd3998`,
  Buff
  `sha256:d03bad07d911d4b371f6f60a6d6ee24f9491b03f31ab02cfd15bb7df42af7828`.
  The prior retry authorization cannot transfer across the changed code bundle.
  No external request, crawler, Item/Buff DML, staging, commit, cleanup, or
  discard occurred.

- **Image provenance retry-02 execution and datetime guard (2026-08-20):** the
  user authorized both retry-02 requests. Item packet
  `sha256:df551b5b7ca055a5e806bc3e3f99f6d6890282bad9274136874076bd6f375d33`
  was signed and dispatched. It stopped at the first maint update because raw
  ISO UTC timestamps (for example `2026-04-18T19:58:09Z`) were sent directly to
  strict MySQL `DATETIME(0)` columns. The transaction rolled back; the result
  file is absent, the permit was revoked, and the consumed decision identity is
  `canonical-item-image-provenance-patch-20260820-admin-02`. Buff was not
  signed or dispatched.
- The fail-closed repair serializes only ISO UTC revisions to
  `YYYY-MM-DD HH:mm:ss`, rejects timezone-less timestamps, and compares MySQL
  driver `Date` readbacks by UTC-second semantics. Regression coverage passes
  `97/97` across the focused runner/manifest/Item/Buff/preparation suites;
  `git diff --check` passes. A no-overwrite retry-03 Item manifest and request
  are prepared with request hash
  `sha256:894fce86721bfa506008aa6432788b20bae9c9fa6495d09ac0b616c5286bb344`
  and code hash
  `sha256:2e8e9ad508b76286d6afc1663d9e653512f6e62728166fc4345faf0e01016717`.
  The task is paused for fresh exact owner authorization of retry-03; retry-02
  authorization cannot transfer to the changed code bundle. No external
  request, crawler, Buff DML, staging, commit, cleanup, or discard occurred.

- **Image provenance and Buff projection apply complete (2026-08-20):** after
  fresh authorization, Item retry-03 packet
  `sha256:ae55e746d0cea1fa525c76f328921dafb87827593c304c38a597b6a4cf91295d`
  completed under decision
  `canonical-item-image-provenance-patch-20260820-admin-03`. It updated and
  read back `2,117` maint, `2,117` relation, and `2,117` local rows, covering
  `6,351` row-layer updates / `19,053` provenance field values. Buff retry-02
  packet `sha256:088b6a81f1dde94f66dc3f17c11a97d854aaba9889086f4b8c5066437122961f`
  completed under decision
  `canonical-buff-image-projection-patch-20260820-admin-02`, updating and
  reading back exactly `388` `projection_buffs.image` values while relation
  image evidence remained unchanged. Both result artifacts are completed and
  both permits were revoked after one-time consumption.
- Post-apply image readiness is still `blocked`: Item has `2` managed/cache
  rows without source/original fallback, `23` rows without an image, and `5`
  stale verification timestamps; Buff is `warning` only because all `388`
  verification timestamps are stale; NPC remains non-unified with `4` missing
  images. Post-apply lineage has `2/7` entity types ready (Buffs and Bosses);
  Item still has projection-managed-image evidence gaps, and NPC/Projectile/
  Armor/Biome remain independent residuals. Local core compatibility smoke is
  `failed` for Items, NPCs, and Bosses.
- Focused image/authorization suites pass `97/97`; `git diff --check` passes.
  Read-only API smoke returned `200` for backend Items, backend categories,
  admin root, and admin Items proxy; front root exceeded the five-second
  timeout. The canonical smoke script was stopped after it hung on the known
  unreachable image origin (`localhost:19000`); no service or database state
  was changed. The closure plan remains active and does not claim total image
  closure.
- **Image runtime recheck (2026-08-20):** the configured MinIO data directory
  already contained the local managed objects, but the ordinary example stack
  config had MinIO disabled. Using the repository start script with
  `--reuse-existing` and loopback-only temporary credentials restored the
  canonical object API on `localhost:19000` without restarting the existing
  backend/front/admin processes or changing database rows. The bounded local
  smoke is now `5/5`; direct object, legacy image-compat proxy, front root, and
  front Items probes returned real `image/png` or HTTP `200` evidence. With the
  correct local MinIO prefixes supplied to the read-only lineage audit, image
  lineage is `5/7` ready: Buffs, NPCs, Bosses, Projectiles, and Armor sets pass.
  Remaining gaps are Item `invalid_item_image_projection_apply_evidence` and
  the intentionally unimplemented Biome maint/relation/projection image
  contract. Item asset readiness remains blocked by `2` rows lacking
  source/original fallback, `23` missing images, `5` stale verification rows,
  and Buff's `388` stale verification rows; these are data-contract findings,
  not object-origin reachability failures. Reports:
  `reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/post-minio-image-asset-readiness.json`,
  `post-minio-image-source-lineage-configured.json`, and
  `reports/local-start/smoke-20260820-015430.json`. No crawler, external
  request, new permit, database write, staging, commit, cleanup, or discard
  occurred.

- **Fresh final-rerun evidence (2026-08-20 02:42 CST):** a new read-only
  evidence set was written under
  `reports/runtime/local-data-chain-closure/20260820/final-rerun/`. NPC source
  coverage is `762/762` pass and the domain audit is now `releaseBlockingCount=0`
  (`304` direct loot, `114` contract-backed inherited, `289` expected-zero,
  `17` reviewed no-direct-item-loot). Closure smoke consumes that report plus
  the existing fresh loopback parity and reports `0` domain blockers, `0`
  runtime blockers, `0` open loot audits, and `418` trusted direct-loot NPCs.
  Cross-DB remains `9 pass / 1 warning / 0 blocking`, with the sole warning
  being `6,056` local acquisition rows without maint/relation lineage; relation
  health remains `21 pass / 1 warning / 6 info / 0 blocking`.
- The same rerun confirms Item source closure is still read-only and not fully
  closed: `269` duplicate-only candidates, `276` planned duplicate rows,
  `17` projection rows with `16` public-contract-covered, and `23` explicit
  exemption candidates. Image asset readiness remains blocked by `2` managed
  rows without source/original fallback and `23` missing images; Buff is
  warning-only with `388` stale verification timestamps. Image lineage is
  `2/7` ready under the default managed-prefix audit and `5/7` ready when the
  actual local MinIO prefixes are supplied; Item projection evidence and the
  Biome image contract remain independent blockers.
- The full loopback NPC parity rerun was stopped after more than five minutes
  without a terminal report; it produced no write or 429. The latest complete
  fresh parity artifact remains `.local/tmp/image-audit/fresh-npc-parity-20260820.json`
  (`418/418`, `1542` rows at each relation/projection/local/API stage). The
  focused parity, image patch, and local-core suites pass `40/40`. The two
  quality-gate fixture suites remain fail-closed: `3` item-group publication
  tests require the absent `canonical-item-group-bootstrap.result.json`, and
  one NPC owner-phase test requires the absent
  `canonical-npc-apply.input.json`; no fixture was synthesized.
- **Biome icon read-only audit (2026-08-20 03:12 CST):** the loopback audit
  reports `47` active biome rows: `40` managed local objects and `7` direct
  Wiki fallback URLs (`forest`, `jungle`, `desert`, `crimson`, `corruption`,
  `hallow`, `spike_caves`), with `0` missing and `0` invalid URLs. This confirms
  the residual is an ownership/schema gap, not an absent core icon. The audit
  is `readOnly=true`; no schema or database write ran. Evidence:
  `reports/runtime/local-data-chain-closure/20260820/final-rerun/biome-icon-readiness.json`.

- C3 commits `c20d7b2` and `dcf214c` repair all seven classification-audit tokens
  and add a transactional shared five-section pager. The final behavior suite
  passes 13/13 and admin typecheck passes; it executes aggregation, deferred
  commit, failed-target retry, contraction/zero-result clamp, and waiting-state
  preservation. Specification and quality re-review report no remaining findings.

- C4 commits `3a1d178` and `06d655b` migrate login/dashboard theme colors,
  delegate category controls to global styles, restore >=4.5:1 light/dark normal
  text contrast, and keep KPI gradients within their semantic domains. Focused
  contracts pass 21/21, admin typecheck passes, runtime geometry has no layout
  regression, and fresh specification/quality re-review has no blocking findings.

- C5 commit `630ddb5` exports the shared cookie key, reuses `resolveApiUrl`, makes
  audio match status token-exact, and maps items through a 24-field whitelist.
  Focused contracts pass 23/23 and admin typecheck passes. Quality review found
  two Important issues: recipe loading can race submission or a later edit, and
  the whitelist contract does not execute the actual `handleEdit` behavior.

- C5 repair commit `02df27b` adds template/function submission gates, generation
  identity, and executable deferred handler tests; focused contracts pass 25/25.
  Fresh quality re-review confirmed those two findings are resolved, then found
  the remaining failure-path ambiguity: `fetchItemRecipes` catches errors as `[]`,
  so the page can still unlock and later write an empty recipe set.

- C5 final repair `2e101c9` preserves the default array contract while exposing
  strict null-on-error only to the edit page. Failed loads remain write-blocked,
  legitimate empty recipes remain savable, stale requests cannot change current
  state, and production-body contracts pass 28/28. Final fresh specification and
  quality reviews report no findings.

- D1 initial commit `a801455` consolidates 35 local trim helpers with focused
  5/5 and seven compiling checkpoints. Specification review found two blockers:
  five original Unicode-blank helpers are not equivalent to `String.trim()`, and
  seven `firstNonBlank` bodies were textually changed by qualification.

- D1 repair `d2a8782` adds the narrowly-scoped Unicode-blank variant for exactly
  five owners and restores seven firstNonBlank bodies with static import. Focused
  tests pass 10/10, compilation passes, and fresh specification/quality review
  reports no findings.

- D2 commits `4ab211e7`, `7d6457fc`, and `c86ddcd1` remove all eight naive
  controller IP parsers, inject `ClientIpResolver`, and prove seven previously
  weak paths with exact fixed-IP propagation plus URI/unique-header request
  identity. Final specification and quality reviews report no findings; the
  coordinator reran 151 targeted backend tests and compilation successfully.

- D3 commit `c13ce117` replaces the category-null envelope with an exact global
  404 and lets six local catches surface through existing 400/500 handlers.
  MockMvc 404/400/500 coverage, final specification review, final quality review,
  and coordinator test/compile validation all pass.

- D4 commit `c7835ee7` preserves no-filter blank reviewStatus semantics, adds the
  parameterized mapper filter, and removes frontend count refreshes. Backend 62/62,
  admin contracts 33/33, typecheck, and final reviews all pass.

- Public category child navigation is closed at `4a744dc`: six parent routes
  expose 34 image-backed child categories with verified scope, count, and
  fail-closed behavior.
- V2 crawler operation workflow is integrated from `3234cc0` pending the local
  merge commit. It adds the backend-owned 19-operation catalog, truthful
  attempt plan/result evidence, lease renewal, exact controls, and compact ID
  presentation. Fresh branch gates passed admin 311/311 plus typecheck/build,
  crawler/workflow 61/61, and focused V2 backend 527 with zero failures/errors.
- The local merge initially regressed the main notification source by treating
  missing legacy `domain.state` as V2 idle. The fallback was removed; merged
  gates now pass admin 345/345 plus typecheck/build, focused V2 backend 538/538,
  and backend test compilation.

### Item Image Gap Classification (2026-08-20 04:32 CST)

- Read-only local classification is complete in
  `reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-classification.json`:
  all `23` missing Item images are accounted for as `15`
  `legacy_unowned_image_contract` identities plus `8`
  `accepted_local_only_recipe` identities. `FallenStar` and
  `SeveredHandBanner` remain separate provenance quarantine and are outside
  the `2,117` Item provenance scope. Important clarification: this count is
  exact local identity coverage, not proof that Wiki has no related image;
  local evidence finds canonical/other-entity images for `OgreMask`,
  `ManaCloakStar`, and `FirstFractal`, plus component images for five
  synthetic recipe rows. Report SHA-256:
  `sha256:cb532e7802364923768a7374db139940e91031f1d1844a62a79124d50fd5b576`.
- No image URL was synthesized, no Wiki/Steam/forum request was sent, and no
  crawler, image download, database write, apply, staging, commit, cleanup, or
  discard occurred. Overall image closure remains open on Item projection
  evidence, the Biome image contract, and the two provenance quarantine rows.

- Read-only HTML viewer is available at
  `reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-classification.html`.
  It is served locally at `http://127.0.0.1:8787/reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-classification.html`
  with search and category filters. It now shows the real seven-table row
  counts and concise identity fields for all `25` identities. The default view
  is one searchable table (`id`, `name`, `name_zh`, `internal_name`, row
  counts, projection image, and image filename/cache summary); the
  field-level snapshot is an optional JSON link rather than an expanded card.
  The
  companion snapshot is
  `reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-table-details.json`
  (SHA-256
  `sha256:bd7a3c4d554d01cfcb94b1caee7df76a8b8970d521bb320c2255f95a54029efd`).
  The viewer has no external dependencies; both JSON fetches are same-origin.
  Chromium screenshot/DOM validation remains unavailable because the host snap
  launcher times out before browser startup.

## Next Agent Should Start Here

- Read `entries/2026-08-26-l2-readiness-handoff.md` and the current index at
  `reports/runtime/local-data-chain-closure/20260825/parent-final-1055/closure-index.json`.
  The Item-source lane, image lane, Boss/Shimmer reconciliation, NPC source
  partition, and duplicate relation retirement are terminal; do not replay any
  consumed operation or permit. NPC canonical readiness freshness now passes
  (`reports/canonical-migration/canonical-npc-crawler-facts-readiness.json`),
  but all eight L2 domains remain blocked by policy/run/reconciliation gates and
  scheduler preflight remains `409 STATE_STORE_RESET`. Do not create an L2
  proposal or scheduler decision until those gates are independently green.

- The dark discovery page was repaired after acceptance was withheld: all four `--article-approved-*` surfaces were transparent tints of `--tp-color-page` and therefore resolved back to the ground in dark, and the latest-submission rows now use the user-selected G3 two-column card grid at the darkest L0 fill. Details, the one-for-one contract migration, and byte-level light-theme non-regression proof are in `entries/2026-07-29-approved-public-pages-production.md`.

- The Article discovery/archive work is committed on `ux/detail-pages-redesign` at the user's explicit instruction; the plan's Task 9 acceptance gate was satisfied by that instruction rather than by a formal visual sign-off. Nothing was pushed or merged. The next open item is the fold vertical-rhythm repair: it is fully analysed with measurements in `entries/2026-07-29-approved-public-pages-production.md` under "Commit state", but not implemented, and it needs the user to choose between capping the stage height plus fluid inner spacing, or dropping the `calc(100svh - 203px)` viewport lock outright. The standard stack is live on `15177/18191/13004`; if it is down, note that a torn Redis AOF tail can block backend startup and that the authorized repair plus its verified backup are documented in that entry. Preserve every unrelated design/report path.

- Front P2 and the light-theme button adaptation require no further merge
  action. Read `entries/2026-07-22-front-p2-local-integration.md` for the
  curated-history boundary and excluded data-audit work, and
  `entries/2026-07-22-light-theme-button-system.md` for button validation and
  residual-risk boundaries.

- Admin P1+P2 requires no further action. Read
  `entries/2026-07-18-admin-p1-p2-batch.md` only for historical context. The
  local task branch/worktree remain available for acceptance follow-up.

- Read `entries/2026-07-17-crawler-v2-per-env-activation-guard.md` before any
  crawler-monitor work. This environment routes V2; other worktrees still
  route V1 until they run `platform/local/crawler-v2-cutover.sh`.
- Do not run real crawler force/apply actions, Redis reset, or database writes
  without explicit operation-level authorization.

## Current Risks

- Article archive implementation is awaiting final visual acceptance. The flagged fallback-cover typography and kicker/date spacing were inspected, found genuinely defective because both classes take their base styling from the `pages/articles/index.vue` scoped block, and repaired in `assets/css/domains/detail-pages-redesign.css` under two new layering-contract assertions. A second user-directed round then repaired the dark discovery page: the four `--article-approved-*` surfaces were transparent tints of the page colour and composited back to it, so the fold and archive collapsed to one flat black mass. They are now token-derived real surfaces at the user-selected L0 level, and the archive rows became a two-column card grid (G3). The v22 band element was intentionally not reintroduced; only its closing rule was implemented, at content width rather than full bleed. The Task 7.4 interaction probe passed before the handoff but its post-repair hash was never captured; recreate it from the repaired Task 7.4 plan if durable probe hashing is required.

- Acceptance follow-up browser checks observed intermittent failed Nuxt
  prefetches for unvisited crawler-monitor modules. The login and article
  targets had zero console errors, zero target request failures, and zero
  non-auth/non-resolver writes; the prefetch noise is unrelated to this scope.

- D6 is committed at `513ab4db` with test repair `fda1484c`; final admin gates
  pass 400/400. Runtime screenshots pass at six 1280px routes with stable-state
  zero console/network errors and no page overflow. C4's focused CSS evaluator intentionally supports only the
  repository's current syntax subset and does not model future decorative
  background layering.

- Broad Maven/full quality-gate baseline failures are outside the V2 scope.
- 6/8 local worktrees still silently route V1 until cut over; the new banner
  only appears after they merge this change.
- V1 defects (fake exit 0 on recovered processes, reducer contradiction
  swallow) remain in code but are unreachable under V2 routing.
- Real force-crawl, formal apply, live Redis expiry races, and adversarial HTTP
  preview-path acceptance remain manual/runtime concerns.
- Public category totals and representative images depend on current local
  data; their route and fail-closed contracts remain the acceptance boundary.

## Recently Closed

- `docs/devlog/entries/2026-07-29-public-ui-design-system.md`
  - branch: `ux/detail-pages-redesign`
  - status: `closed`
  - commit: `52a83c59`; mandatory public UI baseline and three-theme specimen

- `docs/devlog/entries/2026-07-29-articles-hifi.md`
  - branch: `ux/detail-pages-redesign`
  - status: `closed`; user-approved high fidelity; production implementation is tracked by `entries/2026-07-29-approved-public-pages-production.md`

- `docs/devlog/entries/2026-07-22-light-theme-button-system.md`
  - branch: `main` from `feat/front-p2-integration`
  - status: `closed`
  - commit: `466146c1`; two approved light button systems and byte-identical
    interactive previews complete

- `entries/2026-08-11-scheduler-preflight-domain-mapping-decision.md` - Task 5 preflight domain gap analysis; owner chose Approach C (narrow to 5 auto-dispatch domains); preflight now 10/10 eligible.

- `entries/2026-08-09-crawler-v2-scheduler-formal-enablement-preparation.md` - Tasks 1-4 committed as proposal-only, current-hash-bound preparation; no production preflight artifact or authorization identity generated.

- `entries/2026-08-08-recipe-formal-read-only-verification.md` - formal Recipe
  state verified read-only; overwritten standalone evidence rejected.
- `entries/2026-08-08-biome-t1-isolated-acceptance.md` - exact Biome T1 passed
  and cleaned to zero; formal Biome apply remains unauthorized.
- `entries/2026-08-08-buff-t1-isolated-acceptance.md` - exact Buff T1 passed
  and cleaned to zero; formal Buff apply remains unauthorized.
- `entries/2026-08-07-projectile-item-only-t1-acceptance.md` - exact item-only
  Projectile T1 passed and cleaned to zero; NPC relation coverage remains
  explicitly out of scope.
- `entries/2026-08-07-projectile-t1-source-blocker.md` - original NPC-inclusive
  lane intentionally stopped and transferred to the owner-approved item-only
  child.
- `entries/2026-08-07-boss-t1-isolated-acceptance.md`
- `entries/2026-08-07-npc-t1-isolated-acceptance-refresh.md`
- `entries/2026-08-06-crawler-v2-domain-freshness-card.md`
- `entries/2026-08-06-crawler-v2-items-sample-operation.md`
- `entries/2026-08-06-crawler-v2-automation-controls.md`
- `entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`
- `entries/2026-07-27-crawler-automated-ingestion-closure.md`
- `entries/2026-08-04-item-image-projection-apply-runtime.md`
- `entries/2026-08-06-crawler-v2-monitor-simplification.md`
