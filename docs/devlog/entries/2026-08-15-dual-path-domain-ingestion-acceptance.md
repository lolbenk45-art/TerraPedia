# Dual-Path Domain Ingestion Acceptance

## Status

`closed`

## Context

- User goal: validate manual and automation-gated ingestion for the eight source-probed domains; use local standardized data plus real probes for Items and Projectiles, and real crawl plus real local database transactions for the remaining six domains.
- Branch: `feat/supplementary-domains-readiness`
- Worktree: `/home/lolben/TerraPedia`
- Target database: WSL-local `terria_v1_local` only.
- Review plans: `docs/superpowers/specs/2026-08-15-dual-path-domain-ingestion-acceptance-review.zh.md`, `docs/superpowers/specs/2026-08-15-dual-path-domain-ingestion-acceptance-review.en.md`
- Execution plans: `docs/superpowers/plans/2026-08-15-dual-path-domain-ingestion-acceptance-execution.zh.md`, `docs/superpowers/plans/2026-08-15-dual-path-domain-ingestion-acceptance-execution.en.md`
- Related prior entry: `docs/devlog/entries/2026-08-14-crawler-auto-domain-consumption-resume.md`

## Direction / Decisions

- The user approved removing per-apply Owner authorization for automatic ingestion while retaining current canonical automation activation as the mandatory global write gate.
- Manual and automatic triggers must share the same importer, transaction, owned-table, progress, and audit contracts.
- Items (managed Wiki corpus `6131`; local table total `6159`) and Projectiles (`1111`) use existing local data plus real probes and importer dry-runs; they do not perform full crawls or commit DB changes.
- NPCs (`762`), Buffs (`388`), Armor Sets (`63`), Bosses (`33`), Audio (`<=600`), and Shimmer use real bounded sources and real local DB transactions.
- All crawler and database work is serialized. No Windows service, production DB, L2, NPC loot, Boss loot, Redis reset, or unrelated data repair is allowed.

## Scope

- Backend: automation activation/preflight gate and automatic apply dispatch only if the approved design requires a missing seam.
- Data: manual and automatic importer acceptance, local DB before/after evidence, real bounded source work for six domains.
- Crawler: monitor-visible source/probe execution with stable progress and no duplicate writers.
- Docs/process: bilingual review plan followed by a separate bilingual executable plan.
- Out of scope: public UI, unrelated generated data cleanup, production writes, loot automation, and L2.

## Validation

- Commands run: read-only repository, registry, source-chain, runtime-writer, local corpus count, and authorization inventory checks.
- Results: eight auto domains confirmed; local counts are Items table `6159` with managed Wiki input `6131`, Projectiles `1111`, NPCs `762`, Buffs `388`, Armor Sets `151` with standardized input `63`, and Bosses `33`; no active crawler/backend writer was found at design time.
- Not run: no service start, crawler, scheduler mutation, database write, or importer dry-run during the review-design stage.
- Follow-up implementation: Node supplementary suites pass 24/24; focused backend registry/monitor suites pass 215/215. WSL automatic operation for `audio` fails closed before source/progress output because no fresh `SCHEDULER_ACTIVATION` decision exists for that domain.
- Local frozen-bundle acceptance: Audio, Bosses, and Shimmer were executed serially through the existing L1 transaction runner using local frozen sources. All three runs committed with generation fences and audit/result rows; Shimmer first rejected a stale baseline, then succeeded after rebuilding the baseline from the current local generation. No loot action was called.
- Local independent-entity acceptance: the importer now accepts explicit `--entity` selection and was run serially against existing standardized inputs. NPCs processed 762 records (758 updated, 4 skipped, 0 errors); Armor Sets processed 63 records and 501 owned relations (0 errors). Post-run counts remained NPCs 762, Armor Sets 151, Buffs 388, Projectiles 1111, and NPC loot 1890. The importer touched only the selected domain in each run.
- Natural changed-only scheduler acceptance dispatched Items, NPCs, Projectiles, Bosses, Audio, and Shimmer. Items/Projectiles completed as dry-runs; NPCs/Bosses/Audio committed; Shimmer committed after repairing its automatic generation input path. Armor Sets and Buffs were unchanged in that sweep and retain completed automatic transaction evidence from their local acceptance runs. No active V2 attempt or importer writer remained.
- Post-review regression on 2026-08-15 passed Node `100/100`, Maven registry/monitor `216/216`, and `git diff --check`.

## Review Follow-up

- Reviewer: read-only automatic Shimmer/8-domain chain review. Resolver: Codex. Re-review is required before runtime restart or commit.
- Important 1: direct preview CLI defaulted to `ACTIVATION_GATED_AUTO`. Resolved by restoring `MANUAL_OWNER_L1`; the automatic runner continues to pass auto mode explicitly.
- Important 2: local Shimmer acceptance acknowledged a live probe without proving that the reused generation matched it. Resolved by returning `local_source_not_acknowledged` and leaving the canonical manifest unchanged for local supplementary runs.
- Important 3: caller-supplied automatic run IDs and run-ID-only reconciliation could bind a new source to old committed evidence. Resolved for all eight domains by rejecting `--run-id`, deriving the run ID from domain plus source fingerprint, and comparing committed evidence domain/path/hash with the current frozen source before acknowledgement.
- Important 4: supplementary terminal progress discarded V2 attempt identity and lacked a transaction heartbeat. Resolved for all eight domains with the shared progress builder, attempt sequencer, atomic progress writes, and periodic heartbeat during dry-run/apply work.
- Additional root cause: scheduler reads `data/generated/wiki-source-manifest.latest.json`, while runners previously acknowledged the shared-data default. The registry now passes the scheduler canonical path to all eight actions, and the base runner resolves it inside the active worktree.
- Runtime root cause: when an ingestion-manifest record was missing, `source-update-comparison.mjs` reported `changed=true` but discarded the probe fingerprint as `currentValue=null`. The comparator now preserves `contentHash`, then revision ID/timestamp fallbacks, so a natural sweep can checkpoint the actual source identity.
- Recovery follow-up: the first natural sweep after the runner changes had no source fingerprints. Items and Projectiles completed dry-runs; NPCs, Audio, and Bosses failed closed during committed-evidence reconciliation; Shimmer was skipped as non-resumable. Boss source work itself completed `33/33`, and no database apply was repeated. A RED/GREEN backend test now proves that a failed attempt with a known current fingerprint and no prior fingerprint checkpoint starts one fresh attempt; known identical fingerprints retain the existing resume/dedupe boundary.
- Runtime sweep follow-up: the natural sweep checked at `2026-08-15T05:14:55.455627662Z` dispatched Items `attempt-023b22d3-33be-4258-b085-c4825dfa7803`, NPCs `attempt-6adceb5c-3b16-4deb-97c9-92570a9efc28`, Bosses `attempt-0b0abfa7-c5db-416a-ba61-dccefb8da37c`, Shimmer `attempt-33372732-eba0-47d6-a43a-658a4f0d5388`, and Audio `attempt-7639c32d-dcf8-4966-9110-fe1dcbd91dce`, all with non-empty source fingerprints. Projectiles, Armor Sets, and Buffs were correctly unchanged. NPCs, Audio, and Bosses completed with acknowledgement reconciliation; Items completed its dry-run; Shimmer reached the authoritative `timed_out/HEARTBEAT_TIMEOUT` terminal state.
- Items root cause: the outer scheduler detected live fingerprint `20ea8b5f...`, but the inner module sync reused canonical raw fingerprint `748823fd...` and reported `actionCount=0`. Base-domain automatic source commands now pass `--force=true`, limited to the selected module and not the Item-page corpus, so a changed source cannot acknowledge stale raw data.
- Shimmer root cause: the extraction pipeline emitted heartbeat sequence values without continuing from the V2 attempt's already observed sequence `101`, so progress ingest rejected them and the supervisor timed out the attempt. All logical and timer heartbeats now share the attempt sequencer and continue at `102+`. Scheduler recovery now treats `failed`, `timed_out`, and `interrupted` terminal attempts with `allowedActions=retry` as bounded retry candidates; non-resumable work retries in fresh mode, with the existing maximum of three attempts per queue unchanged.
- Second natural sweep: `2026-08-15T06:15:42.248091223Z` detected only Items and Shimmer as changed. NPCs, Projectiles, Armor Sets, Buffs, Bosses, and Audio were unchanged. Shimmer was naturally dispatched as `attempt-e931cdba-1631-4dbe-93f8-072afbe5fbac`; Items was incorrectly skipped as `automatic_attempt_completed` even though its canonical manifest remained `748823fd...` and the live source remained `20ea8b5f...`.
- Completed-dedupe root cause: scheduler recovery compared the current fingerprint only with the prior sweep's attempt checkpoint. A completed attempt could therefore block repair after it failed to acknowledge the canonical source. Completed dedupe now also requires the source monitor's canonical `previousValue` fingerprint to equal the current fingerprint. A RED/GREEN test covers the exact stale-manifest/same-attempt-fingerprint case; the existing confirmed-same-fingerprint test now carries explicit canonical acknowledgement evidence.
- Shimmer preview-heartbeat root cause: the preview writes an initial progress snapshot and then performs its first source probe before starting the extraction pipeline. The real probe took about 98 seconds, exceeding the V2 90-second heartbeat deadline. Extraction then advanced disk progress through sequence `116` and completed `7/7`, but the authoritative attempt had already transitioned to `stalled` and correctly rejected late progress, ending `timed_out/HEARTBEAT_TIMEOUT`; generation stayed at `4` and the source remained unacknowledged. The automatic wrapper now starts a V2-identified periodic heartbeat before entering preview and stops it with failed progress if preview throws. A RED/GREEN delayed-preview test proves sequence advancement before preview returns.

## Result

- Completed: the review and execution plans are available as separate Chinese and English documents.
- Completed: the WSL Bash stack was restarted at `18:09 CST`; the first post-restart natural sweep acknowledged the repaired Shimmer fingerprint, and the second natural sweep confirmed same-fingerprint dedupe with no new attempt. No manual sweep or direct domain operation was used.
- Current runtime: the local stack is healthy on backend `18191`, front `15177`, admin `13004`, Redis `16380`, and MySQL `127.0.0.1:13306/terria_v1_local`; V2 automation remains enabled in `changed-only` mode with a one-minute local interval.

## Residual Risks

- Existing runtime-generated Audio/Bosses and authorization artifacts remain dirty and must not be mixed into later code/doc commits.
- Exact per-domain owned-table queries and rollback commands must be resolved from the existing importers in the executable plan.
- The local scheduler interval is intentionally one minute for continued acceptance observation; this is a runtime setting and is not yet promoted as a project-wide default.
- The default WSL `/snap/bin/chromium` exits `46` while waiting for snap system profiles. The verifier supports `CHROMIUM_BIN`; rerunning it with the WSL-local Playwright Chrome under `$HOME/.cache/ms-playwright/` completed with exit `0`, so no Windows browser or system package change was needed.
- Items intentionally remain a local-corpus dry-run and may continue to appear changed against the live Wiki until a separately approved full Item refresh is ingested. Same-fingerprint completed-attempt checkpointing remains its anti-loop boundary.

## Follow-up

- Continue read-only observation of the one-minute natural scheduler sweeps; do not invoke a manual domain start, direct Shimmer operation, or unrelated domain write.

## Latest Validation

- TDD RED: `CrawlerMonitorServiceImplTest#shouldStartFreshAutomationWhenFailedAttemptHasNoPriorFingerprintCheckpoint` failed because no fresh enqueue was emitted.
- TDD GREEN: the same test passed after the single recovery-condition change.
- Focused regression after the Items force-refresh, Shimmer sequence, and terminal-retry fixes: Node `126/126`; Maven registry/monitor `217/217`; `git diff --check` passed.
- Second-sweep RED/GREEN: the delayed-preview Node test failed because no progress existed before preview returned, then passed after the wrapper heartbeat change. The backend test failed because no Items dispatch existed when canonical acknowledgement was stale, then passed after completed-dedupe began using the source monitor's `previousValue`.
- Second-sweep regression: Node `109/109` passed when the long `run-wiki-sync` file was run separately from the other 98 tests; its first parallel run alone exceeded the Node process's 20-second budget without an assertion failure, while the standalone file passed `11/11` in 12.8 seconds. Maven registry/monitor passed `218/218`; `git diff --check` passed.
- Full WSL stack verification: `CHROMIUM_BIN=$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome bash ./scripts/dev/verify-local-stack.sh` passed with exit `0`.
- Pre-sweep database baseline: NPCs `762`; Armor Sets `151` plus `501` relations; Buffs `388` plus `380` source relations; Audio `428/428`; Boss groups `33`; Shimmer `279/248/121/29`. Latest six-domain automation runs are `COMPLETED` with `COMMITTED` applies.
- Shimmer repair acceptance: first post-restart natural sweep at `10:17:38Z` acknowledged `09019d44...`; second at `10:40:06Z` was `changed=false` with no dispatch and stable generation. Follow-up one-minute sweep at `10:46:31Z` remained unchanged. Focused probe/source regression is `15/15` in the final run.

## Commits

- `a416fe20` — `fix(crawler): stabilize shimmer source fingerprints`
- `1623c708` — `feat(crawler): complete supplementary automation recovery`

## Latest Runtime Follow-up (2026-08-15 16:50 CST)

- Root cause found for repeated Shimmer V2 `HEARTBEAT_TIMEOUT`: the supplementary outer runner and the inner preview/pipeline shared the canonical attempt progress path. The inner pipeline could publish `completed` before the outer apply/acknowledgement lifecycle had fully returned, leaving the V2 supervisor without a valid running heartbeat.
- Added a RED/GREEN regression test and isolated preview progress to `<attempt-progress>.preview.json`; the outer runner now exclusively owns the canonical V2 progress path.
- Fresh Node supplementary/pipeline regression: `48/48` passed. Focused Maven monitor/registry regression: `218/218` passed. `git diff --check` passed.
- WSL stack restarted at `2026-08-15 16:48 CST` with the fix. Backend, front, admin, Redis, MySQL, MinIO and image compatibility services are reachable.
- Database verification: latest automatic runs for Items, NPCs, Projectiles, NPCs, Buffs, Armor Sets, Audio, Bosses and Shimmer are `COMPLETED/COMMITTED`; Shimmer latest run is `shimmer_l1_auto_05cbf8a18b1c0f9fd760f150209b3184`.
- V2 currently has `liveQueue=[]` and reconciler `healthy`. The previous Shimmer attempts remain historical `timed_out` records; the source manifest has since acknowledged fingerprint `0ec2a1f4...`.
- Pending acceptance: one natural scheduler sweep after this acknowledgement, followed by one unchanged-fingerprint sweep, must show no new Shimmer attempt and stable generation. No manual sweep or domain start is authorized.

## Shimmer Repair Handoff (2026-08-15 17:51 CST)

### Observed

- The natural changed-only sweep at `2026-08-15T09:17:20.740668014Z` (17:17 CST) reported all seven other domains unchanged, but dispatched Shimmer with source fingerprint `429924ca0c1f9f5a4863dc708a2c3e68c743c3a20484a3b9bdfcd49ade76e2b6` as `attempt-85908475-4120-4f8c-a016-2b1e6fcfa5df`.
- The resulting local run `shimmer_l1_auto_81b257b155b8403fda2a1082c80f47dd` is `COMPLETED/COMMITTED` at `2026-08-15 09:20:38` UTC. The canonical source manifest then acknowledged the same `429924ca...` hash at `09:22:13` UTC.
- V2 live queue was empty and the reconciler was healthy at `17:51 CST`; no crawler or automatic-operation process was active.
- This is the seventh Shimmer committed run on 2026-08-15. The source page revision remained insufficient to establish a real Wiki content change, so the repeated fingerprint change must be treated as a determinism bug until proven otherwise.

### Recorded

- The previous fix in `scripts/data/automation/run-supplementary-domain-automatic-operation.mjs` isolates preview progress as `<attempt-progress>.preview.json`; Node focused regression passed `48/48` and Maven monitor/registry tests passed `218/218` before the 17:17 sweep.
- The WSL stack remains running on backend `18191`, front `15177`, admin `13004`, Redis `16380`, and MySQL `127.0.0.1:13306/terria_v1_local`.

### Next Safe Action

1. Restart the WSL stack through the Bash scripts so the probe repair is loaded.
2. Observe two natural changed-only sweeps: the first must acknowledge one stable Shimmer fingerprint; the second must report Shimmer unchanged and create no attempt.
3. Do not run a manual sweep or direct Shimmer operation.

### Boundaries And Risks

- Do not use Windows tooling, production databases, NPC loot, Boss loot, L2, a Redis reset, or full Item-page crawling.
- Do not delete/revert the existing generated Shimmer generations or authorization artifacts. They are runtime evidence in an already dirty worktree.
- Do not claim Shimmer automation is production-ready until the two natural-sweep acceptance conditions above pass. The other seven domains were unchanged in the 17:17 sweep.

## Shimmer Determinism Repair (2026-08-15 18:08 CST)

- Root cause confirmed: identical Wiki revision `252716` responses differed only in MediaWiki runtime diagnostic comments (`NewPP limit report`, `Transclusion expansion time report`, and `Saved in parser cache with key ...`), including cache timestamps and timing/profile values. The probe previously hashed the full rendered HTML, so these volatile comments produced a new `contentHash` on every request.
- TDD RED: `supplementary-source-probes.test.mjs` failed when two frozen Shimmer fixtures differed only in those diagnostic comments (`9` passed, `1` failed).
- Minimal fix: Shimmer probe fingerprinting now removes only those three recognized MediaWiki diagnostic comment blocks before hashing; raw HTML remains unchanged for extraction and fail-closed revision/langlink checks.
- TDD GREEN: the focused probe suite passes `10/10`; monitor/source regression passes `19/19`; `git diff --check` passes. Three archived generation raw pages with different diagnostic lengths now produce the same normalized HTML hash offline.
- Completed: restart and the two required natural changed-only sweeps; no manual sweep or direct Shimmer operation was used.

## Natural Sweep Acceptance (2026-08-15 18:54 CST)

- The restarted stack's first natural sweep at `2026-08-15T10:17:38Z` dispatched exactly one Shimmer attempt with repaired fingerprint `09019d44...`; it completed with progress sequence `12`, and the canonical manifest acknowledged that fingerprint at `10:21:43Z`.
- At the user's request, the authenticated V2 automation setting changed from `sweepIntervalMinutes=60` to `1`, preserving `enabled=true` and `mode=changed-only`; no sweep endpoint or direct domain operation was called.
- The second natural sweep at `2026-08-15T10:40:06Z` reported Shimmer `changed=false`, with `currentValue=previousValue=ingestedValue=09019d44...`, `dispatched=[]`, and no new generation. The pointer remained generation `83b9a07e...`.
- This satisfies the two-sweep Shimmer acceptance condition. The shorter one-minute interval is retained as the current local scheduler runtime setting for continued observation.
- Follow-up natural sweeps at `10:46:31Z` and `10:53:05Z` also remained unchanged with no Shimmer dispatch.
