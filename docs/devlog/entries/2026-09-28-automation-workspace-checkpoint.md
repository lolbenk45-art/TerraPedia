# Automation workspace checkpoint

## Status

`active`

## Scope and authority

- Owner/reviewer: Codex, serial current-model review. Branch `feat/automation-scheduler-continuation`; worktree `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`.
- User instruction on 2026-09-28: cleanly preserve and commit existing work before continuing automated ingestion. Local commits authorized; no push, destructive cleanup, runtime writes or scheduler activation in this checkpoint.
- Parent/follow-up: `2026-09-27-armor-image-cache-continuation.md`, active. Checkpoint completion is independent of full-chain runtime acceptance.
- Observed baseline: HEAD `0f871e94dc8b48f8883c77b1e0557593a271609b`, no upstream/staged files, 79 modified and 2033 untracked files using `git status --porcelain=v1 -z -uall`. Other branches/worktrees remain untouched.

## Classification and preservation

- Implementation checkpoint: scheduler identity/reauthorization/canary contracts, governed Armor candidate/executors/cache and semantic fixes, bounded Buff sync guards, dual-root launch/monitor support, API retirement filters and accompanying tests/plans/devlog. See git for code-level diff details.
- Evidence checkpoint: existing decision-consumption ledger, compact authorization/results/readbacks and domain/audit baselines. Historical authorization artifacts are evidence only, never permission to replay consumed identities.
- Large proposals, downloaded image checkpoints and upload journals stay at their original paths. A private `.local/archives/2026-09-28-automation-runtime.tar.gz` backup and the tracked `docs/audits/2026-09-28-automation-local-artifacts.json` inventory record each path, byte count and SHA-256. All 347 originals (447,803,990 bytes) and archive members matched their SHA-256 before exact-path exclusions were installed. The private archive is 236,169,061 bytes.
- Exact retained paths are added to the common Git `info/exclude` (shared by worktrees); no source, tests, docs or ledger are excluded. Git-clean means no pending tracked/untracked work; it does not mean deletion of ignored runtime artifacts. A fresh clone contains the inventory and compact evidence, not the local archive; restore the archive to recover its large proposal inputs.

## Validation and review

- 62 changed/adjacent Node test files: Node 22.23.0 and Node 26.1.0 each report 1384 tests, 1383 pass, 0 fail, 1 existing Shimmer extraction test skipped. Exact file list and full output: `.local/tmp/checkpoint-tests.json`, `.local/logs/checkpoint-node{22,}-tests.log`.
- Maven compile/focused suites: 474 tests, 0 failures/errors/skips; `BUILD SUCCESS`. Suites: CrawlerQueueV2Configuration, CrawlerAutomationActivationDecisionMapperSqlContract, CrawlerAutomationPolicyServiceImpl, CrawlerMonitorServiceImpl, PublicItemServiceImpl, CrawlerAttemptSupervisor, ArmorImageCacheMonitor and AdminCrawlerMonitorController (all `Test` classes). Log: `.local/logs/checkpoint-maven-tests.log`.
- 119 changed/new Node modules passed Node 22 syntax checks; both changed shell files passed `bash -n`. Historical ledger entries are all retained (117 before, 191 now). Initial staged check exposed three extra EOF blank lines in formerly untracked files; removed those lines, then reran staged whitespace validation. JSON parse scan passed; nonempty authorization fields in prepared/results contain decision/hash metadata, not credentials. Example configuration retains its existing placeholder credentials.
- Source/review boundaries: executor registration and locked rederivation remain separate from authorization; the existing V61 migration is versioned source only and is not executed here. No fresh runtime preflight or full local UI/E2E gate claimed.
- Review disposition: stale candidate crit labels/retired-row/member filtering, genuine set-effect provenance, Buff/Shimmer implementations and natural-tick acceptance are explicitly transferred to Codex in the active parent child entry. They block full-chain release, not this preservation checkpoint. No claim of successful ingestion from the diagnostic legacy-text builder.
- Corrected `.27` failure attribution and recorded already-completed `.32` to prevent another redundant image upload. Immutable runtime artifacts are unchanged.

## Commits

- Pending verified implementation/evidence checkpoint commits; overall automation task remains active.
