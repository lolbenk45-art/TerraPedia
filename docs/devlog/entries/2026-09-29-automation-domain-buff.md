# Buff automation domain continuation

### Fresh current-Wiki re-crawl #2 and isolated replay - 2026-10-11 16:15 CST

- A new invocation of `bash ./platform/local/run-buff-current-source-replay.sh` completed with run key `buf_b7d4e3418962ccfc`, artifact `.local/tmp/buff-current-source-replay-buf_b7d4e3418962ccfc.json`, `status=passed`, and artifact SHA-256 `sha256:72fe44cd073a5c98a939213f028d6af92d040f55f4c0e65ba64c1f9df23df8d8`.
- This run fetched Wiki sources again over the network. It captured `Template:GetBuffInfo@1023278`, `Module:Iteminfo/data@1023241`, `Shadowflame@1027510`, and `Acid Venom@1027618`; source snapshot hash is `sha256:d9c70a95a1ac96c2466a82edffd8d883c1020269f42f6c78485f5d5df797d547`. Revision IDs are unchanged; the page raw hashes are new for this capture, proving fresh retrieval without claiming a semantic source delta.
- Parsed facts are ShadowFlame `5/1/30` and Venom `8/3/26` for source items/inflicting NPCs/immune NPCs. Isolated T1 passed with Buff import `2/2`, source-item rows `13`, maint inserts `2`, relation/projection Buff rows `2/2`, inflicting-NPC rows `4`, unresolved `0`, and consumer readback Venom `8/26` plus ShadowFlame `5/30`.
- The runner recorded Redis `6380/DB13` preflight/postflight `0`, run-derived databases `terria_v1_automation_acceptance_buf_b7d4e3418962ccfc_{local,maint,relation}`, and `cleanupPassed=true`. The independent check immediately afterward observed a new Armor reservation `arm_db58a3f20b51d757` in DB13 because the Armor isolated runner started concurrently; no key was deleted or flushed. After that run ended, another Armor run `arm_05aa800dcb5aa189` reclaimed DB13; six read-only samples over ten seconds all showed its two keys. DB13 cannot be treated as globally idle while that Armor automation is running.
- A preceding attempt `.local/tmp/buff-current-source-replay-buf_126d7ce6c385472a.json` failed closed before capture for the same DB13 contention and was not reused. The contention is environmental concurrency, not a Buff source or T1 failure.
- The artifact remains explicitly `manual_source_replay=true`, `production_source_delta=false`, and `databaseWritesToFormalRuntime=false`; production Buff `18105/DB15` remains disabled and no formal runtime write occurred.

## Session resume and Item dependency scope — 2026-10-06

Task 17 continuation: branch/HEAD and the unstaged/untracked handoff match.
Fresh authenticated API preflight at 2026-10-06 07:20 CST is HTTP `200`,
disabled scheduler, live attempts/claims `0/0`, healthy reconciler, unchanged
H8/epoch; no pipeline writer is active. A helper initially selected its
default port `18088`; using the recorded `18104` endpoint resolved the
connection failure without service changes.

Implement the source-bound six-Item proposal and insert transaction core,
with TDD, real landing/maint receipts, locked rederivation, exact preserved
rows/after-set, and mandatory recovery evidence. Use independent namespace
`canonical.buff-item-dependency.<runId>` and reuse the maint extractor.
Current spec is unchanged until a governed runtime entrypoint is registered.
No DDL, direct SQL repair, scheduler activation, H8 expansion, commit or push
is in this implementation phase. Registration/packet/permit and actual
publication remain downstream gates; the existing standing register is not
replaced by a caller boolean.

Resumed session `01a10936-edff-70c0-b375-7cfcacc3d19a` from its local rollout.
Observed branch/worktree/HEAD match the final Buff handoff:
`feat/automation-domain-buff`, `.worktrees/automation-domain-buff`,
`0a23fab31914aa0a6d79779c758243d74f342f74`, no upstream. Existing tracked and
untracked code, tests, audits, and authorization artifacts are preserved; no
cleanup or Git mutation is required. The original command-tool interruption
is resolved in this session. Backend `18104`, Redis `6380`, and MySQL `13306`
are listening. A fresh READ ONLY transaction confirms server UUID
`b4ae6728-4f72-11f1-bcc9-00155d37eadf` and unchanged Buff counts
`388/388/388/1290/0` (maint/relation/projection/NPC secondary/Item secondary).

Task 16 reuses this entry and the existing no-loss plan. Success is a
reproducible source-bound Item dependency contract and six source-derived
maint previews, retaining exact game IDs and the separate Flask identity drift.
Scope is the pure `pipelines/maint/buff-item-maint-readiness.mjs` helper,
focused tests, local SELECT-only replay, audit, and handoff. No shared catalog,
sync implementation, new source capture, scheduler/control, packet/permit,
landing/maint/relation/projection write, commit, or push is included.
Current spec is unchanged: this is a task-local diagnostic contract.

Task 16 readiness checkpoint: the pure Item classifier and six source-derived
maint previews are complete. The final source/code-bound artifact is
`.local/tmp/buff-item-maint-readiness-20261006-v3.json`, file SHA-256
`sha256:3ae55341eb4655fd9387cb642c52e26c9aad65efa8ec983f942e4a5b9941bd8f`.
The frozen secondary audit's fifteen facts yield thirteen unique Item
dependencies, six exact active
maint identities, six missing maint rows, and one spelling drift at `1340`.
Iteminfo and canonical maint both prove `FlaskofVenom`; page payload still
uses `FlaskOfVenom`, retained for explicit disposition. All six missing Item
previews bind Terraria `1.4.5.7` source fields and keep landing/maint row IDs
null. Local Item auto-increment IDs remain diagnostic evidence only.

Read-only replay used the semantic capture verifier and the existing maint
extractor. One initial SELECT assumed a local `source_id` column; the real
local Item schema has none. `information_schema.columns` proved that mismatch,
then the corrected SELECT completed in a new READ ONLY transaction. No
business mutation was attempted. Exact hashes and source/server/snapshot
bindings are in the artifact and
`docs/audits/2026-10-06-buff-item-maint-readiness.md`.

Validation: new classifier `11/11` after RED; related Iteminfo/maint/Buff
lineage/candidate/maint-plan regression `99 passed / 1 existing Shimmer skip /
0 failed`; Node syntax, artifact code-hash/ID/null-receipt assertions and
`git diff --check` pass. Fresh authenticated preflight on `18104` is HTTP
`200`, disabled scheduler, live attempts/claims `0/0`, healthy reconciler,
unchanged H8/epoch. Final SELECT counts remain `388/388/388/1290/0`.
Authentication uses the existing login and may record ordinary auth audit;
the data replay is SELECT-only. Full quality/browser gates were not run.

The parent remains `active`: next implement/review the bounded Item-owned
landing/maint operation, then resolve `1340`, NPC immunity secondary lineage,
and Buff zero-baseline/full-chain gates before real publication. No scheduler,
crawler, direct Redis, business-table, packet/permit, commit or push occurred.
See git for code-level diff details.

### Task 17: Bounded Item landing/maint insert core — 2026-10-06

Task 18 review coordination: Codex root owns all code/devlog/current changes
and real data targets. The `requesting-code-review` skill explicitly requires
an independent reviewer for this new governed write path. Reviewer
`buff_item_review` is read-only, owns only findings on this turn's six-Item
contract/executor/runner and catalog/manifest/packet wiring, and may run
isolated tests. Forbidden: edits, devlog writes, DB/Redis mutation, source
capture, lifecycle changes, packets/permits, commits. Root will record and
resolve material findings before readiness; user scope confirmation for real
publication remains pending.

The six-Item insert contract and executor are implemented with tests first.
The proposal derives only source IDs `6148/6149/6155/6161/6164/6173` from the
verified Iteminfo semantic capture, retains `_generated` and Terraria `1.4.5.7`,
and uses the independent `canonical.buff-item-dependency.<runId>` namespace.
The landing is deliberately `is_current=0` so the general `items_raw` sync does
not expand the full Iteminfo corpus; maint rows carry the real landing receipt
only during execution. Existing landing/maint rows are preserved by exact
locked baseline and after-set checks.

Core tests cover source/name/version and delimiter drift, namespace/baseline
conflicts, authorization/manifest binding, fixed-column receipts, six distinct
maint identities, source rederivation under lock, rollback, COMMIT-unknown,
rollback-unknown, terminal journal failure, callback immutability, and exact
after-set. Focused result: `20/20` pass.

Read-only replay artifact `.local/tmp/buff-item-maint-insert-proposal-20261006-v1.json`
has contract hash `sha256:b80c88374270561b6c22b942bb95cefb9a2875d7a045d712de96f466143a47e9`
and artifact SHA-256
`sha256:7c8561f23abcbf918e9a26d69a4b2d174417189721d67c0167c37e05ab422785`.
Fresh API preflight before/after is HTTP `200`, scheduler disabled, live
attempts/claims `0/0`, healthy reconciler, unchanged H8/epoch. SELECT-only
MySQL readback confirms server UUID/port, `maint_items=6146`, one existing
`items_raw` landing, and Buff counts `388/388/388/1290/0`.

This phase produced no landing/maint write, packet, permit, Redis mutation,
scheduler activation, relation/projection write, or commit. The next gate is
registration in the canonical operation catalog/manifest plus a fresh
operation-bound packet, Owner/server/fence checks, one-use permit, and
post-commit readback. The `1340` spelling disposition, NPC immunity secondary
identity, and Buff zero-baseline/full-chain authorization remain independent.

### Task 18: Canonical runner review and recovery-fence repair — 2026-10-06 08:08 CST

Task 18 registration is implemented as the independent
`canonical-buff-item-maint-insert` operation. The catalog/manifest binds the
exact six source IDs, frozen Iteminfo input bytes, proposal, transitive runner
code, two distinct fence tokens, and prepared/materialized/committed,
fence-hold, and independent-readback outputs. Generic Item sync, local Item
updates, scheduler writes, DDL, H8 expansion, and Buff relation/projection
writes remain outside scope.

Read-only reviewer `buff_item_review` found two material executor issues. The
first was packet expiry during database lock waits or immediately before
COMMIT; the executor now validates `authorizedAt`/`expiresAt` at initial
admission, after locked rederivation, before permit consumption, and before
COMMIT. The second was ordinary 60-minute fence expiry after unknown
COMMIT/ROLLBACK or failed independent readback. The runner now commits both
fence holds in a separate locked transaction with deadline
`9999-12-31 23:59:59`, writes immutable hold journal phases, releases a hold
only after a confirmed rollback and terminal journal, and keeps holds on any
unknown or committed-but-unread-back outcome. A test advances beyond the
ordinary TTL and proves a competing `acquireFence` remains blocked.

Validation after repair: maint contract/executor/runner `33/33`; governance,
manifest, and authorization regression `110/110`; all touched module syntax
checks and `git diff --check` pass. No database, Redis, scheduler, packet,
permit, or real fence write occurred. The draft evidence is stale for the
changed code and must not be promoted. Real publication remains blocked until
the user explicitly confirms the new independent Item operation scope, then
requires a fresh preflight, proposal, packet, permit, two real fences, and
post-commit readback. The plan's Task 18 implementation/review items are
complete; the scope-confirmation and live-publication items remain open.

## NPC source continuation review boundary — 2026-10-01

Coordinator: Codex root. The existing `buff_partial_review` agent may perform
read-only review of NPC parser/evidence and Buff record composition changes.
It may not edit files, update shared devlogs, launch crawlers, change runtime
state, stage, commit, or push. Root owns all implementation and documentation
writes serially. Review must check stable NPC identity retention, per-fact
revision provenance, expected-missing preservation and the non-executable
full-chain fence. The active entry remains `active`; no database write is
authorized by this review.

## Status

`active`

## Scope

This isolated Buff branch closes the code-level deferred landing identity gap
without performing database, Redis, crawler, import, permit, packet, decision,
DDL, `local.items`, or scheduler writes. The source applicability gate remains
closed while retained evidence contains unresolved immunity applicability facts.

## Code contract repaired

- `applyBuffUpstreamMutations` now binds the real insert-only landing ID and
  landing trace fields into relation, item-relation, NPC-relation, and image
  candidate rows. Projection rows retain their relation identity through
  `relation_record_key` and do not receive an invented landing column.
- Deferred trace conflicts fail closed. Rows moved from `unchanged` to a trace
  update carry `landing_source_id` in `changedColumns`; expected after-sets are
  rebuilt from the bound mutation.
- The transaction executor forwards the upstream bound envelope to mutation
  and after-set callbacks. The governed runner callbacks now consume that
  callback envelope instead of closing over the pre-binding envelope.
- Deferred envelopes remain non-executable and are still rejected before
  `BEGIN`; manifest pinning, locked full rederivation, fence acquisition,
  uncertain-commit recovery, and runtime applicability remain follow-up gates.

## Validation

- `node --test pipelines/relation/buff-canonical-transaction-executor.test.mjs pipelines/relation/run-buff-canonical-ingestion.test.mjs` — 36/36 passed.
- `node --check pipelines/relation/run-buff-canonical-ingestion.mjs` — passed.
- `git diff --check` — passed.

No runtime write was attempted.

## Commit

`2a86f143` (`fix(buff): propagate deferred landing identity`)

## Governance contract checkpoint

Added a Buff-local, pure governance contract for exact fence/owner/server
readback, execution-manifest pin equality, locked rederivation hash equality,
and immutable recovery-journal record construction. The runner now delegates
its existing `FOR UPDATE` fence readback checks to the exact fence contract.
These helpers do not write a journal or activate execution; durable journal
persistence, packet/envelope manifest wiring, and full locked rederivation
remain runtime gates for the coordinator.

## Recovery journal checkpoint — 2026-09-29

- Added a private, hash-chained Buff recovery journal store and adapter. The governed runner now reserves a result label together with a journal path, binds both paths through the execution manifest, persists `PREPARED` before permit consumption, records `ROLLED_BACK` on pre-commit failure, records `COMMIT_UNKNOWN` without issuing a blind rollback when commit acknowledgement is lost, and records `COMMITTED` after a successful commit.
- The transaction executor accepts the optional journal callbacks while retaining fail-closed behavior when no journal is supplied. Journal writes are atomic, private, repository-confined, no-overwrite artifacts.
- Validation: the combined Buff landing/full-chain/transaction/recovery/runner plus manifest/authorization suite passes `197/197`; Node syntax checks and `git diff --check` pass. No database, Redis, permit, packet, scheduler, crawler, or import write was executed.
- Source applicability remains blocked: latest retained classification has `139` unknown facts and the diagnostic retry promoted none to `not_applicable`; no fresh packet or runtime Buff write is authorized.

## Revision-bound supplementary source run — 2026-09-29

- User authorization is limited to Buff revision-bound source evidence, monitor
  progress, raw artifacts, and reports. Database, Redis control, packet, permit,
  scheduler, and canonical import writes remain out of scope.
- The accidental `node pipelines/fetch/fetch-wiki-buffs.mjs --help` invocation
  was terminated at PID `2624089`. Its module-only/23-page output was marked
  diagnostic-invalid in `.local/tmp/b1-a63-20260929-07/diagnostic-invalid/`;
  it is not admissible evidence.
- Run `b1-a63-20260929-08` is the active detached revision-bound crawl (PID
  `2728191`). It uses `pipelines/fetch/fetch-wiki-buffs.mjs`, whose page fetch
  requires selected page/revision identity binding. Raw output is isolated at
  `.local/tmp/b1-a63-20260929-08/raw/`; run manifest and log are under the same
  namespace. Canonical monitor progress is
  `/home/lolben/TerraPedia/data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json`.
- At the checkpoint, progress is `running`, phase
  `buff-page-immunities`, `8/400`, with resume state under
  `.local/tmp/b1-a63-20260929-08/resume.json`. No landing, maint, relation,
  projection, packet, permit, or decision artifact has been generated.
- The local scheduler preflight endpoint was unreachable without the active
  admin session (HTTP 401 on the scheduler worktree backend); MySQL TCP
  preflight passed, and the source crawl does not depend on DB readiness.

Next action: let run `b1-a63-20260929-08` reach a terminal progress state, then
verify every page revision binding and regenerate applicability classification.
Only a zero-unknown, revision-bound classification can reopen candidate/packet
generation; historical L1/L2 artifacts remain audit evidence and do not grant
current runtime authorization.

## Corrected run checkpoint — 2026-09-29 23:08 CST

This checkpoint supersedes the earlier live PID, monitor path, preflight and
applicability counts. Source collection is active; canonical ingestion remains
blocked. Owner: Buff domain, branch `feat/automation-domain-buff`, worktree
`/home/lolben/TerraPedia/.worktrees/automation-domain-buff`, HEAD `0a23fab3`.
The coordinator owns `current.md`; its older runtime statements must not be
treated as this Buff run's live state.

- Authenticated backend `18102` preflight now confirms scheduler disabled,
  live attempts/sweep claims `0/0`, healthy reconciler, unchanged H8/epoch.
  A separate read-only MySQL transaction confirms server UUID
  `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, port `13306`, active fences `0`.
  Evidence: `.local/tmp/b1-a63-20260929-08/preflight-readback.json` and
  `database-preflight.json`. The earlier all-skipped stack check is not DB
  health evidence; admin typecheck failed because this worktree lacks Nuxt
  dependencies.
- Authenticated overview revealed the original collector wrote monitor data
  to Redis DB0 while the backend reads DB14. Stopped PID `2728191`, preserved
  its 163-record checkpoint and resumed with DB14 plus the actual canonical
  file `/home/lolben/TerraPedia/data/generated/fetch-wiki-buffs-progress.latest.json`.
  Progress/heartbeat writes are crawler observability, not scheduler or V2
  queue control. No historical Redis key was deleted.
- The first resumed process (`2853407`, Node 22) failed with network
  `ETIMEDOUT` during localized expansion and wrote terminal `failed` progress.
  Retry PID `2863511` uses Node `v26.1.0`, the original working runtime, and
  retains the same request-gate state and resume fingerprint. It resumed past
  the 163 saved records and reached `170/400`. The timeout is preserved in
  `crawl-resumed.log` and `resume-timeout-progress.json`.
- Monitor visibility is verified by authenticated overview, not merely by a
  Redis write: `monitor-confirmed.json` records the task as `running`, progress
  found/readable. Current run paths/PID are in `resumed-launch-2.json` and `pid`;
  the original `run-manifest.json` records the initial launch only.
- **Correction:** page-level `parseStatus=parsed` and empty `unresolvedFacts`
  do not mean immunity applicability is resolved. The exact classifier found
  `163` revision-bound pages: `12` parsed immunity sections, `0` proven
  not-applicable, `151` unknown. The prior `139` unknown figure relied on an
  invalid category inference; the old full 400-record baseline has `370`
  unresolved immunity sections. No inference was promoted in this run.
- Detailed per-Buff revision URLs and reasons are in
  `.local/tmp/b1-a63-20260929-08/reports/classification.snapshot-163.json`.
  Detached source-only finalizer PID `2879170` waits for this collector's
  terminal progress and runs the existing classifier, producing
  `reports/classification.final.json` and `finalization.json` in that run
  directory. A final report may remain blocked; it grants no execution rights.
  Source collection and audit reports are ignored local artifacts, not commits.
- Validation: Node 22 Buff fetch/resume/applicability suites pass `27/27`;
  finalizer syntax check passes. No production source code was changed. No
  landing/maint/relation/projection, packet, permit, scheduler control or
  canonical import write was performed.

Next: inspect canonical progress and `finalization.json`; do not launch a
second writer. Review every unknown against actual page evidence. Category
membership, absence of a section, and successful page parsing remain
insufficient to create `source-page-contract/v1` not-applicable claims.

## 2026-09-30 source diagnosis and continuation plan

- Run `.08` completed 400/400 at 2026-09-29 23:41 CST; finalizer exited 0.
  All 400 page revisions and the final source file hash were verified. Exact
  immunity classification remains 30 parsed, 0 not-applicable, 370 unknown.
- Unknowns split into 310 buffs and 60 debuffs. Midas targets enemies but has
  no immunity section, so neither buff/debuff type nor an item-page category
  proves non-applicability. Shared pages also expose a potential wrong-Buff
  association (Dryad's Blessing/ Dryad's Bane; Stardust Cell minion/Cell debuff).
- The current runtime normalizer accepts only parsed immunity sections;
  classifier-level `not_applicable` alone cannot unblock canonical ingestion.
  The 400-record fetch retains parsed evidence but discards raw per-page text.
- Plan: add a bounded, explicit-ID source capture using existing fetch,
  revision-binding, progress and private atomic artifact helpers; test progress
  before requests, canonical mirroring, terminal failure and fresh-output
  enforcement; capture shared-page examples; verify target identity before
  any parser/gate fix. Produce a durable diagnosis and targeted next actions.
- Scope: Buff capture/parser/audit tests and this entry only. No schema, DB,
  canonical import, policy relaxation, scheduler control, historical artifact
  overwrite or other worktree changes. Reuse existing admin preflight before
  the bounded network run. The source gate remains closed.

### Source attribution review assignment

- Coordinator/writer: Buff primary agent; owns all modifications and this entry.
- Reviewer: `buff_source_review`, read-only child assigned under
  `requesting-code-review`; reviews capture/parser/applicability sources and
  tests against HEAD `0a23fab3`. No file, network, database, Redis, scheduler,
  git or devlog mutations are allowed. Existing focused tests may run.
- Producer contract: bounded 1–20-ID raw capture; revision/hash-bound artifacts;
  canonical progress and serialized Redis progress; parser rejects explicit
  wrong/ambiguous/unverified immunity targets and preserves explicit display aliases.
- Return: concrete Critical/Important/Minor findings with paths and reproducer,
  validation and remaining risks. Parent alone resolves and records findings;
  task remains active until review is disposed. No downstream import is enabled.

### Source diagnosis result and review repair

- Three serial bounded captures preserved 31 pages / 34 IDs, covering every
  original parsed-immunity record. Raw-hash-verified v3 replay yields 28 matched
  parsed sections, 370 missing sections and two wrong-target assignments
  (IDs 165/182): 372 unknown, zero not-applicable. Durable findings and remaining
  ingestion work: `docs/audits/2026-09-30-buff-page-evidence-diagnosis.md`.
- Reviewer `buff_source_review` confirmed the frozen manifest/page hashes and
  reported two important gaps: unverified target acceptance and progress-path
  input/output collisions. Buff primary resolved both with failing-then-passing
  regressions. Missing sections remain missing; identified Buffs with present
  but unbound lists fail closed. Both progress destinations are validated before
  writes, including existing symbolic-link ancestors.
- Scope extended narrowly to `sync-buffs-to-relation.mjs` normalization and its
  tests: explicitly unresolved binding cannot pass through parsed metadata.
  No acceptance rule was relaxed; no importer was executed. Related synthetic
  fetch/resume/cache success fixtures now carry explicit target proof.
- Validation: targeted review-fix tests 129/129; broad Buff fetch/relation/
  landing tests 241/241 (`.local/tmp/buff-evidence-final-regression-v3.log`);
  v3 replay validates all 31 raw hashes and all 34 selected identities, unchanged
  28/372 result; `git diff --check` passed. See git for code-level diff details.
- Final local process/progress check: no active Buff Node crawler/finalizer;
  canonical file completed 5/5 at `2026-09-29T16:19:35.087Z`. Earlier authenticated
  preflight and DB observations are historical checks, not freshly repeated here.
- Legacy parser helper (no live caller) and dedicated delayed-Redis/timer tests
  remain minor follow-ups owned by Buff primary. Historical binding-absent
  evidence still needs a separate contract migration/revalidation; this patch
  does not certify it. Source-item coverage and per-group applicability remain
  blockers for whole-domain ingestion. No DB, packet/permit, scheduler control,
  historical L1/L2 or other worktree write occurred.
- Re-review completed by `buff_source_review`: both important findings resolved;
  no new critical/important issues. Reviewer independently passed 129 focused
  tests, `git diff --check`, all manifest/raw hashes and 34 v3 replays; acknowledged
  the repaired producer/normalizer contract. Buff primary accepts this disposition;
  minor follow-ups stay assigned above. Source-repair patch is validated and
  uncommitted; the overall Buff ingestion task remains active and blocked on the
  documented source contracts. No commit or push performed.

### Source-item preservation continuation

- User requested continuation. Goal: prevent missing page source sections from
  becoming authoritative empty source-item sets, preserve available module
  candidates without certifying them, and quantify retained-versus-new coverage.
  No network crawl, import, DB, scheduler or historical artifact write is needed.
- Read-only comparison found 161 previously sourced Buffs now empty (242 retained
  item rows), all with `sourceItems.status=section_missing`. The isolated `.08`
  shared root contains no Iteminfo module input. The separate available shared
  module has a revision timestamp but no revision ID; it is comparison evidence,
  not fresh ingestion authority.
- Plan: add RED tests for missing/empty/incomplete source groups and available
  module fallback, then make `buildBuffRecords` preserve fallback candidates and
  mark unresolved source-item evidence incomplete; keep present positive page
  facts and other fact groups unchanged. Verify normalizer rejection and input
  immutability. Produce a hash-bound offline coverage report, run Buff regression,
  and request read-only review before accepting the change.
- Files: `pipelines/fetch/fetch-wiki-buffs.mjs` and `.test.mjs`, diagnosis audit,
  this entry, ignored local comparison artifacts. Existing source-normalizer
  behavior must reject incomplete evidence; no new import acceptance is added.
- Reviewer assignment: existing `buff_source_review`, read-only on this delta
  and diagnostic artifacts, no file/network/DB/Redis mutations. Buff primary
  owns implementation, validation, findings disposition and devlog updates.
- Implementation: positive page source rows retain precedence; empty page
  arrays no longer suppress module candidates. `sourceItemsSource` records the
  selection. Missing/empty/unverified page groups remain unresolved and set
  assembled `parseStatus=parse_incomplete`; the current normalizer rejects
  them. Source evidence is copied before adding unresolved facts; inputs and
  unrelated unresolved groups are preserved. See git for code-level diff details.
- Hash-bound offline comparison (`.local/tmp/buff-source-items-20260930/coverage.json`)
  freezes all three inputs: 242/242 retained entries match available module item
  IDs. Replaying that module preserves 426 entries / 194 Buffs; all 161 fallback
  Buffs remain incomplete. Without a module, 184/33 remains, with 367 unresolved
  source-item groups. This is diagnostic only; no payload or candidate is emitted.
- Validation: six new RED-verified regressions, 17/17 focused tests and 247/247
  broad Buff tests (`.local/tmp/buff-source-items-regression.log`). Reviewer
  `buff_source_review` independently passed focused tests, all input/builder
  hashes, 426/194 replay and rejection of all 161 fallback Buffs; no critical/
  important findings. Buff primary accepts the review; no review blocker remains
  for this patch. `git diff --check` and builder syntax check pass.
- Immunity remains 28 matched / 372 unknown. Next source owner is Buff primary:
  fresh module evidence needs explicit revision IDs (shared module fetch currently
  requests content/timestamp only), and per-fact applicability remains unresolved.
  No shared module helper was edited; no network or runtime mutation was performed
  during this continuation. Patch remains uncommitted and overall ingestion active.

### Revision-bound Iteminfo capture continuation

- User requested continuation. Reuse the bounded capture entrypoint with an
  explicit `--source-kind=iteminfo` mode: one fixed `Module:Iteminfo/data`
  resource for the supplied Buff input, revision-bound via the existing page
  fetch helper; no arbitrary module or shared helper changes. Default Buff-page
  selection remains 1–20 explicit IDs. Add selector/title/progress tests first.
- Success: immutable module raw/manifest hashes, exact positive `buffType`
  comparisons for the 242 retained item rows, authenticated monitor evidence,
  and reviewed tests. No import candidate, packet/permit, scheduler control,
  standardized overwrite or DB write. Recheck live runtime before network.
- Owner/writer: Buff primary. Existing `buff_source_review` remains read-only
  reviewer for capture delta, tests and later evidence; no network or mutations.
- Implemented the explicit one-module mode; shared module fetch stays unchanged.
  Mocked capture suite 15/15 and broad Buff suite 250/250 pass; pre-run reviewer
  found no critical/important issues. See git for code-level diff details.
- Fresh authenticated preflight: scheduler disabled, attempts/claims 0/0,
  reconciler healthy, same H8/epoch; no active crawler process at launch.
  `.12` capture exited 0 with page 18021/revision 1023241, source timestamp
  `2026-08-22T03:26:22Z`. Raw and report hashes are recorded in the durable audit.
- Field-level source report confirms all 242 retained item→Buff relationships,
  plus four new module assertions (249 total on 167 Buffs). Diagnostic replay:
  430 items / 198 Buffs; all 165 fallback Buffs still incomplete. No candidate,
  import or applicability claim generated. Immunity remains 28 matched / 372 unknown.
- Authenticated overview confirms matching `.12` terminal progress from Redis:
  completed 1/1 at `2026-09-29T17:03:04.100Z`. Artifact paths and next contract
  boundary are in `docs/audits/2026-09-30-buff-page-evidence-diagnosis.md`.
  Post-capture reviewer independently verified all nine hashes, all counts and
  165 normalizer rejections; no critical/important findings. Buff primary accepts
  the review. Explicit Iteminfo boundary test cases remain a minor follow-up.
- Current checkpoint: Iteminfo positive source evidence is collected and verified;
  runtime source-group integration and immunity applicability remain active work
  owned by Buff primary. No DB, scheduler control, historical data or other
  worktree edits; changes remain uncommitted. `git diff --check` and capture
  syntax check pass.

### Source contract integration and runtime readiness

- User requests continuing automatic ingestion; standing authorization permits
  fresh governed local execution after technical gates, not direct SQL writes.
  Design uses positive Iteminfo assertions as separately bound source-item
  evidence. Missing immunity or source completeness cannot become zero facts.
- Fresh authenticated preflight/read-only DB baseline at 2026-09-30 01:19 CST:
  disabled scheduler, zero live attempts/claims/fences, healthy reconciler;
  landing 2, maint/relation/projection 388 each, item relations 0, NPC relations
  1270, images 388. Snapshot `.local/tmp/buff-ingestion-baseline-20260930.json`.
- Implementation plan: pure Iteminfo verifier recomputes raw/input hashes and
  module assertions, validates exact page/revision and input IDs/names; the
  existing Buff record builder accepts the capture as an explicit argument and
  attaches separate source-item proof. Positive page rows retain precedence;
  module rows retain incomplete overall status until the full importer contract
  supports that fact group. No caller-created proof or not-applicable assertion
  may unlock a candidate.
- Scope: new `pipelines/fetch/buff-iteminfo-evidence.mjs` plus tests;
  `fetch-wiki-buffs.mjs` and its tests; this entry and audit. Validation: corruption,
  wrong module/revision, input drift, mismatched Buff identity, source isolation,
  existing normalizer rejection, real frozen-capture replay and Buff regression.
- Next readiness audit must run assembled evidence through the actual normalizer
  and compare managed-image identities with the fresh baseline. Seven of the
  28 target-matched raw lists already fail duplicate NPC page identity; 28 was
  attribution evidence, never an executable-row count. New landing envelopes
  also remain blocked by deferred lineage integration. No packet is minted.
- Buff primary owns writes; `buff_source_review` is the established read-only
  reviewer for this producer contract and replay, with no network/DB/Redis edits.

### Iteminfo source contract assembly

- Added pure verifier/grouping module `pipelines/fetch/buff-iteminfo-evidence.mjs`.
  It binds input, manifest, raw module page, page ID/revision/timestamp and each
  positive numeric `buffType` assertion. It rejects corruption, scope drift,
  wrong revision/module and identity errors. Builder accepts this evidence via
  explicit maps; page source rows retain precedence, module rows are labeled
  `iteminfo-revision-bound`, and overall incomplete page facts stay incomplete.
- Assembly replay `.local/tmp/b1-a63-20260930-12/assembled-source-contract-v2.json`
  confirms 165 revision-bound Buffs, 33 page-source Buffs, 430 source-item rows;
  all 165 module fallback records remain incomplete. Actual normalizer accepts
  13/400 and rejects 387 (363 incomplete, 12 missing immune section, six target
  binding, six duplicate NPC identities). Immunity remains 28 attributed / 372
  unknown; no candidate or write was attempted.
- Validation: focused verifier tests and broad Buff fetch/relation/landing suite
  **254/254** (`.local/tmp/buff-source-contract-regression.log`); `git diff --check`
  and syntax checks pass. Existing reviewer `buff_source_review` owns read-only
  review of this contract delta; no network/DB/Redis edits.

### Source contract hardening

- Builder no longer accepts caller-created Iteminfo assertion maps. Passing
  `iteminfoCapture` forces `verifyBuffIteminfoCapture` to recompute exact input,
  manifest/raw hashes, selected identities, module page/revision and positive
  `buffType` rows before attaching per-Buff `sourceItemEvidence`.
- Added fail-closed checks for the 1000-record input bound, Buff/item identity,
  positive integer IDs, duplicate names/IDs, malformed durations and malformed
  capture bytes. Zero `buffType` remains non-positive and is ignored.
- Rebuilt v3 assembly: 165 revision-bound Buffs, 33 page-source Buffs, 430 rows;
  normalizer 13 accepted/387 rejected, unchanged. Focused verifier 5/5 and broad
  Buff suite **255/255** (`.local/tmp/buff-source-contract-regression-v2.log`).
  `git diff --check` passes. This delta creates no candidate or write.
- Post-hardening `buff_source_review` passed combined focused tests 22/22,
  independent v3 replay and diff check; no critical/important findings. Minor
  follow-up: compare manifest page ID/requested title/API URL in the verifier.
  Fixed module title/page ID and revision-bound fetch currently make this low risk.
- Buff primary accepts this review. Source contract is stronger, but runtime
  remains blocked by incomplete page facts, duplicate NPC identities, deferred
  landing lineage and incomplete applicability. No packet or DB operation was
  attempted; worktree remains uncommitted and active.

### Duplicate rendered identity containment

- Six captured pages rendered the same stable NPC identity twice across version
  presentations. Added RED/GREEN parser regression; identity-bound evidence now
  deduplicates by page title/internal name, preserves first source order and
  exposes raw versus unique counts. Legacy raw extraction remains unchanged.
- Assembly v5: 19/400 normalizer accepted, 381 rejected; duplicate identity
  failures are removed. Remaining blockers: 363 incomplete page records, 12
  missing immunity sections and six unresolved target bindings. Immunity remains
  28 attributed / 372 unknown; this is not a partial-import authorization.
- Buff regression suite **256/256** (`.local/tmp/buff-dedupe-regression.log`),
  focused parser 22/22 and `git diff --check` pass. No DB/import/scheduler write.
  Read-only `buff_source_review` re-review is required for this parser contract;
  overall task remains active and blocked.
- Re-review completed: dedupe is source-safe and aligns with the normalizer;
  focused combined tests **131/131**, no critical/important issue. Buff primary
  accepts the disposition. Case/alias canonicalization remains a minor follow-up;
  no database or external service write occurred.

### Missing-section target-binding correction

- Corrected normalizer ordering: an explicit `unverified` binding without an
  immunity section remains `section_missing`/incomplete; only present parsed or
  target-rejected immunity groups trigger target-binding rejection. Added RED/GREEN
  regression; no record was newly accepted.
- Assembly v6 remains 19/400 accepted and 381 rejected, with reasons 365
  incomplete, 14 missing immunity sections and 2 unresolved target bindings.
  Immunity remains 28 attributed / 372 unknown. No DB/import/scheduler write.
- Reviewer `buff_source_review` confirmed fail-closed behavior and v6 counts;
  targeted combined tests and diff check pass, with no findings. Buff primary
  accepts the review. Broad final continuation suite is 257/257.

### Missing-immunity sample capture — 2026-09-30

- User-authorized continuation completed a bounded raw capture for 20 explicit
  IDs: `1,2,3,4,5,6,7,8,9,10,21,22,23,25,32,33,35,37,38,46`.
  Artifacts are isolated under `.local/tmp/b1-a63-20260930-13/`; the capture
  reached `20/20` with revision-bound page IDs and raw hashes. No landing,
  packet, permit, scheduler, canonical import, or database write was run.
- Fresh authenticated preflight on backend `18102` reported scheduler
  disabled, Buff readiness eligible, live attempts/claims `0/0`, and a healthy
  reconciler. Canonical progress reached terminal `completed`; the final
  payload was explicitly mirrored and read back from the backend Redis DB14
  progress key. The canonical/Redis/API context is bound in
  `.local/tmp/b1-a63-20260930-13/monitor-readback-v2.json`. The first overview
  still exposed `.12`; capture had not inherited the backend Redis connection
  settings. Live API visibility during capture was not proven. After terminal
  mirror repair, `monitor-registered-task-readback.json` independently confirms
  registered-task progress matches canonical `completed 20/20`. No Redis
  history was deleted; future launches must explicitly bind port6380/DB14.
- Offline replay through `buff-immunity-page-parser.mjs` classified all 20
  selected pages as `immuneNpcs.status=section_missing`. No page contained a
  rendered `Immune NPCs` heading, `Enemies immune to` block, or missed immunity
  template section. ID 37 (`Horrified`) resolves to the `Wall of Flesh` NPC
  page, which also describes Horrified; this mapping alone is not an input
  identity error. Its NPC infobox `Immune to` describes the reverse relation
  and is not evidence of NPCs immune to Horrified. The top-level `parseStatus=parsed`
  does not override the authoritative `immuneNpcs` fact-group status.
  Durable detail is in
  `docs/audits/2026-09-30-buff-missing-immunity-sample-review.md`.
- Decision: this sample confirms missing evidence, not `not_applicable`.
  The gate remains closed. Next source work must find a revision-bound,
  Buff-specific alternate source before any applicability claim or candidate
  generation; page category, Buff/debuff type, and absent sections remain
  insufficient.
- Fresh regression: Buff fetch/relation/landing suites pass `257/257` and
  `git diff --check` passes. Read-only reviewer verified all20 raw hashes and
  parser results; the monitor-context finding and parse-status clarification
  were resolved and re-reviewed. Reviewer accidentally regenerated the ignored
  analysis file; Buff primary regenerated and re-bound its hash explicitly.
  Raw capture files were preserved. No new implementation change or commit.

### Revision-bound NPCinfo alternate-source capture — 2026-09-30

- Fresh authenticated preflight again reported scheduler disabled, Buff
  eligible, live attempts/claims `0/0`, and healthy reconciler. The first
  `.14` capture used a 388-record input while raw Npcinfo contained positive
  IDs outside that scope; its temporary script filtered them and the new
  verifier correctly rejected it. `.14` remains diagnostic history only.
- Corrected `.15` capture binds the complete 400-record `.08` input hash and
  completed a one-page `Module:Npcinfo/data` capture with page ID `18065`,
  revision `1022313`, and 762 parsed NPC rows. Its positive `buffImmune`
  assertions total `1417` across 21 Buff IDs; raw, manifest, assertion,
  verifier, and monitor hashes are recorded in
  `docs/audits/2026-09-30-buff-npcinfo-evidence.md`.
- Twenty IDs overlap the 28 page-target-matched IDs; ID 337
  (`TentacleSpike`) is the only new positive ID. NPCinfo counts differ from
  page counts (for example ID 20 `215` vs `158`, ID 39 `5` vs `26`), so the
  alternate source cannot replace or merge page lists yet. It remains
  positive-only evidence and does not establish negatives.
- Added and RED/GREEN-verified pure verifier
  `pipelines/fetch/buff-npcinfo-evidence.mjs`; the real `.15` artifact passes
  it. No assertion was copied into standardized data or the database. The
  next code boundary is an explicit composition contract for NPC-owned
  positive facts, count drift, duplicates, and provenance; the source gate
  remains closed.

### NPCinfo/page positive-source composition contract — 2026-09-30

- The audit table now labels page counts as raw captured rows and records the
  identity-deduplicated counts (`157/219/100` for IDs `20/31/353` in the
  examples). This removes the raw-versus-unique ambiguity without changing
  evidence.
- Added pure `composeBuffImmunitySourceEvidence` and tests. It accepts a
  verified revision-bound NPCinfo result plus optional Buff-page evidence and
  records page rows, NPCinfo positive assertions, source revisions, display
  label overlap, and count drift. Duplicate identities fail closed. Missing
  page sections remain unresolved; the result has no merged `immuneNpcs`, no
  negative assertions, and no applicability claim.
- `buildBuffRecords` now accepts raw `npcinfoCapture` only through the existing
  verifier and stores the composition under
  `sourceEvidence.immuneNpcPositiveEvidence`. The existing page-bound
  `immuneNpcs` and normalizer contract are unchanged, so this path cannot
  authorize a candidate or import.
- Fresh verifier replay of `.15` remains `400` Buff scope / `1,417` positive
  assertions / `21` Buff IDs. Offline composition against retained `.08`
  parsed output is intentionally fail-closed for seven historical duplicate
  page identities; 393 rows compose, 14 carry positive assertions, and count
  drift is recorded without any source or database mutation.
- Validation: focused composition plus Buff fetch tests `24/24`; broad Buff
  fetch/landing/relation suite `271/271`
  (`.local/tmp/buff-positive-composition-regression-v2.log`);
  `git diff --check` passed. No
  crawler, candidate, packet, permit, scheduler, standardized JSON, or
  database write was executed.
- Read-only re-review by `buff_source_review` found no Critical, Important, or
  Minor issue. It confirmed positive-only behavior, page-normalizer source
  binding, scope/duplicate rejection, count-drift recording, and unresolved
  missing-section handling. No edits were made by the reviewer.

Next: obtain current identity-deduplicated page evidence and replay the
positive-source composition through the actual normalizer. Keep canonical
ingestion blocked until page completeness, source-item coverage, and
applicability contracts are separately satisfied.

### Frozen multi-source composition replay — 2026-09-30

- Replayed the frozen raw page captures `.09`–`.11` with the current parser,
  plus Iteminfo `.12` and NPCinfo `.15`. Every selected page identity,
  revision, raw hash and input hash was checked before assembly. The replay is
  recorded at `.local/tmp/buff-positive-composition-replay-20260930-v1.json`
  with runner `.local/tmp/replay-buff-positive-composition-20260930.mjs`.
- Coverage is 31 raw pages / 34 page Buff identities. Current results are 28
  matching immunity sections and 372 unresolved Buffs. The assembled source
  has 430 item rows, with 33 page-source Buffs and 165 revision-bound Iteminfo
  fallback Buffs still marked incomplete.
- NPCinfo contributes 1,417 positive assertions across 21 Buffs; 20 have both
  page and NPCinfo positives, and all 20 have count drift. The normalizer
  accepts 19/400 and rejects 381/400 (365 incomplete, 14 missing immunity
  sections, two unresolved target bindings). A paired no-NPCinfo replay has
  identical admission for all 400 records, proving this evidence does not
  widen the canonical gate.
- This was read-only offline work: no network crawl, standardized JSON,
  candidate, packet, permit, scheduler, Redis, or database write. The next
  action remains fresh/current page evidence only if needed to replace the
  frozen unresolved source; canonical ingestion stays blocked.
- A fresh direct probe of the required backend preflight endpoint at
  `127.0.0.1:18102/api/admin/crawler-monitor/v2/automation/preflight` returned
  HTTP 401 (`未登录或登录状态已失效`). Per the crawler progress contract, no
  new ID337 network capture was launched and no unauthenticated Wiki request
  was used as a substitute. The next network step requires an authenticated
  admin session and a new read-only preflight.

### ID337 authenticated bounded capture — 2026-09-30

- Reused the local admin credentials in memory only to obtain a fresh
  read-only preflight. The artifact is
  `.local/tmp/buff-runtime-preflight-20260930.json` (SHA-256
  `sha256:22c344d1f2691986a75314759e9d599ecde10c845271d99b7939c742384106d8`);
  it reports scheduler disabled, live attempts/claims `0/0`, healthy
  reconciler, Buff `eligible`, and unchanged V2 epoch. No token was persisted.
- Ran the bounded monitor-visible capture for explicit ID337 using
  `pipelines/fetch/capture-buff-page-evidence.mjs`. Evidence is under
  `.local/tmp/b1-a63-20260930-16/`; page ID `15429`, revision `947858`, raw
  SHA `sha256:b7c742325ce098177790195b261a6c7c7cac581f2476e429f4f976ecad7ebce4`.
  File, canonical and Redis DB14 progress all report `completed 1/1`, and no
  crawler process remains active.
- Current parser replay confirms the page's internal Buff ID 337 but finds no
  immunity section: `immuneNpcs.status=section_missing`, zero rows. This is
  source evidence, not an applicability negative.
- Replayed the complete frozen assembly as v2:
  `.local/tmp/buff-positive-composition-replay-20260930-v2.json` with SHA
  `sha256:18283584a32fc163fdf74c48b95dad561f71382a2ff72a8f690801f3dc4be27e`.
  Coverage is now 32 raw pages / 35 page identities; results remain 28
  matched / 372 unknown, normalizer 19/400 accepted, NPCinfo 1,417 positive
  assertions across 21 Buffs.
- Validation after capture: focused composition/fetch tests `24/24`, broad
  Buff fetch/landing/relation suite `271/271`, replay assertions passed, and
  `git diff --check` passed. No landing, maint, relation, projection,
  candidate, packet, permit, scheduler control, or database write occurred.

Next session: read this entry and the two Buff audits, confirm the runtime
preflight artifact is still fresh before any further crawl, and keep canonical
ingestion blocked unless a separately reviewed complete source contract is
available. The worktree remains intentionally uncommitted and dirty from the
full Buff continuation; do not discard or clean unrelated paths.

### Session handoff checkpoint — 2026-09-30 09:07 CST

- Worktree: `/home/lolben/TerraPedia/.worktrees/automation-domain-buff`.
- Branch: `feat/automation-domain-buff`; `HEAD=0a23fab31914aa0a6d79779c758243d74f342f74` (`fix(buff): persist canonical recovery journal`). The branch has no configured upstream tracking ref.
- Git state: unstaged modifications in the Buff parser/fetch/relation tests and
  devlog, plus the untracked Buff audit/verifier/capture/composition files
  listed by `git status --short -uall`; nothing is staged. Preserve all of
  these paths. No reset, checkout-discard, clean, stash, commit or push was
  performed.
- Governing documents for resume: `AGENTS.md`,
  `docs/project-governance/00_CURRENT_SPEC.md`,
  `docs/project-governance/00_WORKFLOW.md`,
  `docs/devlog/current.md`, this entry, and
  `docs/audits/2026-09-30-buff-npcinfo-evidence.md`.
- Handoff validation: `git diff --check` passed; focused composition/fetch
  tests passed `24/24`; the latest broad Buff suite passed `271/271` in
  `.local/tmp/buff-positive-composition-regression-v2.log`.
- Runtime/source state: authenticated preflight and ID337 capture are complete;
  no Buff process is active. Canonical ingestion remains blocked by 372
  unresolved immunity records, incomplete Iteminfo fallback groups, source
  count drift, and the absence of a reviewed partial-fact import contract.
- Smallest safe next action: after rereading this checkpoint, do a fresh
  preflight only if another bounded source capture is justified; otherwise
  continue read-only contract/audit work. Do not execute landing, maint,
  relation, projection, packet, permit, scheduler, or database writes.

### Read-only continuation validation — 2026-09-30

- Re-read the current governance documents, this entry, and the three retained
  Buff source audits. No Buff crawler or database writer is active, and the
  retained authenticated preflight remains historical evidence only; no new
  network capture was justified in this continuation.
- Re-ran the complete Buff fetch/landing/import/relation suite: **289/289**.
  Replayed the frozen page, Iteminfo, and Npcinfo artifacts through the
  current parser, composition contract, applicability classifier, and real
  normalizer. The fresh offline report is
  `.local/tmp/buff-positive-composition-replay-20260930-v3.json` with SHA-256
  `sha256:cb02ae1aa6c95af54b9c4ecdb8e2abac37f9896320fb04c78cf8f8129ec72d95`.
- Replay remains unchanged at 28 matched / 372 unknown; normalizer admission
  remains 19/400, with 381 rejected (365 incomplete, 14 missing immunity
  sections, and two unresolved target bindings). NPCinfo remains positive-only
  diagnostic evidence (1,417 assertions across 21 Buffs) and does not widen
  admission. No candidate, packet, permit, scheduler, standardized-data,
  Redis, or database write occurred.
- Decision: leave the entry `active` and canonical ingestion blocked. The next
  permitted source action still requires a fresh authenticated preflight and a
  separately justified bounded capture; otherwise the next owner should define
  and review the partial-fact/applicability contract before any import work.

### Automation ingestion continuation — bounded source retry — 2026-09-30

- Fresh in-memory admin login plus read-only preflight at backend `18102`
  succeeded. The new artifact is
  `.local/tmp/buff-continuation-preflight-20260930.json`; scheduler is
  disabled, live attempts/claims are `0/0`, reconciler is healthy, Buff is
  `eligible`, and the V2 epoch is unchanged. No token was persisted and no
  scheduler control endpoint was called.
- Ran one monitor-visible bounded capture for explicit IDs
  `2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,22,23`.
  `.local/tmp/b1-a63-20260930-17/capture.json` completed `20/20` with
  revision-bound raw pages; canonical progress reached terminal `completed`
  and no Buff Node process remains active. No landing, maint, relation,
  projection, candidate, packet, permit, scheduler, standardized-data,
  Redis, or database write occurred.
- Offline parser replay of all 20 fresh pages found `0` matching immunity
  sections and `20` `section_missing` results. The expanded frozen replay is
  `.local/tmp/buff-positive-composition-replay-20260930-v17.json` with
  SHA-256 `sha256:5940f3e5ecf9df49b0fbd3d6cd11e7015583d2442bd949c9c532691dff8c7048`;
  coverage is now 52 raw pages / 55 page identities, while the complete
  assembly remains 28 matched / 372 unknown and normalizer admission remains
  19/400.
- Decision: this retry adds current revision-bound evidence but does not move
  the source gate. Canonical ingestion remains blocked; do not mint a packet
  or execute landing→maint→relation until a reviewed complete applicability
  contract and sufficient page evidence exist.
- Monitor correction: the capture's first Redis mirror used the helper default
  rather than the backend's explicit `6380/DB14`, so authenticated overview
  initially continued to show `.16`. The finished `20/20` terminal payload was
  explicitly mirrored to `terrapedia:crawler:buff-page-immunity-refresh:progress`
  on `6380/DB14` without deleting old history. Fresh overview readback is
  HTTP `200`, `completed 20/20`, output/report paths under `.17`,
  `progressFound=true`, `progressReadable=true`, and `progressStale=false`.
  Future Buff captures must pass the backend Redis host/port/database
  explicitly; this is an observability correction only and grants no import
  authority.

### Automation ingestion continuation — NPC-targeting debuff retry — 2026-09-30

- Fresh authenticated preflight `.local/tmp/buff-continuation-preflight-20260930-18.json`
  again reports scheduler disabled, `0/0` live attempts/claims, healthy
  reconciler, and Buff `eligible`.
- Captured 20 uncovered NPC-targeting debuff IDs
  `67,68,80,103,144,145,148,149,156,160,163,164,195,196,197,320,321,332,333,334`.
  Shared pages reduced the request count to 18; all 18 completed with bound
  page/revision/raw hashes under `.local/tmp/b1-a63-20260930-18/`. Explicit
  Redis `6380/DB14` settings were used from launch, and authenticated overview
  readback confirms `completed 18/18`, readable, and non-stale.
- Parser replay found **0 matched** immunity sections and 20 `section_missing`
  Buff facts. This confirms that another page retry does not resolve the
  missing applicability contract. No source, standardized-data, candidate,
  packet, permit, scheduler, Redis-control, or database ingestion write was
  performed; the Redis action was monitor progress only.
- Decision: stop additional page retries for now. The next implementation
  boundary is a reviewed partial-fact/applicability contract that preserves
  unresolved immunity facts while allowing only independently complete fields;
  canonical ingestion remains blocked until that contract is implemented and
  re-reviewed.

### Partial-fact contract checkpoint — 2026-09-30

- Added pure `buildBuffPartialFactPlan` in
  `pipelines/relation/buff-source-applicability.mjs` with RED/GREEN coverage.
  The contract requires revision-bound source identity and empty parser-error
  state, replaces only fact groups with parsed sections, and requires an exact
  baseline for every unknown group. Unknown immunity facts are explicitly
  preserved; unresolved target binding cannot be promoted to parsed evidence.
- The plan is deliberately `executable=false` with
  `executionBlocker=partial-fact-contract-review-required`. It is not wired to
  a candidate writer or runtime operation, so this change cannot authorize or
  perform a database mutation. The existing strict normalizer and full-chain
  gate remain unchanged.
- Applicability focused tests now pass `12/12`; no landing, maint, relation,
  projection, packet, permit, scheduler, standardized-data, Redis-control, or
  database write was performed. The next code review must decide how the plan
  binds preserved baseline JSON and secondary relation rows before any
  executable partial candidate is added.

### Partial-fact candidate binding — 2026-09-30

- Added optional `partialFactPlansByInternalName` input to
  `buildBuffIncrementalMutationPlan` and bound it to the exact landing record,
  revision identity, and active relation baseline. The integration re-validates
  the pure partial-fact plan, rejects plan/source/baseline drift, and keeps the
  existing strict page-evidence path unchanged.
- A partial candidate keeps `raw_json` byte/content-equivalent to landing. Parsed
  fact groups are checked against the incoming record; unresolved groups copy
  exact baseline JSON/count/sample values into relation and projection columns.
  Omitted secondary rows remain `preserved` in the baseline delta, and the
  persisted `source_evidence_json` records a non-executable
  `buff-partial-fact-disposition/v1` with the preserved/replaced groups.
- Added RED/GREEN integration coverage for source-item replacement, preserved
  immunity and sample/count fields, omitted NPC secondary rows, projection
  propagation, source/landing drift, and missing baseline rejection. The full
  Buff fetch/landing/import/relation suite now passes **294/294** after this
  change; `node --check` and `git diff --check` pass.
- This remains a candidate-contract change only. The partial plan is still
  `executable=false` with `partial-fact-contract-review-required`; no landing,
  maint, relation, projection, packet, permit, scheduler, standardized-data,
  Redis-control, or database write was performed. Canonical ingestion remains
  blocked pending contract review and complete applicability evidence.

### Partial-fact parsed-count tightening — 2026-09-30

- Review found that a parsed partial fact group checked section presence and
  array shape but did not compare its declared count with the replacement rows.
  Added a RED/GREEN test and now reject missing, negative, non-integer, or
  mismatched parsed-group counts before a partial plan is assembled.
- Applicability tests pass **13/13** after the change. The partial plan remains
  non-executable and no runtime, landing, maint, relation, projection, Redis,
  scheduler, or database write was performed.
- The complete Buff fetch/landing/import/relation regression now passes
  **295/295**; `node --check` and `git diff --check` also pass.

### Partial-fact full-chain execution fence — 2026-09-30

- Review found that the full-chain envelope did not inspect candidate source
  evidence before setting `executable=true`. Added a RED/GREEN full-chain test
  and now reject relation candidates carrying
  `buff-partial-fact-disposition/v1` or its review blocker before envelope
  creation.
- The partial contract therefore remains confined to candidate inspection and
  cannot reach a canonical execution envelope. No packet, permit, scheduler,
  landing, maint, relation, projection, Redis, or database write was performed.
- The integrated Buff regression passes **296/296**; all touched relation
  modules pass `node --check`, and `git diff --check` is clean.
- Final regression output is retained at
  `.local/tmp/buff-partial-final-regression-20260930.log`; no Buff process was
  active after the run.

### Wall of Flesh / Horrified API direction fixture — 2026-09-30

- Read-only replay of the revision-bound `Wall of Flesh` page (`pageId=10220`,
  revision `1032375`) confirms that the Wiki parse API returns both wikitext
  and rendered HTML. The existing NPC parser extracts the infobox fact
  `Wall of Flesh -> inflicts -> Horrified` with NPC auto ID `113`.
- The same page's `Immune to` rows are NPC-owned resistance facts
  (`On Fire!`, `Confused`, `Hellfire`). Revision-bound `Module:Npcinfo/data`
  confirms NPC `113` has `buffImmune="24, 31, 323"`, not Buff ID `37`.
- `Template:GetBuffInfo` maps Buff ID `37` (`Horrified`) to the `Wall of Flesh`
  page, but `parseBuffPageEvidence` only treats a Buff-page `Immune NPCs`
  section as `immuneNpcs` evidence. The current result is therefore
  `immuneNpcs.status=section_missing`; this is a source-contract gap, not an
  API absence. The precise fixture and hashes are recorded in
  `docs/audits/2026-09-30-buff-npc-page-direction-fixture.md`.
- No canonical candidate or runtime write was created. The next implementation
  boundary remains a revision-bound NPC-owned `inflicts` source contract; it
  must not populate Buff `immuneNpcs` from the NPC page's `Immune to` cell.

### Directional no-loss contract execution — 2026-09-30

- Executed `docs/superpowers/plans/2026-09-30-buff-relation-no-loss.md` through
  the source-contract and offline-replay stages. The new
  `extractBuffNpcPageInflictionEvidence` contract binds page/revision, NPC
  auto ID, page scope, and Buff identity, then emits only positive NPC-owned
  `inflicts` facts. Wall of Flesh revision `1032375` now replays both
  `Horrified` (37) and `The Tongue` (38), with their duration text. Its HTML
  `Immune to` rows are not used as Buff immunity facts.
- `verifyBuffNpcinfoCompleteCapture` adds an explicit exhaustive-source gate:
  `all-npc-rows`, `buffImmune-exhaustive`, and exact `npcCount` are all
  required. The retained `.15` capture still verifies only as
  `positive-assertions-only`; no absent Buff ID is converted into an empty
  immunity list. The composer and partial plan preserve separate infliction
  and immunity evidence groups and keep partial execution blocked.
- Final offline replay
  `.local/tmp/buff-directional-source-replay-20260930-v4.json` (SHA-256
  `sha256:7a8801865f11d4cf315c3bb2f7e070ee0fd87ebbd8d1305f68c50e42421f2493`)
  revalidated the frozen 400-Buff input, Wall of Flesh raw hash, and Npcinfo
  capture before composition. It reports 28 matched / 372 unknown and 19/400
  normalizer admissions; rejection reasons are 365 incomplete groups, 14
  missing immunity sections, and 2 unresolved target bindings.
- Focused source/relation regression is green, and no landing, maint,
  relation, projection, candidate, packet, permit, scheduler, Redis-control,
  standardized-data, or database write was performed. Canonical ingestion
  remains blocked pending a newly captured Npcinfo artifact with the complete
  semantics declarations and a reviewed executable full-chain contract.

### Runtime readiness decision — 2026-09-30

- A fresh authenticated read-only preflight was recorded at
  `.local/tmp/buff-directional-preflight-20260930-v2.json`:
  scheduler `enabled=false`, live attempts/claims `0/0`, reconciler
  `healthy`, Buff readiness `eligible`, active Buff writers `0`, unchanged V2
  epoch `epoch-8c1a61e1-c3f4-46bc-98d2-0884ca743346`, and policy hash
  `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`.
  The readback is authenticated and no scheduler or database mutation was
  requested.
- The source gate still fails closure: the retained Npcinfo capture is
  positive-only, the directional replay has 372 unknown Buff records, and
  the normalizer admits only 19/400. Candidate/full-chain rederivation
  therefore remains non-executable. Task 5 execution and runtime readback
  were intentionally not run; no landing, maint, relation, projection,
  packet, permit, scheduler, Redis-control, or database write occurred.
- Final validation: the plan's focused regression passes `150/150`; the
  broader Buff fetch/relation suite passes `255/255`; all touched modules pass
  `node --check`; and `git diff --check` passes. These validations cover the
  new direction, complete-scope verifier, source composition, partial-plan
  fence, normalizer, candidate, and full-chain contracts.

### All-buff Npcinfo semantic gate correction — 2026-09-30

- Root-cause review of the retained Npcinfo source found that the module does
  not encode immunity only through `buffImmune`. It also emits
  `buffImmuneAll` and `buffImmuneAllNotWhips`; the revision-bound Wiki
  documentation defines these as all-buff and all-except-whip immunity, and
  `Module:Npcinfo/datagen` maps the corresponding game rules to those fields.
  A producer-written `fieldSemantics=buffImmune-exhaustive` string therefore
  cannot prove that an absent Buff ID is a negative fact.
- Added a RED/GREEN verifier regression and fail-closed behavior:
  `verifyBuffNpcinfoCompleteCapture` rejects any numeric NPC row carrying an
  all-buff flag until a separate semantic expansion and exact whip-debuff
  classification are captured and reviewed. The verifier also now detects
  duplicate numeric NPC definitions appearing on one line, which the shared
  Lua object parser would otherwise collapse.
- The `.20` artifact remains preserved as diagnostic source material. Its raw
  SHA is
  `sha256:dba3f8b2f2e94b43b9ed244d7e2f060baac3d99507173c5c6c1fb0c4eedadcbf`;
  the post-gate disposition is
  `.local/tmp/b1-a63-20260930-20/verified-complete-after-flag-gate.json`
  (SHA
  `sha256:fbe49607eeeeac7d134bb5c7e78e59b8cf49c0ec6db380aad0e91e42516cc1dd`)
  with rejection reason `Npcinfo all-buff immunity flag requires expansion
  evidence: 68`. The earlier producer `verified-complete.json` is not
  re-certified and cannot authorize an empty immunity list.
- Fixed NPC-page direction extraction to filter infliction facts by the
  requested source infobox when a page contains multiple NPC infoboxes. Added
  a regression for that ownership boundary. Wall of Flesh still yields only
  `113 --inflicts--> 37/38`; its `Immune to` cell remains outside Buff
  immunity evidence.
- Replayed the frozen directional chain as
  `.local/tmp/buff-directional-source-replay-20260930-v5.json` (SHA
  `sha256:af284df7b2c285ccb551396976849968637d4b1e7fcc4d20409ddd2d8a1d228b`).
  Results remain 28/400 matched, 372 unknown, 19/400 normalizer-admitted,
  1,417 positive Npcinfo assertions across 21 Buff IDs, and no complete
  immunity source. The replay is blocked without producing a candidate.
- Final Buff fetch/relation regression after the gate correction is **285/285**;
  `node --check` for both changed fetch modules and `git diff --check` pass.
  No landing, maint, relation, projection, candidate, packet, permit,
  scheduler, Redis-control, standardized-data, or database write occurred.

Next boundary: implement and independently capture the semantic expansion for
`buffImmuneAll`/`buffImmuneAllNotWhips`, including an exact Buff-scope
whip-debuff classification. Until that source contract is revision-bound and
reviewed, keep the Npcinfo evidence positive-only and canonical ingestion
blocked.

### Revision-bound Npcinfo semantic capture — 2026-09-30

- A fresh authenticated preflight
  `.local/tmp/buff-semantic-preflight-20260930-01.json` passed with scheduler
  disabled, live attempts/claims `0/0`, healthy reconciler, Buff eligible, and
  zero active Buff writers.
- The registered monitor-visible capture now supports the semantic-source mode
  and fetched `Module:Npcinfo/data`, `Module:Npcinfo/doc`,
  `Module:Npcinfo/datagen`, and `Template:GetBuffInfo` into
  `.local/tmp/b1-a63-20260930-25/`. File and Redis DB14 readback both report
  completed `4/4` in `.local/tmp/b1-a63-20260930-25/monitor-readback.json`.
- Revision-bound evidence confirms 762 numeric NPC rows, 11 all-buff rows and
  26 all-except-whips rows. The catalog exposes 19 whip-named debuff
  candidates, but the exact complete whip-debuff classification is not yet
  independently certified. The semantic report
  `.local/tmp/b1-a63-20260930-25/semantic-source-report.json` is therefore
  `review-required`; it does not authorize expansion.
- The execution plan now includes this semantic-source gate. Expansion of
  `buffImmuneAll` and `buffImmuneAllNotWhips`, candidate/full-chain
  rederivation, landing, relation, projection and API readback remain blocked
  until the classification contract is reviewed and tested. No database or
  standardized-data write occurred.

### Semantic expansion and alternate immunity normalizer — 2026-09-30

- Reviewed the revision-bound `Whips` source in capture `.local/tmp/b1-a63-20260930-26/`. Its `whip debuffs` section identifies current relevant exceptions as Buff `310` (Dark Harvest) and Buff `362` (Electric Eel). The verifier now requires both IDs plus the revision-bound documentation, datagen, and Buff catalog pages before expanding `buffImmuneAllNotWhips`.
- The expanded Npcinfo result contains 762 numeric NPC rows, 11 `buffImmuneAll` rows, 26 `buffImmuneAllNotWhips` rows, and 16,155 deterministic NPC-to-Buff immunity assertions over the 400-Buff scope. `Wall of Flesh` remains directional: NPC `113` inflicts Buff `37` and Buff `38`; its `Immune to` cell is not used as Buff immunity.
- Complete expanded Npcinfo evidence is now materialized as the canonical immunity group only when the Buff page immunity section is absent and the semantic source contract is present. Buff-page immunity rows remain preferred. Positive-only Npcinfo evidence still stays diagnostic and cannot replace a missing group.
- Replay `.local/tmp/buff-expanded-npcinfo-replay-20260930-v12.json` (SHA-256 `sha256:ae4b548a335c667422a6014e8d5c76f7627f942a1103afeade2fa624caf4ea35`) reports 398 matched / 2 unknown source pages, 33/400 normalizer admissions, and 367 normalizer rejections from incomplete source groups. No candidate, full-chain envelope, landing, maint, relation, projection, packet, permit, scheduler, Redis-control, or database write occurred.
- Validation after the change: broad Buff fetch/landing/import/relation suite `314/314`; focused Npcinfo/composition/applicability/sync suite `123/123`; touched modules pass `node --check`; `git diff --check` passes. The source and full-chain gates remain blocked for canonical ingestion.

### Partial-contract replay and directional evidence completion — 2026-10-01

- Completed Task 7 of `docs/superpowers/plans/2026-09-30-buff-relation-no-loss.md`.
  The revision-bound NPC-page evidence is now threaded through `buildBuffRecords`
  as separate positive `inflicts` provenance. Wall of Flesh revision `1032375`
  contributes NPC `113 -> Buff 37` and `NPC 113 -> Buff 38`; its `Immune to`
  cell remains outside Buff immunity evidence.
- Read-only replay artifact
  `.local/tmp/buff-partial-contract-replay-20261001-v2.json` has SHA-256
  `sha256:5956f9b50ab4431998d662d4190fec75f9428e546bbc8dd2482614553f7e6bfa`.
  It covers all 400 records: 386 partial plans were built, 12 records had no
  active relation baseline, and two records (`DryadsWard`, `StardustMinion`)
  failed closed on `target_mismatch` parser errors. The plan replaces 386 `immuneNpcs`
  groups from the complete expanded Npcinfo alternate, preserves 357
  `sourceItems` and 358 `inflictingNpcs` groups from baseline, and records the
  two positive Wall of Flesh facts. Normalizer admission is still `33/400`,
  with `367` rejected incomplete records; applicability is `398 parsed / 2
  unknown`. This artifact is read-only and produced no candidate, packet,
  permit, scheduler, Redis-control, standardized-data, or database write.
- Validation after the continuation: focused source/relation command passes
  `161/161`; the complete Buff fetch/import/landing/relation set passes
  `318/318`; all discovered Buff tests pass `350/351`, with the single failure
  being the pre-existing backfill test unable to load `mysql2/promise` before
  test execution. Touched module syntax checks and `git diff --check` pass.
- The partial plan and full-chain fence remain non-executable. The
  baseline-binding review is recorded in
  `docs/audits/2026-10-01-buff-partial-contract-review.md`; canonical ingestion
  remains blocked until the two target-mismatch records have safe source
  evidence and the 12 missing baselines are resolved. No runtime readback or
  database write was attempted.
- Plan audit found no critical or important scope defect: the source chain,
  no-write boundary, replay smoke check, focused regressions, and blocked
  continuation path are explicit. Closure still requires the source gate and
  an independently reviewed executable contract.

### Baseline binding review correction — 2026-10-01

- The first partial replay (`v2`) used `raw_json` fallback for the source-item
  and inflicting-NPC baseline groups, so it remains historical evidence and is
  not the final baseline-binding proof.
- Corrected replay `.local/tmp/buff-partial-contract-replay-20261001-v3.json`
  selects `source_items_json` and `inflicting_npcs_json` directly from active
  `terria_v1_relation.relation_buffs` rows. Its SHA-256 is
  `sha256:d89c5409685fe248fb0e9a5ae0cf845ef97776f3cbabe6851ae1dd5ac57c378d`.
  Results remain 386 plans, 12 missing baselines, 2 `target_mismatch` parser
  failures, `33/400` normalizer admission, and the same replacement and
  preservation counts. A separate read-only comparison across all 388 active
  rows found zero drift for source items, inflicting NPCs, immune NPCs, immune
  samples, or immune counts between relation columns and `raw_json`.
- This correction changes evidence quality only; no candidate, packet, permit,
  scheduler, Redis-control, standardized-data, or database write occurred.
- Re-ran the source/composition/applicability/sync/full-chain regression after
  the correction: `139/139` passed; touched module syntax checks and
  `git diff --check` also passed, with no Buff process remaining active.

### Blocker identity review — 2026-10-01

- The 12 missing baseline records are new Buff IDs `389–400`; read-only checks
  found no rows for them in relation, projection, secondary relation, or image
  tables. They cannot safely receive invented empty baselines. Any future
  publication must use an insert-only governed path after all fact groups are
  complete.
- The two remaining parser failures are page ownership mismatches, not missing
  API payloads: `DryadsWard`'s page section targets `Dryad's Bane`, and
  `StardustMinion`'s section targets `Celled`. Npcinfo can replace immunity
  facts for them, but it cannot certify their source-item or inflicting-NPC
  groups. The detailed disposition is in the partial-contract audit.
- No packet, candidate, permit, scheduler, Redis-control, standardized-data,
  or database write was performed.

### Target-mismatch alternate correction — 2026-10-01

- Added a narrow RED/GREEN contract: a `target_mismatch`, `target_ambiguous`,
  or `target_unverified` immunity page group may be replaced only when a
  complete independent immunity alternate covers `immuneNpcs`. The mismatched
  page rows remain excluded; without that alternate, existing fail-closed
  behavior remains unchanged.
- v4 replay `.local/tmp/buff-partial-contract-replay-20261001-v4.json` has
  SHA-256 `sha256:cbbdf602bbe6d881af26e291933b9e96f6aefafbe9bb85a9aeebe20156788251`.
  It builds 388 partial plans with `400 parsed / 0 unknown` applicability,
  preserves 359 source-item and 360 inflicting-NPC groups, and replaces 388
  immunity groups. Strict normalizer admission remains `33/400`; 367 records
  still fail incomplete source-item or inflicting-NPC evidence.
- The complete fetch/import/landing/relation regression passes `319/319`.
  No packet, permit, scheduler, Redis-control, standardized-data, or database
  write occurred; the full-chain partial-fact fence remains active.

### Strict-normalizer bottleneck grouping — 2026-10-01

- Diagnostic replay `.local/tmp/buff-partial-contract-replay-20261001-v6.json`
  has SHA-256
  `sha256:75657fe6ae5f7623714612bb4fb9f26e6a3939428ba7107b3c4eba5669a72dfd`.
  It groups the 367 strict-normalizer failures into 365 source-item failures
  and two combined immunity/source-item failures. Source-item completeness is
  the active gate; no absent item assertion is treated as an empty list.

### Exhaustive Iteminfo source semantics — 2026-10-01

- Added the monitor-visible `iteminfo-semantics` capture mode. It fetches the
  fixed source set `Module:Iteminfo/data`, `Module:Iteminfo/doc`, and
  `Module:Iteminfo/datagen` through action `buff-page-immunity-refresh` and
  records page IDs, revision IDs, timestamps, and raw hashes in the capture
  manifest. Progress is written before the first request and the capture has a
  completed terminal snapshot.
- Added `verifyBuffIteminfoSemanticCapture`. It requires exact Buff input
  identity, all three independent page bindings, the generated-data declaration
  for all items, the `buffType`/Buff ID documentation, and the datagen
  `convertToJsonData` mapping. Any source drift fails closed. Positive-only
  Iteminfo captures keep their prior behavior.
- Threaded complete Iteminfo evidence through `buildBuffRecords`. It replaces
  only the `sourceItems` group, records `iteminfo-revision-bound` provenance,
  and permits a complete-scope empty group. It never creates immunity or NPC
  infliction facts.
- Capture audit:
  `docs/audits/2026-10-01-buff-iteminfo-semantic-capture.md`. The actual
  revision-bound capture has 249 item→Buff assertions across 167 Buffs and 233
  verified empty Buff groups.
- Read-only replay
  `.local/tmp/buff-partial-contract-replay-20261001-v8.json` (SHA-256
  `sha256:2285a9292c54181cb9265a1d7c14ee6889a298be5fa7949ebb333490edd60428`)
  builds 388 baseline-bound plans, replaces all 388 source-item and immunity
  groups, preserves 360 inflicting-NPC groups, and admits 398/400 records to
  the strict normalizer. The two rejections are the known Dryad/Stardust page
  ownership mismatches; IDs 389–400 remain without historical baselines.
- Validation: Iteminfo semantic and capture tests `25/25`, the combined Buff
  fetch/capture tests `45/45`, verifier and builder syntax checks pass, and
  `git diff --check` remains required after this documentation update. No
  landing, maint, relation, projection, packet, permit, scheduler,
  Redis-control, standardized-data, or database write was performed.

### Target-mismatch normalizer correction — 2026-10-01

- The first Iteminfo replay still rejected `DryadsWard` and `StardustMinion`
  because `normalizeBuffPageEvidence` required `parseStatus=parsed` even when a
  complete independent immunity alternate was already bound. Added a RED/GREEN
  regression and changed only that gate: a target-mismatched page can pass the
  immunity group when the complete alternate matches the canonical rows; any
  non-immunity unresolved fact still blocks it.
- Replay `.local/tmp/buff-partial-contract-replay-20261001-v9.json` has SHA-256
  `sha256:2328ce558139529454492f97df7db327de227c549b0e59ecb74e94d834e8e204`.
  It reports `400/400` strict normalizer admission, `400 parsed / 0 unknown`
  applicability, 388 baseline-bound partial plans, 388 source-item and 388
  immunity replacements, and 360 inflicting-NPC groups preserved from the
  active baseline. Twelve new Buff IDs `389–400` still have no baseline; no
  empty baseline or NPC-direction inference was added.
- The complete Buff regression after the correction passes `302/302` in the
  touched fetch/relation set; `node --check` and `git diff --check` pass. No
  landing, maint, relation, projection, packet, permit, scheduler,
  Redis-control, standardized-data, or database write was performed.

### NPC infliction parser and no-loss continuation — 2026-10-01

- RED/GREEN parser checks now cover Wiki debuff values with numeric suffixes
  (`Darkness / 25%`, `Electrified / 5`) while preserving `rawBuffText`.
  HTML-comment pipes are ignored when splitting infobox fields, fixing the
  Wall of Flesh summary `auto=113` binding. Repeated stable NPC auto IDs are
  merged by stable identity; same-display-name NPCs are not deduplicated away,
  and positive rows retain their own page/revision provenance.
- The verifier records shared-page variants with no debuff row as unresolved
  scope gaps rather than empty facts. The retained v6 capture remains raw and
  revision-bound; no bounded network recapture was needed.
- Verified artifact `.local/tmp/buff-npc-infliction-verified-20261001-v2.json`
  has SHA-256 `sha256:6b255f38330213e260e19ae41248e7af3d3ceaf3137bc2455f83c73690453c08`.
  It covers 511 target pages, 443 unique raw pages, 753 page-backed NPC rows,
  9 explicit no-page exclusions, 112 positive `inflicts` facts, and 70
  unresolved shared-page variant gaps. `Slimer2` now maps to `Darkness` and
  `MartianTurret` maps to `Electrified`; Wall of Flesh retains both Buff 37/38
  facts without importing its `Immune to` cell.
- Read-only replay `.local/tmp/buff-partial-contract-replay-20261001-v13.json`
  has SHA-256 `sha256:10c7df07c4e5738726180afd917c33699044d50e81e32d9f8df9108b4024aaef`.
  It retains `112/112` verified NPC facts, admits `400/400` records to the
  strict normalizer, builds 388 baseline-bound plans, replaces 28 inflicting
  groups, preserves 360 inflicting groups from baseline, and leaves Buff IDs
  `389–400` without invented baselines. No candidate, packet, permit,
  scheduler, Redis-control, standardized-data, or database write occurred.
- Validation: combined Buff/NPC parser/source/capture/fetch/relation/full-chain
  regression `262/262`; touched Node syntax checks pass; `git diff --check`
  passes. Canonical ingestion remains blocked by unresolved variant scope,
  baseline-preservation requirements, and missing historical baselines.

### Review repair re-run and current read-only replay — 2026-10-01 18:12 CST

- Re-generated the revision-bound verifier artifact without a network request:
  `.local/tmp/buff-npc-infliction-verified-20261001-v3.json`, SHA-256
  `sha256:a470cecc383ef56301ceda3643e68a814c8d034b6ec35f2caaf11d23957e2ccd`.
  Its source now exposes `factSources`, preserving page ID, revision ID, and
  revision timestamp for every contributing NPC page. The artifact retains 511
  target pages, 443 unique raw pages, 753 page-backed NPC rows, 9 exclusions,
  112 positive facts, and 70 unresolved shared-page variant gaps.
- Re-generated the baseline-bound replay artifact:
  `.local/tmp/buff-partial-contract-replay-20261001-v14.json`, SHA-256
  `sha256:3f718ccb24e28ff7335925f3222e44894a0cbf1fe69040508d5f6991c88e7280`.
  It retains `112/112` NPC facts, admits `400/400` records to the strict
  normalizer, builds 388 plans, replaces 28 inflicting groups, preserves 360
  inflicting groups from the active baseline, and reports zero plan errors.
- The complete focused Buff suite passes `263/263`; all touched modules pass
  `node --check`. `git diff --check` is run after this documentation update.
- Observed blocker is unchanged: 70 shared-page scope gaps remain unresolved,
  360 inflicting groups require baseline preservation, and Buff IDs `389–400`
  have no historical rows. The positive evidence remains non-exhaustive and
  cannot authorize a candidate or full-chain envelope.
- No landing, maint, relation, projection, packet, permit, scheduler,
  Redis-control, standardized-data, or database write occurred. Entry remains
  `active` and canonical ingestion remains blocked.

### Shared-page scope-gap classification — 2026-10-01

- A read-only classifier grouped the 70 unresolved variant gaps into 25 raw
  Wiki pages: 7 redirected/shared-page groups and 18 same-page variant groups.
  All 25 pages contain at least one positive debuff on another infobox, but the
  affected variant has no own debuff field. The classifier therefore preserves
  `shared-page-infliction-scope-unverified` and never copies the other variant's
  facts or infers an empty list.
- Artifact: `.local/tmp/buff-npc-infliction-scope-gap-classification-20261001-v1.json`,
  SHA-256
  `sha256:e7c46726eb70a0344a898ae606b9363992879e59900a8c6f41e34ec40e0183e2`.
  It is derived from the verified v3 capture and makes zero network requests or
  database writes. A future source can replace these gaps only with explicit
  variant-scoped page/infobox evidence.

### Wiki API variant-page discovery — 2026-10-01

- Performed a bounded, read-only MediaWiki API discovery for the 70 gap records.
  The artifact `.local/tmp/buff-npc-variant-page-discovery-20261001-v2.json`
  has SHA-256
  `sha256:01dd761f3d6e64e6fd0e0cf8b75fbaf1344534420c5c1dee26fcf2b631eb0640`.
- Two API requests covered 100 unique internal/display titles. The response
  contained 13 redirect pairs and only two exact internal-name page hits
  (`Golem`, `Slimer`); the remaining display-name hits are shared/base pages.
  This establishes API/page availability but no independent variant infliction
  evidence for the unresolved records.
- No capture replacement, landing, maint, relation, projection, packet, permit,
  scheduler, Redis-control, standardized-data, or database write occurred.

### New-ID bounded capture and insert-only diagnostic — 2026-10-01 19:11 CST

- Fresh authenticated read-only preflight
  `.local/tmp/buff-new-id-preflight-20261001T110117Z-v2.json` passed with
  scheduler disabled, live attempts/claims `0/0`, healthy reconciler, Buff
  blocked, and no active Buff writer. SHA-256:
  `sha256:6a7be9cadbcbc70add143330ba2ff4be3954b27ce7f975330cd8d070123a7173`.
- Bounded monitor-visible capture
  `.local/tmp/buff-new-id-page-capture-20261001-v1/` completed 7 targets across
  6 raw revision-bound pages for IDs `389–394` and `396`. The pages are Cattiva
  `1032467`, Foxparks `1032651`, Chillet `1029555`, Clay Bud Staff `1028353`,
  Ruinous Staff `1029515`, and Mana Surge `1026303`. Manifest SHA-256:
  `sha256:59c4d724837cd899738a4a81d28d68a5c8cf9a221acac776fa1a91936132f336`.
- Insert-only diagnostic
  `.local/tmp/buff-new-id-insert-contract-diagnostic-20261001-v2.json` has
  SHA-256
  `sha256:65d6f8082591afff76b66322de05433d3ec855fcb7a17c4fc58a5f2106229a72`.
  All 12 new IDs have complete Iteminfo source-item groups and normalize
  successfully; five use page immunity evidence and seven use the complete
  expanded Npcinfo alternate. Every inflicting-NPC group remains
  `section_missing`, so no empty group is certified and no executable
  insert-only candidate exists.
- No landing, maint, relation, projection, candidate, packet, permit,
  scheduler, Redis-control, standardized-data, or database write occurred.

### New-ID NPC infliction scope audit — 2026-10-01 19:57 CST

- Replayed the retained revision-bound NPC-page capture against only Buff IDs
  `389–400`. Artifact
  `.local/tmp/buff-new-id-infliction-scope-audit-20261001-v1.json` has SHA-256
  `sha256:bf6c7288b9b0605d199dae8539ab4972f7147d34f281fb94734d2cd61c006452`.
- Scope is 511 target pages, 443 unique raw pages, 753 page-backed NPC rows,
  9 explicit exclusions, and 70 unresolved shared-page gaps. The selected
  twelve Buff IDs have zero positive NPC infliction facts and zero selected hits
  in the unresolved gap records.
- The result is intentionally `empty-unproven`: no positive evidence was found,
  but unresolved variants prevent certifying an exhaustive empty group. No
  insert-only candidate, landing, maint, relation, projection, packet, permit,
  scheduler, Redis-control, standardized-data, or database write occurred.

### New-ID database baseline readback — 2026-10-01

- The first Node readback attempt failed before any query because this worktree
  has no installed `mysql2/promise` dependency. The failure is recorded as an
  environment/tooling blocker, not as evidence about database rows.
- A read-only MySQL CLI query then connected to the local MySQL 9.2.0 server on
  `127.0.0.1:13306`. Query batch
  `.local/tmp/buff-new-id-db-readback-20261001.sql` has SHA-256
  `eedfbeb3f880eeede81907dcb640992a0b7ec4aae85fa5f8e091dd36702d5386`; raw
  output `.local/tmp/buff-new-id-db-readback-20261001.tsv` has SHA-256
  `85c58d1015693661d6fefc3415351c58a357e82c99e619f19a7cfc56592b4106`.
- All nine scopes returned zero rows for IDs `389–400` or their bound internal
  names: local and maint Buff tables, relation/projection Buff tables, item and
  NPC secondary relations, relation Buff images, and local source-item rows.
  This confirms absence of a recoverable historical baseline; it does not prove
  any source group is empty and does not authorize an insert-only write.
- Canonical ingestion remains blocked. No landing, maint, relation, projection,
  candidate, packet, permit, scheduler, Redis-control, standardized-data, or
  database write was performed.

### Baseline readback and regression verification — 2026-10-01 23:23 CST

- Fresh focused Buff/NPC/capture/relation/full-chain suite: `281/281` passed,
  `0` failed. This run includes the new monitor-visible capture and verifier
  contracts in addition to the existing parser and partial-plan checks.
- Every modified or newly added `.mjs` module passed `node --check`, and
  `git diff --check` passed after the audit/devlog updates.
- The source disposition is unchanged: 70 shared-page scope gaps, 360
  baseline-preserved inflicting-NPC groups, and the twelve `389–400`
  `empty-unproven` groups still prevent an executable candidate. No runtime
  writer or database mutation was started.

### Fresh runtime preflight — 2026-10-01 23:44 CST

- Authenticated read-only preflight artifact
  `.local/tmp/buff-continuation-preflight-20261001T2324Z.json` has SHA-256
  `90c1752d1af7187b9d0d6023e20756542b4cbcf4f62f7e39c8a297a0532eb821`.
- The observed state at `2026-10-01T15:44:03.124Z` was scheduler disabled,
  live attempts/claims `0/0`, healthy reconciler, Buff readiness `blocked`, and
  zero active Buff writers. H8/epoch and policy hash were unchanged.
- This was a GET-only observation. It did not activate the scheduler, enqueue a
  task, fetch a page, or write Redis, standardized data, or any database.

### Runtime no-loss sample readback — 2026-10-01 23:56 CST

- The revision-bound NPC capture proves `Wall of Flesh (NPC 113) inflicts
  Horrified (Buff 37)` at Wiki revision `1032375`, while the current runtime
  has no corresponding row. Read-only SQL query/output artifacts are
  `.local/tmp/buff-runtime-readback-20261001.sql`
  (`sha256:da8bdb00d831ccb411c025099f95e6d39db355c1d38fccbfcbf145b7c4cb3756`)
  and `.local/tmp/buff-runtime-readback-20261001.tsv`
  (`sha256:a375d0fa89e426909990276cbf8b6e8a3a97fb13f987ea55a6556d3129979e97`).
- Relation/local tables contain `113 -> 38 (TheTongue, inflicts)` but not
  `113 -> 37 (Horrified, inflicts)`. Relation and projection Buff `37` both
  carry empty inflicting-NPC JSON. Authenticated read-only admin and public API
  responses likewise return `inflictingNpcCount: 0` and empty arrays. The API
  still exposes an older Wall of Flesh source snapshot with
  `inflictingNpcs=section_missing`; it is stale evidence, not a current source.
- Full API/DB readback artifact `.local/tmp/buff-runtime-readback-20261001.json`
  has SHA-256
  `b362f4324bc9905775c88beebafe76a7b279093900878461620651f3ebcd697d`.
  This confirms the relation-loss symptom end to end. No repair SQL, landing,
  maint, relation, projection, or other write was executed.

### Positive infliction additive contract — 2026-10-02

- Added RED/GREEN coverage for partial plans that preserve the active
  `inflictingNpcs` baseline, append revision-bound positive NPC-page facts,
  deduplicate an existing identity, and remain `executable=false`.
- Threaded the additive disposition through partial normalization, baseline
  application, raw/landing fact binding, secondary relation validation, and
  projection propagation. Complete replacement groups remain replacement-only.
- Hardened the complete NPC-page verifier so forward and reverse facts must
  match field-for-field, including duration and page/revision provenance.
- Read-only replay `.local/tmp/buff-partial-contract-replay-20261002-v17.json`
  has SHA-256
  `sha256:20e8c4f9265618dae65a4df8adf1b63ab87fd5345a67a80138e94d996c861da0`.
  It reports `400/400` strict normalizer admission, 388 baseline-bound plans,
  zero plan errors, 360 preserved inflicting groups, six additive groups with
  six positive facts, and `112/112` verified NPC facts retained. Buff `37`
  now carries `WallofFlesh (113) -> Horrified (37)` from the `Wall of Flesh`
  page at revision `1032375`.
- The complete Buff/NPC/capture/relation regression passed `363/363`, all
  touched modules passed `node --check`, and `git diff --check` passed.
- The 70 shared-page scope gaps, 360 baseline-preserved groups, and missing
  baselines for IDs `389–400` still block canonical ingestion. No landing,
  maint, relation, projection, packet, permit, scheduler, Redis-control,
  standardized-data, or database write occurred.

### Review repair: identity, reverse coverage, and raw provenance — 2026-10-02

The remaining review findings were repaired in the existing dirty worktree.
Partial fact merging now links stable ID and internal name and fails closed on
either collision direction; exact identities remain deduplicated. Every
revision-bound additive `inflictingNpcs` fact must have one active candidate
`npc_buff_relations` row with the same Buff/NPC identity and `inflicts` direction.
Inactive, missing, or ambiguous reverse rows are rejected before candidate
delta construction.

Complete NPC-page capture provenance is now carried from the raw manifest:
`source.factSources` contains every resolved page descriptor with its raw
SHA-256, each forward fact carries `sourceRawSha256`, and the complete forward
and reverse maps require exact page, revision, timestamp, and raw-hash binding.
Partial additive wrappers reject malformed or missing wrapper and declared
provenance descriptors instead of accepting an unbound per-fact tuple.

The full Buff/NPC/parser/relation command passed `367/367`; all modified `.mjs`
files passed `node --check`, and `git diff --check` passed. The fresh read-only
verifier replay `.local/tmp/buff-npc-infliction-verified-20261002-v4.json` has
SHA-256 `sha256:f8a8b9e7f721b9b976c8c335bd9cbc654a7ea25b65b91bb325b3fe7d96a61923`
and contains 112 positive facts, 70 unresolved gaps, 9 exclusions, and raw-hash
descriptors for all resolved capture pages. The fresh read-only replay
`.local/tmp/buff-partial-contract-replay-20261002-v19.json` has SHA-256
`sha256:042af9250675b17073bd5a77c7373370dcd93edd16b8be01bec9ba9d5f17debb` and
reports `400/400` normalizer admission, 388 baseline-bound plans, zero plan
errors, 360 preserved inflicting groups, six additive groups/six facts, and
`112/112` retained NPC facts.

The 70 unresolved shared-page gaps, nine exclusions, 360 preserved baselines,
and missing historical rows for Buff IDs `389–400` still block canonical
ingestion. No landing, maint, relation, projection, packet, permit, scheduler,
Redis-control, standardized-data, or database write was performed.

### Unkeyed top-level NPC infobox continuation — 2026-10-03

The retained NPC-page capture exposed one additional safe identity shape: a
page's primary infobox can omit `auto`, while a later hidden infobox repeats the
primary stable ID. The resolver now accepts this only for exactly one unkeyed
infobox whose normalized name matches the requested page/entity. Ambiguous
unkeyed blocks remain rejected, and no fact is copied from another stable NPC
ID. The same resolver is used by single-page extraction and complete-capture
verification.

Read-only evidence:

- `.local/tmp/buff-npc-infliction-verified-20261003-v7.json`, SHA-256
  `sha256:813ce0fb049bf5c1cbbd5d412c1c7e951cb87ae211588278ac4c9af3c1ebadd3`:
  114 positive facts, 68 unresolved shared-page gaps, 9 explicit exclusions.
  Newly bound facts are `Golem (245) -> On Fire! (24)` and
  `MoonLordHead (396) -> Moon Bite (145)` with page/revision/raw-hash
  provenance.
- `.local/tmp/buff-partial-contract-replay-20261003-v20.json`, SHA-256
  `sha256:bb515aca5c2cabb07d453f7a876942855d2128ab874e62081cccba78d4a7698f`:
  400/400 normalizer admission, 388 baseline-bound plans, zero plan errors,
  360 preserved inflicting groups, six additive groups/six additive facts, and
  114/114 verified facts retained. Golem and Moon Lord facts already exist in
  the active baseline and are deduplicated.
- `.local/tmp/buff-wiki-api-schema-discovery-20261003-v1.json`, SHA-256
  `sha256:29cbddad67e589fa44d5a8f98ce98edffb7f9d569839a48719289e82f1e625dc`:
  read-only Cargo schema discovery. The `NPCs` table exposes identity,
  statistics, and immunity fields only; no `debuff`/`inflicts` field exists and
  no `NPC infobox` Cargo table is registered.
- `.local/tmp/buff-npc-infliction-scope-gap-classification-20261003-v2.json`,
  SHA-256
  `sha256:0c5cb51838426d626e9312ee352fb571c21983212a43ab5cf2b3108cb104d9b5`:
  the refreshed grouping records 68 gaps across 25 raw pages; every group has
  a positive owner for another infobox and remains unresolved for the requested
  variant.

The API is reachable and returns revision-bound page source, but it does not
provide a complete structured relation feed for shared variants. The remaining
68 variant-owned scope gaps and missing baselines for Buff IDs `389–400`
continue to block canonical ingestion. No landing, maint, relation,
projection, packet, permit, scheduler, Redis-control, standardized-data, or
database write occurred. Focused page/verifier tests pass `24/24`; the full
Buff/NPC/parser/relation set passes `370/370` in this continuation run.

### Insource variant discovery continuation — 2026-10-03

The previous title lookup only established that internal names are not page
titles. A corrected read-only discovery queried each of the 68 gap IDs with
`insource:"npc infobox" insource:"auto=<id>"`, fetched the resulting page
revisions, and parsed the revision-bound NPC infoboxes with the maintained
parser. Artifact `.local/tmp/buff-npc-variant-insource-discovery-20261003-v1.json`
has SHA-256
`sha256:229dc8c6c639d2f13765d45ab7b348d3dcc3ce8472ea29703c529bc9cf7cdfd7`.

All `68/68` IDs had search hits and revision-bound matching infoboxes across 28
unique pages, but `0/68` had a debuff row owned by the requested stable `auto`
identity. The hits are shared/base or language pages whose other infoboxes may
carry positive facts for different NPC IDs; the API exposes source and revision
identity but no independent structured infliction relation for these variants.
This result does not certify empty inflicting-NPC groups. The 68 gaps remain
`unknown`, and the active baseline must be preserved. Durable evidence is in
`docs/audits/2026-10-03-buff-npc-variant-insource-discovery.md`.

### Structured source probe — 2026-10-03

The follow-up revision-bound probe
`.local/tmp/buff-npc-structured-source-probe-20261003-v1.json` has SHA-256
`sha256:81f4ea9e514ccbaaf6839d2fcc8d3fde189ffbc7185e9ee64cb6fa9dac8e04e9`.
`NPC_ID` is a legacy redirect; `NPCs` is an identity/statistics table without a
stable NPC-to-`debuff`/`inflicts` relation; `Module:Npcinfo/data` and
`Module:Npcinfo/datagen` are immunity-only semantic sources; and the requested
`Template:NPC infobox` page is absent from the API. Together with the Cargo
schema result, this closes the cheap structured API discovery branch without
changing the disposition: the 68 gaps remain `unknown`, not empty.

The temporary backend/Nuxt sessions used by the preceding preflight were
stopped before discovery; ports `18102`, `18104`, `5190`, and `3017` are clear.
Read-only runtime checks returned Redis DB14 `PONG`, 230 historical V2 attempt
records all terminal (`145 completed`, `81 failed`, `4 timed_out`) with no lease
keys, and MySQL `run_attempt/reservation/active-fence = 0/0/0`. The focused
Buff/NPC/parser/relation regression passed `200/200`; all touched modules passed
`node --check` and `git diff --check` passed. No landing, maint, relation,
projection, packet, permit, scheduler, Redis-control, standardized-data, or
database write occurred.

### Shared-page variant scope contract — 2026-10-03

Task 14 adds a pure contract builder and regression suite for the remaining 68
shared-page variant gaps. The contract consumes the revision-bound verifier,
scope classification, and partial replay artifacts and emits one status per
stable NPC ID. A positive status requires the requested `npcId` and
`internalName` plus page/revision/raw-hash provenance; a complete-empty status
requires an independently supplied exhaustive negative source. Shared-page
facts owned by another infobox identity are never copied, and unresolved groups
remain baseline-preserved `unknown`.

The generated artifact `.local/tmp/buff-npc-variant-scope-contract-20261003-v1.json`
has SHA-256
`sha256:027aaa415cc635143f864f7eda998e1e8b5499672d68e96bb8f1be9d21118e0a`.
All `68/68` groups are `unknown`; there are zero variant-owned positive or
complete-empty groups. Replay checks retain `114/114` facts, preserve 360
inflicting groups, and keep Buff IDs `389–400` at `missing-baseline`. The
contract is `executable=false`, `applyAllowed=false`, and
`databaseWrites=false`. Durable audit:
`docs/audits/2026-10-03-buff-npc-variant-scope-contract.md`.

Validation for the new contract and the existing Buff/NPC/parser/relation/full-
chain/manifest regression is `311/311`; the new modules pass Node syntax checks
and `git diff --check`. No Wiki request, landing, maint, relation, projection,
packet, permit, scheduler, Redis-control, standardized-data, or database write
was executed. Canonical ingestion remains blocked until variant-owned source
scope and historical baselines are available.

### Governed additive relation proposal continuation — 2026-10-03

The new additive relation lane was resumed from the retained handoff. Its
first real read-only prepare failed on Buff `20` because historical
`inflicting_npcs_json` rows carry `internalName` without a numeric NPC ID.
The stable-identity helper now treats a missing legacy ID as compatible with a
revision-bound numeric ID when the internal name matches, while two explicit
different numeric IDs still fail closed. A regression was added for this
legacy shape; the focused additive suite passes `9/9`.

The corrected prepare command was:

```text
node pipelines/relation/run-buff-additive-relation-apply.mjs \
  --operation-id=canonical-buff-additive-relation-apply \
  --result-label=20261003-wall-of-flesh --prepare=true
```

It produced the private, proposal-only artifact
`reports/authorization/canonical/canonical-buff-additive-relation-apply.20261003-wall-of-flesh.proposal.json`:

- proposal SHA-256: `sha256:bf72e9aade7057e273a3ff0f4c02b6df317898324d3ae59408aa9cdb042124fd`
- source artifact SHA-256: `sha256:813ce0fb049bf5c1cbbd5d412c1c7e951cb87ae211588278ac4c9af3c1ebadd3`
- scope SHA-256: `sha256:3d12213ea8ea332d8768d77fb899f323e016c1580dab68ee2544d8b1c644af81`
- 114 revision-bound positive facts across 30 existing Buff baselines
- 19 `relation_buffs` inflicting/evidence updates, 20 missing reverse
  `inflicts` inserts, and 30 `projection_buffs` inflicting/evidence updates
- Buff IDs `389–400` absent; no forbidden immunity/source-item mutation
- `Wall of Flesh (113) -> Horrified (37)` present with exactly one reverse
  insert

The complete focused verification passed `210/210` (`9 + 22 + 94 + 9 + 2 +
74`), and `git diff --check` passed. The proposal is explicitly
`executable=false`, `applyAllowed=false`, and `databaseWrites=false`. No packet,
permit, scheduler, Redis-control, landing, maint, relation, projection,
standardized-data, or database write was executed. The remaining 68 shared-page
scope gaps and missing Buff baselines `389–400` continue to block canonical
ingestion; this additive lane is only a reviewed read-only repair proposal.

### NPC variant immunity identity audit — 2026-10-03

The Npcinfo evidence path was checked for variants that share a display name.
The revision-bound `Module:Npcinfo/data` source is revision `1022313`
(`2026-08-20T18:13:10Z`) with raw SHA-256
`sha256:0c3a474f7b0f0034bc62183b2a0ae1b00c13f47527f109f24e8e8a536fec2a3a`.
Its identity contract retains numeric NPC ID and `internalName`; it does not
deduplicate by display name.

Representative source rows confirm the behavior. `LavaSlime (59)` has
`buffImmune=20,24,323,30,375` (Poisoned, On Fire!, Hellfire, Bleeding,
Hemorrhage), while `JungleSlime (-10)` has `30,375,20` and no On Fire!/Hellfire.
`SpikedJungleSlime (204)`, `Slimer (121)`, and `Slimer2 (-2)` remain separate
identities even when their immunity lists happen to match. The audit is stored
at `docs/audits/2026-10-03-buff-npc-variant-immunity.md`.

A regression now feeds two same-display-name rows with different stable IDs and
asserts that both immunity sets survive without merging. The focused Npcinfo
suite passes `9/9`. `lavaImmune` remains a separate property and is never
treated as Buff immunity. No relation/projection/runtime write was executed;
canonical ingestion remains blocked by the existing source and baseline gates.

### Task 15 additive apply authorization and proposal bundle repair — 2026-10-03

Task 15 was added to the active plan to make the reviewed positive-relation
proposal executable only through a distinct canonical owner decision. The
proposal remains deliberately read-only (`executable=false`,
`applyAllowed=false`, `databaseWrites=false`); the registered execution
manifest is the only source that can authorize a database write.

The runner now exposes a pure fail-closed apply assertion and calls it after
the authorized data bundle/proposal is loaded and before the MySQL connection is
opened. It requires an `AUTHORIZED` packet, the exact
`formal_buff_additive_relation_apply` manifest with `databaseWrites=true` and
`networkAccess=false`, exact relation ownership keys and artifact paths, the
proposal bundle hash, and the three relation-table target scope. Existing
permit consumption, loopback fingerprint, fence lock, recovery journal, locked
before-set and after-set checks remain in the transaction path. See git for
code-level diff details.

TDD evidence: the new runner authorization suite first failed because the
exports/contract were absent, then passed `4/4`. The authorization resolver
also had a real defect: additive manifests were falling through to an empty
data bundle. A RED/GREEN regression now proves the private proposal is included
in `dataBundleEntries`; the combined additive/authorization/manifest suite is
`103/103`; the broad Buff/NPC/parser/relation/auth suite passes `444/444`
when the existing backfill test that cannot load `mysql2/promise` is excluded;
`node --check` plus `git diff --check` pass.

Fresh read-only preparation used result label
`20261003-task15-authorization-v3`:

- proposal:
  `reports/authorization/canonical/canonical-buff-additive-relation-apply.20261003-task15-authorization-v3.proposal.json`
  SHA-256 `sha256:bf72e9aade7057e273a3ff0f4c02b6df317898324d3ae59408aa9cdb042124fd`;
- execution manifest:
  `reports/authorization/canonical/canonical-buff-additive-relation-apply.20261003-task15-authorization-v3.execution-manifest.json`;
- authorization request:
  `reports/authorization/canonical/canonical-buff-additive-relation-apply.20261003-task15-authorization-v3.request.json`
  SHA-256 `sha256:bbfa453236240f040d1d542dea8d7e4bc38a94c46159ac5612e24553f27d18c5`;
- request data bundle has exactly one private proposal entry with the matching
  proposal hash; manifest contract verification passed.

The fresh runtime read-only preflight returned server UUID
`b4ae6728-4f72-11f1-bcc9-00155d37eadf`, MySQL port `13306`, active owner
`admin`, zero live attempts, zero reservations, and zero active write fences.
No owner packet, dispatch permit, fence acquisition, scheduler action, Redis
mutation, landing, maint, relation, projection, or database write was
performed. The apply step is therefore still blocked pending a distinct owner
authorization packet/permit and an active runtime fence. The 68 unknown
shared-page variants and missing Buff baselines `389–400` remain blocked and
are not changed by this additive lane.

Final read-only relation verification on MySQL server
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306` found one active forward Buff `37`
row and one active projection Buff `37` row, but neither contains
`WallofFlesh (113)`; the reverse query for `113 -> 37, relation_type=inflicts`
returned zero rows. This confirms that no ungoverned or accidental write was
performed during Task 15.

### Task 15 continuation preflight and authorization refresh — 2026-10-04

The v3 request expired at `2026-10-04T16:00:00Z`. A read-only MySQL policy
capture found that the global policy set had changed since the old capture:
`shimmer` is now v3/ACTIVE, so its current policy rows were rebound before a
new request was created. The fresh capture is stored under
`reports/authorization/canonical/automation-buffs-l2-reauthorization.retry-25.task15.*`.

The v5 additive proposal and manifest were rebuilt from the unchanged
revision-bound evidence. The proposal remains `114` facts and `69` changed
rows with SHA-256
`sha256:bf72e9aade7057e273a3ff0f4c02b6df317898324d3ae59408aa9cdb042124fd`.
Request `20261004-task15-authorization-v5` is `AWAITING_OWNER`, expires at
`2026-10-04T16:50:54.229Z`, has request hash
`sha256:a44af8f1ffcc67857a169c4eb30569d991992c2265f37ebad98cd08ef557596d`,
and binds one private proposal entry plus the current policy hash
`sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`.

The direct runtime readback remains no-write: server UUID/port is
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, Buff policy is v2/ACTIVE, live
attempts and reservations are `0/0`, active write fences are `0`, Redis V2
epoch is unchanged, all scanned attempts are terminal, and reconciler failure
and overdue counts are zero. Running the v5 apply command without an authorized
packet failed closed on `TERRAPEDIA_AUTHORIZED_PACKET_PATH` before opening
MySQL. The authorization, manifest, additive proposal, and runner suites now
pass `126/126`; the broader Buff/NPC/parser/landing/import/relation/auth suite
passes `494/494` with the dependency-missing backfill test excluded. Node
syntax checks and `git diff --check` pass. No owner packet,
single-use permit, fence acquisition, scheduler action, or database write was
performed. The 68 unknown NPC variants and missing Buff baselines `389–400`
remain blocked.

### Continuation read-only recovery check — 2026-10-04 06:39 CST

- Rechecked the actual worktree and authorization directory without changing
  the dirty branch. The v5 request remains `AWAITING_OWNER`; it has no
  `decisionIdentity` or `authorizationReference`, and no matching packet,
  single-use permit, or active fence exists.
- MySQL read-only verification against server UUID
  `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306` found relation/projection Buff
  `37` rows with `inflicting_npcs_json=[]` and zero reverse
  `npc_source_id=113, buff_source_id=37, relation_type=inflicts` rows. This
  confirms the known no-loss symptom remains unfixed and no ungoverned write
  occurred.
- The backend on `18102` was not listening during this check, so the prior
  authenticated preflight cannot be treated as fresh for this continuation.
  No preflight, packet, permit, fence acquisition, apply, scheduler action,
  landing, maint, projection, Redis-control, or database write was performed.
- Next safe action: restore the authenticated backend and capture a new
  read-only preflight; then wait for a distinct owner packet and single-use
  dispatch permit before considering the additive executor. Keep full Buff
  ingestion blocked on the 68 shared-page variant gaps and missing baselines
  `389–400`.
- Fresh source validation after this recovery check passed authorization,
  manifest, additive runner tests `130/130` and Buff/NPC/parser/source/relation/
  full-chain tests `206/206`; every changed `.mjs` passed `node --check`, and
  `git diff --check` passed. These results do not create execution authority.

### Additive runner fail-closed recheck — 2026-10-04 06:54 CST

The registered additive runner was invoked with the current result label and
`--apply=true` while `TERRAPEDIA_AUTHORIZED_PACKET_PATH` was unset. It failed
before opening MySQL with `TERRAPEDIA_AUTHORIZED_PACKET_PATH is required`.
No packet, permit, fence, transaction, or database mutation was attempted.
The v5 request remains `AWAITING_OWNER`; canonical Buff ingestion and the
additive repair remain blocked until the distinct owner authorization context
and fresh authenticated runtime preflight exist.

### Owner authorization request — 2026-10-04 07:12 CST

The user explicitly requested that the agent generate authorization and start
the apply. The existing v5 request is still `AWAITING_OWNER` and has no owner
`actor`, `reason`, `authorizationReference`, or unique `decisionIdentity`.
The agent must not impersonate the database owner or mint a signed packet and
dispatch permit from a caller instruction. No packet, permit, fence, or write
was created; the apply lane remains fail-closed until an independently issued
owner decision is bound to the exact proposal, manifest, server, and policy
hashes.

### Authenticated backend recovery and DB14 runtime check — 2026-10-04 08:02 CST

The Buff worktree backend is running on `127.0.0.1:18104` with the explicit
runtime binding required by the handoff: MySQL `127.0.0.1:13306`, Redis
`127.0.0.1:6380` logical DB `14`, `legacy` profile, Flyway disabled, and
automation read-only. ADMIN login returned HTTP 200.

The worktree initially lacked the ignored durable V2 marker. An authenticated
cutover request exposed a recovery-order bug: the service generated a fresh
epoch before reading the already completed Redis cutover record. A temporary
wrong-DB0 start was then isolated through the governed
`recover-state-store-reset` endpoint; no business database tables were touched.
The backend was stopped and restarted with explicit DB14 settings. The fixed
cutover path now binds the completed record epoch before restoring a stale
marker, and never invents a missing mutation reservation or confirmation.

TDD regression coverage now passes `11/11` for cutover recovery and `24/24`
for the router/cutover pair. The additional router regression maps Redis first
mutation evidence without a durable reservation to `STATE_STORE_RESET`,
rather than claiming an unproven reservation. `git diff --check` passes.

The authenticated DB14 automation preflight is intentionally still blocked with
HTTP `409 STATE_STORE_RESET`: Redis retains first-live-mutation evidence while
the recovered marker has no matching reservation. This is fail-closed and must
be resolved only by the formal state-store recovery process. Read-only SQL
verification still shows `relation_buffs.source_id=37` and
`projection_buffs.source_id=37` with empty inflicting-NPC JSON and zero active
reverse `npc_source_id=113 -> buff_source_id=37` rows. The v5 owner request is
unchanged at `AWAITING_OWNER`; no packet, permit, fence, scheduler action,
landing, maint, relation, projection, or business database write was executed.

### ADMIN-authenticated backend check — 2026-10-04 08:11 CST

The existing backend process remains bound to `127.0.0.1:18104` with MySQL
`127.0.0.1:13306`, Redis `127.0.0.1:6380` logical DB `14`, the `legacy`
profile, Flyway disabled, and automation read-only. `GET /api/actuator/health`
returned `200 {"status":"UP"}`. `POST /api/auth/login` with the configured
local ADMIN account returned HTTP `200`; the resulting bearer token reached the
read-only crawler monitor endpoint. The fresh V2 automation preflight returned
HTTP `409` with `reasonCode=STATE_STORE_RESET`, so ADMIN authentication does
not grant scheduler or ingestion authority. No recovery mutation, packet,
permit, fence, scheduler action, or database write was performed.

### Owner packet preparation — 2026-10-04

The existing v5 authorization request is available for owner review at
`reports/authorization/canonical/canonical-buff-additive-relation-apply.20261004-task15-authorization-v5.request.json`.
It remains `AWAITING_OWNER` and is still within its expiry window. The owner
must provide `actor`, `reason`, `authorizationReference`, and a unique unused
`decisionIdentity`; these fields are intentionally not inferred from ADMIN
login. After those values are supplied, the packet can be generated against
the unchanged request hash. This does not clear the separate V2
`STATE_STORE_RESET` preflight blocker.

The user then supplied `actor=admin` and explicitly authorized completion of
the remaining owner fields. The owner input is private under
`.local/tmp/buff-additive-relation-owner-input-20261004.json`. The formal
packet was generated at
`reports/authorization/canonical/canonical-buff-additive-relation-apply.20261004-task15-authorization-v5.packet.json` with packet hash
`sha256:0869df33c12be9505eb1ab45b1eca6050391d9d25e2b84755b19b28853fdba00`
and decision identity `buff-additive-relation-20261004-admin-01`. Packet hash,
request hash, current technical identity, and owner `admin/ACTIVE` readback
were verified. No dispatch permit, fence, result, journal, or database write
was created; execution remains blocked by the V2 `STATE_STORE_RESET` gate and
the missing single-use dispatch permit.

### Task 15 bounded additive execution completed — 2026-10-04 10:08 CST

The user supplied `actor=admin` and authorized the remaining owner fields for
the manifest-bound additive relation lane. Distinct v10, v11, and v12 decision
identities were used; consumed identities and their permits remain in
`reports/authorization/canonical/used-decisions.json` and were never replayed.

The v10 and v11 attempts failed closed during the transaction after-set
comparison and rolled back without business writes. The failures exposed two
representation gaps in the exact snapshot contract: MySQL-generated `id` and
timestamps on reverse/update rows, followed by DECIMAL `confidence` values
being returned as strings. The executor now canonicalizes only those known
database-generated representations and has regression coverage for them.

The v12 transaction passed the locked before-set and after-set checks and
committed the bounded proposal. SQL commit completed before the recovery
journal rejected the valid `prepared -> committed` transition. A read-only
post-commit verification matched the proposal after hash exactly, confirmed
all 69 declared changes, and showed no active fence. The Buff journal state
machine now permits a successful direct `PREPARED -> COMMITTED` transition;
the existing v12 journal was atomically advanced to `COMMITTED` and its result
artifact was written with `status=COMPLETED` without replaying SQL.

v12 artifacts:

- result:
  `reports/authorization/canonical/canonical-buff-additive-relation-apply.20261004-task15-authorization-v12.result.json`
- journal:
  `reports/authorization/canonical/canonical-buff-additive-relation-apply.20261004-task15-authorization-v12.journal.json`
- packet and manifest:
  `reports/authorization/canonical/canonical-buff-additive-relation-apply.20261004-task15-authorization-v12.packet.json` and
  `reports/authorization/canonical/canonical-buff-additive-relation-apply.20261004-task15-authorization-v12.execution-manifest.json`

Fresh MySQL readback on server UUID
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306` confirms:

- `terria_v1_relation.relation_buffs.source_id=37` contains one inflicting
  NPC, `WallofFlesh (113)`;
- `terria_v1_relation.projection_buffs.source_id=37` contains the same fact;
- `terria_v1_relation.npc_buff_relations` contains
  `npc_source_id=113, buff_source_id=37, relation_type=inflicts` with the
  revision-bound Wall of Flesh source;
- immutable `immune_npcs_json` and `source_items_json` values for Buff 37
  match their pre-execution empty baseline; and
- active write fences are `0`.

The backend public endpoint `/api/public/buffs/37` returned
`inflictingNpcCount=1` and the Wall of Flesh relation. Authenticated crawler
V2 preflight now returns HTTP `200` with the recovered epoch; this lane did not call the
scheduler, Redis control plane, landing, maint, general Buff ingestion, or
any variant/new-ID replacement path. The 68 shared-page variant gaps and
missing historical Buff baselines `389–400` remain blocked and preserved.

Fresh validation after the execution passed `117/117` relation/recovery/
full-chain/sync tests and `141/141` authorization/manifest/runner tests;
changed modules pass `node --check` and `git diff --check`.

### Recovery and post-apply continuation check — 2026-10-04 10:26 CST

The worktree backend remains available at `127.0.0.1:18104` with explicit
MySQL `127.0.0.1:13306` and Redis DB14 (`127.0.0.1:6380`). Read-only health
returned HTTP 200, ADMIN login returned HTTP 200, and the authenticated V2
automation preflight now returns HTTP 200. The recovered state is epoch
`epoch-29a8486b-b3df-45a7-a496-28286de5a91b`; scheduler control is disabled,
live attempts/claims are `0/0`, and the reconciler is healthy with zero overdue
or failed work. The previous `STATE_STORE_RESET` note in this entry and
`docs/devlog/current.md` was stale and has been corrected.

Fresh read-only MySQL verification confirms the v12 additive result: relation
and projection Buff `37` each contain `WallofFlesh (113)` as an `inflicts`
fact, `npc_buff_relations` contains the reverse `113 -> 37` row, and the public
`/api/public/buffs/37` response reports `inflictingNpcCount: 1`. No new
mutation was performed during this check.

Validation after recovery: the focused Java recovery suite
`CrawlerQueueEngineRouterTest,CrawlerQueueV2CutoverServiceTest,RedisCrawlerQueueV2RepositoryTest`
passed; the Buff/NPC/source/capture/relation/full-chain/additive suite passed
`240/240`; all touched modules passed `node --check`; and `git diff --check`
passed. Canonical full-domain ingestion remains blocked: 68 shared-page NPC
variant scopes are unresolved, Buff IDs `389–400` have no historical baseline,
and unknown or incomplete fact groups must continue preserving their active
baseline. No scheduler action, new capture, landing, maint, relation,
projection, packet, permit, or database write was performed in this checkpoint.

### Session handoff audit — 2026-10-05 07:13 CST

Observed worktree facts: `/home/lolben/TerraPedia/.worktrees/automation-domain-buff`
is on branch `feat/automation-domain-buff` at HEAD
`0a23fab31914aa0a6d79779c758243d74f342f74`. The branch has no upstream
tracking ref. There are no staged changes; the existing dirty scope contains
Buff source/parser/normalizer/relation/authorization changes, crawler V2
recovery changes, tests, audits, devlog updates, and untracked authorization
artifacts. No reset, checkout-discard, clean, stash, commit, push, or worktree
removal was performed.

Recorded completion remains: Task 15 v12 is `COMPLETED` with a `COMMITTED`
journal, and the post-apply readback shows `Wall of Flesh (113) -> Horrified
(37)` in relation, projection, reverse relation, and public API. The V2 state
store marker is durable at epoch
`epoch-29a8486b-b3df-45a7-a496-28286de5a91b` with null
`mutationReservationAt` and `firstLiveMutationAt`. The historical authenticated
preflight artifact records scheduler disabled, `0/0` live attempts/claims, and
a healthy reconciler; it is not fresh runtime evidence for this handoff.

Current runtime discrepancy: at handoff time only MySQL `127.0.0.1:13306` was
listening. Backend `127.0.0.1:18104` and Redis `127.0.0.1:6380` were not
listening, and no crawler, capture, finalizer, scheduler, or Buff writer
process was observed. This is recorded as stale runtime state, not as a data
failure. The next session must start the governed stack, run a fresh
authenticated read-only preflight, and recheck the V2 marker/Redis epoch
before any bounded capture or execution.

Unknowns and blockers remain unchanged: all automatic domains report blocked
against the current source-readiness gate; 68 shared-page NPC variant scopes
remain unknown; Buff IDs `389–400` lack historical baselines; and incomplete
fact groups must preserve their active baseline. Do not rerun consumed v12
authorization, mint a new packet from stale evidence, or perform full-domain
landing/maint/relation/projection ingestion.

Handoff validation: `mvn -q
-Dtest=CrawlerQueueEngineRouterTest,CrawlerQueueV2CutoverServiceTest,RedisCrawlerQueueV2RepositoryTest
test` exited 0; the focused Buff/NPC/source/capture/relation/full-chain/additive
suite passed `240/240`; touched modules passed `node --check`; and `git diff
--check` passed. The exact governing plan is
`docs/superpowers/plans/2026-09-30-buff-relation-no-loss.md`; the next agent
must read it together with `docs/devlog/current.md` and this entry before
acting.

### Fresh governed stack and authenticated preflight — 2026-10-05 07:30 CST

- The first governed startup allocated this worktree's normal slot 16, so the
  backend read Redis DB16 while the canonical V2 state is in shared Redis DB14.
  The authenticated GET failed closed with HTTP `409 STATE_STORE_RESET`; no
  reset/recovery endpoint, Redis mutation, scheduler action, or business-table
  write was called. The stack was stopped through `stop-local-stack.sh`.
- The stack was restarted through `start-local-stack.sh` with a temporary
  runtime slot binding that preserves the handoff's explicit backend `18104` /
  Redis DB14 contract. Startup checks passed for backend `18104`, front `5190`,
  admin `3017`, Redis `6380`, MinIO `19000`, MySQL `13306`, Maven compile, and
  admin typecheck. The temporary slot registry is outside the repository and
  no source or authorization artifact was changed by it.
- Fresh ADMIN-authenticated read-only GET evidence is captured at
  `.local/tmp/buff-fresh-preflight-20261005T072824Z.json` with HTTP `200`, V2
  epoch `epoch-29a8486b-b3df-45a7-a496-28286de5a91b`, scheduler disabled, zero
  live attempts and sweep claims, and a healthy reconciler. The bearer token
  was not persisted.
- The canonical preflight validator was then run against the same snapshot and
  rejected it before writing `retry-46.preflight.json` because all eight
  automatic domains are `blocked`; each backend panel points to stale
  `reports/domain/*/source-readiness-2026-09-19.json`. No crawler, capture,
  packet, permit, scheduler, Redis-control, landing, maint, relation,
  projection, or database write was performed. The next action is to obtain
  fresh eligible source-readiness evidence under the existing gates; do not
  synthesize eligibility or reuse the failed preflight.

### Read-only source-readiness reconciliation and retry-46 preflight — 2026-10-05 07:46 CST

The preceding 07:30 checkpoint was stale by the time this continuation
resumed. The eight fresh source-readiness artifacts under
`reports/domain/*/source-readiness-2026-10-05.json` were present and each
reported `status=pass`, `writesDatabase=false`, with generatedAt
`2026-10-04T23:42:43Z`. Their hashes are the source hashes bound by the
authenticated scheduler preflight.

The existing retry-46 preflight
`reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-46.preflight.json`
was re-read and its embedded hash recomputed successfully as
`sha256:72b7973aabb214a3c5f1471c017905ef6f2a5ed3320c3fad64898821f3c55fe5`.
It is `0600`, records the recovered DB14 epoch
`epoch-29a8486b-b3df-45a7-a496-28286de5a91b`, disabled `changed-only` control,
zero live attempts and sweep claims, a healthy reconciler, and current policy
hash `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`.
All eight registered domains are `eligible`. This is read-only evidence only;
the scheduler remains disabled and no crawler, packet, permit, scheduler,
Redis-control, landing, maint, relation, projection, or database write was
performed.

Next safe action: build the scheduler activation proposal from retry-46 and
verify its manifest-derived code bundle and policy binding. A proposal or a
new `AWAITING_OWNER` request cannot authorize scheduler activation or Buff
full-domain ingestion; no packet, permit, or decision may be minted or
consumed without an independent owner decision.

### Scheduler proposal and owner-request artifacts — 2026-10-05 07:50 CST

The retry-46 scheduler activation proposal was built from the fresh preflight
and the exact approved T1 report at
`reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-46.proposal.json`.
Its self-hash is
`sha256:feb627473b02659d1866627546b62fc79b1be379ab5daffc147f40924c6349ab`.
Independent readback confirmed `proposalOnly=true`, `enabled=false`, all
no-write flags, the retry-46 preflight hash, T1 hash
`sha256:bb3493ea5fb09da518f1d8a6b2db8712a86cf6a9784c17b5241288be5ed5a8d6`,
all 114 operation-manifest code-bundle paths and byte hashes, the current
10-row policy binding, and the eight eligible domains. The proposal file is
private (`0600`).

A new owner review request was then emitted at
`reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-46.request.json`.
It is `AWAITING_OWNER`, private (`0600`), self-hash verified as
`sha256:e3dcdaa82d63ea88fba6cc4d3fcd206452e87e68f17704bada2a27b2a6361fad`,
and binds proposal file hash
`sha256:01b82f96a01ff8edc0c2efc690b408889969b5acfcbda14127b3d1b9d1b05d0e`
and proposal hash
`sha256:feb627473b02659d1866627546b62fc79b1be379ab5daffc147f40924c6349ab`.
The request expires at `2026-10-05T23:49:08.784Z`; `actor`, `reason`,
`authorizationReference`, and `decisionIdentity` remain null. No owner packet,
single-use permit, policy decision, scheduler control mutation, Redis-control
write, crawler execution, landing, maint, relation, projection, or database
write was performed. The request does not authorize Buff full-domain
ingestion, which remains blocked by the 68 shared-page variant gaps and
missing historical Buff baselines `389–400`.

Next action is independent owner review/decision for scheduler activation. Do
not mint or consume a packet or permit, and do not enable the scheduler, from
this request alone.

### Variant-owned complete-empty evidence — 2026-10-05 08:15 CST

The bounded follow-up for the 68 shared-page NPC variant gaps is implemented
and replayed entirely offline. Root owns the serial writes; no crawler, packet,
permit, scheduler, Redis-control, landing, maint, relation, projection, or
database operation was started.

- Added `pipelines/fetch/buff-npc-variant-empty-scope-evidence.mjs` and its
  focused tests. The builder reuses the maintained NPC parser, binds target
  stable ID/`internalName`, target/resolved page identity, page ID, revision ID
  and timestamp, raw SHA-256, capture SHA-256, and complete normalized field
  names. It emits an empty row only when the target has no `debuff*` field.
  Same-page positive owners stay diagnostics; incomplete blocks, target
  debuffs, duplicate target blocks, identity drift, and hash drift fail closed.
- `extractNpcInfoboxFieldSets` is a read-only parser export used to preserve
  the exact parsed field map and closed-block state. Existing positive NPC
  infliction extraction behavior is unchanged.
- The frozen capture replay driver is
  `.local/tmp/build-buff-npc-variant-empty-scope-evidence-20261005.mjs`.
  It verifies capture SHA-256
  `sha256:70a243c593efd8429de230bc8fe394a3a39aafc5ae858656b787f7f9dee6676b`,
  all 511 descriptors and 443 raw pages, plus the verified/classification/
  partial-replay hashes before building the report. The output artifact is
  `.local/tmp/buff-npc-variant-empty-scope-evidence-20261005.json` with file
  SHA-256
  `sha256:3866b8902cca2122afd67cff010b31f5d4fbcd67bd1a4c20120e4cd9b16e3108`.
- Result: `67` complete-empty rows, `1` rejected row, and `0` promoted positive
  rows. Retinazer `125` remains `unknown` because The Twins revision `1032403`
  has three `auto=125` blocks; choosing one would violate the ambiguity fence.
  The scope contract reports `67` `variant-owned-complete-empty`, `1` unknown
  with `preserveBaseline=true`, and no copied owner facts.
- Contract replay remains `executable=false`, `applyAllowed=false`, and
  `databaseWrites=false`; Buff IDs `389–400` remain `missing-baseline`.
  Audit: `docs/audits/2026-10-05-buff-variant-empty-scope-evidence.md`.

Validation: evidence/scope tests `12/12`; the required page/verifier suite
`36/36`; maintained NPC parser suite `36/36`; and the combined Buff/NPC/parser/
relation regression `448/448`. The new builder, contract, parser, verifier, and
replay driver pass `node --check`; `git diff --check` passes. No runtime write
was attempted. Final validation was rerun at `2026-10-05 08:48 CST` after
making capture SHA-256 mandatory on every complete-empty row.

### Variant-owned empty-scope candidate replay — 2026-10-05 10:35 CST

The next bounded step is implemented as a pure read-only candidate builder in
`pipelines/relation/buff-npc-variant-empty-scope-candidate.mjs`. It consumes
only the existing scope contract and exact active relation/projection/reverse
snapshots. Complete-empty rows may retire an active `npc_buff_relations`
`inflicts` row only when both stable NPC ID and `internalName` match. Relation
and projection JSON facts are removed only when they carry the same numeric ID;
display-name-only rows are retained as diagnostics. Unknown rows, positive
rows, and all Buff IDs `389–400` remain baseline-preserved.

Fresh read-only MySQL exports covered `388/388/1290` active relation,
projection, and NPC-Buff rows. The replay artifact
`.local/tmp/buff-variant-empty-scope-candidate-20261005/candidate.json` has
SHA-256
`sha256:7f6c092e35e65ac370f54689d5883ad5ba2923b011ed9d54020dd3a7ab55ef3f`,
scope hash
`sha256:fbf2a211275af5299eb36c9e9073469dabd1b7819f7142beab20819f06ea92ab`,
before hash
`sha256:ad39733220cd986661005e1d1f9d08e6ab4d750766ae221f47dbd6f48e63b2e5`,
and after hash
`sha256:3e27a33aafbd2086c1ddaa7e6b86106b1d447ebe2ddf8f10d5d57066d92a680a`.
It identifies ten exact reverse retirements: `121 -> 22` and `306–314 -> 33`;
relation/projection JSON updates and inserts are zero. One unkeyed display-only
`Slimer` entry remains preserved. Retinazer `125` stays unknown.

The candidate is explicitly `executable=false`, `applyAllowed=false`,
`databaseWrites=false`, and `destructiveClear=false`. No executor, packet,
permit, scheduler, Redis-control, landing, maint, relation, projection, or
database write was performed. Audit:
`docs/audits/2026-10-05-buff-variant-empty-scope-candidate.md`.

Validation: candidate regression `6/6`; the fresh empty-scope, scope-contract,
Buff relation, additive, and full-chain regression passes `126/126`; module
syntax check, frozen replay, and `git diff --check` pass. This preview does not authorize canonical
publication; independent owner/full-chain gates remain open blockers.

Fresh authenticated read-only preflight
`.local/tmp/buff-variant-empty-scope-candidate-20261005/preflight.json`
returned HTTP `200` with scheduler disabled, live attempts/claims `0/0`, a
healthy reconciler, and unchanged epoch
`epoch-29a8486b-b3df-45a7-a496-28286de5a91b`; its SHA-256 is
`sha256:708a0f1213efcac37b9f64d418739578a55eb71b2be4e41d8010d476f93c48cc`.
Redis DB14 authenticated `PONG`; MySQL server UUID/port remained
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, with active relation/projection/
reverse counts `388/388/1290`. No runtime mutation occurred.

### Repeated stable-ID empty-scope review and fresh scheduler preflight — 2026-10-05 13:20 CST

The Retinazer `125` unknown was rechecked against the frozen `The Twins`
revision (`12908/1032403`). It contains three complete `auto=125` infobox
blocks: the page summary, first form, and second form. All three have no
`debuff*` field; the only page-wide positive owner is Spazmatism `126`.

The empty-scope producer now certifies repeated stable-ID blocks only when all
matching blocks are complete and empty, rejects duplicate field maps, and
records every block with `selection=all-matching-stable-id-blocks`. This
removes the ambiguity without choosing one variant or copying a positive fact.
The evidence replay `.local/tmp/buff-npc-variant-empty-scope-evidence-20261005-v2.json`
has file SHA-256
`sha256:9831c6201e92d719b3a17c864bb4c2497440889ec1c1b02862152291c19dbff4`;
the v3 scope contract is
`.local/tmp/buff-npc-variant-scope-contract-20261005-v3.json` with file
SHA-256 `sha256:98b396fc62ec039e5c3e1bbfa7280d286356efb13bfc80bf50c8df4c38a735c2`.
Both report 68 complete-empty rows, zero unknown rows, and preserve the
`389–400` missing-baseline fence.

The v4 candidate replay
`.local/tmp/buff-variant-empty-scope-candidate-20261005-v4.json` has file
SHA-256 `sha256:6d38ae21c05b540a89db0dd12d3f427055b3dbe160728103b76b7c92f61cf403`.
It still contains ten exact reverse retirements, zero relation/projection JSON
updates, zero inserts, and zero database writes. It remains
`executable=false`, `applyAllowed=false`, and `databaseWrites=false`.

Fresh source-readiness reports for all eight scheduler domains were generated
at `2026-10-05T05:06:19.668Z`, all with `writesDatabase=false`. A new
authenticated retry-47 preflight from backend `18104` has payload hash
`sha256:09a38f7a03859edafd1372271ab62322aebbeb92cf98ef1b88bba09993d4b5ca`
and file SHA-256
`sha256:5cb0e8a61011ec7acf510f7140756ab8d18efb1f978bf21650ab19162cd687ef`;
epoch remains `epoch-29a8486b-b3df-45a7-a496-28286de5a91b`, scheduler is
disabled, live attempts/claims are `0/0`, reconciler is healthy, and all eight
domains are eligible. Retry-47 proposal/request are proposal-only and
`AWAITING_OWNER`.

Validation after the change: related evidence/scope/candidate/full-chain/sync
tests passed `160/160`; changed modules and the frozen replay driver pass
`node --check`; `git diff --check` passes. No scheduler, crawler, Redis,
landing, maint, relation, projection, packet, permit, or database write was
performed. The remaining execution gates are independent owner authorization
and missing historical Buff baselines `389–400`.

### Dynamic blocker contract correction — 2026-10-05 13:33 CST

The scope contract now emits the shared-page unknown blocker only when the
computed status count is non-zero. The empty-scope candidate no longer carries
the superseded Retinazer ambiguity blocker. The refreshed artifacts are scope
contract v3 (`sha256:98b396fc62ec039e5c3e1bbfa7280d286356efb13bfc80bf50c8df4c38a735c2`)
and candidate v4 (`sha256:6d38ae21c05b540a89db0dd12d3f427055b3dbe160728103b76b7c92f61cf403`).

The final related validation remains `160/160` plus NPC parser `36/36`, with
syntax and `git diff --check` passing. No runtime or database mutation was
performed.

### Fresh retry-48 runtime evidence — 2026-10-05 13:37 CST

The eight read-only source-readiness reports were refreshed at
`2026-10-05T05:34:51.064Z`; all passed with `writesDatabase=false`. Fresh
authenticated preflight from backend `18104` was captured at
`2026-10-05T05:35:43.181Z` with payload hash
`sha256:d774d087457e2f7ac9172a93878ff4c794e47a0f71e83f3cd92f013f48c46949`
and file SHA-256
`sha256:8b572abe65f9c7a143d28b10195450f94f3e070bb25ef17482ca8dfbf5505740`.
The V2 epoch is unchanged, scheduler remains disabled, live attempts/claims
are `0/0`, the reconciler is healthy, and all eight domains are eligible.

Retry-48 proposal hash is
`sha256:f02fc2b20a04c519d61e6ba768401b664ae8da8ff20edd2b72dc01d7c41e10a3`;
the `AWAITING_OWNER` request hash is
`sha256:16f1a08c61c230c09fdc90ab7c9650d8669c1e913618eca310961c9707ac8ed7`.
No packet, permit, scheduler control mutation, crawler, landing, maint,
relation, projection, or database write occurred.

### Duplicate field-map fail-closed correction — 2026-10-05 13:44 CST

Repeated stable-ID block identity comparison now canonicalizes field-key order,
so semantically duplicate blocks are rejected even when their source fields are
listed in a different order. The new regression passes, and the frozen replay
still produces 68 complete-empty rows, zero rejections, and three Retinazer
blocks with no debuff fields.

Final related validation is `160/160`, NPC parser validation is `36/36`,
`node --check` passes, and `git diff --check` passes. No runtime or database
mutation was performed.

### Handoff epoch discrepancy before scheduler activation — 2026-10-05 14:37 CST

The resume handoff and several earlier notes recorded the V2 epoch as
`epoch-29a8486b-b3df-45a7-a496-28286de5a91b`. Fresh authenticated backend GET
evidence and both retry-50/retry-51 preflight artifacts contain the actual epoch
`epoch-29a8486b-b3df-45a7-a496-28286e5da91b`. The discrepancy was detected by a
fail-closed assertion before any scheduler PUT; no runtime control or database
mutation occurred. `docs/devlog/current.md` now points at the actual epoch.

### Retry-50 scheduler canary execution — 2026-10-05 14:46 CST

Fresh authenticated preflight at `2026-10-05T06:43:59.270Z` matched retry-51
for the V2 epoch, namespace, policy-set hash, eight eligible domain source
hashes, zero live attempts/claims, and healthy reconciler. The retry-50 packet
and completed decision authorized one natural `projectiles` canary. The
authenticated PUT returned `200` and read back `enabled=true`,
`changed-only`, interval `60`, and `wiki-projectiles-refresh`.

The backend's natural polling tick ran at `2026-10-05T06:44:49.781913266Z` and
failed closed with `status=blocked`, `reason=scheduler_activation_required`,
and `reasons=[L2_PROMOTION_DECISION_STALE]`; no action was detected or
dispatched and no crawler attempt was created. The same authenticated API then
restored `enabled=false`; final preflight at `2026-10-05T06:46:14.886901052Z`
confirmed disabled control, `0/0` live attempts/claims, and a healthy
reconciler. The runtime config now remains present only as the disabled
readback artifact. No manual sweep, Redis mutation, landing, maint, relation,
projection, or database write was performed.

The remaining blocker is the backend's stale L2 promotion decision gate. The
next action is read-only diagnosis of the governing decision/policy timestamps
and authorization contract; do not mint a new decision or mutate policy until
that gate has an explicit owner authorization.

### Items historical disposition renewal and retry-31 L2 reauthorization — 2026-10-05 15:55 CST

The expired Items historical source-hash disposition was renewed under the
standing AUTH-04 prerequisite contract. The fresh candidate is bound to the
legacy Items run `items_l1_auto_0dfbd093f42b072192297f2a727d9c4d`, current
predecessor policy set `sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`,
and the live MySQL fingerprint. Its approved disposition is
`reports/authorization/canonical/l1-historical-source-hash-disposition/items/2e8bed7d8007e949d49c0a2d565e81061ad67dac36493d6db33c6131a34886c0/disposition.json`,
with Owner decision identity
`automation-l1-historical-source-hash-disposition-items-20261005-3d25476d-67e3-4b4c-9b0d-61911c9637ce`
and expiry `2026-10-06T07:47:09.890Z`.

Retry-29 was captured with an incorrect standard input path and remains
unconsumed. Retry-30 was fully prepared but intentionally abandoned because
its manifest bound the evidence root to this worktree; it remains unconsumed.
Retry-31 was freshly captured, proposal-bound, and authorized with the primary
evidence root `/home/lolben/TerraPedia`. The governed runner completed the
decision at `2026-10-05T07:54:28.427Z`; its pending result is
`reports/authorization/canonical/automation-items-l2-reauthorization.retry-31.result.json`
and the authoritative commit marker is the matching `.commit.json`. MySQL
readback confirms one `L2_PROMOTION` row for Items, the exact packet hash
`sha256:d35c3ca2024ff38824024e119b963178c186d19f69b52c64104c4d6c99b48f5d`,
current H8 `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`,
three successful predecessor L1 runs, duplicate identity count `1`, and
live attempts/reservations/fences `0/0/0`.

The fresh authenticated preflight
`.local/tmp/l2-reauth-preflight-20261005-retry30.json` remained HTTP 200 with
scheduler disabled, zero live attempts/claims, and a healthy reconciler before
the decision. No scheduler control, crawler, Redis, landing, maint, relation,
projection, or Buff database write was performed. The next safe action is the
same serial evidence-chain audit for the next domain whose historical L1
source/bundle evidence is stale or missing; Buff full-domain ingestion remains
blocked by the `389–400` baseline fence and the independent scope contract.

### Projectiles historical disposition renewal and retry-32 L2 reauthorization — 2026-10-05 16:02 CST

Projectiles had the same expired historical source-hash disposition shape as
Items. A new candidate was bound to
`projectiles_l1_auto_4d46fa934fc03769178dfde4a5b7508e`, predecessor policy set
`sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`,
and the live MySQL fingerprint. The approved disposition is
`reports/authorization/canonical/l1-historical-source-hash-disposition/projectiles/c79e259045a3872166fbf92b094f05a4cf467251a7252bf9ae0f177ed7a5905e/disposition.json`,
with a fresh Owner identity and expiry `2026-10-06T07:59:23.308Z`.

Retry-32 was freshly captured, bound to the primary evidence root
`/home/lolben/TerraPedia`, and executed through the governed runner at
`2026-10-05T08:00:44.338Z`. Its result and commit marker are
`reports/authorization/canonical/automation-projectiles-l2-reauthorization.retry-32.result.json`
and the matching `.commit.json`. MySQL readback confirms one `L2_PROMOTION`
row, packet `sha256:324d1d7403f24266aaf0151cb37cf4470cf59acf535c55f679169cf7ca5632fb`,
current H8 `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`,
three successful predecessor L1 runs, duplicate identity count `1`, and no
live attempts, reservations, or fences. The retry-32 preflight was HTTP 200
with disabled scheduler and a healthy reconciler. No crawler or business-table
write was performed.

### Retry-56 scheduler canary completion — 2026-10-05 17:42 CST

The governed local stack remained bound to backend `18104`, MySQL `13306`,
Redis `6380` logical DB14, front `5190`, and admin `3017`. Eight source-
readiness reports were refreshed read-only at `2026-10-05T08:51:12.510Z`; all
reported `pass` and `writesDatabase=false`. An authenticated retry-56
preflight was captured from backend `18104` at `2026-10-05T08:52:52.628Z`:
HTTP `200`, epoch
`epoch-29a8486b-b3df-45a7-a496-28286de5a91b`, namespace
`terrapedia:crawler:wiki-monitor:v2:`, queue contract `2`, H8
`sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`,
disabled `changed-only` control, zero live attempts/claims, and a healthy
reconciler. The preflight hash is
`sha256:80f32a36811a869d78118b552350523eb942aa9629e55a307c3310d4b9cb9c5b`.

Retry-53 was not reused. The TOCTOU comparison found all eight source hashes
changed because fresh report bytes carried the new generated timestamp, even
though epoch, namespace, policy rows, and domain/action identities were
unchanged. Retry-56 proposal/request/automation request, input, server
fingerprint, policy rows, execution manifest, and owner packet were generated
from the fresh preflight. The new packet hash is
`sha256:5380ea90426af07cb77c9d3276dc3db1aa9f8635d74b937e0562c6d791e3a278`;
its unique decision identity is
`automation-crawler-v2-scheduler-activation-20261005-standing-npcs-56-ddf76e82-7b99-4e75-b63a-8e62d84a5cf1`.
The governed runner completed at `2026-10-05T08:59:13.215Z`, MySQL readback
shows exactly one decision row for that identity and packet, and
`used-decisions.json` records the consumed identity with its dispatch-permit
hash.

Authenticated PUT enabled one bounded canary with `changed-only`, interval
`60`, and `wiki-npcs-refresh`. The backend natural scheduler waited for the
existing 60-minute due gate, then ran the source update monitor at
`2026-10-05T09:36:11.498667770Z`. The source monitor reached terminal
`completed`, but its probe was unhealthy (`okSources=0`, all nine sources
reported changed), so the V2 sweep result was `status=error`,
`reason=source_update_check_failed`, with no detected or dispatched actions.
There were no live crawler attempts. The observation artifact is
`.local/tmp/buff-automation-scheduler-natural-tick-retry-56.json`.

The scheduler was immediately restored through authenticated PUT
`enabled=false`; final preflight and MySQL readback show epoch/H8 unchanged,
`liveAttempts/sweepClaims=0/0`, active reservations/fences `0/0`, and a healthy
reconciler. The disabled readback is
`.local/tmp/buff-automation-scheduler-disable-retry-56.json`. No manual sweep,
direct Redis write, landing, maint, relation, projection, or Buff full-domain
ingestion was performed. The source-monitor failure and Buff blockers remain
open; Buff IDs `389–400` still lack historical baselines and the existing
partial/variant contracts remain non-executable.

### Retry-57 scheduler canary and stale L2 gate — 2026-10-05 18:40 CST

Retry-57 was independently re-read before runtime control. The governed result
`reports/authorization/canonical/automation-crawler-v2-scheduler-activation.retry-57.result.json`
is `completed` for decision identity
`automation-crawler-v2-scheduler-activation-20261005-standing-npcs-57-2a1f6c2e-8d3b-4cc3-ae19-6e1cf8e9a7d4`;
its packet hash is
`sha256:a5cd458d4e35b0002cfce1280c41d661e8f9af586b308735df21c2a47bec2b98`.
MySQL readback reports exactly one matching `SCHEDULER_ACTIVATION` row (37
total scheduler decisions), and `used-decisions.json` contains one matching
consumption entry. Retry-56 was not replayed.

The fresh authenticated pre-enable preflight at
`2026-10-05T10:37:42.996Z` matched H8
`sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`,
epoch `epoch-29a8486b-b3df-45a7-a496-28286e5da91b`, namespace
`terrapedia:crawler:wiki-monitor:v2:`, queue contract `2`, disabled control,
zero live attempts/claims, and a healthy reconciler. Authenticated PUT enabled
only `wiki-npcs-refresh` with `changed-only` and a 60-minute interval at
`2026-10-05T10:37:43.002Z`.

The backend natural tick was observed at
`2026-10-05T10:38:24.669405860Z`. It failed closed with
`status=blocked`, `reason=scheduler_activation_required`, and
`reasons=[L2_PROMOTION_DECISION_STALE]`; `detected=[]` and `dispatched=[]`, so
no crawler attempt or data operation was created. The scheduler was restored
through authenticated PUT `enabled=false` at `2026-10-05T10:38:25.188Z`.
Final preflight at `2026-10-05T10:38:25.370Z` reports disabled control, the
same epoch/H8, `liveAttempts/sweepClaims=0/0`, and a healthy reconciler.

Independent post-run readback reports MySQL active attempts, reservations, and
write fences `0/0/0`. Redis DB14 retains engine `v2` and the same epoch; its
live-attempt index is absent, all 230 attempt records are terminal (`145`
completed, `81` failed, `4` timed out), and no new queue/attempt record is
present. Full evidence is
`.local/tmp/buff-automation-scheduler-canary-retry-57-20261005T103742Z.json`.
No manual sweep, direct Redis mutation, landing, maint, relation, projection,
or Buff full-domain ingestion was performed. The independent readback artifact
`.local/tmp/buff-automation-scheduler-readback-retry-57-20261005T104419Z.json`
reconfirms the exact decision/packet pair, MySQL active attempt/reservation/
fence counts `0/0/0`, Redis DB14 engine/epoch, and an absent live-attempt index.

The new runtime blocker is the backend scheduler's stale L2 promotion decision
gate. Next action is read-only diagnosis of the governing L2 decision/policy
timestamps and exact gate scope; do not mint another scheduler packet, replay
retry-57, or enable the scheduler again until that gate has a fresh authorized
state. Buff IDs `389–400` and the unresolved shared-page/partial contracts
remain independent canonical-ingestion blockers.

### L2 promotion gate diagnosis — 2026-10-05 18:45 CST

The read-only policy/decision query confirms that the scheduler eligibility
loop covers all eight automatic domains, not only the NPC canary. Their current
policies remain unchanged `L2/ACTIVE` under H8, but every latest L2 decision is
expired at the current observation: `items` through `17:53:22Z`,
`projectiles` through `18:00:05Z`, `shimmer` through `18:03:54Z`,
`armor_sets` through `18:06:55Z`, `buffs` through `18:08:32Z`, `audio` through
`18:09:58Z`, `bosses` through `18:11:32Z`, and `npcs` through `18:25:08Z`.
No policy version, H8, server identity, scheduler control, Redis state, or
business table changed during this diagnosis.

Standing AUTH-04 permits fresh append-only policy-stable L2 reauthorization for
these exact eight domains. The next serialized phase uses new labels
`retry-40` through `retry-47`, fresh read-only captures and packets, one
governed runner consumption per domain, and immediate decision/live-state
readback. Historical disposition artifacts for Items, Projectiles, and Shimmer
remain current and are bound only where the operation manifest requires them;
no expired packet or decision will be replayed.

### AUTH-04 L2 freshness reauthorization retry-46 through retry-50 — 2026-10-05 20:33 CST

The remaining fresh packets were executed serially through the governed
`run-authorized-canonical-operation.mjs` runner. No packet was replayed and no
crawler or scheduler operation was enabled.

| Domain | Decision identity | Packet hash | Completed (UTC) |
| --- | --- | --- | --- |
| Armor Sets | `automation-armor-sets-l2-reauthorization-20261005-auth04-retry46-7c643afa-b311-4133-ae55-9ff47e6f77b1` | `sha256:a58c9ef1380a300a6ab8f1144893866e74e55e318a985daaf863e96efe89666f` | `2026-10-05T12:08:56.808Z` |
| Buffs | `automation-buffs-l2-reauthorization-20261005-auth04-retry47-e5678ebe-a02f-4305-8f81-b0e18744f1f6` | `sha256:a5998814f06755d83f74383e8e86f981ea1121670f1e4ebce40567e612cbbb2d` | `2026-10-05T12:14:23.480Z` |
| Audio | `automation-audio-l2-reauthorization-20261005-auth04-retry48-c558dfb1-b3bf-49ab-b0c3-fc5cc51f24ce` | `sha256:de192c4210475b2ab23ea5c62f40913ed51a599794ef0a1ae4662456f2a22eb0` | `2026-10-05T12:21:39.683Z` |
| Bosses | `automation-bosses-l2-reauthorization-20261005-auth04-retry49-3f0f54ea-4542-4a97-9887-1f46ea661e44` | `sha256:2705555f512b57a074d847909730b92f12361d9e5b15364106cc2198f8ef6ef7` | `2026-10-05T12:22:33.735Z` |
| Shimmer | `automation-shimmer-l2-reauthorization-20261005-auth04-retry50-43a2a217-f03f-4151-833b-a60ad0c85d25` | `sha256:f18c219951adbb89a6248f90b84bcf59d6db37e194bdf17ce121bd4601e7dca8` | `2026-10-05T12:23:23.760Z` |

Each runner returned exit code `0`, consumed its one-time identity, and wrote
the expected pending result plus authoritative `.commit.json` marker. The
fresh authenticated preflight
`.local/tmp/l2-reauth-preflight-20261005-retry50-20261005T122701Z.json` at
`2026-10-05T12:27:01Z` returned HTTP `200`, scheduler `enabled=false`, live
attempts/claims `0/0`, a healthy reconciler, epoch
`epoch-29a8486b-b3df-45a7-a496-28286e5da91b`, and H8
`sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`.

Read-only aggregate evidence
`.local/tmp/l2-reauth-readback-20261005-retry46-50-20261005T123228Z.json`
confirms five matching MySQL `L2_PROMOTION` rows on server UUID
`b4ae6728-4f72-11f1-bcc9-00155d37eadf` port `13306`, active attempts,
reservations, and fences `0/0/0`, and Redis DB14 `PONG`, engine `v2`, the same
epoch, and an absent live-attempt index. Every result is `pending` with an
authoritative `committed` marker, and every decision identity is present in
`used-decisions.json`.

This phase only refreshed L2 authorization state. Scheduler activation,
crawler execution, direct Redis writes, landing/maint/relation/projection
writes, and Buff full-domain ingestion were not performed. Buff IDs `389–400`,
the 68 shared-page variant scope, and the independent full-chain/source gates
remain blockers for canonical Buff ingestion.

### Bounded new-ID Buff source capture and scope audit — 2026-10-05 21:17 CST

The governed local stack was rechecked through an authenticated read-only
preflight before source work. Artifact
`.local/tmp/buff-new-id-preflight-20261005T130518Z.json` returned HTTP `200`
with scheduler disabled, live attempts/claims `0/0`, a healthy reconciler,
and unchanged H8/epoch. The process scan matched only the preflight shell and
Node command itself; no Buff writer was active.

The bounded `capture-buff-page-evidence.mjs` run selected IDs
`395,397,398,399,400` and wrote a fresh monitor-visible run under
`.local/tmp/buff-new-id-page-capture-20261005T130604Z/`. It reached terminal
`completed` at `4/4` raw pages: Potent Acid, Chlorophyte Saber, Catalyst Band,
and Zapped (shared by `399` and `400`). Capture and progress both declare
`databaseWrites=false`; no crawler attempt, scheduler mutation, or database
write occurred.

The merged replay
`.local/tmp/buff-new-id-insert-contract-diagnostic-20261005-v3.json` has SHA-256
`sha256:8c3f5756785193690912b84d44d0d1433d5f867f0aa471c0e8e8b63c6d43ca9b`.
All twelve IDs `389–400` normalize, all twelve source-item groups are
complete, and all twelve `inflictingNpcs` groups remain `section_missing`.
The revision-bound NPC scope audit
`.local/tmp/buff-new-id-infliction-scope-audit-20261005-v2.json` has SHA-256
`sha256:76d66347da91ac77a58ba928b6280f441935c4a6f4b9bb5866d49754a220a2be`;
the retained 511-target/443-raw-page capture contains zero positive infliction
facts for these IDs. That artifact predates the final repeated-ID scope replay
and is superseded for the current decision by scope contract v3, which reports
68 `variant-owned-complete-empty` rows and zero unknown rows.

The derived source-complete insert-only diagnostic
`.local/tmp/buff-new-id-insert-contract-diagnostic-20261005-v4.json` has
SHA-256 `sha256:89a5ad5316b4bfcfb3a20b6844c5d47237c467a40cae4b071cd5e42559b8258a`.
It reports `12/12` normalized records, complete source-item, inflicting-NPC,
and immunity groups for every new Buff, with zero preserved groups. This clears
the former infliction-scope source sub-gate, but does not create a landing,
maint, relation, projection, owner decision, packet, or apply operation.

The missing-baseline fence `389–400`, landing-to-maint lineage, relation and
projection candidate construction, and independent owner/full-chain gates
remain active.

Validation after the capture: capture contract `18/18`; Buff parser, NPC
infliction, and variant scope-contract tests `40/40`; the derived builder
passed `node --check`; touched module syntax checks and `git diff --check`
passed. The next action is governed insert-only candidate construction and
owner review for `389–400`; do not enable the scheduler or run canonical Buff
ingestion.

The authenticated postflight
`.local/tmp/buff-new-id-postflight-20261005T132537Z.json` at
`2026-10-05T13:25:38.218Z` returned HTTP `200` with scheduler disabled, live
attempts/claims `0/0`, healthy reconciler, unchanged epoch/H8, and no active
Buff writer beyond the probe's own shell and Node command.

### New-ID source-complete insert-only contract — 2026-10-05 21:47 CST

The earlier v3 new-ID diagnostic was conservative because it did not bind the
final repeated-ID scope contract. The current scope contract
`.local/tmp/buff-npc-variant-scope-contract-20261005-v3.json` has SHA-256
`sha256:98b396fc62ec039e5c3e1bbfa7280d286356efb13bfc80bf50c8df4c38a735c2` and
reports 68 `variant-owned-complete-empty` rows, zero unknown rows, and the
exact missing-baseline IDs `389–400`.

The read-only driver `.local/tmp/build-buff-new-id-insert-contract-20261005-v4.mjs`
derived a Buff-level complete-empty infliction source from that contract and
the revision-bound verifier. Its artifact
`.local/tmp/buff-new-id-insert-contract-diagnostic-20261005-v4.json` has SHA-256
`sha256:89a5ad5316b4bfcfb3a20b6844c5d47237c467a40cae4b071cd5e42559b8258a`.
All 12 new Buffs normalize; all 12 source-item, inflicting-NPC, and immunity
groups are complete; every partial plan replaces all three groups and preserves
zero baseline groups. The artifact remains `executable=false`,
`applyAllowed=false`, and `databaseWrites=false`.

This clears the former new-ID infliction-scope source sub-gate. It does not
invent historical rows or authorize publication. Zero-baseline owner decision,
landing-to-maint lineage, relation/projection candidate construction, and
independent full-chain authorization remain required. No packet, landing,
maint, relation, projection, scheduler, Redis, or database write occurred.

Validation: derived builder `node --check`; focused Buff source/applicability/
fetch/relation suite `138/138`; `git diff --check` passed.

### New-ID insert-only candidate and secondary-lineage blocker — 2026-10-05 23:05 CST

The read-only driver `.local/tmp/build-buff-insert-only-candidate-20261005-v1.mjs`
now builds a deferred landing/maint and relation/projection candidate for
exactly Buff IDs `389-400` from the revision-bound source input. The candidate
artifact `.local/tmp/buff-insert-only-candidate-20261005-v1.json` is
`status=blocked`, `executable=false`, `applyAllowed=false`, and
`databaseWrites=false`; its SHA-256 is
`sha256:203ea633d0a845f5b424b1b89cbb13fd87a9d366024dc7ac0ca36ee9e9decf45`,
and its contract hash is
`sha256:71cd963be35b18412b5c1258b7eec38b58bede6f1c1382e735c13af10ffdc6dd`.

The candidate keeps the full current relation snapshot as preserved rows
(`2454` rows), proposes 12 relation Buff inserts, six item-Buff secondary
inserts, 12 projection Buff inserts, and no image or NPC-Buff secondary
inserts. Nine source-item issues remain: four Iteminfo IDs (`6148`, `6149`,
`6161`, `6164`) have no current `maint_items` identity, two page-only item
facts on Buffs `399-400` have no stable IDs, and Buff `395` has an item-name
identity drift for ID `1340`. The immunity lists also have no stable NPC IDs,
so no NPC-Buff secondary insert is proposed. These are lineage blockers, not
inferred empty or positive facts; the durable audit is
`docs/audits/2026-10-05-buff-new-id-insert-candidate.md`.

The builder supports deferred landing IDs and explicitly allows unresolved
secondary diagnostics only for this non-executable candidate path; the normal
Buff candidate path still rejects unresolved facts. No packet, permit,
scheduler, Redis, landing, maint, relation, projection, or database write was
performed. Validation: candidate tests `3/3`, builder syntax check, fresh
authenticated preflight, read-only MySQL snapshot, final artifact hash
recomputation, and postflight
`.local/tmp/buff-insert-candidate-postflight-20261005T150310Z.json` all passed;
the one process-scan match was the probe itself. The combined focused Buff
candidate/source/relation suite passed `165/165`, and a final row-count
readback remained `388/388/388/1290/0` for maint Buff/relation Buff/projection
Buff/NPC-Buff/item-Buff. The next owner decision must resolve or explicitly
defer the secondary item/NPC lineage before any full-chain authorization.

### Secondary identity lineage diagnosis — 2026-10-05 23:29 CST

The pure read-only resolver `pipelines/relation/buff-secondary-identity-lineage.mjs`
and focused test `pipelines/relation/buff-secondary-identity-lineage.test.mjs`
compare the candidate payload with the complete revision-bound Iteminfo page
and current MySQL identity snapshots. Artifact
`.local/tmp/buff-secondary-identity-lineage-audit-20261005-v1.json` has SHA-256
`sha256:4282ef4723d06812867918458ef2bc7793d3a944294f66156be0ce578e6d9a99`;
the durable audit is `docs/audits/2026-10-05-buff-secondary-identity-lineage.md`.

All 15 source-item facts now have stable source IDs. Missing `maint_items`
identities are narrowed to `6148`, `6149`, `6155`, `6161`, `6164`, and `6173`;
local compatibility rows exist for these names but their auto-increment IDs are
evidence only. Item ID `1340` matches `maint_items` by source ID, while the
source page identity `FlaskOfVenom` differs from canonical `FlaskofVenom` and
remains an owner-review drift. Item summary is `15` stable IDs, `8` fact rows
without maint identity, `0` unresolved IDs, and `1` drift row.

The immunity diagnostic contains `373` facts: `259` have Npcinfo stable IDs
and `114` remain display-only. Exact maint-name matches for those 114 facts are
not promoted because a page display identity does not prove the NPC source ID.
The insert-only candidate still has zero NPC secondary inserts; this audit does
not create a new immunity relation path. The lineage resolver is
`executable=false`, `applyAllowed=false`, `databaseWrites=false`, and the
candidate remains blocked by missing item maint identities, the item-name drift,
and the 114 NPC source-ID gaps.

Validation: `node --test pipelines/relation/buff-secondary-identity-lineage.test.mjs`
passed `4/4`; the artifact was generated from SELECT-only MySQL reads with zero
network requests. No crawler, scheduler, Redis, landing, maint, relation,
projection, or business-table write was performed. The next safe owner action
is a separately governed item-domain maint ingestion review plus an explicit
NPC immunity secondary-relation plan; do not convert this diagnostic into an
executable Buff packet.

### Task 18 authorized six-Item maint publication — 2026-10-06 08:49 CST

The user explicitly authorized the bounded independent Item operation for game
IDs `6148`, `6149`, `6155`, `6161`, `6164`, and `6173`. The canonical runner
completed decision `buff-item-maint-20261006-admin-01` under run
`buff-items-20261006-task18-exec-v1`; packet hash is
`sha256:1da203d2619affe02acde7a2e9195eaecf076b37ef89d501a88ae4cbef657139`.
It committed one non-current `items_raw` landing `12546` and six active
`maint_items` rows `6162/6163/6164/6165/6166/6167`, preserving the exact source
ID and internal-name mapping in the result artifact.

The committed result and independent readback are
`reports/authorization/canonical/canonical-buff-item-maint-insert.20261006-task18-exec-v1.result.json`
and `.readback.json`. The readback records after-hash
`sha256:4e88abb3ed31f3d00754ee58200c058aa6d9cf1c6ec906c0e79e9999b629a79a`,
server `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, `maint_items=6152`, two
`items_raw` landings, all six inserted rows linked to landing `12546` with
`status=1/deleted=0`, and active attempts/reservations/fences `0/0/0`.
Authenticated API preflight remained HTTP `200` with scheduler disabled and a
healthy reconciler. No local Item, Buff relation/projection, scheduler, Redis
business state, or DDL write occurred.

Validation: maint contract/executor/runner `33/33`; governance, manifest, and
authorization regressions `113/113`, plus Item-operation registration `3/3`;
Node syntax checks and `git diff --check` passed. Remaining independent blockers are the Item `1340` spelling drift,
`114` NPC immunity facts without stable source IDs, and the Buff `389-400`
zero-baseline/full-chain gate. No decision was replayed and no commit or push
was performed in this session.

### Task 19 refreshed zero-baseline candidate after Item maint publication — 2026-10-06 09:00 CST

After the authorized six-Item maint publication, the deferred Buff candidate
for IDs `389-400` was rederived from the current SELECT-only MySQL snapshots.
Artifact `.local/tmp/buff-insert-only-candidate-20261006-v2.json` has SHA-256
`sha256:b3b1232a21eabbbaaeb365bc369fd57a7df7d4d3f63b353b9a5e8d6895693af0` and
remains `status=blocked`, `executable=false`, `applyAllowed=false`, and
`databaseWrites=false`.

The six new Item maint identities now resolve. The candidate contains 12
deferred maint inserts, 12 relation Buff inserts, 12 projection Buff inserts,
14 Item-Buff secondary inserts, zero NPC-Buff secondary inserts, and preserves
2,454 existing downstream rows. The only remaining Item secondary issue is
Buff `395` source spelling drift: page `FlaskOfVenom` versus canonical
Iteminfo/maint `FlaskofVenom` at source ID `1340`; no alias or rewrite was
inferred. The candidate remains blocked by this explicit disposition, the 114
NPC immunity facts without stable source IDs, the `389-400` zero-baseline/full-
chain gate, and fresh operation-bound authorization/readback requirements.

Durable audit: `docs/audits/2026-10-06-buff-insert-candidate-refresh.md`.
Focused candidate and identity tests pass `7/7`; driver/module syntax checks
and the SELECT-only source rederivation pass. No packet, permit, fence,
landing, maint, relation, projection, Redis, scheduler, or business-table
write occurred.

### Task 20: Buff zero-baseline/full-chain publication — 2026-10-06 10:49 CST

The user-approved scope was executed once with `actor=admin`: publish Buff IDs
`389-400` through the canonical landing -> maint -> relation -> projection
chain, publish the source-derived Item-Buff rows except the explicit Item `1340`
`FlaskOfVenom`/`FlaskofVenom` spelling drift, and keep NPC-Buff secondary rows
deferred. No prior decision identity was replayed.

The formal v13 runner completed with result
[canonical-buff-full-chain.task20-zero-baseline-v13.result.json](../../reports/authorization/canonical/canonical-buff-full-chain.task20-zero-baseline-v13.result.json)
and journal
[canonical-buff-full-chain.task20-zero-baseline-v13.journal.json](../../reports/authorization/canonical/canonical-buff-full-chain.task20-zero-baseline-v13.journal.json).
The run is `buff-full-chain-20261006-task20-v13`, journal state is `COMMITTED`,
packet hash is `sha256:d32d489bce2d3dc1eec947b947a08115adbb29bb25d72472ade92835188b0473`,
and execution-manifest hash is
`sha256:291e3affc6657ca46d580eab9a1bdef9357fe97a7cf036931196eefe72b8e3a4`.

Independent read-only MySQL readback on server
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306` confirms:

- active `maint_buffs`, `relation_buffs`, and `projection_buffs` counts are `400/400/400`;
- Buff IDs `389-400` contribute `12/12/12` rows across those three layers;
- `item_buff_relations` has `14` active rows, including no inferred alias for Item `1340`;
- `npc_buff_relations` remains `1290`, with `0` new NPC-Buff rows;
- active fences, live attempts, and live reservations are `0/0/0`.

The v13 envelope preserves `388` existing relation/projection rows and `1290`
existing NPC-Buff rows; it plans no deletes. The scheduler remains disabled.

Final combined regression after the last runner/manifest changes passed `303/303`
across the landing, full-chain, governance, recovery journal/store, transaction
executor, canonical runner, Buff sync, authorization, execution-manifest, and
authorized-operation tests. The only code-level repair in this closeout was a
test fixture update to provide the now-required `buffFullChainBinding`; no
production behavior changed in that repair. `node --check` and `git diff --check`
also pass.

Remaining follow-up is explicit rather than inferred: decide the Item `1340`
spelling disposition separately, and create a separately governed NPC-Buff
secondary identity operation for the `114` display-only immunity facts when
stable source IDs are available. Do not replay v13 or consume another decision
for this completed publication.

### Buff NPC secondary identity candidate — 2026-10-06

The next Buff step is now captured as a read-only candidate rather than an
implicit continuation of v13. Candidate
`.local/tmp/buff-npc-secondary-candidate-20261006-v1.json` uses the frozen
identity lineage and one MySQL `START TRANSACTION READ ONLY` snapshot. It
preserves all `1290` active `npc_buff_relations` rows and proposes `259`
insert-only `immune` rows for stable NPC source IDs in Buffs `389-394` and
`396`. The remaining `114` display-only immunity facts are retained as
deferred evidence; Buffs `395` and `397-400` have no stable NPC IDs in the
current lineage and receive no candidate rows.

The candidate is `readOnly=true`, `executable=false`, `applyAllowed=false`,
and `databaseWrites=false`; it has no deletes or updates. Candidate SHA-256 is
`sha256:6c51c7be7b2c76a3d40ef01d1e15dbaa1659ea1252356f3003518340ba75d91e`.
Durable audit: `docs/audits/2026-10-06-buff-npc-secondary-candidate.md`.
Focused candidate tests pass `3/3`. A future publication requires a separate
governed additive operation, fresh owner authorization, packet/permit/fences,
and independent after-set readback; this candidate did not write the database.

### Task 21: Buff NPC secondary immune relation apply - 2026-10-06

The approved NPC-Buff follow-up was registered as the separate governed
operation `canonical-buff-npc-secondary-apply`. It is insert-only for the
`immune` relation lane and binds only `relation.npc_buff_relations.immune`.
The refreshed v3 candidate was generated from a SELECT-only current baseline,
normalized source revision timestamps to MySQL `DATETIME`, and retained the
bounded `259` promotable / `114` deferred split.

Two fresh attempts failed closed and were not replayed: the first rolled back
on an invalid ISO `DATETIME` value; the second rolled back on an after-set
ordering mismatch. Their journals are `ROLLED_BACK`, their decision
identities remain consumed, and both fences were released. The third fresh
decision `canonical-buff-npc-secondary-apply-20261006-admin-03` completed with
journal `COMMITTED` and result
`reports/authorization/canonical/canonical-buff-npc-secondary-apply.20261006-admin-03.result.json`.

Independent readback proves `npc_buff_relations=1549` from `1290`, exactly
`259` new active `immune` rows, no duplicate keys or deletes, and Buffs
`389-394`/`396` contributing `37` rows each. The database after-set hash
matches the proposal/result at
`sha256:a00f5d5c9c4c7c165e1fc2b2e4e997386becf2ae0c9567a2ed1bc096c77fbe55`;
active write fences are `0`. Durable audit:
`docs/audits/2026-10-06-buff-npc-secondary-apply.md`.

Focused governed regression passes `123/123`; syntax checks and `git diff
--check` pass. The `114` display-only facts and Item `1340` spelling drift
remain deferred follow-ups.

### Task 22: deferred NPC identity discovery - 2026-10-06

A read-only replay bound the deferred NPC page identities to the existing
revision-bound NPC target artifact and raw page revisions. Of the `114`
previously deferred immunity facts, `94` now have a unique page-target stable
NPC source ID and an active matching `maint_npcs` row. The remaining `20`
facts are the four shared display-name variant groups `Lunatic Cultist`,
`Martian Saucer`, `Phantasm Dragon`, and `The Destroyer`; each has multiple
stable source IDs and remains deferred.

Runtime artifact:
`.local/tmp/buff-npc-secondary-identity-discovery-20261006-v1.json`, SHA-256
`sha256:1bfe882ff69fe1243d88b95d634a5bd53bed247a9d87190cabc852ae867f36f4`.
Durable audit: `docs/audits/2026-10-06-buff-npc-secondary-identity-discovery.md`.
This was `networkRequests=0`, `databaseWrites=false`, and SELECT-only. The
existing NPC secondary runner cannot apply the `94` subset because its
validator is intentionally bound to the consumed `259/114` scope. A new
operation or versioned scope contract, fresh authorization, and independent
readback are required; no packet, permit, fence, journal, or database write
was created.

The v4 scope preview `.local/tmp/buff-npc-secondary-candidate-20261006-v4.json`
(`sha256:8e9f9e7fa27ee235f616893683cd4c3ab676c2c54017833dfc1d9410174a97ea`)
rederived the current `1549`-row baseline and proposes `94` inserts while
preserving all existing rows. It is proposal evidence only and has no
execution authority.

### Task 23: 94-row NPC identity scope authorization request - 2026-10-06

The consumed `259/114` NPC secondary decision was kept immutable. The apply
validator now accepts a separately bound `buff-npc-secondary-identity-scope/v1`
contract and validates its discovery hash plus declared promotable/deferred
counts; candidates without that contract retain the legacy `259/114` guard.
The proposal source binds the scope contract, and the prepare CLI accepts an
explicit `--candidate-path` while rejecting that override in apply mode.

The v4 candidate was prepared against one MySQL `START TRANSACTION READ ONLY`
snapshot. Proposal
`reports/authorization/canonical/canonical-buff-npc-secondary-apply.identity-scope-94.proposal.json`
has SHA-256
`sha256:bd255f4fd5cf74f25e0500a33049e5494ac3cf63aa6ff862597637597b623378`,
scope hash
`sha256:e42faa66b1682b3de743e89034751fa51ebf76fe0f752c1e93c3960e52db301f`,
and plans `1549 -> 1643` (`94` inserts, `20` deferred). The execution-manifest
contract hash is
`sha256:0055e1f1569b1d3aac406c988eb393d57dd9ab1644f91abe7a5b76b56e865070`.

Request
`reports/authorization/canonical/canonical-buff-npc-secondary-apply.identity-scope-94.request.json`
is `AWAITING_OWNER`, expires `2026-10-07T09:43:58.422Z`, and has request hash
`sha256:c344998a2bac901f4440783fe3813d1c41fbf1116e16bd5f2173a3c8f6d92d09`.
The durable scope audit is
`docs/audits/2026-10-06-buff-npc-secondary-identity-scope-94.md`.

Focused candidate/apply/runner tests pass `6/6`; syntax and `git diff --check`
pass. No packet, dispatch permit, runtime database fence acquisition, journal,
result, or database write was created for this scope. The next action is an
explicit owner approval for this exact request; only then may the packet,
permit, fence, apply, and independent readback be prepared.

### Task 24: 94-row NPC identity scope apply - 2026-10-06

The user approved the exact `identity-scope-94` request as `actor=admin`,
with request hash
`sha256:c344998a2bac901f4440783fe3813d1c41fbf1116e16bd5f2173a3c8f6d92d09`
and proposal hash
`sha256:bd255f4fd5cf74f25e0500a33049e5494ac3cf63aa6ff862597637597b623378`.
Decision identity is
`canonical-buff-npc-secondary-apply-20261006-identity-scope-94-admin-01`;
packet hash is
`sha256:b9052970347908fb9550a3a4a4612e587f80ef587b992c3c7e1add0c50f552e4`.

The governed runner acquired the local `npc_buff_relations.immune` fence,
inserted exactly `94` stable-NPC `immune` rows, committed the journal, and
released the fence. Result
`reports/authorization/canonical/canonical-buff-npc-secondary-apply.identity-scope-94.result.json`
is `completed` with result SHA-256
`sha256:1c31f9f1f5531f1043eb7929d4469ff8cbfe0fbccd2df7ae6ed47c2dcf3097ff`;
journal
`reports/authorization/canonical/canonical-buff-npc-secondary-apply.identity-scope-94.journal.json`
is `COMMITTED`. Fence evidence records
`fence:buff-npc-secondary-20261006-identity-scope-94` and
`activeFencesAfter=0`.

Independent readback
`.local/tmp/buff-npc-secondary-independent-readback-20261006-identity-scope-94.json`
(`sha256:5f90aabfc711b6e7cf4ce2c8f079957ec6cdc43019e961f722114a4077908ecf`)
proves `1549 -> 1643` active rows, after-set hash
`sha256:2963edba59eae3cf11711bb145ffe1d4e60e8efc8419c371bee0d78c6cdd1e31`,
`94/94` present, zero missing/wrong/duplicate keys, and live
attempts/reservations/fences `0/0/0`. The `20` shared-name variants remain
deferred; the decision ledger is consumed and no permit artifact remains.

Task 24 validation: focused candidate/apply/runner tests `6/6`, module syntax
checks, `git diff --check`, and independent SQL readback all pass. No scheduler
activation or unrelated domain write was performed. Durable audit:
`docs/audits/2026-10-06-buff-npc-secondary-identity-scope-94.md`.

### Task 25: Item 1340 source disposition — 2026-10-06 18:58 CST

A read-only disposition request was generated for the remaining Item-Buff
source fact `(Buff 395, Item 1340)`. The page candidate says
`FlaskOfVenom`; Iteminfo and active `maint_items` bind stable source ID `1340`
to `FlaskofVenom`, and the Iteminfo row declares `buffType=71`, not Buff `395`.
The current relation layer has no `(1340,395)` secondary row; the projection
retains a canonical Item payload while the relation Buff raw payload retains
the page spelling. This is a semantic conflict plus spelling drift, so the
proposal recommends `defer-semantic-conflict` and preserves all source facts.

Proposal:
`reports/authorization/canonical/canonical-buff-item-1340-source-disposition.20261006-v1.proposal.json`
(`sha256:24ab8cbb38b5aab98b47eccf412f92f2e87bc2928a6d878dad78be3d216c67ab`);
request hash:
`sha256:e05ace819b1fd0ca565df5f9d326def0a108e111798b7d0c744aac151c923995`.
Durable audit: `docs/audits/2026-10-06-buff-item-1340-source-disposition.md`.
The request is not a canonical write authorization; no operation, packet,
permit, fence, or SQL write exists for this scope. The `20` shared-name NPC
variants remain deferred.

### Task 26: Item maint recovery-hold review repair — 2026-10-06 18:58 CST

Independent review found that an unknown recovery-hold `COMMIT` acknowledgement
could leave the two Item fences at their ordinary finite TTL if the hold
transaction actually rolled back. The new regression test reproduces that
condition and checks competing acquisition after the ordinary TTL. The runner
now requires an independent reconciliation callback for unknown hold outcomes,
re-applies both exact fence predicates at the maximum DATETIME deadline, emits
an immutable `FENCE_HOLD_RECONCILED` journal phase, and rechecks authorization
validity before each hold update. No business mutation or runtime write was
performed while fixing this contract.

The complete changed-surface Item/governance validation passes `189/189`.
A Buff-only sweep passes `498/498` after excluding the pre-existing backfill
test `pipelines/backfill/npc-buff-relations-from-wiki-crawler.test.mjs`, which
fails at module load because this worktree has no `mysql2/promise` dependency.
Node syntax checks and `git diff --check` pass. P1 is closed for this recovery
path. The only remaining P2 is environmental/integration follow-up: install the
missing dependency and rerun the excluded backfill test and broader repository
gate. No runtime state or business data was changed.

### Task 27: Item 1340 semantic conflict disposition — 2026-10-06 19:34 CST

The Owner approved the recommended read-only disposition for the remaining
Item-Buff source conflict as actor `admin`:

- disposition: `defer-semantic-conflict`;
- reason: `Iteminfo buffType=71` conflicts with the Buff `395` page source, so
  the current state is retained pending source correction;
- authorization reference: `buff-item-1340-review-20261006`;
- decision identity: `canonical-buff-item-1340-source-disposition-20261006-admin-01`.

The create-only owner-input and decision records bind proposal hash
`sha256:24ab8cbb38b5aab98b47eccf412f92f2e87bc2928a6d878dad78be3d216c67ab`
and request hash
`sha256:e05ace819b1fd0ca565df5f9d326def0a108e111798b7d0c744aac151c923995`.
The original `AWAITING_OWNER` request remains immutable. This disposition
keeps `(item_source_id=1340,buff_source_id=395)` absent, preserves the page and
Iteminfo/maint source spellings plus `buffType=71`, and leaves the `20`
shared-name NPC variants deferred. No packet, permit, runtime fence, scheduler
control, SQL mutation, alias, or source-payload rewrite was generated.

Validation completed: both JSON records parse; proposal file hash is
`sha256:24ab8cbb38b5aab98b47eccf412f92f2e87bc2928a6d878dad78be3d216c67ab`,
request hash is
`sha256:e05ace819b1fd0ca565df5f9d326def0a108e111798b7d0c744aac151c923995`,
owner-input file hash is
`sha256:a9f53dbabb133f3e8160481a9723f206a6da73142bb9e3b0e0ce9819b34635fc`,
and decision file hash is
`sha256:bbbc2c972b7da5e24bbb2d9d10ea51decf7a948eaab5399706aedd7febdb7831`.
The original request remains `AWAITING_OWNER`. `git diff --check` passes. A
fresh `START TRANSACTION READ ONLY` readback confirms server
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, `item_buff_relations=14`, no
active `(1340,395)` row, Buff `395` rows only for `1341/1342`, and local live
attempts/reservations/write-fences `0/0/0`. No packet, permit, fence, or SQL
write was generated.

### Task 29: Variant-scope-65 approved apply and retry recovery - 2026-10-07

The Owner approved the exact revision-bound variant scope for `65` stable NPC
identity `immune` relations and `0` deferred facts. The first packet admission
consumed its single-use decision but failed before journal preparation because
the runtime fence had not been acquired. It produced no journal, result,
fence, or business-table mutation and was not replayed.

The same approved scope was re-bound to retry-02 with a fresh request,
manifest, packet, and decision identity. The retry request hash is
`sha256:6f43c9bf074c52a5f800376ccdf27517b91fc005acb9d424059739d01a14c0a5`,
packet hash is
`sha256:ae5a7af6775bb2483fa2ffcc6e9b9bc41e15ab5b66c1b1cd39805dc9192f2393`,
execution-manifest hash is
`sha256:0d42045e8e455ffd4978757ff187c7be7d39961faac592f9da74f2d7313b7619`,
and decision identity is
`canonical-buff-npc-secondary-apply-20261007-variant-scope-65-retry-02-admin-01`.

The retry runner acquired the exact `local/npc_buff_relations/immune` fence,
committed `65` insert-only rows, wrote a `COMMITTED` journal, and released the
fence. Result/readback artifacts are
`reports/authorization/canonical/canonical-buff-npc-secondary-apply.retry-02.result.json`,
`reports/authorization/canonical/canonical-buff-npc-secondary-apply.retry-02.journal.json`,
and `.local/tmp/buff-npc-secondary-independent-readback-20261007-variant-scope-65-retry-02.json`.
Independent readback confirms `1643 -> 1708`, exact after hash
`sha256:dbc0834c1df54ac24404fd1a2b57799b07196970f6b0f67cea69f70232e3a1c2`,
`65/65` present, zero missing/wrong/duplicate, and final
attempts/reservations/fences `0/0/0`; Redis DB14 returned `PONG`. The retry
decision is consumed once and no permit artifact remains. Durable audit:
`docs/audits/2026-10-06-buff-npc-secondary-variant-scope-65.md`.

### Task 28: Shared-name NPC variant scope 65 - 2026-10-06 23:02 CST

The revision-bound Npcinfo evidence was rechecked against the four groups that
were deferred after the `identity-scope-94` apply. The same Npcinfo data
revision `1022313` and its bound semantic pages identify every stable variant:
Lunatic Cultist `439/440`, Martian Saucer `392/395`, Phantasm Dragon
`454-459`, and The Destroyer `134-136`. The exact five Buff facts are present
for each variant after applying the documented `buffImmuneAll` and
`buffImmuneAllNotWhips` semantics.

Read-only evidence is
`.local/tmp/buff-npc-secondary-variant-identity-evidence-20261006-v1.json`
with file SHA-256
`sha256:c47efe3c15ae96f3a8dce99fbb363a31ad5980451f5db452649dc1399c0c01e5`.
It contains `65` stable-ID facts and `0` deferred facts, and records the raw
Npcinfo hash `sha256:0c3a474f7b0f0034bc62183b2a0ae1b00c13f47527f109f24e8e8a536fec2a3a`.

The new candidate
`.local/tmp/buff-npc-secondary-candidate-20261006-v5.json` has file SHA-256
`sha256:99e1ea9f8b165cc4b3a013940e853c49a959362f353a0e8be17036500a37c75e`.
The one-snapshot MySQL read-only baseline is `1643` active rows with hash
`sha256:8ed1d4e5999c46c04b8f4819f13d4d1c32d7170b0ae41855d0fb026fe0984614`;
the candidate plans `65` insert-only `immune` rows and after-set `1708` with
hash `sha256:dbc0834c1df54ac24404fd1a2b57799b07196970f6b0f67cea69f70232e3a1c2`.

Proposal
`reports/authorization/canonical/canonical-buff-npc-secondary-apply.variant-scope-65.proposal.json`
has SHA-256
`sha256:88aa18f3701e3eda37be2bc510225bd1828c8fada81856ba7d25afae81fb66d9`.
The new request
`reports/authorization/canonical/canonical-buff-npc-secondary-apply.variant-scope-65.request.json`
is `AWAITING_OWNER` with request hash
`sha256:fa106bdaa793c565358c8d4783b7c80f7f507f10698ffe0a25f169347f331cd3`
and expiry `2026-10-07T15:01:38.564Z`. Execution-manifest hash is
`sha256:7a041d48ccaa26fd5aaa216c2ec80fc8ce301c55192f1411c6a39a6bee92fef9`.

Runtime readback remained read-only: MySQL server
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, owner `admin/ACTIVE`, live
attempts/reservations/fences `0/0/0`, and Redis DB14 `PONG`. No packet, permit,
fence acquisition, journal, SQL, Redis, scheduler, landing, maint, relation,
or projection write was performed. Durable audit:
`docs/audits/2026-10-06-buff-npc-secondary-variant-scope-65.md`.

Validation: revision-bound Npcinfo plus secondary candidate/apply/runner tests
pass `15/15`; candidate/proposal validation, syntax checks, and `git diff
--check` pass. Only explicit owner approval for the exact request may proceed
to packet, permit, fence, apply, and independent after-set readback.

### Task 30: Post-apply Buff runtime and source-contract review - 2026-10-07

A fresh `START TRANSACTION READ ONLY` snapshot on server
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306` verified
`trx_is_read_only=1` and was rolled back after inspection. Active counts are
`maint_buffs/relation_buffs/projection_buffs=400/400/400`, IDs `389-400`
`12/12/12`, `item_buff_relations=14`, and `npc_buff_relations=1708` with
`1559 immune` and `149 inflicts`; active write fences are `0`. Item pair
`(1340,395)` remains absent.

The inflicts rows contain five duplicate `(npc_source_id,buff_source_id,
relation_type)` pairs: Queen Bee `222` with Poisoned `20`, Duke Fishron `370`
with Bleeding `30` and Rabies `148`, and Deerclops `668` with Slow `32` and
Frozen `47`. Each pair has different record keys but identical remaining
relation/lineage fields. Four pairs have only one current maint source fact;
Poisoned/Queen Bee appears twice in that source list. The legacy relation rows
use `terrapedia.generated/buffs.standardized`, landing `18627`, and have no
source revision timestamp. Public Buff assembly returns the rows without
`DISTINCT` and sets `inflictingNpcCount` from the list size, so the duplicate
pairs are visible in the response and exceed the distinct identity count by
five. No cleanup was performed; it needs separate source review and governed
authorization. Durable audit: `docs/audits/2026-10-07-buff-runtime-state-after-npc-applies.md`.

Validation: `node --test pipelines/fetch/*buff*.test.mjs
pipelines/relation/*buff*.test.mjs pipelines/automation/*buff*.test.mjs`
passes `403/403`; `git diff --check` passes. No crawler, API runtime smoke,
quality gate, or database/control-plane write was run. The active Buff follow-up
is the separately scoped review of these legacy duplicate inflicts rows; the
Item `1340` semantic conflict remains deferred.

### Task 31: Deduplicate identical generated NPC inflicts facts - 2026-10-07

Added failing-first regressions showing that repeated identical facts for one
NPC/Buff/duration generated duplicate relation rows, while a distinct duration
must remain separate. The relation processor now deduplicates on canonical
NPC/Buff identity, relation type, duration, chance, and conditions while
preserving the existing source-order `record_key` format for stable sync
matching. Existing relation rows were not changed: all five legacy duplicate
pairs remain in the runtime and need a separate source/data disposition plus
governed authorization before cleanup. Item `1340` remains deferred; Armor
remains owned by its separate worktree.

Validation: the new test failed first with three rows instead of two, then
`node --test pipelines/relation/secondary-relation-processor.test.mjs` passed
`13/13`; the Buff fetch/relation/authorization regression passed `403/403`;
both changed modules passed `node --check`. No database, Redis, authorization,
packet, fence, or runtime write occurred. See git for code-level diff details.

### Task 32: Source-order-bound legacy inflicts dedup request - 2026-10-07

The first Task 19 proposal selected lower-ID rows as keepers. Rechecking the
current maint source order showed that three canonical source keys belong to
higher-ID rows, so the v1 request is superseded and must not be approved. The
proposal now binds the five active maint_buffs source rows, derives the keeper
key from the first matching inflictingNpcs occurrence, and validates the
source snapshot and full relation baseline under transaction locks before
permit consumption. Drift rolls back before permit use or mutation.

The fresh read-only proposal
reports/authorization/canonical/canonical-buff-npc-infliction-dedup.task19-v2.proposal.json
has file SHA-256
sha256:28fb8fb48e643169e71747f8287c6ad81b7c4e96ff97db11936acddf0ffbe15e,
scope hash
sha256:5aa42ce41393d63de4ddb5f8f33bd367da3cd277fbc84eb34bae88e37a13398b,
and plans to retain 904/444/471/773/575 while soft-retiring 1219/393/627/232/457.
It preserves 1708 active relation rows as a baseline and proposes 1703
afterward. The exact owner request is
reports/authorization/canonical/canonical-buff-npc-infliction-dedup.task19-v2.request.json,
hash sha256:3e5be3b7ee01ba3b2238686e1139f2f1aaddfd3e0acec9254037e99fcf547576,
status AWAITING_OWNER, expiry 2026-10-08T04:01:54.892Z. Durable audit:
docs/audits/2026-10-07-buff-npc-infliction-dedup.md.

Validation passes: core/runner/registration 17/17, broad Buff
fetch/relation/automation 421/421, syntax checks, and git diff --check.
Both fresh MySQL snapshots were read-only and rolled back. No packet, permit,
fence, journal, or SQL write was created. Next action: wait for approval of the
exact v2 request/proposal hashes; then run fresh preflight before execution.

### Handoff state — 2026-10-07 12:24 CST

Observed worktree is `/home/lolben/TerraPedia/.worktrees/automation-domain-buff`
on `feat/automation-domain-buff`, HEAD
`0a23fab31914aa0a6d79779c758243d74f342f74`, with no upstream configured. Git
reports zero staged changes, 42 modified tracked files, and 752 untracked files;
all pre-existing dirty paths and generated artifacts are retained. No cleanup,
stash, commit, or worktree operation was performed.

At this historical handoff checkpoint, Task 19 v2 was `AWAITING_OWNER`, generated at
`2026-10-07T04:01:54.892Z` and expiring at `2026-10-08T04:01:54.892Z`. No
matching decision is recorded in `reports/authorization/canonical/used-decisions.json`.
The approval must bind request hash
`sha256:3e5be3b7ee01ba3b2238686e1139f2f1aaddfd3e0acec9254037e99fcf547576`
and proposal file hash
`sha256:28fb8fb48e643169e71747f8287c6ad81b7c4e96ff97db11936acddf0ffbe15e`.
No packet, permit, journal, fence acquisition, or database write exists for
this dedup operation. After exact approval, repeat server, policy, source,
relation, and fence preflight before generating execution authority.

### Task 19 v2 approval and runtime blocker — 2026-10-07 14:23 CST

Owner approval was received in the current session and binds the exact v2
request hash `sha256:3e5be3b7ee01ba3b2238686e1139f2f1aaddfd3e0acec9254037e99fcf547576`
and proposal file hash
`sha256:28fb8fb48e643169e71747f8287c6ad81b7c4e96ff97db11936acddf0ffbe15e`.
The approval is recorded as private owner-input
`.local/tmp/buff-npc-infliction-dedup-task19-v2-owner-input.json` with actor
`admin` and decision identity
`canonical-buff-npc-infliction-dedup-20261007-admin-01`; the original request
artifact remains unchanged.

Fresh preflight confirmed the configured formal target is `127.0.0.1:13306`, but
TCP connection was refused. `start-local-stack.sh --reuse-existing` stopped at
the same database preflight. The installed MySQL server cannot be started by
this session because systemd/service is unavailable, `sudo` requires a password,
and the existing `/var/lib/mysql` datadir is owned by `mysql`; a copied or new
datadir would not be the approved formal database. No packet, permit, fence,
journal, or SQL write was created. Next action is to restore the existing local
MySQL service, then rerun server/policy/source/relation/fence preflight and
continue authorization/apply/readback in one sequence.

### Task 19 v2 execution and closeout - 2026-10-07

MySQL was restored and the exact v2 scope was revalidated read-only: server
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, policy hash
`sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`,
source artifact `sha256:0a166d9006780720b85c93a8447e400a774bcaa57cf80b8125d49406a91a4cbc`,
maint source `sha256:fcecb7572806a574f6c8857f26f500018f3c9bce2e1c125415d4690f1f997655`,
and relation baseline `1708` / `sha256:f0b7a7721639b64f71a3ff5a7d096f174d52142ce4ed40dcd017477e04f9172f`.

The first dispatch consumed admin-01 before discovering the missing fence and
did not mutate business rows. Retry-02 acquired the fence but rolled back at
the exact after-set check because MySQL auto-updated `updated_at`; ten target
rows remained unchanged. A failing-first regression was added and the fixed
UPDATE now uses `updated_at = updated_at` while its proposal still declares
only `status` and `deleted` as changed columns.

Retry-03 regenerated the code-bound manifest/request/packet against the same
approved proposal and original expiry window. Decision
`canonical-buff-npc-infliction-dedup-20261007-admin-03` committed packet
`sha256:ab756641db304f2cc4354acc8f9a5310f8f3cacae888ac6847f1cff1fbb5747f`.
Result/journal/readback are `COMPLETED`/`COMMITTED` with five retirements and
after-set hash
`sha256:750a5bc878f128f0d342a448002572d5dc38986c8dcaf644ea8bc876c8f5abf9`.

Independent SQL readback confirms active rows `1708 -> 1703`; retained
`904/444/471/773/575` remain active; retired `1219/393/627/232/457` are
soft-retired; the complete after-set hash matches; and all ten `updated_at`
values are unchanged. The exact relation fence was released after readback
and the scope has zero active fences. No v1 authorization was used. See the
durable audit `docs/audits/2026-10-07-buff-npc-infliction-dedup.md` for artifact
hashes and the two failed-attempt records.

Validation: focused relation/runner/registration `17/17`, real MySQL rollback
reproduction, `node --check`, and `git diff --check` pass. Task 19 execution is
complete; remaining Buff follow-ups retain their existing scope and status.

### Task 33: Post-Task-19 Buff continuation verification - 2026-10-07

The current Buff state was rechecked after Task 19 closeout. Task 20's approved
zero-baseline/full-chain publication for Buff IDs `389-400` is complete, so its
earlier insert-only candidate is historical evidence rather than an open gate.
The remaining Item `1340` source conflict is unchanged: the Buff `395` page uses
`FlaskOfVenom`, while Iteminfo and `maint_items` bind source ID `1340` to
`FlaskofVenom` with `buffType=71`. The existing Owner decision remains
`defer-semantic-conflict`; no Item-Buff write is authorized by that decision.

The full Buff fetch/relation/automation regression passes `421/421`. No packet,
permit, fence, SQL, scheduler, Redis, landing, maint, relation, projection, or
Item-Buff write was created in this verification. A future override must create
a new exact Item-Buff proposal and authorization with explicit justification;
Task 19 decisions and the existing defer decision cannot be reused.

### Task 34: Iteminfo-owned Buff 1340 correction - 2026-10-07

The user corrected the source semantics: Item `1340` `FlaskofVenom` applies
Buff `71` `WeaponImbueVenom`; Buff `395` `PotentAcid` is a debuff and must not
own that item. A failing-first regression in
`pipelines/fetch/fetch-wiki-buffs.test.mjs` demonstrated that parsed Buff-page
causes incorrectly overrode complete semantic Iteminfo `buffType` ownership.
`buildBuffRecords` now gives complete semantic Iteminfo scope precedence while
preserving ordinary page and fallback precedence outside that scope.

The focused Iteminfo/fetch tests pass `31/31`; the full Buff
fetch/relation/automation regression passes `422/422`; the changed fetch module
passes `node --check`; and `git diff --check` passes. No source fetch or data
write occurred.

A fresh read-only database snapshot found relation/projection Buff rows `400/400`,
Buff 395 source items `1341/1342/1340`, Buff 71 relation source item `1340`,
projection Buff 71 `source_item_count=0`, and no active `item_buff_relations`
row for `(1340,71)`. The correction candidate is
`.local/tmp/buff-source-correction-candidate-20261007-v1.json`, with candidate
hash `sha256:dc500963e7722d1f368fb8fe1a7fae1e2a756f0e993f1409ab9faed8263431af`
and four changes: remove 1340 from Buff 395 relation/projection, set Buff 71
projection count to 1, and insert `(1340,71)`.

The new exact request is
`reports/authorization/canonical/canonical-buff-full-chain.item-1340-ownership-correction-20261007-v1.request.json`
with request hash
`sha256:dc8e8ca5aac462485a18ed973092bb6843e57fbe34d4a336e13ab51c45c58785`.
It binds proposal
`reports/authorization/canonical/canonical-buff-full-chain.item-1340-ownership-correction-20261007-v1.proposal.json`
with file hash
`sha256:98f3d9b0057bad224b73d4c6660f406bb4ce342f9ae46a19a6a5f955b6a1aba7`,
manifest hash
`sha256:6e6e4c089e7942a2ed27a9418a087e3e8dbf272eaaaceffc96700ff642a05c79`,
and expiry `2026-10-07T10:35:49.591Z`. The request has no missing technical
fields. A target fence is held only to bind the exact manifest; no packet,
permit, journal, or business-table mutation exists. After approval, repeat
server/policy/source/relation/fence preflight, create execution authority, apply,
release the fence, and independently read back all affected layers.

The exact request was subsequently approved by the Owner with decision identity
`canonical-buff-full-chain-item-1340-ownership-correction-20261007-admin-01`.
Fresh server, policy, source, relation, and fence checks passed before packet
admission. The canonical executor completed the four bounded changes with packet
hash `sha256:5876a2e7162a04bfc53c1aa12d1bdde9570e384e8bff6377f7e1dcfb45efa392`
and permit hash
`sha256:fbc3c97207d1b42b14ec13fd632924bac70cea6d74599cb131549be4ec834014`.
Result is `COMPLETED`; journal is `COMMITTED`. The independent readback
`.local/tmp/buff-source-correction-independent-readback-20261007-v1.json` has
SHA-256
`sha256:46a7f3e0c21c10df9eab9b5e00eb9ea0885b40303530d692ed868916e5543cf6`.
It confirms relation/projection Buffs `400/400`, Item-Buff active rows `15`,
NPC-Buff active rows `1703`, Buff 71 owns Item 1340 exactly once, Buff 395
contains only Items 1341/1342, `(1340,395)` is absent, and the correction fence
is released with zero active fences. Result and journal hashes are
`sha256:c91da03b1f80072ba95d2a680e20f08d32cac711a2707c58573409b55cb869e7`
and
`sha256:2d501fe6a4bd194da98258831fdf1da3fd3aa16911bf7f86ed50d9d66081765f`.

Validation after execution: the focused correction/fetch/relation/automation
regressions remain green (`31/31` focused Iteminfo/fetch and `422/422` Buff
fetch/relation/automation), changed-module syntax checks pass, and
`git diff --check` passes. No additional source, scheduler, Redis, landing, or
maint write was performed. The prior `defer-semantic-conflict` decision is
superseded for this exact corrected scope and must not be replayed.

### Task 34 source-layer review finding - 2026-10-07

The committed correction is complete for its authorized relation/projection
scope, but a fresh SELECT-only check found that the source layer remains stale:
`terria_v1_maint.maint_buffs.id=419` (`source_id=395`) still has
`major_value=3` and `raw_json.sourceItems` with `FlaskOfVenom`/Item `1340`.
`maint_buffs.id=71` already contains Item `1340`. The pure relation builder
reads `maint_buffs.raw_json.sourceItems`, so a future broad maint-to-relation
sync would derive 1340 back onto Buff 395 even though the current relation and
projection rows are corrected.

This is an open source-chain mismatch, not a failed Task 34 readback. Task 34's
exact owner authorization explicitly allowed no landing or maint write, and its
proposal has no `maint_buffs` mutation. No repair was attempted. Resolve it with
a new source/maint-bound candidate, fresh preflight, and a separate exact owner
approval; do not reuse the consumed Task 34 request, packet, permit, or decision.
The relation/projection correction remains independently verified, and active
runtime fences are `0`.

The same review also found provenance drift in the bounded relation correction:
the two retained 395 source-item entries still carry legacy `buff-page-causes`
markers, while the preserved 71 source evidence has no Iteminfo semantic
capture. The verified fetch contract would emit both rows from the complete
Iteminfo scope as `iteminfo-revision-bound`. The follow-up should therefore
regenerate the 71/395 source payload and evidence together with the maint update,
rather than patching only the count or relation membership.

### Task 35: Buff source-layer correction v5 - 2026-10-08

Owner approved the exact source-layer request with request hash
`sha256:b8ad675ea77a75047984c10f1ed4358201fdb9df36285ba24f5d852d2196f214`
and proposal file hash
`sha256:bede16e3c5f374f71629bfa2738be1349ace4dcadff093f0fa4726e0b05a9a80`.
The v5 operation used decision identity
`canonical-buff-full-chain-source-layer-correction-20261008-v5-admin-01` and
candidate `.local/tmp/buff-source-layer-correction-candidate-20261007-v2.json`
(`candidateSha256=sha256:cde16d1a831a0fe99e821e434f57ca979881daeec95087de1edbfa6d8c7657a7`,
file SHA-256 `sha256:f44cd395e22925b224c4ebcb98cfc35850746a374c797a0e0f5487982d14811e`).

The canonical full-chain executor committed the bounded landing, maint,
relation, and projection changes. Packet hash is
`sha256:140e8877db253509fbb88d7e7f862bc83a8b149e3bdf8523340e4da42926b0ad`;
result status is `completed`; journal state is `COMMITTED`. The consumed
decision is recorded once in `reports/authorization/canonical/used-decisions.json`.
The source landing is current at
`canonical.buff-page-immunity.buff-source-layer-correction-20261007-v2` with
content hash `6893c2c8217e069bb1107ef4d1051b954414c04f7853a91bef428f3ff1cc7f0b`.

Independent readback
`.local/tmp/buff-source-layer-independent-readback-20261008-v5.json` has SHA-256
`sha256:70531d44cd75bb16b0214da7ce3c4737126f13efbd635b75ee9b2783fe78de26`.
All 16 checks pass: server, owner, policy, landing, maint, relation,
projection, Item-Buff, counts, and fence release. Buff 71 owns Item 1340;
Buff 395 owns only Items 1341/1342; `(1340,395)` is absent; active counts are
`maint/relation/projection=400/400/400`, `item_buff_relations=15`, and
`npc_buff_relations=1703`; the correction fence is `0`. The readback deliberately
uses stable `internalName` mapping for legacy maint/relation source rows that do
not carry numeric item IDs. No additional write, scheduler, Redis, or source
fetch occurred.

Validation for this execution: independent SELECT-only readback, `node --check`
on the readback script, `git diff --check`, artifact hash/permission checks, and
final fence/count checks pass. The broader Buff regression remains at the prior
validated `422/422`; it was not rerun during this closeout.

### Handoff: Buff automatic-ingestion continuation - 2026-10-08 08:05 CST

#### Status

`active`

#### Observed

- Worktree is `/home/lolben/TerraPedia/.worktrees/automation-domain-buff` on
  `feat/automation-domain-buff`, HEAD
  `0a23fab31914aa0a6d79779c758243d74f342f74`, with no upstream, `0` staged,
  `42` modified tracked files, and `791` untracked files. Existing dirty paths
  and generated artifacts are retained; no cleanup, stash, reset, commit, push,
  merge, or worktree removal was performed.
- The v5 executor process has exited. The v5 source-layer result is
  `completed`, the journal is `COMMITTED`, and the exact correction fence is
  released. The independent readback has all 16 checks true.
- Readback evidence is
  `.local/tmp/buff-source-layer-independent-readback-20261008-v5.json` with
  SHA-256 `sha256:70531d44cd75bb16b0214da7ce3c4737126f13efbd635b75ee9b2783fe78de26`.
  It confirms current landing hash `6893c2c8217e069bb1107ef4d1051b954414c04f7853a91bef428f3ff1cc7f0b`,
  Buff 71 source item `1340`, Buff 395 source items `1341/1342`, Item-Buff
  `1340 -> 71` only, and counts `400/400/400/15/1703` for
  maint/relation/projection/Item-Buff/NPC-Buff active rows.

#### Recorded

- v5 request hash is
  `sha256:b8ad675ea77a75047984c10f1ed4358201fdb9df36285ba24f5d852d2196f214`;
  proposal file hash is
  `sha256:bede16e3c5f374f71629bfa2738be1349ace4dcadff093f0fa4726e0b05a9a80`.
  Decision identity
  `canonical-buff-full-chain-source-layer-correction-20261008-v5-admin-01`
  is consumed once. Packet hash is
  `sha256:140e8877db253509fbb88d7e7f862bc83a8b149e3bdf8523340e4da42926b0ad`.
- v5 artifact hashes: proposal
  `sha256:bede16e3c5f374f71629bfa2738be1349ace4dcadff093f0fa4726e0b05a9a80`,
  request file `sha256:d314ccd5916fbd3badfaaf2df1393b7e984d13e86f408216f1ce2e1cd78a28f7`,
  packet `sha256:6d13adbcd49a438e05bb6db2166c6a79d5b56e2bfdfaf2bac890752009cce1d3`,
  result `sha256:6c3598da6ae453a54ca99ebb98c8a51ef3eb8a73650da4148c10f6ba318d2ee5`,
  journal `sha256:05b567dbe54cb77e2f251cfd0509faef9cf620707178d73b20de65140836d79b`,
  envelope `sha256:6b358c227fea6eda79ce5008a1be91cf7fc190d27303346b35383e079c43208d`.

#### Unknown or not yet accepted

- The one-shot Buff source-layer correction is not proof of scheduler-owned
  automatic ingestion. Automatic acceptance remains open: scheduler control
  state needs a fresh authenticated preflight; no current natural Buff tick,
  real nonzero scheduler-owned Buff delta, or sustained soak is recorded in
  this handoff.
- A read-only attempt to query a guessed `crawler_automation_scheduler_control`
  table returned MySQL `1146` because that table does not exist; do not treat
  this as scheduler-state evidence. Use the supported authenticated preflight
  endpoint and current V2 runtime readback in the next session.

#### Next safe action

1. Re-read `AGENTS.md`, current spec, workflow, this entry, and
   `docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md`.
2. Run a fresh read-only Phase 0/preflight for the scheduler-owned Buff path,
   binding server UUID/port, V2 epoch/namespace, policy H8, source readiness,
   current code/manifest hashes, owner state, Redis DB14, live attempts/claims,
   and active fences.
3. Reconcile the fresh Buff automatic runner contract against the current
   catalog. If a new scheduler authorization is required, build one complete
   request/packet and ask for approval once; do not ask for approval between
   preflight, packet, apply, and readback.
4. Keep scheduler disabled until the fresh authorization is valid. Then prove
   a natural tick, a real nonzero Buff-owned change through the full chain, and
   terminal readback. Do not use manual sweep, synthetic timestamps, consumed
   decisions, or the v5 one-shot artifacts as automatic-ingestion proof.

#### Validation at handoff

- `node --check .local/tmp/independent-readback-buff-source-layer-v5.mjs` passed.
- `git diff --check` passed.
- Independent v5 readback checks passed `16/16`.
- Final SQL summary confirmed landing current, relation/projection source items
  `71=[1340]`, `395=[1341,1342]`, Item 1340 linked only to Buff 71, NPC-Buff
  active `1703`, and correction fence `0`.
- Broad Buff regression remains the previously recorded `422/422`; it was not
  rerun during this handoff. No new database, Redis, scheduler, crawler, or
  import write occurred during handoff preparation.

### Scheduler continuation: fresh L2 and activation request - 2026-10-08 08:52 CST

The expired L2 decision set was renewed under standing AUTH-04. The first
attempt using retry `83` was rejected before transaction write because the
historical source-hash disposition authorization had expired on 2026-10-06;
no result, commit marker, or business row was written. New candidate/Owner
packet/disposition artifacts were created for Items, Projectiles, and Shimmer.
The approved disposition artifacts are
`c78412e08a96565e0aa3ae2b6c949efa1e09a7a0aebbf73b1717f386018d28a2`,
`4b2140294061ba04f5a6fb81285d5903c588fde1b095141f37b67d51f4dd9cbd`, and
`4a39bae1143d3f4f0f8c89c30b5ee61e63d6f4d47e72c700965bd9bba104dca6`, all
valid through `2026-10-09T00:48:09.467Z`.

Fresh L2 reauthorization packets were then created and executed serially for
retry `91..98` (Items, NPCs, Projectiles, Armor Sets, Buffs, Audio, Bosses,
Shimmer). Each decision has a committed publication marker, `successfulL1Runs=3`,
current H8 `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`,
and expiry `2026-10-09T00:48:48.874Z`. Independent SQL checks after each
decision found attempts/reservations/fences `0/0/0`.

The source-readiness panels were regenerated in the backend primary report
root `/home/lolben/TerraPedia/reports/domain` at `2026-10-08T00:52:31.283Z`.
Fresh authenticated scheduler preflight
`.local/tmp/buff-scheduler-phase0-20261008T005244Z.json` is disabled,
changed-only, healthy, H8-bound, and reports all eight domains `eligible`;
V2 epoch remains `epoch-29a8486b-b3df-45a7-a496-28286e5da91b` and namespace
remains `terrapedia:crawler:wiki-monitor:v2:`. Contract validation passed
`136/136`.

Scheduler activation preflight retry-58 has hash
`sha256:54d053947933b7838bf30182ffd88226c243ed3c83f0706e342e3080e40eb4e9`,
and its proposal is read-only and bound to the exact eight eligible domains,
T1 report, current H8, server, queue state, and code bundle. The fresh Owner
request is
`reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-58.request.json`
with request hash
`sha256:84fa495cfbe3c6f0ae7efb051a75428b3055665ac6e47d9cd5d86dd89094ddde`;
it is `AWAITING_OWNER` and expires 24 hours after its current generated time.
No scheduler activation packet, control mutation, natural tick, or Buff
business change has been executed.

### Retry-61 scheduler activation outcome - 2026-10-08

The user authorized continuation with `AUTH-08`. A fresh read-only TOCTOU
check passed before decision consumption: API and MySQL agreed that the
scheduler was disabled and changed-only, H8/epoch/namespace matched the packet,
the `admin` owner was ACTIVE, the retry-61 decision identity was unused, live
attempts/reservations/active local fences were `0/0/0`, the reconciler was
healthy, Redis DB14 was reachable, and no Buff writer was active. Evidence:
`.local/tmp/buff-automation-retry-61-toctou-1791443579071.json`.

The formal policy decision command completed authoritatively at
`2026-10-08T07:13:41.876Z`. SQL readback confirmed
`SCHEDULER_ACTIVATION`, decision identity
`automation-crawler-v2-scheduler-activation-20261008-retry-61-admin-01d770f3-bdd8-430b-95f4-69d98fb2c725`, canary
`buff-page-immunity-refresh`, H8, packet hash
`sha256:321b0dac30a0844b191be17cb97b686eea110a8573399ed7aa764ae845f276b0`,
and future expiry. The fresh pre-enable evidence passed all assertions,
including execution-manifest hash
`sha256:ce5366becc920834bdb5c20e3615e76aaf822356983445fb1417011b3568406a`
and server fingerprint: `.local/tmp/buff-automation-retry-61-pre-enable-1791445600361.json`.

The authenticated scheduler PUT enabled exactly one changed-only window with
Buff canary `buff-page-immunity-refresh` and interval 60 minutes. A natural
sweep at `2026-10-08T07:48:09.337Z` accepted Buff attempt
`attempt-0381a0bb-3614-4d29-a42b-49e8c939ac0f`; no manual sweep, force refresh,
direct Redis write, or external daemon was used. The attempt heartbeat and
Redis V2 state remained healthy while the source runner advanced through the
400-page immunity phase. It reached `399/400`, then terminated as
`PROCESS_EXIT_NONZERO` with `381/400 buffs 完成`; the remaining pages repeatedly
failed with `The operation was aborted due to timeout`. The retained attempt
manifest records `reasonCode=PROCESS_EXIT_NONZERO`, `exitCode=1`, and no
`reportPath`/`outputPath`. Evidence is the attempt directory
`reports/crawler-monitor/v2/2026-10-08/attempt-0381a0bb-3614-4d29-a42b-49e8c939ac0f/`,
the failure log within it, and observation artifacts:
`.local/tmp/buff-automation-retry-61-natural-tick-observation-1791446294686.json`
and `.local/tmp/buff-automation-retry-61-attempt-observation-1791450105101.json`.

The attempt was terminally failed and its Redis state was reclaimed. Read-only
MySQL checks found no automation run/attempt/reservation rows for this natural
attempt and zero active local fences. A filesystem scan found no new landing,
maint, relation, projection, or import output; only source resume/partial
artifacts and attempt evidence were produced. The scheduler was restored via
authenticated PUT at `2026-10-08T09:05:08.867Z`; final API readback is
`enabled=false`, `mode=changed-only`, `liveAttempts=0`, `sweepClaims=0`, and
healthy reconciler. Evidence:
`.local/tmp/buff-automation-retry-61-disable-response-1791450308867.json`.

#### Result and next gate

Retry-61 proves decision consumption, natural dispatch, V2 lease/heartbeat,
terminal failure handling, and rollback to disabled. It does **not** prove
automatic Buff ingestion or any nonzero business change. Retry-61 packet,
decision, and source attempt must not be replayed. The next run requires a
fresh Phase 0/preflight, a newly generated scheduler request/packet, and a new
owner approval after resolving the source timeout/retry failure. Scheduler
must remain disabled until those gates are complete.

### Retry-68 scheduler continuation and restart soak — 2026-10-09

The fresh retry-68 activation was authorized under decision identity
`automation-crawler-v2-scheduler-activation-20261009-retry-68-admin-6512c9c7-afb5-439b-9ef1-d7d53c487351`.
The packet hash is
`sha256:47098eeb5834c3a689e5d82a16802e4f050adf06bd9d2b642bf818edf47d2b5b`;
the preflight hash is
`sha256:24f2f09aab2b1dd48e5795ad56282c47c5d56ebe3bc3240b48b87fcb19b832ac`.
The packet used the Buff canary `buff-page-immunity-refresh`, changed-only
mode, and the same H8/epoch/namespace. No retry-61/63/64/65/66 decision was
reused.

The natural dispatch created attempt
`attempt-aa158c4f-3791-43b3-9c1b-6e7aadb912a4` and queue
`queue-6078a29b-cc35-457e-b6ab-78aa835c1433`. The source progress reached a
terminal `completed` state and the automatic run was
`buffs_l1_auto_0b98f7575a54596d6c09357e800cbb55`. Its committed owned-table
readback reports generation `6` for both `buff_source_items` and `buffs`,
complete source coverage, terminal progress, zero unclassified mutations, zero
unauthorized mutations, and zero active/overdue attempts. The run produced no
business DML: inserts `0`, updates `0`, relationship deletes `0`; the source
and local owned-table baseline both remained `buffs=388` and
`buff_source_items=380`. The scheduler's last sweep records
`automatic_attempt_completed` and no duplicate dispatch.

The automatic runner left its two committed full-table fences until their
finite deadline. After verifying the run ID, committed generation `6`, and
bundle commit marker `02b8d5a9df86d6e1c5696a38060ec172a03b1a2495649d8cf155b7bdf1c601d3`,
the existing `table-ownership-fence.releaseFence` helper released only the
Buff `buff_source_items` and `buffs` rows. The release artifact is
`.local/tmp/buff-automatic-fence-release-20261009.json`; post-release SQL
readback shows active fences `0`.

The Buff backend was restarted as the soak step. Buff PID `4060206` listens on
`18105`; Armor PID `3736528` continues on `18104`. The post-restart artifact
`.local/tmp/buff-backend-restart-soak-post-fence-release-readback-20261009.json`
records authenticated preflight HTTP `200`, `enabled=false`, unchanged H8,
epoch `epoch-29a8486b-b3df-45a7-a496-28286e5da91b`, namespace
`terrapedia:crawler:wiki-monitor:v2:`, healthy reconciler, MySQL server
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, live attempts/reservations/fences
`0/0/0`, Redis DB14 `PONG`, and live V2 attempt index cardinality `0`. The
Actuator endpoint returned `503 {"status":"DOWN"}` because the local
`MailHealthIndicator` has no SMTP password; MySQL, Redis, preflight, scheduler
control, and Buff APIs remained available. This is retained as an environment
warning, not treated as a scheduler-chain failure.

Independent API/SQL readback covers the current downstream boundary:
`/public/buffs/71` exposes Item `1340`; `/public/items/1341/buff-effects` and
`/public/items/1342/buff-effects` expose Buff `395`; and NPC `134` aggregate
readback returns `12` Buff relations. The local Buff table still has `388`
rows while maint/relation/projection each have `400`; therefore
`/public/buffs/395` remains `404`, and relation compatibility remains
`blocked` with 12 projection-only Buff extras. The relation health report is
old but readable with no blocking checks and one warning (`296` unresolved
relation audits).

#### Retry-68 result and remaining gate

Retry-68 proves fresh packet admission, one natural dispatch, source terminal
completion, committed automatic reconciliation, fence cleanup, disabled-state
readback, and restart recovery. It does **not** prove a real nonzero Buff-owned
change, local `388 -> 400` completion, full Buff API parity, multi-cycle/expiry
soak, or unattended automatic ingestion. Scheduler remains disabled. A future
activation needs a genuinely changed source snapshot (or an explicitly
authorized bounded data operation) and must re-run full landing -> maint ->
relation/projection -> API/SQL readback plus multi-cycle, expiry, and restart
soak; this retry-68 packet and run are consumed and must not be replayed.

### Retry-71 natural tick and disabled restart verification - 2026-10-09

Retry-71 consumed the fresh scheduler decision under packet hash
`sha256:0404d05290e1f92dfb0324fe56a4c48ffad55e392b7f22127d5fee4be2d888ee`
and H8 `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`.
The backend was started with scheduler polling enabled and the authenticated
PUT set exactly the Buff changed-only canary. A real natural scheduler sweep
completed at `2026-10-08T21:31:41.235627020Z`; its source monitor completed at
`2026-10-08T21:31:41.410Z` with Buff `changed=false` because the current
`wiki.page.template_getbuffinfo` fingerprint remained equal to the ingested
manifest (`a512db8c...`). The sweep detected no Buff change and dispatched no
attempt. No manual sweep, synthetic timestamp, direct Redis write, or source
manifest rewrite was used.

The scheduler was disabled through the authenticated API at
`2026-10-08T21:38:39.333Z`. Post-disable preflight and a fresh backend restart
readback both report disabled control, unchanged epoch
`epoch-29a8486b-b3df-45a7-a496-28286e5da91b`, namespace
`terrapedia:crawler:wiki-monitor:v2:`, H8, `liveAttempts/sweepClaims=0/0`,
healthy reconciler, Redis DB14 `PONG`, and no live-attempt index. Independent
SQL readback remains `local buffs/buff_source_items=388/380`,
`maint/relation/projection=400/400/400`, `item_buff_relations=15`, and
`npc_buff_relations=1703`; active run attempts/reservations/fences are
`0/0/0`. Evidence is in `.local/tmp/buff-automation-retry-71-*20261009.json`,
`reports/crawler-monitor/v2/automation-last-sweep.json`, and the disabled
restart log `.local/logs/buff-backend-retry-71-disabled-restart-20261009.log`.

Retry-71 proves a fresh natural tick and disabled restart recovery, but it does
not prove a real nonzero Buff-owned mutation or unattended automatic ingestion.
The remaining gate requires an actual upstream Buff source delta (or a newly
authorized bounded data operation), followed by natural dispatch, terminal
landing -> maint -> relation/projection -> API/SQL readback, and multi-cycle,
expiry, and restart soak. Scheduler remains disabled pending that evidence.

### Fresh Phase 0 and upstream delta check - 2026-10-09 07:24 CST

The continuation resumed the actual Buff worktree and first verified the
recorded branch/HEAD and dirty scope. The Buff backend was restarted on
`18105` with the formal `terria_v1_local` MySQL target at `127.0.0.1:13306`,
shared Redis `6380` logical DB14, and both queue-V2 roots bound to this
worktree. The first launch failed before Spring context initialization because
the fallback token-secret example was only 30 characters; it created no
database, Redis, scheduler, or business mutation. A second launch inherited the
existing valid runtime secret environment and started successfully. The health
endpoint returned HTTP 200.

Fresh authenticated preflight and independent readback then confirmed:

- scheduler control is `enabled=false`, `mode=changed-only`, with H8
  `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`;
- V2 epoch is `epoch-29a8486b-b3df-45a7-a496-28286e5da91b`, namespace is
  `terrapedia:crawler:wiki-monitor:v2:`, and the reconciler is healthy;
- MySQL server is
  `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, Owner is `admin ACTIVE`, and
  active attempts/reservations/fences are `0/0/0`;
- Redis DB14 returns `PONG` and the live-attempt index cardinality is `0`;
- SQL counts are local `buffs/buff_source_items=388/380`, and active
  maint/relation/projection Buff rows are `400/400/400`.

The fresh readback artifact is
`.local/tmp/buff-automation-phase0-fresh-20261009.json`, SHA-256
`sha256:0353855a47f09fc2858bb5c54d177b85b15a8b8e8f8029cf90e276439fd2d803`.

An isolated read-only source monitor checked all nine managed probes. Its
terminal progress is `completed`; 9/9 probes are healthy. For
`wiki.page.template_getbuffinfo`, current, previous, and ingested fingerprints
are all
`a512db8cc60378dcefed3e3f7905480fe6a60cb9e04ef3adf947cd5205d5aa57`, so
`changed=false`. The source state artifact is
`.local/tmp/buff-source-monitor-phase0-20261009-rerun1/state.json`, SHA-256
`sha256:efd3fc495206341497de2dbaad8cbcabf3d30b37ac48338dc3a7fff61fb0f76d`.
The other four changed probes are Biome, Bosses, Shimmer, and Audio; none is
the Buff canary.

Because no real upstream Buff delta exists, this phase intentionally generated
no scheduler request, packet, permit, decision, or control mutation. Scheduler
stays disabled. The next safe action is another fresh Phase 0 after the Wiki
Buff source fingerprint changes; only then may a new request/Owner approval and
natural-tick full-chain acceptance be considered. No manual sweep, synthetic
timestamp, direct Redis write, manifest rewrite, or consumed artifact was used.

### Redis DB14 split and DB16 Buff recovery - 2026-10-09 14:04 CST

The prior runtime contract incorrectly placed both Armor and Buff on shared
Redis `6380/DB14`. The active split is now explicit: Armor uses backend `18104`
and DB14; Buff uses backend `18105` and DB16. No Redis key was copied between
databases and no `FLUSHDB`/`FLUSHALL` was used.

Armor's durable marker was recovered through the authenticated
`recover-first-mutation` endpoint using confirmation
`RECOVER_CRAWLER_QUEUE_V2_FIRST_MUTATION` and reset id
`armor-first-mutation-recovery-20261009T053500Z`. The marker now retains
reservation `2026-10-08T02:26:55.218963811Z` and first mutation
`2026-10-08T02:26:55.241138411Z`, matching DB14. Armor was then restarted from
its own worktree jar with DB14 and its preflight returned HTTP 200 with epoch
`epoch-29a8486b-b3df-45a7-a496-28286e5da91b`, zero live attempts/claims, and a
healthy reconciler.

Buff started against an empty DB16 and was repaired only through the authenticated
`recover-state-store-reset` endpoint using reset id
`buff-db16-forward-repair-20261009T054100Z` and confirmation
`RESET_CRAWLER_QUEUE_V2_EPOCH`. The endpoint created Buff epoch
`epoch-275d5cda-a966-4e6c-8e07-f69aac972d3f`, preserved irreversible first
mutation metadata, and returned zero live V2 attempts. After removing the
temporary cutover switch, Buff was restarted from its own worktree jar on
`18105/DB16` with Spring scheduling enabled and scheduler control disabled; its
preflight returned HTTP 200, zero live attempts/claims, and a healthy reconciler.

The fresh Buff source probe
`.local/tmp/buff-source-monitor-phase0-db16-20261009/state.json` completed with
`probeHealthy=true`. It reports the Buff `Template:GetBuffInfo` fingerprint
`a512db8cc60378dcefed3e3f7905480fe6a60cb9e04ef3adf947cd5205d5aa57` as the
current Buff source identity, while several unrelated sources are marked
`missing_ingestion_manifest`. This is evidence of an incomplete canonical
manifest, not a verified Buff delta; no new scheduler request, packet, permit,
decision, dispatch, or business write was created.

The reconciler attention observed immediately after reset was traced to the
launch setting `SPRING_TASK_SCHEDULING_ENABLED=false`, which disabled the
reconciler itself. Restarting both services with Spring scheduling enabled while
leaving scheduler control `enabled=false` restored healthy reconciler status.
Future Buff launches must use DB16 and must not set the global Spring scheduler
off; scheduler control remains disabled until the real Buff delta and full
automatic-ingestion acceptance gates are satisfied.

The consolidated DB16 Phase 0 artifact is
`.local/tmp/buff-automation-phase0-db16-20261009.json` with SHA-256
`sha256:ca26717c78aa55088538acd18a74ce8143f442e9d0b7346c9ca33625f433efe9`.
Its checks all pass: API health 200, scheduler disabled, DB16, marker/preflight/
Redis epoch agreement, first-mutation agreement, zero live work, healthy
reconciler, unchanged Buff fingerprint, and no packet creation. The isolated
source state hash is
`sha256:944f9f4dbf92c6d44ea08866aa5c1b6c2606fba0882e04215ec9b813c0704e6a`;
the Armor DB14 baseline hash is
`sha256:c88263618a169400437eb0025c305fe54f5be8a37a49e43558825519bb6b5141`.

### Fresh DB16 probe and runtime blocker - 2026-10-10 11:05 CST

The continuation re-ran the source probe in an isolated output directory. The
first attempt reproduced transient source failures: Iteminfo returned Node
`fetch failed` and the Shimmer probe timed out. A direct `curl` request to the
same Wiki API succeeded over IPv4 while IPv6 connection attempts failed. The
probe was rerun with `NODE_OPTIONS=--dns-result-order=ipv4first`; it completed
`9/9` healthy with state
`.local/tmp/buff-source-monitor-phase0-db16-20261010-105717-retry/state.json`
(`sha256:6f01f86fc77e1993e9d79183b4b6099d38544db76c954ce34bfa3d9638971215`).
Buff `wiki.page.template_getbuffinfo` remains unchanged: current and ingested
fingerprints are both `a512db8c...`, `changed=false`. The four changed sources
are Biome, Bosses, Shimmer, and Audio; none is the Buff canary.

Static review found the ignored runtime file
`reports/crawler-monitor/v2/automation-config.json` still has
`enabled=false` but `canaryActionId=domain-source-armor-sets`. The prior Buff
preflight reports the same Armor canary. Redis DB16 isolation does not correct
this separate scheduler configuration mismatch. Do not edit the runtime file
directly; after MySQL is restored and Buff is running on `18105/DB16`, use the
authenticated automation API to set `buff-page-immunity-refresh` while keeping
`enabled=false`, then read it back before generating any new request.

The canonical read-only stack preflight then stopped at MySQL
`127.0.0.1:13306` with `ECONNREFUSED`; the existing `/var/lib/mysql` is owned
by `mysql:mysql` and this session has no non-interactive sudo privilege. No
replacement database, schema, or bypass was created. Redis was started from
the configured persistent directory only to verify isolation: DB16 returns
`PONG`, engine `v2`, epoch
`epoch-275d5cda-a966-4e6c-8e07-f69aac972d3f`, first mutation
`2026-10-08T02:26:55.241138411Z`, live attempts `0`, and sweep claims `0`.
The Buff backend did not use DB14, which remains Armor-owned. This continuation
did issue one accidental read-only DB14 comparison query; it wrote no keys, and
no DB14 access is part of the next steps. No backend, scheduler, crawler,
packet, permit, or business-table write occurred.

The stale ignored helper `.local/tmp/run-buff-capture-16.mjs` was found to
hardcode Redis DB14. It was corrected to DB16 and given an ownership comment;
the helper was not run, and no capture or Redis key write occurred. Static
search found no other active Buff launch path in source/scripts that selects
DB14.

The 2026-10-10 runtime blocker is resolved. MySQL is available again; Armor is
running on `18104/DB14` and Buff is running on `18105/DB16` with Spring
scheduling enabled. The Buff canary was corrected and independently read back
through the authenticated API as `buff-page-immunity-refresh`, while scheduler
control remains disabled.

### Fresh DB16 Phase 0 and manifest-bound source probe - 2026-10-10 12:35 CST

The fresh DB16-only Phase 0 artifact is
`.local/tmp/buff-automation-phase0-db16-20261010-rerun-v2.json` with SHA-256
`sha256:02bdf4b412e8fa9a0f689d9b2ca79f6d9dd10fbb678bec16fe7748e99585464e`.
All checks pass: authenticated API reads, scheduler `enabled=false`, Buff
canary, H8 `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`,
Buff epoch `epoch-275d5cda-a966-4e6c-8e07-f69aac972d3f`, fixed namespace
`terrapedia:crawler:wiki-monitor:v2:`, zero live attempts/reservations/fences,
healthy reconciler, MySQL server `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`,
Flyway V61, active Owner `admin`, Redis `6380/DB16`, and current 114-entry code
bundle. Active counts are local `buffs/buff_source_items=388/380`, maint,
relation, projection `400/400/400`, Item-Buff `15`, and NPC-Buff `1708` total /
`1703` active. The artifact is owner-only (`0600`) and records no writes.

The authoritative read-only source probe used the worktree manifest explicitly:
`.local/tmp/buff-source-monitor-db16-manifest-bound-20261010T042814Z-3078124/state.json`
(`sha256:fa479aeff83852c8212b3996c7b74f7d13e4519643db6ba0f2f2c079aac8584a`),
with report SHA-256
`sha256:cfa1a2767472121ae57a407e68104407c2c6b193860f134483d461f12dbca8cf`.
It is `probeHealthy=true`, `9/9` healthy, and has four changed non-Buff
sources: Biome, Audio, Bosses, and Shimmer. Buff
`wiki.page.template_getbuffinfo` remains equal to the ingested
`a512db8cc60378dcefed3e3f7905480fe6a60cb9e04ef3adf947cd5205d5aa57` with
`changed=false`.

A diagnostic probe without `--manifest-path` used the stale shared manifest
outside this worktree and reported `missing_ingestion_manifest` for Buff and
three other sources. It was kept as diagnostic evidence only and did not alter
the shared or worktree manifest. The Redis repository intentionally persists
engine, epoch, active-cutover, and first-live-mutation metadata; the namespace
is the fixed API/code contract and there is no `meta:namespace` Redis key. Buff
did not access DB14 in this continuation.

Because no real Buff source fingerprint delta exists, no new scheduler proposal,
request, Owner packet, permit, decision, scheduler enablement, natural tick,
landing, maint, relation, projection, or business-table write was generated.
Wait for a genuine Buff fingerprint change, then rerun fresh Phase 0 and create
exactly one new request/packet before a bounded natural tick. The automatic
ingestion acceptance and multi-cycle/expiry/restart soak remain open.

### Retry-73 readiness repair and DB16-only independent readback - 2026-10-10 12:46 CST

The continuation addressed the stale readiness observation without touching
the scheduler or business tables. A serialized read-only run of
`pipelines/workflow/domain-acceptance-generate-reports.mjs` refreshed all 32
panels for `items,npcs,projectiles,armor_sets,buffs,audio,bosses,shimmer` at
`2026-10-10T04:42:59Z`; the generator summary was `28 pass / 3 warning / 1
blocked / 0 missing`. The source-readiness panel for each of the eight
scheduler domains is `pass`, including Buff. The command output is
`.local/tmp/domain-readiness-refresh-20261010-retry-73-v2.json`, SHA-256
`sha256:280545c8aac5bcd03157736fb3c852c8c88aaa82393961dae046c90f9554bb06`.

Retry-73 preflight initially received HTTP `401` because the retained admin
token had expired. A new token was obtained through the existing local login
configuration and stored only in owner-mode file
`.local/tmp/buff-admin-token-retry-73.txt`; the failed request created no output
file. A first report refresh also used `2026-10-10T05:00:00Z`, which was in the
future relative to the runtime and was correctly rejected as
`wiki-items-refresh readiness observedAt is in the future`. The reports were
regenerated from current UTC and the same preflight then passed. The fresh
preflight is
`reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-73.preflight.json`,
SHA-256 `sha256:8d26ad402f69348e11c937cc45ae2e155d1bbea596bd74f661714138d4cb911c`,
with internal `preflightHash`
`sha256:23a11ceafec75b30dcea7e7c2c6a907825341021164d2d1bc88d05a1d1c31629`.
It is `0600`, binds the explicit Buff canary `buff-page-immunity-refresh`, and
keeps scheduler control disabled.

An explicit worktree-manifest source probe then ran with
`NODE_OPTIONS=--dns-result-order=ipv4first` and isolated output directory
`.local/tmp/buff-source-monitor-retry-73-044355/`. Its terminal state is
`completed`, `9/9` sources are healthy, and the Buff source
`wiki.page.template_getbuffinfo` remains
`a512db8cc60378dcefed3e3f7905480fe6a60cb9e04ef3adf947cd5205d5aa57` for
current, previous, and ingested values with `changed=false`. State SHA-256 is
`sha256:712ae2f88a360064c5bd6a85c80f31604db06b1d64b03014a243653dd4417169`;
progress is owner-mode and terminal.

Independent API, read-only MySQL transaction, Redis DB16, process, report
binding, and artifact checks are recorded in
`.local/tmp/buff-automation-retry-73-phase0.json`, SHA-256
`sha256:14b00688e56f80cad801fa3e6093a5403fef16c32725a5e81b0db65faf563ea0`.
All `26/26` checks pass: Buff is running on `18105` with Spring scheduling
enabled, scheduler control is disabled, H8 matches, the eight domain reports
are fresh and bound, epoch is
`epoch-275d5cda-a966-4e6c-8e07-f69aac972d3f`, Redis `6380/DB16` is `PONG`,
the fixed namespace is `terrapedia:crawler:wiki-monitor:v2:`, and live
attempts/reservations/fences are `0/0/0`. The Redis repository intentionally
has no `meta:namespace` key. MySQL remains server
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, Flyway V61, Owner `admin ACTIVE`;
counts remain local Buff `388/380`, maint/relation/projection `400/400/400`,
Item-Buff `15`, and NPC-Buff `1708` total / `1703` active.

Because the real Buff fingerprint did not change, retry-73 intentionally
created no proposal, request, Owner packet, permit, decision, scheduler
mutation, crawler dispatch, or business-table write. Buff used DB16 for every
runtime/probe/readback operation; DB14 was not accessed and remains Armor-owned.
The next executable step is to wait for a genuine Buff source fingerprint
delta, then repeat fresh Phase 0 and generate exactly one new authorization
request/packet before bounded natural-tick, full-chain, multi-cycle, expiry,
and restart-soak validation.

### Retry-74 natural tick blocked; AUTH-04 refresh required — 2026-10-10 13:40 CST

Retry-74's fresh pre-enable evidence passed `18/18`. At 13:32:13 CST the
authenticated API enabled one changed-only Buff window; the scheduler's natural
tick at 13:33:01 returned `blocked` with `L2_PROMOTION_DECISION_STALE`. The
scheduler was restored disabled through the API at 13:33:06. No Buff detection,
attempt, dispatch, or business-table write occurred; live attempts,
reservations, and fences remained `0/0/0`, and the reconciler was healthy.
Retry-74 is consumed and must not be replayed.

Evidence: `.local/tmp/buff-automation-retry-74-pre-enable-final-20261010T053213Z.json`
and `.local/tmp/buff-automation-retry-74-natural-tick-20261010T053306Z.json`.
The packet hash was
`sha256:a134092d6df932d821f37411c6827cce4b2a406a8b58e75fd9ebaaa85bf27d56`;
decision identity was
`automation-crawler-v2-scheduler-activation-20261010-retry-74-admin-6ff0fdc3-39e7-4637-8455-d08a5dd49665`.

The activation gate checks all eight registered domains. Read-only policy
inspection found the latest L2 promotion decision expired for Items 91, NPCs
92, Projectiles 93, Armor Sets 94, Buffs 95, Audio 96, Bosses 97, and Shimmer
98. AUTH-04 still authorizes fresh append-only policy-stable reauthorization
for these eight domains at unchanged L2/ACTIVE policy and H8; no policy update
or scope expansion is allowed. Continue serially with fresh captures, unique
retry labels/decision identities, one canonical runner execution and
independent readback per domain. Then run fresh Phase 0 and prepare a new
bounded natural Buff window. Buff runtime and Redis checks must use backend
`18105` and Redis DB16 only; DB14 remains Armor-owned. Never use manual sweep.

The next acceptance gate remains a real nonzero Buff source delta followed by
the full source-to-landing/maint/relation/projection/API/SQL readback and
expiry/restart soak. Until those pass, do not claim unattended automation is
complete.

### DB15 runtime reassignment and managed restart - 2026-10-10 14:12 CST

- The old Buff-root JVM on `18105` was found running with `TERRAPEDIA_REDIS_DATABASE=16` and returning `409 FIRST_MUTATION_OUTCOME_UNCERTAIN` against the old DB16 epoch. It was stopped with `TERM`; no API control write, Redis write, marker edit, FLUSHDB, permit replay, or business-data mutation occurred. DB16 data remains retained.
- Buff was restarted in tmux session `terrapedia-buff-db15` from this worktree. PID `2314260` uses Redis `6380/DB15`, Spring scheduling enabled, Flyway disabled, `TERRAPEDIA_CRAWLER_AUTOMATION_READ_ONLY=true`, and scheduler control disabled. Two authenticated samples 2.5 seconds apart returned HTTP `200` for health/control/preflight, Buff canary `buff-page-immunity-refresh`, `liveAttempts/sweepClaims=0/0`, and reconciler `healthy`.
- Evidence: `.local/tmp/buff-db15-managed-restart-preflight-20261010T061042174Z.json`. DB15 is `PONG`, `DBSIZE=10`, epoch `epoch-ecad0546-cc45-40f7-b374-a115e4b3067b`, and its live attempt/claim indexes are zero. The DB15 marker has the same epoch and first-mutation timestamp. Armor DB14 was not modified and remains owner-isolated.
- The real Buff source fingerprint has not changed in this checkpoint, so no new Phase 0 authorization, scheduler enablement, natural tick, source fetch, landing/maint/relation/projection write, or acceptance readback was created. The next Buff action remains a fresh source probe on DB15, followed by AUTH-04 policy-stable reauthorization only when a real nonzero Buff delta exists.

### Superseded DB16 recovery continuation - 2026-10-10 14:24 CST

The interim DB15 assignment is superseded. User direction and the DB16 recovery evidence establish Redis `6380/DB16` as Buff's only target; Armor remains `18104/DB14`. Current process inspection found no listener on `18105`; the only backend is Armor's process on `18104`. No DB14 Redis query or mutation was performed in this continuation.

Authenticated configuration read reaches DB16 and confirms engine `v2`, epoch `epoch-275d5cda-a966-4e6c-8e07-f69aac972d3f`, and the existing reset record `buff-db16-forward-repair-20261009T054100Z`. The durable worktree marker still records interim DB15 epoch `epoch-ecad0546-cc45-40f7-b374-a115e4b3067b`, while preserving the irreversible first-mutation timestamp. The next operation is to build current backend code, start Buff only on `18105/DB16`, and use that existing reset identity through the authenticated recovery endpoint; verify the response restores the existing DB16 epoch before fresh Phase 0. Do not edit the marker directly or generate another epoch.

Natural source change, a valid fresh scheduler authorization, a successful Buff natural tick, nonzero landing-to-API/SQL readback, and expiry/restart soak are still open. Retry-74 is consumed and cannot be replayed. Scheduler control remains required to stay disabled until fresh Phase 0 and authorization gates pass.

### DB15 runtime correction and final preflight - 2026-10-10 19:32 CST

- The DB16 owner that had taken port `18105` was stopped. Its DB16 Redis state was retained; no DB16 key or data was deleted.
- The existing DB15 recovery identity `buff-db15-forward-repair-20261010054633` was submitted once more through the authenticated `/admin/crawler-monitor/cutover/recover-state-store-reset` API under the existing coordinator lock. The idempotent response was HTTP `200`, epoch `epoch-ecad0546-cc45-40f7-b374-a115e4b3067b`, and `v2LiveAttemptCount=0`; no new epoch was created and no marker was edited directly. Evidence: `.local/tmp/buff-db15-idempotent-recovery-20261010.json`.
- Buff is now owner-managed on `18105` with Redis `6380/DB15`, `SPRING_TASK_SCHEDULING_ENABLED=true`, `TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED=false`, `TERRAPEDIA_CRAWLER_AUTOMATION_READ_ONLY=true`, and mail health disabled for the local credentialless environment. Final authenticated health, automation, preflight, and overview reads are all HTTP `200`; scheduler `enabled=false`, Buff canary `buff-page-immunity-refresh`, live attempts/claims `0/0`, and reconciler `healthy`. Evidence: `.local/tmp/buff-db15-final-preflight-20261010-v2.json`.
- Redis DB15 is `PONG`, `DBSIZE=10`, epoch/first mutation match the marker, and live-attempt index cardinality is `0`. DB16 remains `PONG`/`DBSIZE=8` as retained historical state. No FLUSHDB, permit or decision replay, manual sweep, crawler dispatch, or business-table write occurred.
- The Buff-specific `Template:GetBuffInfo` fingerprint remains unchanged at `a512db8c...`; three changed shared sources belong to other domains. Automatic Buff ingestion therefore remains gated on a real Buff delta plus fresh Phase 0/authorization. Scheduler stays disabled.
- A fresh DB15 worktree-manifest source probe at `2026-10-10T11:42:35.086Z` (`.local/tmp/buff-source-monitor-db15-final-20261010-1938/state.json`) completed `9/9` healthy. `Template:GetBuffInfo` is still `changed=false` with current/previous/ingested `a512db8c...`; the four changed sources are Biome, Audio, Bosses, and Shimmer. No Buff authorization or scheduler action was created.

### DB15 continuation preflight - 2026-10-10 20:54 CST

- A new isolated source probe `.local/tmp/buff-source-monitor-db15-continue-20261010T125030Z/state.json` completed `9/9` healthy. `Template:GetBuffInfo` remains unchanged at `a512db8c...` for current, previous, and ingested values; the four changed sources remain outside Buff.
- The first continuation preflight used `/api/health`, which is not a project endpoint and returned `404`; this was a probe-path defect, not a service outage. The corrected endpoint is `/api/actuator/health`.
- Corrected read-only evidence `.local/tmp/buff-db15-continue-preflight-20261010T1254Z-v2.json` (`sha256:27512b76cd109b4b5f321a19408fb81478628a79fc7c56a646b32b89b407ca57`) passes all checks: health/automation/preflight/overview `200`, scheduler `enabled=false`, Buff canary, DB15 `PONG`, epoch `epoch-ecad0546-cc45-40f7-b374-a115e4b3067b` agreement, live attempts/claims `0/0`, healthy reconciler, DB15 process identity, and cutover disabled.
- No authorization, permit, decision, scheduler mutation, crawler dispatch, landing/maint/relation/projection write, or business-table write was performed. The next executable Buff step still requires a genuine nonzero Buff fingerprint delta; do not use the four unrelated source changes as a trigger.

### Natural scheduler confirmation - 2026-10-10 21:25 CST

- Read-only baseline `.local/tmp/buff-db15-natural-baseline-20261010T1305Z.json` reached Buff backend `18105`/DB15 with HTTP `200` automation, preflight, and overview reads. Control was `enabled=false`; MySQL Buff counts were local `388/380`, maint/relation/projection `400/400/400`, Item-Buff `15`, and NPC-Buff `1708` total / `1703` active. Redis DB15 was `PONG` with live index `0`; SQL live attempts/reservations/fences were `0/0/0`.
- The latest natural sweep recorded in the baseline completed at `2026-10-10T13:07:14.000Z`: Buff `wiki.page.template_getbuffinfo` had `changed=false`, `dispatched=[]`, and no Buff attempt. Other-domain changes were excluded by the Buff canary scope.
- Post-observation `.local/tmp/buff-db15-natural-post-20261010T1329Z.json` confirms all seven checks: HTTP reads `200`, control disabled, Buff unchanged, zero dispatch, zero live work, stable epoch, and unchanged SQL counts. No automatic Buff ingestion occurred during the observation window. The next trigger remains a genuine Buff source fingerprint delta; do not enable scheduler or create AUTH-04 artifacts before that gate.

### Retry-77 natural window and DB15 source continuation - 2026-10-10 21:25 CST

The six serial AUTH-04 L2 reauthorizations completed and independently read back
as valid for Armor retry-119, Buffs retry-120, Audio retry-121, Bosses retry-122,
Projectiles retry-123, and Shimmer retry-124. Scheduler decision retry-77 was
then consumed once with packet
`sha256:917d33ad34d17541edd4acfd398293206a22b8a608bfcaeef578148423d54fa5`.
The corresponding MySQL decision identity is
`automation-crawler-v2-scheduler-activation-20261010-auth04-retry-77-admin-fa806feb-17a2-450f-9e35-a04460b310a6`.
Neither the L2 decisions nor retry-77 may be replayed.

One authenticated changed-only natural window was opened and then restored to
disabled. At `2026-10-10T13:07:14Z`, the scheduler completed its source check;
Buff `Template:GetBuffInfo` was unchanged, `dispatched=[]`, and no Buff attempt,
landing, maint, relation, projection, or business-table write was created.
Final readback
`.local/tmp/buff-automation-retry-77-post-window-readback-v2.json` has SHA-256
`sha256:cf7e30e0ba725389ef10d2464e848cf22da6bc89fce9f17ecbac2b1cb3316b46` and
confirms scheduler `enabled=false`, API/SQL/Redis live work `0/0/0`, Redis
`6380/DB15` `PONG`, and a healthy reconciler. The readback counts are local
Buff `388/388`, source Items `380/380`, maint/relation/projection `400/400/400`,
Item-Buff `15`, and NPC-Buff `1708` total / `1703` active; Buff `71` maps to
Item `1340`, Buff `395` maps to Items `1341/1342`, and `(1340,395)` is absent.

A fresh explicit worktree-manifest source probe completed at
`2026-10-10T13:21:09.574Z` with `9/9` healthy sources. Its state artifact is
`.local/tmp/buff-source-monitor-db15-continue-20261010T132109Z/state.json`
(`sha256:849a36389ab9f567e7fe7c3fd84da7f56e59f571ce6cb16ebb0a1559b24d3aaa`).
Buff current, previous, and ingested fingerprints all remain
`a512db8cc60378dcefed3e3f7905480fe6a60cb9e04ef3adf947cd5205d5aa57` with
`changed=false`; four changed sources belong to other domains. An authenticated
DB15 read confirms the same epoch
`epoch-ecad0546-cc45-40f7-b374-a115e4b3067b` and live attempts/claims `0/0`.

Automatic-ingestion acceptance is still open: there has been no real nonzero
Buff fingerprint delta, so no new Phase 0, proposal, request, Owner packet,
permit, scheduler enablement, or source-to-business-table write is authorized.
The next action is another read-only probe when requested or when the source
changes; after a genuine Buff delta, generate one fresh authorization packet,
observe the natural tick, and complete full-chain plus multi-cycle/expiry/
restart soak readback. Buff remains DB15-only; Armor owns DB14 and DB16 is
historical state only.

Final read-only verification at 21:32 CST returned HTTP `200` from health,
automation, preflight, and `/admin/crawler-monitor/overview`. The overview queue
is empty with `queueHealth=healthy` and `reconcilerHealth=healthy`; scheduler is
`enabled=false`, canary is `buff-page-immunity-refresh`, and API live work is
zero. Process inspection confirms `18105` uses Redis DB15 with scheduling
enabled and queue cutover disabled. Authenticated Redis DB15 returns `PONG`,
the expected epoch, and live attempt/claim indexes `0/0`. `git diff --check`
passed with exit `0`; no paths are staged.

### Buff manual automation test window implementation - 2026-10-10

- Added the bounded local command `platform/local/run-buff-automation-test-window.sh` and runner `pipelines/automation/buff-automation-test-window.mjs`.
- The runner accepts only T1, limits the window to 1-15 minutes (default 5), derives isolated MySQL names and Redis DB13, rejects formal databases and DB14/DB15/DB16, and writes a private run artifact under `.local/tmp/`.
- The fixture backend now accepts `fixture-changed-only` only when `TERRARIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED=true`; production mode rejects the fixture mode and treats any persisted fixture config as disabled.
- The existing V2 system driver now exposes explicit fixture enable/disable phases and runs the existing Buff T1 chain against run-derived schemas after a natural scheduled fixture tick. Failure and timeout paths disable first, retain diagnostics, and report `blocked` if cleanup cannot be confirmed.
- Focused validation passed: Buff window contract `5/5`, scheduler lifecycle/system-driver regression `37/37`, Buff T1 fixture contract `3/3`, automation profile `3/3`, syntax checks, and `git diff --check`. No production runtime, formal database, or Redis DB15 mutation was performed.

### Session handoff continuation - 2026-10-11 00:25 CST

- The final focused suite is `39/39` across the Buff window, wrapper, scheduler lifecycle, automation profile, and Buff T1 fixture tests. Java validation is `292/292` for `CrawlerMonitorServiceImplTest`, `13/13` for `CrawlerMonitorActionRegistryTest`, and `1/1` for the fixture dispatch method. Node/Shell syntax and `git diff --check` pass.
- A first live window attempt failed closed because the backend JAR was older than the modified fixture routing source. After rebuilding with `mvn -DskipTests package`, a second attempt reached isolated T1 provisioning but failed closed during the local MySQL read-only snapshot SQL (`ERROR 1064`). Artifact: `.local/tmp/buff-automation-test-window-buf_73a0b91a920106f2.json`, status `blocked`. No test backend was left running; Redis DB13 was empty after cleanup and the temporary MySQL accounts were explicitly removed.
- The runner now avoids re-preparing after a failed setup, disables only after enablement was confirmed, and retains the adapter before provisioning completes so failed setup can clean temporary accounts. It resolves the ignored local config from the primary repository when invoked from this worktree.
- Remaining blocker is local T1 snapshot provisioning compatibility/privilege, not the production Buff path. Next session must inspect the snapshot SQL/credential prerequisite and rerun only the isolated window. Production remains DB15-only, disabled, and unchanged.

### Prepare handoff - 2026-10-11 01:47 CST

Observed:

- Worktree: `/home/lolben/TerraPedia/.worktrees/automation-domain-buff`; branch: `feat/automation-domain-buff`; HEAD: `42f49ede99a147ce3e42fe163b26249f3f8ba3e9`; no upstream configured.
- Git state: 68 tracked modified paths, 1597 untracked paths, 0 staged paths. The dirty paths include existing Buff implementation, audits, authorization artifacts, and generated reports; no cleanup or reset was performed.
- The manual window implementation is present but uncommitted. The durable plan is `docs/superpowers/plans/2026-10-10-buff-manual-automation-test-window.md`; the design is `docs/superpowers/specs/2026-10-10-buff-manual-automation-test-window-design.md`.
- Focused validation is recorded as Node `39/39`, Java `292/292` plus `13/13` and `1/1`, syntax checks passed, and `git diff --check` passed.

Recorded:

- `.local/tmp/buff-automation-test-window-buf_73a0b91a920106f2.json` has `status=blocked`, run ID `buff-window-20261010161822-a75867a2`, run key `buf_73a0b91a920106f2`, Redis `6380/DB13`, and run-derived schemas `terria_v1_automation_acceptance_buf_73a0b91a920106f2_{local,maint,relation}`.
- The failure is `ERROR 1064` in the local MySQL T1 snapshot SQL. The artifact's cleanup readback also contains `ERROR 1396` for a temporary provisioner-account check; the next session must independently verify that no account/schema/DB13 resource remains before retrying.
- Production Buff remains `18105`/Redis DB15 with scheduler control disabled and unchanged fingerprint `a512db8c...`; Armor remains `18104`/DB14; DB16 is historical-only. No production authorization, scheduler dispatch, formal-table write, or permit/decision replay occurred.

Unknown / next action:

- The exact MySQL snapshot statement and privilege mismatch causing `ERROR 1064` have not yet been isolated. Inspect the generated snapshot/provisioning SQL and the local credential capability, make the smallest isolated fix, rerun the bounded fixture window, and retain the failed artifact for audit.
- Do not enable production Buff automation, call `/v2/automation/sweep`, flush Redis, edit markers, reuse the blocked run key, replay an old permit/decision, or write formal Buff/Armor tables.

### Isolated T1 window passed - 2026-10-11 02:20 CST

Observed:

- The preflight found no residual account or run-derived schema for the blocked run, and Redis DB13 was verified before the successful window. The successful run used a fresh identity `buff-window-20261010181642-a6bf8c87` / `buf_1ab569ee1b8ed200`.
- Artifact `.local/tmp/buff-automation-test-window-buf_1ab569ee1b8ed200.json` is `status=passed`, SHA-256 `faab82009418f2d014c69a37139c208e10a123756841a30692b7bcdd98010c6c`. It records one natural `fixture-changed-only` tick, one completed attempt, confirmed disable, and Buff T1 acceptance `passed`.
- Acceptance evidence is two imported Buff rows (`created=2`), 11 source-item relations, 11 item dependencies, 4 NPC dependencies, two relation/projection Buff rows, zero unresolved fixture rows, and consumer readback for Venom `70` (`7` source items / `26` immune NPCs) and ShadowFlame `153` (`4` / `30`).
- Final independent readback is zero for backend processes, child processes, Redis keys, temporary credentials, files, permits, ports, and databases. Redis DB13 and the three run-derived schemas are clean after the run.
- Focused Node validation passed `59/59` across the Buff window, wrapper, scheduler lifecycle, MySQL adapter, and Buff T1 acceptance suites. Syntax checks and `git diff --check` passed.

Interpretation:

- The current isolated T1 snapshot/provisioning path is operational. A direct adapter probe verified all 132 bounded source-table samples on MySQL 9.2 with the configured read-only grants, and the historical `ERROR 1064` did not reproduce. The current compound-trigger MySQL CLI delimiter rewrite is exercised by the adapter tests and full window provisioning.
- The exact historical `ERROR 1064` statement was not independently reproduced, so the evidence does not claim a definitive historical root cause. The cleanup `ERROR 1396` also left no account residue; the successful run's credential and schema readback are zero.

Boundary:

- This was fixture-only work on Redis DB13 and run-derived T1 schemas. It did not use production Buff DB15, Armor DB14, or historical DB16, and it created no production authorization, permit/decision replay, scheduler dispatch, formal-table write, or `/v2/automation/sweep` call. Buff production automation remains disabled until a genuine Buff source fingerprint delta and the separate production authorization gates are satisfied.

Next action:

- Retain the passed artifact and focused validation as the manual test-window evidence. Keep the production Buff scheduler disabled and wait for a real Buff source delta before any fresh Phase 0 or production authorization work. Do not reuse the blocked run key or old permits/decisions.

### Final five-minute window and production isolation readback — 2026-10-11 02:27 CST

- The planned command `bash ./platform/local/run-buff-automation-test-window.sh --fixture-profile=t1 --window-minutes=5` passed with artifact `.local/tmp/buff-automation-test-window-buf_af1a32a9649740f9.json` (`0600`, `status=passed`). Fresh run key: `buf_af1a32a9649740f9`; fixture hash: `sha256:aa72b1afb6d103868bcb91d7763f00453083fe9c8d2aca7891dbcc4cc546a179`; natural attempt: `attempt-1358bd60-3bd7-4245-a18b-a5bd89ba0020`.
- The bounded window started at `2026-10-10T18:24:57.979Z`, enabled at `18:24:58.018Z`, observed the natural tick at `18:25:57.430156261Z`, reached terminal `completed`, and confirmed disable at `18:26:19.049Z`. Buff T1 acceptance passed with two imported Buffs, 11 source-item relations, four inflicting-NPC relations, zero unresolved fixture rows, and exact isolated consumer readback.
- Cleanup readback is zero for backend/child processes, Redis keys, temporary credentials, files, permits, ports, and databases. DB13 is empty; all three run-derived schemas and temporary automation accounts are absent. The window did not touch formal databases, production DB15, Armor DB14, or historical DB16.
- Independent post-run production readback returned HTTP `200` for health, automation, preflight, and overview on `18105`. Buff remains `enabled=false`, mode `changed-only`, canary `buff-page-immunity-refresh`, API live attempts/claims `0/0`, reconciler `healthy`, and DB15 epoch `epoch-ecad0546-cc45-40f7-b374-a115e4b3067b` with live index `0`. Armor DB14 remains reachable with epoch `epoch-29a8486b-b3df-45a7-a496-28286e5da91b` and live index `0`; formal Buff counts remain `388/400/400/400/15/1708`.
- The compatibility fixes validated during this run are the compound-trigger mysql CLI delimiter wrapper, Buff-mode Recipe isolation, fixture-only canary normalization, temporary worktree config cleanup, and enforcement of the post-preflight window deadline. Java focused tests pass `305/305`; scheduler lifecycle `33/33`; adapter `16/16`; Buff window `5/5`; syntax and `git diff --check` pass.
- Production automatic-ingestion acceptance remains open. The real Buff fingerprint is still `a512db8c...`; this fixture-only run does not create production authorization or establish unattended full-domain ingestion.

### Final patched artifact - 2026-10-11 02:35 CST

Observed:

- The artifact contract now records `manual_isolated_acceptance=true`, `production_source_delta=false`, and `databaseWritesToFormalRuntime=false`; the Buff window unit test asserts all three fields.
- The first post-patch 1-minute run `.local/tmp/buff-automation-test-window-buf_9765b47ab10f6117.json` reached a natural completed tick but timed out waiting for terminal Buff progress. It confirmed disable and independently read back zero backend/child/Redis/credential/file/permit/port/schema resources. The failure is retained and its run key is not reused.
- The final post-patch 5-minute run is `.local/tmp/buff-automation-test-window-buf_7a645579f2b395f4.json`, SHA-256 `2cf27947a24a4867f17578affb7aec37e5225fb5f4ec59071dcf8641ca2992ac`, `status=passed`. Run ID is `buff-window-20261010183129-a86f1607`; run key is `buf_7a645579f2b395f4`.
- The final run observed one natural fixture tick and completed attempt `attempt-cd885377-d97e-42a5-bb54-bc01686f1592`; enable/disable used `fixture-changed-only` with canary `crawler-queue-v2-fixture`, and disable was confirmed. Buff T1 acceptance passed with two imports, 11 source-item relations, 11 item dependencies, 4 NPC dependencies, two relation/projection rows, zero unresolved fixture rows, and consumer readback Venom `70` (`7` / `26`) plus ShadowFlame `153` (`4` / `30`).
- Final independent readback is zero for backend/child processes, Redis keys, temporary credentials, files, permits, ports, and databases. Redis DB13 is empty; all run-derived schemas and temporary accounts are absent.
- Focused Node validation after the artifact-field change passed `59/59`; syntax checks and `git diff --check` pass.

Interpretation:

- The test-window implementation and current MySQL snapshot/provisioning path are operational for the isolated T1 contract. The historical `ERROR 1064` remains unreproduced as a standalone failure; the final live provisioning path passed, so no additional production credential or schema change is needed.
- The 1-minute timeout demonstrates the intended bounded-window failure behavior. The 5-minute run is the final acceptance artifact because it allows the Buff T1 terminal readback to complete.

Boundary:

- Both post-patch runs used only Redis DB13 and run-derived T1 schemas. No production Buff DB15, Armor DB14, or historical DB16 resource was used, and no formal-table write, production authorization, permit/decision replay, `/v2/automation/sweep`, or marker edit occurred. Production Buff remains disabled pending a genuine Buff source fingerprint delta and fresh production authorization gates.

### Real Buff snapshot isolated replay - 2026-10-11 08:57 CST

Observed:

- The workspace-bound source manifest record `wiki.page.template_getbuffinfo` points to `/home/lolben/TerraPedia/data/terraPedia/raw/wiki/template__getbuffinfo.latest.json`. Its raw `moduleContent` hash is `a512db8cc60378dcefed3e3f7905480fe6a60cb9e04ef3adf947cd5205d5aa57`, matching the manifest and the source revision `2026-08-22T05:46:54Z`. The historical parsed payload was accepted only after all `400/400` raw Buff identities matched; the 388-record standardized file was not used.
- Fresh isolated identity: run ID `buff-real-snapshot-20261011005120986-b6a05632d5`, run key `buf_2ba594c0857e0f44`, Redis `6380/DB13`, and `terria_v1_automation_acceptance_buf_2ba594c0857e0f44_{local,maint,relation}`. Artifact `.local/tmp/buff-real-snapshot-replay-buff-real-snapshot-20261011005120986-b6a05632d5.json` has mode `0600`, SHA-256 `bf2341be1fef3105b07bb89d1338e62acd1f6b8c3c41bc82a9392b66bb1f14dc`, and `status=passed`.
- The isolated run copied formal dependency rows through the read-only boundary: `maint_items=6152`, `maint_npcs=762`, and local Buff image rows `388`. It inserted one `buffs_raw` landing row with content hash `a512db8c...`; maint sync processed `400` Buff records (`398` inserts, `2` updates). Full relation/projection sync readback is `relation_buffs=400`, `projection_buffs=400`, `item_buff_relations=165`, and `npc_buff_relations=1264`. Consumer rows are Venom `70` (`8` source items / `26` immune NPCs) and ShadowFlame `153` (`5` / `30`).
- Dependency closure is explicitly not complete: the 184 source-item and 130 inflicting-NPC facts contain strict identity gaps of `34` and `27`; a name fallback check still finds `29` missing/`24` ambiguous item identities and `24` missing/`36` ambiguous NPC identities. Targeted evidence is `.local/tmp/buff-real-snapshot-replay-buff-real-snapshot-20261011005120986-b6a05632d5-dependency-readback.json` (SHA-256 `b4028253348bdfe70f6a254070283da04c3ff033d85ed9dd9a6a197de19c8d9d`).
- Cleanup readback is `remainingSchemas=0`, `remainingDb13Keys=0`, `remainingAccounts=0`, and `cleanupErrors=[]`. Formal read-only counts after the run remain maint Buff `400`, maint Items `6152`, maint NPCs `762`, local Buff `388`, and three formal schemas. No formal write was issued.

Interpretation:

- The current manifest-bound 400-record Buff payload now has evidence for a structural isolated landing -> maint -> relation -> projection full-chain replay. The known source/dependency identity gaps mean this is not a semantic completeness or publication gate. The changed source gate is independent: the manifest fingerprint remains unchanged, so this replay does not authorize production automatic ingestion.
- The first fresh run failed closed only because the temporary landing insert used an ISO `Z` value directly for a MySQL `DATETIME`; artifact `.local/tmp/buff-real-snapshot-replay-buff-real-snapshot-20261011004914233-a13f6891e2.json` records the failure and zero cleanup. The corrected run used a new identity; the failed identity was not reused.

Boundary:

- The replay did not use Buff DB15, Armor DB14, or historical DB16, and did not enable the scheduler, call `/v2/automation/sweep`, edit markers, replay permits/decisions, or write formal Buff/Armor tables. Production Buff remains disabled until a genuine source fingerprint delta and fresh authorization chain exist.

Validation:

- `node --check .local/tmp/run-buff-real-snapshot-replay.mjs` passed before execution; artifact assertions, SHA-256 verification, schema/account/Redis cleanup readback, and formal read-only counts passed after execution. The temporary replay driver is retained under `.local/tmp/` with the private artifacts; no tracked source file was changed for this runtime-only evidence.

### Fresh source probe and production readback - 2026-10-11 05:06 CST

- The first probe `.local/tmp/buff-source-monitor-continue-20261010T205924Z/state.json` used the default shared-data manifest at `data/terraPedia/generated/wiki-source-manifest.latest.json`, which has no Buff source record. It reported `missing_ingestion_manifest`; this result is invalid for deciding Buff delta and is retained as diagnostic evidence.
- The verified probe explicitly bound `data/generated/wiki-source-manifest.latest.json`. State `.local/tmp/buff-source-monitor-verified-20261010T210248Z/state.json` is SHA-256 `15db963c1df3a0ca20ad81622780a12f203ce6cb713b36095ad686ce6e47f9d1`; report `.local/tmp/buff-source-monitor-verified-20261010T210248Z/reports/source-update-check-2026-10-10T21-02-48.383Z.json` is SHA-256 `67e16017cb104fd17648111c7a39c07ef4ca0bf60ceb396db11aa99e101c773e`. Progress is terminal `completed`, `9/9`, and all nine sources are healthy.
- Buff `wiki.page.template_getbuffinfo` current, previous, ingested, and manifest hashes all equal `a512db8cc60378dcefed3e3f7905480fe6a60cb9e04ef3adf947cd5205d5aa57`; `changed=false`. The four changed sources are `wiki.page.biomes_anchor`, `wiki.audio_assets.catalog`, `wiki.bosses.catalog`, and `wiki.shimmer.page_and_langlinks`; none is a Buff trigger.
- Fresh authenticated production reads at `2026-10-10T21:05:53Z` returned HTTP `200` for health, automation, preflight, and overview on `18105`. Scheduler remains `enabled=false`, mode `changed-only`, canary `buff-page-immunity-refresh`, live attempts/claims `0/0`, reconciler healthy. MySQL server UUID/port remain `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, live attempts/reservations/fences are `0/0/0`; Redis DB15 is `PONG`, `DBSIZE=10`, epoch `epoch-ecad0546-cc45-40f7-b374-a115e4b3067b`, live attempts `0`.
- No authorization artifact, permit, decision, scheduler mutation, crawler dispatch, or business-table write was created. Keep waiting for a genuine Buff fingerprint delta; after one appears, start with fresh Phase 0 and a new authorization chain.

### Fresh DB15 read-only gate - 2026-10-11 05:07 CST

- Verified source probe `.local/tmp/buff-source-monitor-verified-20261010T210248Z/state.json` (`sha256:15db963c1df3a0ca20ad81622780a12f203ce6cb713b36095ad686ce6e47f9d1`) is explicitly bound to `data/generated/wiki-source-manifest.latest.json`, completed `9/9` healthy, and keeps Buff `Template:GetBuffInfo` current/previous/ingested at `a512db8c...` with `changed=false`. The later default-manifest probe remains diagnostic because its Buff row has `missing_ingestion_manifest` and `previousValue=null`.
- Fresh authenticated readback `.local/tmp/buff-db15-readonly-preflight-20261010T210732994Z-verified-source.json` (`sha256:60ee82b4ffa21721ef373d8ed64ef6c68d4848770a235e98bef3485fcdaa0d39`) passes the DB15/DB14 isolation gate. Buff `18105` health, automation, preflight, and `/admin/crawler-monitor/overview` are HTTP `200`; scheduler is disabled, mode is `changed-only`, canary is `buff-page-immunity-refresh`, live attempts/claims are `0/0`, reconciler is healthy, and the process uses Redis DB15 with cutover disabled. Armor `18104` remains DB14; Redis DB13 is empty. Formal MySQL counts are local `388/380/1270`, maint `400`, relation `400/400/1708/15`; SQL live attempts/reservations/fences are `0/0/0`.
- The first ad hoc read used `/admin/crawler-monitor/v2/overview` and received `404`; the controller exposes the read-only overview at `/admin/crawler-monitor/overview`. This was a path defect only; the corrected artifact records both overview reads as `200`. No runtime mutation resulted.
- No authorization artifact, permit, decision replay, scheduler enablement, `/v2/automation/sweep`, crawler dispatch, Redis write, or formal-table write was performed. Because the admissible Buff fingerprint is unchanged, production automatic-ingestion acceptance remains blocked at the source-delta gate. Wait for a genuine Buff delta, then start a fresh Phase 0 and authorization chain.

### Current-source isolated replay implementation - 2026-10-11 09:18 CST

- Added the bounded current-source replay path for exactly Buff `153/ShadowFlame` and `70/Venom`. It captures revision-bound `Template:GetBuffInfo`, `Module:Iteminfo/data`, and both Wiki pages, binds page source items to the captured Iteminfo revision, and retains a snapshot hash plus page/module identity evidence.
- The replay now writes canonical Buff progress through `sharedDataPath('generated', 'fetch-wiki-buffs-progress.latest.json')`, requires loopback MySQL/Redis, rejects every Redis database except DB13, preserves failed artifacts before and during source capture, verifies the exact run-derived T1 three-database identity, and requires DB13 to be empty after cleanup.
- Regression evidence before live execution: current-source orchestration `5/5`, source replay `6/6`, Buff T1 acceptance `5/5`, combined fetch/wrapper checks `36/36`; `node --check`, `bash -n`, and `git diff --check` pass. No live current-source replay has been run yet in this checkpoint.
- Production boundary remains unchanged: Buff `18105`/DB15 scheduler is disabled; Armor `18104`/DB14 and historical DB16 are forbidden targets; no production authorization, scheduler mutation, formal-table write, marker edit, `/v2/automation/sweep`, or Redis flush is permitted.

### Current-source isolated replay passed - 2026-10-11 09:20 CST

- Two fresh runs used unique run-derived identities. Final artifact `.local/tmp/buff-current-source-replay-buf_75c52bd119f505f6.json` is `status=passed`, mode `0600`, SHA-256 `sha256:3272684ae794724c645b136e0f566bc1ad2f79569de096e201c2d53bfe71ad38`, run ID `buff-source-replay-20261011011455-02dfb939`, and run key `buf_75c52bd119f505f6`. The first successful artifact remains `.local/tmp/buff-current-source-replay-buf_9095073a1b76949f.json`; neither run key is reused.
- Current source identities are complete: `Template:GetBuffInfo` page `55467`, revision `1023278`, raw hash `sha256:a512db8c...`; `Module:Iteminfo/data` page `18021`, revision `1023241`, raw hash `sha256:df8a7219...`; `Shadowflame` page `9767`, revision `1027510`, raw hash `sha256:2bc8f031...`; and `Acid Venom` page `8675`, revision `1027618`, raw hash `sha256:981ca0c0...`. Snapshot hash is `sha256:fe5ba385c18588df1f28bc61346ffb37e8d2587a237e4666bb24ddc048375939`.
- Parsed records are Buff `153/ShadowFlame` with `5` source items, `1` inflicting NPC, `30` immune NPCs; Buff `70/Venom` with `8`, `3`, and `26`. The T1 artifact explicitly identifies `current_wiki_source_replay` as input, rather than the offline fixture.
- Isolated chain evidence: Buff import `input=2, created=2`; maint writes `inserted=2`; relation/projection Buff counts `2/2`; source-item relations `13`; inflicting-NPC relations `4`; unresolved `0`; consumer readback is Venom `8` source items / `26` immune NPCs and ShadowFlame `5` / `30`. DB13 preflight and postflight are both `0`; independent readback found zero run-derived schemas and zero temporary accounts.
- Production read-only artifact `.local/tmp/buff-current-source-replay-production-readback-20261011T011834657Z.json` (`sha256:ff9b26f302ba495d1420e934c50efb2fc9dcfcd3f7b20f5ff5919d42df932aa4`) confirms backend `18105` uses Redis DB15, scheduler is disabled, API/SQL/Redis live work is zero, reconciler is healthy, and formal Buff counts are `388/400/400/400`.
- Final focused validation is `51/51`; `node --check`, `bash -n`, and `git diff --check` pass. This is a manual isolated current-source pass, not production automatic-ingestion acceptance. The Buff fingerprint remains unchanged; no production authorization, scheduler mutation, `/v2/automation/sweep`, marker edit, permit/decision replay, formal-table write, DB14/DB15/DB16 write, or Redis flush occurred.

### Automatic acceptance Phase 0 recheck - 2026-10-11 10:00 CST

- A fresh manifest-bound source probe completed `9/9` with `probeHealthy=true`. Buff `wiki.page.template_getbuffinfo` current, previous, and ingested content hashes all equal `a512db8cc60378dcefed3e3f7905480fe6a60cb9e04ef3adf947cd5205d5aa57`; `changed=false`. The four changed sources are other domains and do not trigger Buff.
- Fresh read-only production preflight at `2026-10-11T01:58:06Z` returned HTTP `200` for health, automation, preflight, and overview on backend `18105`. Its process uses Redis DB15, `TERRAPEDIA_CRAWLER_AUTOMATION_READ_ONLY=true`, and queue cutover disabled. Armor process remains `18104`/DB14. Scheduler is disabled, reconciler healthy, API/SQL/Redis live work is zero, Redis DB15 is `PONG` with live index zero, and Buff counts remain local/maint/relation/projection `388/400/400/400`.
- Source state `.local/tmp/buff-source-monitor-phase0-20261011T015547Z/state.json` SHA-256 is `0ef83ec3d060b766db84b1bfc6e40486205d5cb8a73e69b5868f297240daedae`; report `.local/tmp/buff-source-monitor-phase0-20261011T015547Z/reports/source-update-check-2026-10-11T01-55-47.269Z.json` SHA-256 is `323c3259a4845ee72f13f00334bcae3c2772012c2873ae0a10972491188ea460`; consolidated readback `.local/tmp/buff-automatic-acceptance-phase0-readback-20261011T0200Z.json` SHA-256 is `cf8c08aaf50cacd14f11258968a2ce66d958be06cf0976a77dc66113e10fddb2`.
- Result: automatic ingestion did not trigger because the Buff source delta is absent; this is a gated/no-dispatch result, not an ingestion failure. No scheduler mutation, authorization/permit/decision creation or replay, crawler dispatch, Redis write, or formal-table write occurred. Keep the scheduler disabled; after a genuine Buff fingerprint change, rerun fresh Phase 0 and use a new exact-source-bound authorization before natural-tick/full-chain/soak acceptance.

### Fresh current-Wiki re-crawl and isolated replay - 2026-10-11 10:10 CST

- The first invocation stopped before network capture because DB13 was temporarily non-empty; failed artifact `.local/tmp/buff-current-source-replay-buf_2f62d8e77d463527.json` records no source or acceptance payload. A read-only follow-up found DB13 empty with no matching test process, so the failed run key was not reused.
- A fresh invocation of `bash ./platform/local/run-buff-current-source-replay.sh` completed with run key `buf_c45236dfe43a5cfe`, artifact `.local/tmp/buff-current-source-replay-buf_c45236dfe43a5cfe.json`, `status=passed`, and SHA-256 `sha256:10cf2768131f01a9091b78fbf2d1229696a69f03ef7c1449c42e17b7bb0180dd`.
- It fetched `Template:GetBuffInfo` revision `1023278`, `Module:Iteminfo/data` revision `1023241`, `Shadowflame` revision `1027510`, and `Acid Venom` revision `1027618`. Parsed facts are unchanged: ShadowFlame `5` source items / `1` inflicting NPC / `30` immune NPCs; Venom `8` / `3` / `26`. Wikitext, sections, and parsed facts match the previous capture; only rendered HTML cache-time bytes differ.
- Isolated T1 acceptance passed with `current_wiki_source_replay`: Buff import `2/2`, maint writes `2`, relation/projection `2/2`, source-item relations `13`, inflicting-NPC relations `4`, unresolved `0`, and exact consumer readback Venom `8/26` plus ShadowFlame `5/30`. Redis DB13 pre/post are `0`; cleanup passed.
- The replay artifact's own DB13 postflight is `0` and its run-derived schema/account cleanup passed. The independent read-only artifact `.local/tmp/buff-current-source-replay-production-readback-20261011T020948Z.json` instead records `db13Size=2` and `db13Empty=false` at `2026-10-11T02:10:18Z`; the observed keys were the temporary `arm_49ef5d6676df6d06` namespace and reservation keys. The follow-up confirmation `.local/tmp/buff-current-source-replay-post-run-confirmation-20261011T021109Z.json` recorded the same non-empty size. At this continuation's check Redis `6380` was no longer listening, so the keys' subsequent state could not be verified. The same readback still confirms HTTP `200` for the four endpoints, scheduler disabled, DB15 `PONG`, zero API/SQL/DB15 live work, healthy reconciler, and unchanged formal Buff counts `388/400/400/400`.
- This transient/unstable DB13 observation is retained as a cleanup-readback gap. No cleanup, `FLUSHDB`, unknown-key deletion, or process termination was performed; the replay remains isolated and no formal runtime write occurred.
- This run is intentionally classified as fresh current-source capture plus isolated replay. Its artifact has `production_source_delta=false` and `databaseWritesToFormalRuntime=false`; the new HTML snapshot hash is not a semantic source delta. No production manifest/marker, authorization, permit/decision, scheduler, DB15, or formal-table write occurred; the isolated replay did use DB13 and its own postflight reported zero keys.
### Fresh current-Wiki re-crawl #3 and isolated replay on Redis DB18 - 2026-10-11 17:14 CST

- The source replay isolation lane was moved from the concurrently contended fixture DB13 to explicit Redis DB18. The wrapper now accepts only `--redis-db=18`; source replay, T1 resource assertions, identity checks, and source snapshot validation all reject other Redis DBs, while the manual fixture test window remains on DB13.
- Command `bash ./platform/local/run-buff-current-source-replay.sh --redis-db=18` completed with artifact `.local/tmp/buff-current-source-replay-buf_d029209e7dba685c.json`, SHA-256 `sha256:2d6be608db16a51415ddae032501ddddcdaae19245610121251e6842b58a54b5`, run ID `buff-source-replay-20261011091357-c0372206`, run key `buf_d029209e7dba685c`, and `status=passed`.
- The run fetched `Template:GetBuffInfo@1023278`, `Module:Iteminfo/data@1023241`, `Shadowflame@1027510`, and `Acid Venom@1027618` over the network. Snapshot hash: `sha256:78ff3f0427594d80f6f9d902261fc97720a0bcd45c7204d1302ea59eeacf62f2`; all raw source descriptors and page hashes are retained in the artifact. Revisions are unchanged, so `production_source_delta=false` remains correct.
- Parsed source facts: ShadowFlame `5/1/30`, Venom `8/3/26` for source items / inflicting NPCs / immune NPCs. T1 chain: Buff import `2/2`, maint inserted `2`, relation/projection `2/2`, source-item relations `13`, inflicting-NPC relations `4`, unresolved `0`, consumer readback Venom `8/26` and ShadowFlame `5/30`.
- Redis DB18 preflight/postflight were both `0`; run-derived schemas were `terria_v1_automation_acceptance_buf_d029209e7dba685c_{local,maint,relation}`; cleanup passed. No formal database, DB15, DB14, DB16, scheduler, authorization, permit/decision, marker, or `/v2/automation/sweep` write occurred.
- Focused validation is `34/34`; syntax, shell, and diff checks pass. Production Buff remains disabled on `18105/DB15`. Historical DB13 replay evidence remains unchanged and is retained only as historical evidence.
