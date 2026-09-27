# Superseded scheduler current-index snapshot

Archived 2026-09-22 by Codex. Historical observations below are not current instructions.
See ../current.md and the active continuation child for current state.

# Current Devlog

Last updated: 2026-09-22 18:23 CST by Codex

Active branch: `feat/automation-scheduler-continuation` (scheduler handoff worktree)

## Active Scheduler Handoff

### Current continuation (supersedes historical next-action paragraphs below)

- Owner: Codex; status: `active`; branch `feat/automation-scheduler-continuation`;
  worktree `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`.
- Active child: `entries/2026-09-22-automation-ingestion-plan-repair.md`; parent:
  `entries/2026-08-31-automation-scheduler-activation-handoff.md`.
- Focus: repair reviewed plan gaps, prove actual table/API chain, then continue
  authorized serial natural canaries. Dependencies: fresh runtime/policy/source
  readback and code-freeze hashes; standing authorization register still applies.
- Contract handoff: H8 unchanged as previously recorded; Retry-39/decision 65 consumed;
  backend health freshly UP at 18:23 CST. Other safety axes need fresh readback.
- Existing 1381 dirty/untracked paths preserved, index empty. No automatic commit,
  clean/reset, manual sweep or direct SQL/Redis/control-file mutation.
- Historical service-down/Retry-33 next-action text below is retained evidence,
  not a current instruction. Start from the active child and authorization register.

### Handoff reconciliation (2026-09-22)

- Read-only reconciliation completed in the intended worktree. Observed
  `HEAD=0f871e94dc8b48f8883c77b1e0557593a271609b`, branch
  `feat/automation-scheduler-continuation`, no upstream, no staged changes,
  and `git status --short -uall` reports `1381` dirty/untracked paths. The
  dirty set includes the active scheduler code/test changes, the two active
  devlog files, task plans, and generated authorization/domain/audit reports;
  it is intentionally preserved and must not be reset, cleaned, committed, or
  pushed during resume without a separate closeout decision.
- The standing authorization register remains
  `entries/2026-09-19-automation-scheduler-authorization-list.md`. It permits
  only fresh, local, registered operations with per-phase gates and immediate
  readback; `/sweep`, direct SQL/Redis/JSON writes, epoch reset, stale packet or
  decision reuse, remote targets, and Git history mutations remain forbidden.
- Runtime reachability is **unknown in this handoff turn**. The operator
  reports MySQL has been started, but this session did not independently verify
  MySQL `13306`, Redis `6380`, backend `18102`, MinIO `19000`, public `5188`, or
  admin `3015`. The first resume action is read-only service probing followed,
  only if all gates pass, by the canonical start script with scheduling
  disabled.
- The last recorded runtime stop was after Retry-39 projectiles failed before
  import on the obsolete `items.source_id` select. The importer repair is
  present in the dirty worktree and its recorded focused test is `9/9`; Retry-39
  and decision `id=65` remain consumed and must not be reused. The next legal
  runtime chain is fresh Retry-40-or-later L2 captures/packets/decisions,
  serialized with MySQL readback, then a fresh projectiles natural-tick canary.
- No scheduler control write, source probe, crawler/import, Redis write, epoch
  reset, or business-table DML was performed by this handoff reconciliation.


- Entry: `entries/2026-08-31-automation-scheduler-activation-handoff.md`; owner:
  Codex; status: `active`; branch:
  `feat/automation-scheduler-continuation`; worktree:
  `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`;
  parent: `entries/2026-08-27-eight-domain-l2-execution-continuation.md`
  (closed at `edc40b4fe702aa11b9ec03d2d49ff9448d6eeb09`).
- Standing authorization register:
  `entries/2026-09-19-automation-scheduler-authorization-list.md`; user
  directs uninterrupted continuation within its local, registered-action, and
  per-phase readback boundaries. Generate fresh technical packets as needed;
  do not ask for repeated confirmation of an action already listed there.
- Resume status (2026-09-18): services are now reachable at MySQL `13306`,
  Redis `6380`, backend `18102`, MinIO `19000`, public `5188`, and admin
  `3015`. The expired retry-04 decision was not reused: eight fresh L2
  reauthorization decisions and scheduler decision `id=39` are current for
  H8. The authorized natural tick has been observed once and the API control
  is restored to `enabled=false`; see the active entry for exact evidence.
- Retry-33b completion (2026-09-20): source monitor is `9/9` healthy, current
  registry acceptance is `32/32 pass`, and fresh preflight hash is
  `sha256:801f8fad63a9b8172f9a4d741602c1ede258f83e6e2427cadf4e9d1f44266d73`.
  MySQL activation decision `id=60` is unique for
  `automation-crawler-v2-scheduler-activation-20260920-standing-items-11`.
  The authenticated natural canary completed one `wiki-items-refresh` run
  (`items_l1_auto_a911b7322e5a782fdc4498ec195e3e09`) with monitor-visible
  attempt completion, automatic gate pass, and zero row mutations; control is
  restored to `enabled=false`, with zero live attempts/claims and healthy
  reconciler. See the authorization entry for exact artifact paths.
- Retry-34/35 npcs continuation (2026-09-20): fresh source/preflight/decision
  chains were created for `wiki-npcs-refresh`, but neither bounded natural
  window produced a valid npcs dispatch. Retry-34 ended with a late
  `automation_disabled` skip; Retry-35 saw no new sweep before cleanup.
  Scheduler is disabled with zero live attempts/claims and healthy reconciler.
  Do not reuse either decision; next start point is a new fresh npcs retry at
  the next natural cadence, then proceed to projectiles.
- Retry-36 npcs continuation (2026-09-20): a third fresh npcs packet/decision
  was valid (`id=63`, preflight `sha256:b3946cbd...`), but the bounded natural
  window still produced no new sweep, claim, or attempt. Control is disabled,
  live work is zero, and reconciler is healthy. Scheduler action execution is
  paused for cadence diagnosis; do not call `/sweep` or reuse retry-36b.
- Retry-37 npcs completion (2026-09-20): cadence became due and the fresh
  npcs canary dispatched one monitor-visible attempt. The run completed with
  exit code `0`, automatic gate passed, `740` baseline/candidate rows, and
  zero inserts/updates/deletes (`762` input rows skipped). Scheduler is
  disabled with zero live attempts/claims and healthy reconciler. Projectiles
  is the next action after the next natural cadence (approximately `01:43Z`).
- Cadence diagnosis: the scheduler thread polls every 60 seconds, but V2's due
  gate requires `lastSweep.checkedAt + sweepIntervalMinutes`; with the npcs
  sweep at `00:43:48Z`, projectiles cannot naturally run before about
  `01:43:48Z` (`09:43:48 CST`). Scheduler remains disabled while waiting; no
  manual `/sweep` or stale decision reuse is allowed.
- Retry-39 projectiles failure and repair (2026-09-20 to 2026-09-21): a fresh
  action-bound decision `id=65` dispatched one natural
  `wiki-projectiles-refresh` attempt
  (`attempt-5edc8956-1a2f-4a01-bbef-fc4652b9e3ee`), then control was restored
  to `enabled=false`. The attempt fetched and staged the projectile source but
  failed before import with `Unknown column 'source_id' in 'field list'`.
  Readback confirmed projectiles remain `1111` with the prior maximum
  `updated_at`; no business-table DML occurred. The root cause is the shared
  importer selecting unused `items.source_id` although the canonical local
  items table has no such column. Its focused RED-GREEN repair now selects
  only `id, internal_name, name`; `node --test
  pipelines/import/import-independent-entities-to-db.test.mjs` passes `9/9`.
  Retry-39 and decision `id=65` are consumed. Local MySQL `13306`, Redis, and
  backend are currently stopped; do not create a retry until MySQL is restored,
  the canonical stack has started, and all fresh gates are regenerated.
- Retry-40 preparation (2026-09-21): canonical startup is healthy with durable
  V2 `repoRoot=/home/lolben/TerraPedia`, this worktree as command root, and
  scheduling disabled. Fresh source monitor is `9/9 healthy`, projectiles
  readiness passes, and preflight is `8/8 eligible`
  (`sha256:2bcd30a3e7fd053a41b9cdfcb1cdf75f7b74f3b2122e935dd526fbdb54cbb9af`).
  Expired L2 reauthorization capture exposed and repaired a query bug that
  included current L2 evidence rather than limiting to predecessor versions;
  historical-disposition candidate preparation is also now structured and
  tested. All retry-23 reauthorization packets are invalidated before any
  new decision because their frozen code bundle predates the latter helper.
  Three fresh historical disposition approvals exist, but Retry-23 must not
  be used. Next: generate fresh Retry-24 captures/manifests/packets for all
  eight domains, use the new items/projectiles/shimmer disposition paths,
  then execute decisions serially with readback.
- Runtime restart (2026-09-19): the canonical stack restarted with scheduling
  disabled and Flyway V61 applied. The running backend uses durable V2
  `repoRoot=/home/lolben/TerraPedia` and the current scheduler worktree as
  `commandRoot`; authenticated V2 automation and preflight reads are HTTP
  `200`, with zero live attempts/claims and `enabled=false`. The new
  `wiki-items-refresh` retry-12 preflight was not published because its source
  readiness observation exceeded the mandatory 15-minute limit.
- Retry-12 continuation (2026-09-19): the eight scheduler source-readiness
  reports were refreshed in the primary runtime root as read-only evidence;
  authenticated preflight returned `8/8 eligible` with H8 unchanged. Fresh
  `wiki-items-refresh/items` preflight, proposal, request, and execution
  manifest artifacts were emitted under the private canonical authorization
  root. Proposal/request remain `proposalOnly=true`/`AWAITING_OWNER`; no owner
  fields were invented and no decision was consumed.
- Source-refresh continuation (2026-09-19): with explicit user authorization
  limited to `wiki.page.biomes_anchor` (`Forest`), the bounded Biomes fetch
  completed with `47` records, `6` derived records, and `0` unresolved. The
  importable transform completed with `47` records. The governed manifest
  finalize added the Forest record at revision `1029270` to the primary
  `data/generated/wiki-source-manifest.latest.json`; no MySQL, Redis queue, or
  business-table write occurred.
- Fresh source monitor completed at `2026-09-19T00:39:18.362Z`: `9/9` sources
  are `ok`, `errorSources=0`, and Forest has matching current/ingested revision
  `1029270`. Eight domain acceptance readiness panels were regenerated as
  read-only evidence (`32/32 pass`) at `2026-09-19T00:51:28Z`.
- New retry-15 read-only scheduler preflight is private `0600`, canary
  `wiki-items-refresh/items`, H8 unchanged, `8/8 eligible`, live
  attempts/claims `0/0`, reconciler healthy. Artifact:
  `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-15.preflight.json`;
  preflight hash
  `sha256:32d3dc09cb71ddcf5f0adbc991f6b35ec475c862804c4749b36e754b656267cf`.
  Scheduler remains `enabled=false`; no Owner packet/decision, control PUT,
  sweep, crawler/import, or business-data write was performed after retry-14.
- Retry-16 scheduler Owner authorization and bounded canary tick (2026-09-19
  09:10-09:49 CST): the explicit user authorization was bound to
  `wiki-items-refresh/items`, packet hash
  `sha256:86c8b9ed0b08512ce766d07a20edfa0e0c8e867bf9ccaf7db8011d0a166c34f1`,
  and decision identity
  `automation-crawler-v2-scheduler-activation-20260919-owner-02`. The formal
  policy decision completed and was read back as immutable MySQL decision
  `id=41`, with `authorized_action_id=wiki-items-refresh` and H8 unchanged.
  The API enabled `changed-only` automation with the exact `wiki-items-refresh`
  canary. After the one-minute bounded interval, one natural background tick
  completed at `2026-09-19T01:46:26.192975608Z`: it detected all eight source
  panels, but dispatched `0`; non-canary actions were skipped as
  `canary_scope_excluded` and the items action was skipped as
  `automation_disabled` during rollback. No manual `/sweep`, crawler/import,
  Redis queue mutation, or business-table write occurred. The cleanup PUT
  restored `enabled=false`; final preflight is `8/8 eligible`,
  live attempts/claims `0/0`, and reconciler healthy. Redis DB14 readback is
  `409` keys after the tick (no queue claims); the retry-16 result is
  private `0600` at
  `reports/authorization/canonical/automation-crawler-v2-scheduler-activation.retry-16.result.json`
  (SHA `sha256:a436c91d44e8090942bf52e79ac2c8bff4e87834aeeb0756b002a3de2e1433b1`).
- Retry-17 scheduler Owner authorization and bounded natural-tick canary
  (2026-09-19 13:41-13:44 CST): fresh preflight hash
  `sha256:52be1a54ea9849455939724daa82a0a10f2c4948379060526e7a2bdd764c0aed`,
  packet hash
  `sha256:31b9aa33900533665c248dafb275368efcfacff007a6c40af8395b8062db4be2`,
  and immutable MySQL decision `id=42` authorized only
  `wiki-items-refresh/items` with H8 unchanged. A natural V2 tick completed
  at `2026-09-19T05:41:56.683152201Z`; it dispatched `0` and skipped items as
  `automatic_queue_metadata_untrusted`. The API restored
  `enabled=false`, `changed-only`, interval `60`, and the items canary at
  `2026-09-19T05:44:48.569744697Z`. No crawler/import process, Redis queue
  mutation, or business-table write occurred. The next step is read-only
  identification of the historical V2 items record with untrusted queue
  metadata; do not open another scheduler window or force a queue reset.
- Retry-22 reached the first scheduler-owned items V2 attempt. It refreshed
  source/normalized artifacts but failed before DB apply because the supervisor
  launched old durable-root code. The repaired three-root launch binding is
  deployed after a canonical restart; fresh source-readiness is 8/8 eligible,
  H8 is unchanged, control is disabled, and there are zero live
  attempts/reservations/fences. Retry-23 preflight is retained but invalidated
  because its code bundle missed the two repaired launch files. Retry-24 has
  only private preflight/proposal/request artifacts and is now also immutable
  historical evidence: its frozen bundle predates the P1 canary-scope repair.
  The activation bundle now pins the request builder, owner-input capture,
  policy-decision runner, API DTO, and policy interface; its contract is
  `58/58`. Next: create fresh retry-25 read-only evidence only, then use the
  standing authorization gates for any bounded natural canary.
- Offline canary-binding repair is specification-approved: canonical request
  self-hash/status/time validation runs before MySQL connection, and capture
  freezes the request path, file SHA, request SHA, canary, and
  `authorizedActionId`. Full automation validation is `994/994`; Java mapper
  contract is `2/2`; `git diff --check` passes. No runtime mutation occurred.
  An independent quality-review slot was unavailable after the serialized
  spec review, so no code checkpoint or commit is claimed.
- Retry-25 policy decision `id=51` is authoritative and action-bound to
  `wiki-items-refresh`. Its first natural V2 sweep began at
  `2026-09-19T09:49:58Z`, completed source monitoring `9/9 healthy` with
  `7` changed sources, but did not enqueue: the bounded observer restored
  `enabled=false` while source monitoring was active, and the mutation-time
  recheck recorded items as `automation_disabled`. Database attempts,
  reservations, fences, and items remain `0/0/0/6159`. The next legal
  60-minute cadence is about `18:49 CST`; retry-25 cannot open a second
  window. At that time, create fresh retry-26 source-readiness, preflight,
  proposal/request/packet, and decision evidence before another items-only
  natural tick.
- The refresh emitted eight untracked runtime report files under the primary
  checkout's `reports/domain/**` root; they are generated evidence only and
  remain outside the scheduler code checkpoint and any commit scope.
- Retry-27 terminal readback (2026-09-19 20:22 CST): the natural tick
  dispatched only `wiki-items-refresh/items`, then attempt
  `attempt-d44c3cb1-6178-490e-a0e9-b9a3c1e2b8d1` failed with
  `PROCESS_EXIT_NONZERO` because recovery reused the prior source fingerprint
  while its source-run/content identities were stale. The child runner failed
  closed on `source monitor checkedAt does not match the dispatch identity`;
  no crawler/import or business-table write occurred. Recovery now requires
  exact full source identity before retry, with focused RED-GREEN evidence
  (`2/2`). The stack was restarted with durable repo root
  `/home/lolben/TerraPedia`, this worktree as command root, and scheduler
  disabled; final preflight is `8/8 eligible`, live attempts/claims `0/0`,
  reconciler healthy, and MySQL items remains `6159`. Retry-27 is terminal
  historical evidence; do not reuse it, call `/sweep`, or directly retry the
  attempt. The next window must use fresh retry identity and preflight.
- Retry-28/30 canary readback (2026-09-19 23:25-23:56 CST): fresh H8
  preflight and a new action-bound decision `id=57` authorized only
  `wiki-items-refresh`. The backend was restarted with scheduling enabled for
  the natural tick; source monitor completed `9/9 ok`, six non-canary actions
  were excluded, and two items attempts reached terminal
  `PROCESS_EXIT_NONZERO` before apply because the artifact ancestor failed the
  service-UID/non-group-writable boundary. Final control is restored to
  `enabled=false`, interval `60`; live attempts/claims and MySQL
  attempt/reservation/active-fence counts are `0/0/0`, reconciler is healthy,
  and `items=6159` unchanged. Do not retry either attempt or alter artifact
  ownership/modes ad hoc. Next owner: repair/review the artifact ancestor
  service-UID contract, then generate a new preflight and decision identity.
- Retry-31 policy decision and natural-window readback (2026-09-20
  01:07-01:28 CST): the governed decision completed and was read back as
  immutable MySQL `id=58`, identity
  `automation-crawler-v2-scheduler-activation-20260920-standing-items-09`,
  action `wiki-items-refresh`, packet
  `sha256:bc9234d95562e45571135e87803418cecfb74ea5a20be83a264efea8fdb80ed4`.
  A fresh pre-enable preflight was `8/8 eligible`, zero live attempts/claims,
  healthy reconciler, H8/epoch unchanged. The natural-only watcher enabled the
  exact canary at `17:24:27Z`, but the backend did not emit a fresh scheduled
  sweep during 48 polls over four minutes; cleanup restored `enabled=false`.
  No attempt, source refresh, crawler/import, Redis queue mutation, or
  business-table DML occurred. The next action is read-only scheduler cadence
  diagnosis followed by a fresh preflight and new action identity; Retry-31 is
  consumed and cannot be reused.
- Retry-32 source refresh, decision, and canary readback (2026-09-20
  02:18-02:32 CST): the source monitor completed in the private primary-root
  report directory with `9/9` healthy and `7` changed sources; the eight
  acceptance domains were regenerated as `38/38` registered panels passing.
  Fresh preflight hash is
  `sha256:c4151791dc14a7f532cad6bb7c1889d2910891e1dc4ad64362667998f5dbcd7b`
  with `8/8 eligible`, unchanged H8/epoch, zero live attempts/claims, and a
  healthy reconciler. The governed decision is immutable MySQL `id=59`,
  identity `automation-crawler-v2-scheduler-activation-20260920-standing-items-10`,
  action `wiki-items-refresh`, packet hash
  `sha256:b23dd852b27bd8f76d11c9259fa193c30b5269d827a72f8eb0a6e7309f745e97`,
  and duplicate identity count `1`.
- Retry-32 control readback: the exact canary was enabled once, but the
  observer's first implementation passed `BASELINE=...` as a Node argument
  instead of exporting the environment variable and therefore misclassified
  the historical `lastSweep` as a fresh tick. It immediately restored
  `enabled=false`; corrected API readback shows no natural tick, no attempt,
  source probe, crawler/import, Redis queue mutation, or business-table DML.
  Retry-32 is consumed and cannot be reused. The private
  `automation-crawler-v2-scheduler-activation.retry-32.execution-manifest.json`
  is retained as an erroneous artifact; the authoritative policy manifest is
  the corresponding `.policy-decision-manifest.json`.
- Child entry `entries/2026-09-03-source-dispatch-identity-repair.md` is closed
  in checkpoint `6341f8f0fda8479d5af6816ed84c034c8611c0b9`; its contract
  handoff remains canonical `sourceFingerprint/sourceRunIdentity/sourceContentIdentity`.
- Current state: P1 retained-lock and successor-alert safety is accepted after
  five RED-GREEN assertions, monitor `283/283`, fresh specification review,
  and fresh code-quality review. The cleanup failure fence now preserves the
  current successor state while emitting one deduplicated CRITICAL alert for
  the original dispatch. The Java V2 producer's returned origin/launch/
  recovery/manual-coexistence findings have RED-GREEN repairs in the current
  worktree. The latest cancel/recovery repair moves the reconciler identity
  gate ahead of progress ingestion and makes recovery validate immutable
  manifest identity before cancel adoption. The retry repair now reads the
  authoritative queue/prior attempt before Lua dispatch and Lua atomically
  repeats exact ownership-pair/source-identity checks before writes. Fresh
  focused Java validation is `312/312`, zero failures/errors
  (`5 + 24 + 51 + 61 + 37 + 2 + 92 + 40`). Fresh independent specification
  review approved the persisted retry repair with no findings. Code-quality
  review also approved it with no findings. The Node consumer now re-reads the
  exact source-monitor state immediately before live acknowledgement; its
  identity tests are `99/99` and the full automation suite is `956/956`. The
  returned Node specification findings now have six observed RED-GREEN
  regressions: both acknowledgement paths check source state before their final
  activation identity/time guard, Base reads its final source fingerprint before
  that guard, Supplementary fences preview publication before source/bundle
  writes, and manual identity-bearing environment/bundle/operation inputs fail
  closed. The affected Node suite is `210/210`, full automation is `965/965`,
  and Java producer validation is `312/312`. The returned Node code-quality
  findings are repaired: the shared monitor-state reader now requires a
  repository-confined ordinary file, opens the leaf with `O_NOFOLLOW`, and
  rechecks file identity around the read; it rejects leaf/ancestor symlinks and
  replacement races. The Supplementary initial reader is now inside the
  source-identity terminal-progress handler. Fresh independent Node
  specification and code-quality reviews approved the repair with no findings.
  Fresh coordinator full Node automation (`965/965`) and Java producer
  (`312/312`) reruns passed; the child is closed in checkpoint `6341f8f0`.
  Runtime operations remain blocked.
- L2 stable reauthorization implementation is now present and offline-validated:
  eight exact operation IDs, read-only capture/proposal, retry-labelled
  manifests, content-addressed proposal bundle binding, and no-policy-update
  decision consumption. Fresh Node automation is `981/981`; focused Java
  mapper/migration contracts pass. The canonical startup is healthy; runtime
  progression is instead blocked at the fail-closed source-monitor contract
  described below.
- Contract handoff: H8
  `sha256:e425764ed673f1d16bdbc7b3511cff10f1f090f8276dbfdf7aaf04f9a5ae4df0`;
  eligible domains
  `items,npcs,projectiles,armor_sets,buffs,audio,bosses,shimmer`; global
  readback
  `sha256:34af46aacb92d171c232128712c47641cbb3882a689ae0fd18195302184445e0`.
- Runtime boundary is MySQL `127.0.0.1:13306` (Flyway V61), Redis `6380`, and
  backend `18102`; fresh authenticated API preflight is HTTP `200` with H8,
  eight eligible domains, zero live attempts/claims, and a healthy reconciler.
  Persisted control is `enabled=false`, `changed-only`, interval `60`.
- Next agent start point: Retry-32 is consumed with scheduler control
  disabled. Diagnose cadence/readback only, then create a fresh Retry-33
  preflight and action-bound packet before any new natural canary. Do not call
  `/sweep`, reuse any prior retry, alter Redis/queue JSON, or mutate artifact
  ownership/modes ad hoc. Continue under the standing authorization register
  without another chat confirmation when all fresh gates pass.
- Current gate after source-refresh: scheduler is disabled after the prior
  retry-14 natural tick failed closed. Biomes source freshness is now healthy,
  but retry-15 remains proposal-free/read-only evidence; do not reuse retry-14
  or infer authorization from the source refresh.

- Retry-14 authorization and natural-tick observation (2026-09-19): the
  database-confirmed `admin/ACTIVE` Owner authorized the exact
  `wiki-items-refresh/items` canary. Packet
  `automation-crawler-v2-scheduler-activation.retry-14.packet.json` is
  `AUTHORIZED` with packet hash
  `sha256:b1acd0d7ffa713b31ea4b627d57859a0d306b79e507871c733590c5b717d4256`;
  policy decision result is authoritative/completed and persisted as DB
  decision `id=40`, with H8 unchanged. The canonical stack was restarted with
  durable root `/home/lolben/TerraPedia`, command root this worktree, and
  scheduling enabled. A natural V2 tick ran at `2026-09-18T23:44:28Z` and
  failed closed with `source_update_check_failed`, detected `0`, dispatched
  `0`; scheduler control was then restored to `enabled=false`,
  `changed-only`, canary `wiki-items-refresh`. Final preflight is `8/8
  eligible`, zero live attempts/claims, healthy reconciler. No crawler/import,
  Redis queue mutation, or business-table write occurred. The remaining gate
  is the independent `wiki.page.biomes_anchor` `missing_ingestion_manifest`
  source-refresh/import authorization; do not remediate it or re-enable the
  scheduler without a new bounded authorization.
- Phase 1 evidence catalog was re-run against the linked ingestion worktree on
  2026-09-06. The current helper passed `20/20` tests and produced exactly
  `185` entries (`131/45/4/4/1`) at the private retry-02 path
  `.local/tmp/automation-evidence-catalog-scheduler-activation-20260906-retry-02.json`
  with mode `0600` and logical SHA
  `sha256:1e4bd9b5a8d596f962799aba4ff0dc5863ee22d5baa10153f686eb8ec0d2704e`.
  The historical fixed catalog path was already occupied and was not
  overwritten.
- Phase 2 offline activation-contract tests were rerun on the resumed session:
  `108/108` passed. A fresh Phase 0 baseline is recorded at
  `.local/tmp/automation-scheduler-baseline-scheduler-activation-20260906-retry-04.json`;
  the authenticated collector failed closed at `preflight requires disabled
  automation` before publication.
- Runtime verification at 20:25 CST passed `verify-local-stack.sh --skip-front`
  (database TCP, mapper XML, backend compile, and admin typecheck). No new
  API or data mutation was performed.
- On 2026-09-07 the canonical startup command was re-run and stopped at the
  MySQL TCP preflight because `127.0.0.1:13306` refused the connection;
  Redis `6380` and backend `18102` are also currently down. No runtime
  mutation occurred. An administrator must start the existing MySQL instance
  before the stack and fresh Phase 0 readback can continue.
- MySQL was subsequently restored by the operator. The stack is now healthy
  with the backend bound to the primary durable V2 marker root and scheduling
  disabled. The authorized control PUT is read back as
  `enabled=false/mode=changed-only/interval=1`.
- Governed readiness refresh wrote 32 fresh reports for the eight target
  domains; fresh preflight is `8/8 eligible`, H8 remains unchanged, live work
  is zero, and the reconciler is healthy. Phase 3 proposal/request/manifest
  artifacts are generated under retry-01; the request remains
  `AWAITING_OWNER`. No scheduler enable, Owner packet/decision, sweep,
  source probe, crawler/import, or business-table write occurred.
- The backend evidence-root repair is now implemented in
  `DomainAcceptanceServiceImpl`: Spring runtime consumes the configured
  `terrapedia.crawler.queue-v2.repo-root` before Maven CWD discovery, while
  explicit test overrides remain highest priority. The RED-GREEN regression
  and related controller/preflight tests pass `29/29`.
- The focused code checkpoint is `5bdd2fc8` (`fix(scheduler): bind configured
  evidence roots and retry manifests`). Runtime reports and authorization
  artifacts remain intentionally untracked and outside the checkpoint.
- Before Owner consumption, a second retry-path audit found the policy-decision
  manifest and its authorization data bundle still fixed scheduler activation
  to flat paths. RED-GREEN repairs now bind retry-labelled policy-decision
  inputs/results and require the authorization bundle to read the exact private
  manifest input. The active code checkpoint is updated after these repairs;
  retry-03 remains historical and must not be consumed.
- After backend restart, monitor readback reports `repoRoot=/home/lolben/TerraPedia`.
  A governed primary-root refresh regenerated 32/32 target panels at
  `2026-09-07T13:21:24.667Z` (`pass=32`, `warning=0`, `blocked=0`). Retry-03
  preflight is self-consistent with H8, 8/8 eligible, zero live work, and all
  no-write flags. Preflight hash:
  `sha256:6834da54d50b64296b13eeb56713f8c0c08d13b334d809fba82b07973b480305`.
- Retry-03 proposal/request are self-hash-consistent and remain
  `proposalOnly=true`, `enabled=false`, `AWAITING_OWNER`; request hash is
  `sha256:57e3fa5e1d3914a8e76e4eed1e56d140728bf4ba86060b0e7f0dc18708571f99`.
  The scheduler execution-manifest CLI now accepts a retry label only for this
  proposal operation and binds retry-03 preflight/proposal paths exactly;
  retry-03 manifest is therefore structurally consumable after separate Owner
  authorization. Retry-01/02 remain retained historical artifacts and are not
  consumable.
- Current risks: MySQL and the local stack are currently reachable, but the
  existing system MySQL still requires administrator ownership to recover after
  a stop. Separate runtime authorization is still required even with healthy
  services. The
  reviewer-requested content-only
  post-apply and committed/DRY_RUN acknowledgement permutations remain a
  residual coverage consideration beyond the new pre-publication content-drift
  and normal acknowledgement-race regressions. No natural source-change-to-
  database run has occurred; the
  structured L2 diff producer and shared-`npcs` scope remain code/test evidence
  until fresh live policy-scope readback and a separately authorized canary;
  the 185 private evidence files stay unchanged in the linked ingestion
  worktree.
- Current runtime observation (2026-09-18): the fresh scheduler preflight is
  still `8/8 eligible` at the exact H8 contract, with zero live attempts and
  claims and a healthy reconciler. The bounded natural-tick authorization was
  exercised once and immediately rolled back to `enabled=false` after the
  scheduler wrote `status=error`, `detected=0`, and `dispatched=0`. No crawler
  or business-table write was dispatched. The source monitor process itself
  completed, but its primary-root producer emitted a legacy summary without
  `probeHealthy`; the current backend rejects that contract. Its produced
  source state also includes `wiki.page.biomes_anchor` with
  `missing_ingestion_manifest`, so the backend correctly remains fail-closed
  even after the producer-version mismatch is addressed. Do not re-enable or
  rerun a probe until the runtime code-root/state-root contract is reconciled
  and a separate source-refresh/import authorization is explicit.
- Single-action canary scope repair is now offline-validated. V2 automation
  requires one configured registered action before source probe, passes that
  exact action through every scheduler eligibility readback and mutation
  recheck, and excludes all other changed actions. V61 persists the immutable
  `authorized_action_id`; V61 is now applied and backend `18102` runs the
  corrected dual-root configuration. The detailed continuation state is in the
  active handoff entry. No scheduler-control, source-probe, crawler/import,
  Redis queue, or business-data write was performed by this repair.

## Recently Closed

- `entries/2026-09-03-source-dispatch-identity-repair.md`: reviewed source-
  dispatch identity child closed in `6341f8f0`; runtime phases remain
  unauthorized.
- `entries/2026-08-27-eight-domain-l2-execution-continuation.md`: eight-domain
  L2 promotion chain closed at `edc40b4fe702aa11b9ec03d2d49ff9448d6eeb09`.
