# Session Handoff: Remaining Local Data-Chain Closure

## Status

`closed`

## Repository State

- Repository/worktree: `/home/lolben/TerraPedia`
- Branch: `feat/supplementary-domains-readiness`
- HEAD: `2644d411d2ff48be41b6709dca1bb891cb3d2452`
- Upstream: `origin/feat/supplementary-domains-readiness`, ahead 19, behind 0
- Worktree: intentionally dirty; the 2026-08-26 observation reports `1199`
  status entries, `0` staged. Preserve all existing user/generated changes.
  Do not reset, clean, stash, checkout-discard, or stage everything.

## User Goal

Close the remaining local data-chain work end to end without repeated clarification. A task is closed only when the source chain, governed write boundary, API/runtime consumers, tests, and final smoke/quality evidence all pass. A discovered defect must be repaired in its owning lane, re-reviewed, and revalidated before continuing.

## Current Facts

- Item core projection parity is closed. The five `HeartArrow`, `ValentineRing`, `TurkeyFeather`, `FestiveTopHat`, and `Wiesnbrau` rows are Wiki `旧版:` non-PC local-only entities. They must remain out of PC projection. Fresh smoke reports `items.ok=true` after the audit classification fix.
- Item-source/acquisition lineage is closed for the admitted local-NPC scope.
  Retry-04 admitted the exact governed proposal with `28` accepted identities,
  `103` inserts, and `9` exact reconciliation updates. The post-admission
  partition is `28 accepted`, `1295 duplicate`, `283 quarantine`, `748 blocked`,
  and `0 unclassified`; quarantined and blocked rows remain intentionally
  unpromoted. No further Item-source DML is authorized under this handoff.
- Boss source data and parity pass, and owner-05 terminal metadata is reconciled
  from immutable evidence without replay. Shimmer is
  `COMPLETED/COMMITTED` at generation `9`, and owner-06 terminal metadata is
  reconciled without replay.
- NPC source coverage passes `762/762`; NPC runtime parity is `418/418`
  trusted direct loot with `1542` rows at each relation/projection/local/API
  stage. The duplicate `UndeadMiner -> MiningHelmet` relation was retired
  under the exact approved operation and its post-readback passes.
- Bound image lineage is `7/7` ready using the current Item origin evidence;
  Biome relation/projection rows are current. The generic acceptance image
  probe is not evidence-bound and may report `6/7`; that separate harness gap
  does not reopen the completed data lane.
- Cross-DB has blocking 0 with one warning. Relation-health has blocking 0
  with one warning. The latest local stack smoke passes `5/5`.
- Formal parity operation IDs are registered and manifest/authorization/contract tests pass 74/74:
  `canonical-item-projection-parity-apply`, `canonical-npc-projection-parity-apply`, `canonical-boss-projection-parity-apply`.
- Historical handoff smoke: `reports/relation/local-core-compat-smoke-20260823-handoff.json`;
  its expected Boss `name_zh` gap is superseded by the later Boss source-chain
  audit and final continuation evidence.

## Executed Flow And Remaining Owners

The 12-step flow has been executed through Task 8 review. Boss source-chain,
Boss parity, Item admission, core/cross-DB/relation checks, NPC/Biome/image
audits, Maven, Admin, Public, local stack smoke, quality gate, duplicate
retirement readback, and plan review are terminal under
`reports/runtime/local-data-chain-closure/20260825/parent-final-1055/`.

No remaining parent owner exists. Do not replay Boss, Shimmer, Item admission,
NPC loot retirement, image operations, permits, or DML. A future repair to make
the generic acceptance image probe bind current Item evidence is an independent
validation-harness task and does not reopen this closed data operation.

## Automatic Self-Repair Rules

- Scope/hash drift: discard proposal/packet/permit, create a fresh freeze, and restart the affected lane.
- Missing relation evidence: quarantine the exact key and continue independent lanes; never copy local values into relation/projection.
- Old/legacy/non-PC Item: classify as explicit terminal local-only with source-page evidence; add a regression test and rerun Item smoke.
- Stale landing snapshot: refresh only through the governed source-refresh operation; do not update maint/relation directly from a generated file outside the source chain.
- Empty accepted Item-source set: produce a blocker report and continue Boss/runtime validation; parent remains active.
- API/UI/test failure: trace the owning source layer, add a failing focused test, make one minimal fix, rerun focused then broad validation.
- Unknown DB outcome: inspect result and fingerprints; zero blind retries.
- Any unrelated dirty path: preserve it and keep staged scope empty unless an explicit focused commit is later requested.

## Closure Definition

The parent may become `closed` only when fresh smoke has `ok: true`, Items/NPCs/Bosses/Projectiles/Buffs all pass, Boss Pillar source lineage is non-null and traceable, Item-source treatment has no unclassified rows, cross-DB and relation-health blocking counts are zero, focused/broad tests pass, quality gate passes, and the final closure index records report hashes, operation IDs, decision/permit terminal states, DML status, changed rows, readback assertions, and quarantine counts.

## Validation At Handoff

- `node --test pipelines/relation/replacement-readiness-audit.test.mjs pipelines/relation/local-core-compat-smoke-check.test.mjs`: 14/14 pass.
- `node --test pipelines/automation/canonical-operation-execution-manifest.test.mjs pipelines/automation/build-canonical-cutover-authorization.test.mjs pipelines/relation/core-projection-parity-contract.test.mjs`: 74/74 pass.
- `git diff --check`: pass.
- `node pipelines/relation/local-core-compat-smoke-check.mjs --date-tag=20260823-handoff --throw-on-failure=false`: expected blocked by four Boss Pillar `name_zh` gaps; Items pass after legacy reclassification.
- No database writes, commits, staging, cleanup, external requests, or permit consumption were performed for this handoff.

## 2026-08-24 Fresh Closure Continuation

- Standard local stack was available at MySQL `13306`, backend `18091`, public
  `5177`, and admin `3004`. No database write or permit consumption was done
  in this continuation.
- The previously reported Boss source-refresh is now reconciled to its governed
  evidence: the authorized offline recovery packet was `owner-05`, with local
  and maint landing reports generated at `2026-08-23T04:59:49Z`. Read-only DB
  fingerprints show four new landing rows `18652/18661/18662/18665`, maint
  rows `52/61/62/65`, and relation rows bound to those exact maint record keys.
  Historical April rows remain but are not relation-bound current evidence.
- Added `pipelines/audit/audit-boss-source-chain.mjs` with a regression test.
  The audit now selects maint and landing rows by relation
  `source_maint_record_key`/`landing_source_id`; fresh audit is `ok=true`, all
  ten assertions pass, and the fresh Boss parity proposal has zero rows.
- Fresh runtime evidence under
  `reports/runtime/local-data-chain-closure/20260824/fresh-042509/` records core
  smoke pass, cross-DB `10/10` with blocking `0`, relation health blocking `0`
  with one warning. The corrected Item partition covers `2354` source rows:
  `accepted=0`, `duplicate=1295`, `quarantine=311`, `blocked=748`,
  `unclassified=0`. A bilingual Item blocker was emitted;
  no Item operation, proposal, permit, or DML was created.
- Full Maven initially exposed a test-only PID-file race. The focused owning-lane
  repair waits for a non-empty PID file before parsing it; the focused test is
  `20/20` and full Maven is `1573 pass / 10 skipped / 0 failures`.
- Admin check passes. Public check remains blocked by WSL Chromium snap profile
  timeout. Quality automation remains `189/189`; domain acceptance remains
  `45 pass / 0 warning / 2 blocked` because Shimmer import evidence drifts from
  the current generation pointer and the canonical NPC readiness input file is
  missing. The NPC readiness writer therefore failed closed and did not fabricate
  a report.
- Fresh bilingual closure index and blocker review are recorded at
  `reports/runtime/local-data-chain-closure/20260824/fresh-042509/closure-index.json`
  and `.zh.md`. Parent status remains `blocked` with five blockers; no commit,
  staging, reset, cleanup, or stash was performed.

## 2026-08-24 Governed Shimmer Closure

- The current Shimmer generation `379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761`
  was reconciled through registered operation `automation-shimmer-first-l1`.
  Fresh decision `automation-shimmer-first-l1-20260824-owner-06` was consumed
  once; its temporary dispatch permit was consumed and revoked. No permit file
  remains, no network access occurred, and transaction outcome is known.
- Run `shimmer_l1_20260824closure01` is `COMPLETED`; apply row `36` is
  `COMMITTED` with `SINGLE_TXN`. The four owned-table generations advanced from
  `8` to `9`; row counts remain `279/248/121/29`. Seven generation-specific
  source snapshots are present, parsed, and current. Independent readback is
  `reports/runtime/local-data-chain-closure/20260824/fresh-042509/shimmer-l1-readback.json`.
- Shimmer source and blocking readiness now pass. Post-write core smoke and
  Boss source-chain pass; cross-DB and relation-health both have blocking `0`.
  Maven is `1573 pass / 10 skipped`; Admin and Public pass. Public's Snap
  profile timeout was resolved for the one authorized rerun by selecting local
  Playwright Chromium, without a code or package change.
- Final quality automation is `189/189`; domain acceptance improved to `46/47`.
  The sole blocked panel is the stale NPC readiness whose writer fails closed
  because `reports/authorization/canonical/canonical-npc-apply.input.json` is
  absent. Item source independently remains `accepted=0`, `duplicate=1295`,
  `quarantine=311`, `blocked=748`, `unclassified=0`; no Item operation or
  apply exists.
- Task 7 then added fresh NPC source/domain/runtime, Biome, image-lineage, and
  local-stack smoke evidence. NPC source coverage passes `762/762`; the domain
  and runtime audits block the same six chance-text identities. Independent
  review found Biome's original `47/47` claim was a false pass: after the audit
  uses the shared current-origin policy, Biome is `7/47` managed and image
  lineage is `2/7`. Stack smoke passes `5/5` after the completed NPC audit
  stopped generating concurrent requests. Admin full test passes `413/413`
  plus typecheck/build.
- Parent remains `blocked`: five blocker groups contain ten independent root
  causes: Item source (1), missing NPC canonical input plus six-row loot
  identity regression (2), five image ownership lanes (5), and missing Boss
  plus Shimmer exact changed-row closeout metadata (2).
  Quality-gate exit `1` is derived from the NPC input blocker and is not
  counted again. No commit, staging, reset, cleanup, stash, external request,
  Item write, or NPC write occurred.

## 2026-08-23 Continuation Audit

- The real Boss parity entrypoint is `pipelines/relation/apply-core-projection-parity.mjs`. Its proposal mode requires a live read of `terria_v1_relation`; the existing `reports/runtime/local-data-chain-closure/20260823/bosses-parity-proposal.json` is an old empty artifact generated on 2026-08-22 and is not fresh evidence.
- A contract defect was found before any Boss write: `pipelines/relation/boss-source-refresh-offline.mjs` previously included maint landing and two `image_url` targets outside the operator-approved allow-list. The lane was repaired with a test-first change so it now writes only `local.source_dataset_landings.bosses_raw`, `maint.maint_bosses`, relation Boss title fields, and `relation.projection_bosses.name_zh`; maint sync consumes the local landing rows without writing a second landing table. Boss/authorization/parity focused tests pass `78/78`.
- Fresh runtime checks fail closed because MySQL `127.0.0.1:13306` is refused and Backend `127.0.0.1:18091` is unavailable. Evidence: `reports/runtime/local-data-chain-closure/20260823/fresh-154455/runtime-environment-blocker.json` and bilingual companion.
- Full quality gate was rerun at `2026-08-23T08:13:01.389Z`. Automation is `189/189`; domain acceptance is `45 pass / 0 warning / 2 blocked`, exit code `1`. The blocked panels are Shimmer generation mismatch and stale NPC readiness. Evidence: `reports/runtime/local-data-chain-closure/20260823/fresh-154455/domain-acceptance-quality-gate.json`.
- Item source remains read-only and fail-closed: `accepted=0`, `duplicate=1295`, `quarantine=2022`, `unclassified=0`; no Item operation, permit, or DML exists. Evidence: `reports/runtime/local-data-chain-closure/20260823/fresh-154455/item-source-blocker.json`.
- Compact bilingual closure evidence and exact next actions are indexed at `reports/runtime/local-data-chain-closure/20260823/fresh-154455/closure-index.json` and `closure-index.zh.md`. Parent status remains `blocked` with six blockers; do not close or stage.
- Plan-auditor review is recorded at `reports/runtime/local-data-chain-closure/20260823/fresh-154455/plan-auditor-review.json` with verdict `blocked`; goal/source-chain/boundary/continuity/serial-ownership gates pass, while evidence and commit-readiness gates remain blocked by the six findings. Final repository checks: `git diff --check` pass, skill runtime parity pass, `0 staged`, and `124 modified + 486 untracked` preserved.

## 2026-08-24 Item Closure Continuation (18:33 CST)

- A fresh read-only Item continuation is recorded at
  `reports/runtime/local-data-chain-closure/20260824/fresh-183332-item-final/`.
- Item image evidence was rebuilt from the completed
  `canonical-item-image-origin-normalization` result. The new evidence is
  `item-image-origin-evidence.json`; the independent lineage report is
  `image-lineage.json` with `7/7 ready`. This closes the former stale Item
  projection-evidence root without database mutation.
- The Item source partition remains conserved across `2354` source rows:
  `accepted=0`, `duplicate=1295`, `quarantine=311`, `blocked=748`, and
  `unclassified=0`. A read-only cross-check examined `6722` relation source
  facts and found `240` semantic matches across `186` Items, but zero exact
  raw-source-page to canonical-relation-page promotions. Those rows remain
  quarantine; display-name or family-page similarity cannot become accepted
  identity evidence.
- The bilingual closure index and plan-auditor review are
  `reports/runtime/local-data-chain-closure/20260824/fresh-183332-item-final/closure-index.json`,
  `closure-index.zh.md`, `plan-auditor-review.json`, and
  `plan-auditor-review.zh.md`. The Item parent remains `blocked` with one
  independent root blocker: Item source `accepted=0`.
- No external request, direct SQL DML, operation, permit, candidate apply,
  cleanup, staging, reset, stash, or commit was performed. The next trigger is
  a new exact local raw source snapshot or an explicitly changed no-network
  boundary; then and only then may the Item lane freeze a new proposal.

## 2026-08-25 Local NPC Source-Admission Repair

- Resume audit confirms the same repository, branch, HEAD, upstream distance,
  zero staged paths, and local service boundary. The intentionally dirty tree
  now has `137` tracked dirty and `973` untracked paths (`1110` total), versus
  the earlier handoff's `937`; this is recorded as generated/user workspace
  drift and is preserved without cleanup, staging, or reset.
- Root cause is now proven from local evidence: paired audited NPC snapshots
  exist and pass `buildNpcCrawlerFactEvidence()`, but a bounded subset was
  never admitted to landing, maint, relation, and local Item-source tables.
  The old Item page and NPC page have different source pages, so the former
  source-page equality rule correctly rejected a direct promotion and must not
  be weakened.
- The replacement plan is
  `docs/superpowers/plans/2026-08-25-item-source-local-npc-admission.md`.
  It creates one new operation, `canonical-item-source-local-npc-admission`,
  which may use only audited local NPC snapshots and insert-only frozen rows.
  It forbids network access, broad synchronizers, projection writes, and
  direct SQL DML. New exact Owner authorization will be required only after a
  fresh proposal and independent rebuild exist.
- The frozen candidate partition contains no structured shop-price field.
  Therefore price cannot be compared to an absent historical value: shop
  admission compares stable Item/NPC identities and conditions, then takes the
  price exclusively from the audited NPC source. Drop admission compares
  chance, quantity, and conditions exactly, including nulls. This distinction
  is a fail-closed selector contract, not a relaxed source-page rule.
- Read-only binlog reconstruction also resolves the historical Boss/Shimmer
  changed-row metadata question without a replay: Boss owner-05 has 144
  updates across its five tables, and Shimmer owner-06 has 16 inserts plus 15
  updates with zero writes to the four owned Shimmer data tables. The analysis
  is evidence-only; it did not alter files, services, or database rows.

## 2026-08-25 Admission Proposal Contract Repair

- Coordinator: `/root`. The active Item-source admission lane remains serial
  for all database and authorization work. A read-only Task 2 review may
  inspect only the selector/proposal modules and tests; it may not edit files,
  update devlog state, access the network, start or stop services, or perform
  database writes.
- The focused proposal test exposed a planning-boundary defect: maint template
  metadata `scope` and `tableName` leaked into the frozen database row. The
  existing maint writer excludes those fields. The proposal adapter now does
  the same. Focused selector/proposal tests are `9/9` pass; no DML, decision,
  packet, permit, staging, cleanup, or commit occurred.

## 2026-08-25 Local NPC Admission Reconciliation Proposal

- Resume facts: branch/HEAD remain `feat/supplementary-domains-readiness` /
  `2644d411`; the workspace remains intentionally dirty with `0` staged paths.
  The standard local stack was reused and its database preflight plus backend
  compile and Admin typecheck completed. No database write, decision, packet,
  permit, staging, cleanup, or commit occurred.
- The selector and proposal now distinguish the sole allowed frozen local-source
  reconciliation from a generic conflict. Six exact Dryad Planter Box rows may
  receive only their missing audited source revision. For Mining Helmet, live
  read-only evidence proves archived row `194208` has the correct Item/NPC/drop
  payload but legacy URL source page and null revision; it may be restored with
  the audited page/revision while exact active stale rows `198053` and `198054`
  are soft-deleted. Every row is bound to its primary key plus complete before
  and after image hashes. All other existing non-identical rows remain blocked.
- Fresh read-only proposal:
  `reports/runtime/local-data-chain-closure/20260825/item-source-local-npc-admission/fresh-052731-reconciliation-proposal.json`.
  It is authorization-eligible with `28` accepted, `283` quarantined, `0`
  blocked, `0` unclassified, `8` selected snapshots, `103` inserts, and `9`
  local reconciliation updates (`112` physical changes). Scope hash:
  `sha256:e9800147084816c6ba872c2210aea9992ee5057f2d5c71d29a00e46453fbd52f`;
  before fingerprint:
  `sha256:f7ce49b1b3d4aabf053b4255ea505f19b7df726139a51dc3edc0b62a3f09c782`;
  expected after fingerprint:
  `sha256:47010786b8a7c736befdb2a5ebb517ed2b81f266d07e2f2af042b0eb4902f3ee`.
- Focused selector/proposal tests are `17/17` pass after a red/green cycle.
  The next safe action is to register the exact canonical operation and its
  one-transaction executor, then regenerate the proposal and independent
  rebuild before requesting a new Owner approval. This new operation is not
  covered by historical consumed approvals.

## 2026-08-25 Resume Checkpoint (05:43 CST)

- Resume verification confirms the recorded primary worktree, branch, HEAD,
  upstream distance, zero staged paths, active Item plan, and local stack at
  MySQL `13306`, backend `18091`, public `5177`, and Admin `3004`.
- The intentionally dirty workspace now has `137` tracked-dirty and `683`
  untracked paths (`820` total), compared with the prior `1110`-path snapshot.
  This is workspace drift of unknown ownership; all Item-admission modules and
  the active plan remain present, so it is recorded and preserved without
  cleanup, reset, stash, staging, or overwrite.
- The next serial action is the previously unrun focused transaction-module
  test, followed by the canonical-operation registration only if it is green.
  No database write, decision, packet, permit, or apply has occurred.

## 2026-08-25 Resume Checkpoint (06:02 CST)

- Resume reconciliation confirms the same primary worktree, branch, HEAD,
  upstream distance, active Item-admission plan, local stack, and zero staged
  paths. The workspace now contains `137` tracked-dirty and `986` untracked
  paths. Of the untracked paths, `11` belong to the active Item-admission
  implementation and `975` are preserved non-Item generated/user state. This
  drift is recorded without cleanup, reset, stash, staging, or overwrite.
- The next serial action is a full focused automation-suite reproduction of
  the five known registration/authorization integration failures. No database
  write, decision, request, packet, permit, or apply has occurred.

## 2026-08-25 Item-source Admission Ready for Exact Approval (06:12 CST)

- Canonical-operation registration and authorization path repair are complete.
  The focused Item-source selector, proposal, contract, transaction, executor,
  manifest, authorization, and runner suite passes `130/130`. The new CLI
  regression proves that this operation uses only its decision-derived attempt
  paths and rejects overwrite or cross-attempt authorization artifacts.
- Fresh read-only proposal and independent rebuild are retained under
  `reports/runtime/local-data-chain-closure/20260825/item-source-local-npc-admission/fresh-060913/`.
  Both freeze the same selected identities, source freeze, before/after
  fingerprints, and scope. The proposal has `28` accepted, `283` quarantined,
  `0` blocked, `0` unclassified, `103` insert rows, and `9` exact local-source
  reconciliation rows (`112` physical changes).
- The bilingual exact Owner approval sheet is
  `reports/runtime/local-data-chain-closure/20260825/item-source-local-npc-admission/fresh-060913/owner-approval.zh-en.md`.
  No Owner decision, request, packet, permit, database write, apply, staging,
  cleanup, or commit has been created. The next serial action is to consume
  only the approval text bound to this proposal; any source or database drift
  requires a new proposal and approval.

## 2026-08-25 Item-source Admission Retry Blocker (07:12 CST)

- The exact approval was bound to decision
  `owner-item-source-local-npc-admission-20260825-060913-01`. The canonical
  runner created and consumed its one-time dispatch permit, then rolled back
  before the first insert with `Item-source admission local insert target
  already exists`. No `result.json` was produced and no database row changed;
  the consumed decision remains in
  `reports/authorization/canonical/used-decisions.json` and must not be reused.
- Root cause is proven in `pipelines/relation/item-source-local-npc-admission-db.mjs`:
  the executor treated archived local rows (`status=0`, `deleted=1`) as active
  insert conflicts, while the proposal intentionally allows new active rows
  beside those historical rows. The exact active-row guard is repaired and a
  regression test now covers archived-allowed/active-rejected behavior.
- Focused Item-source tests pass `26/26`. A fresh read-only rebuild after the
  repair agrees with the approved primary proposal on selected identities,
  source freeze, table-before fingerprints, before/after fingerprints, scope,
  and counts (`28` accepted, `283` quarantine, `0` blocked/unclassified,
  `112` physical changes). The rebuild artifact is
  `reports/runtime/local-data-chain-closure/20260825/item-source-local-npc-admission/fresh-060913/proposal-after-fix.json`;
  its extra independent-rebuild metadata is intentionally not the approved
  primary proposal.
- A new decision-derived attempt, packet, and permit are required after this
  code repair. Do not edit the consumed ledger entry, reuse the old packet, or
  run the executor directly. The next blocker is a new exact Owner approval
  with the same primary proposal/scope and a new decision identity.

## 2026-08-25 Item-source Admission DATETIME Retry Blocker (08:07 CST)

- Retry decision `owner-item-source-local-npc-admission-20260825-071200-retry-01`
  was consumed by the canonical runner. The transaction rolled back during the
  exact local-source reconciliation update with MySQL error
  `Incorrect datetime value: '2026-05-13T09:13:39.000Z' for column 'created_at'`.
  No commit occurred and no `result.json` was produced; the decision and packet
  are immutable consumed evidence and must not be reused.
- Root cause is proven: reconciliation after-images preserve complete MySQL
  row images, and JSON serialization turns `Date` values in `created_at`,
  `updated_at`, and related datetime fields into ISO `Z` strings. The executor
  now converts those three columns to MySQL `DATETIME` text only at the SQL
  boundary, preserving the frozen hashes and readback semantics.
- The regression test covers ISO-to-MySQL formatting and the complete focused
  Item-source suite now passes `27/27`; `git diff --check` passes. No direct SQL,
  cleanup, staging, reset, stash, or commit was performed.
- The next attempt must use a new decision-derived root and a new exact Owner
  approval after the manifest code bundle is regenerated for this second repair.

## 2026-08-25 Item-source Admission Insert DATETIME Repair (08:10 CST)

- Static inspection of the failed attempt's frozen write sets found `74`
  ISO-encoded `source_revision_timestamp` values in maint/relation inserts in
  addition to the reconciliation `created_at`/`updated_at` values. The same
  MySQL `DATETIME` boundary issue would otherwise have failed immediately after
  the reconciliation fix.
- The executor now normalizes `created_at`, `updated_at`,
  `source_revision_timestamp`, `fetched_at`, and `parsed_at` for both
  reconciliation updates and inserts. Regression coverage now passes `28/28`
  for the Item-source lane; `git diff --check` passes.
- The two previous retry decisions remain consumed rollback evidence. A new
  exact Owner approval is required for the next manifest, whose code bundle
  includes both repaired boundaries. No direct SQL, cleanup, staging, reset,
  stash, or commit was performed.

## 2026-08-25 Item-source Admission Retry-03 Ready (08:28 CST)

- The final DATETIME hash-normalization repair is covered by the focused
  Item-source suite at `29/29`; `git diff --check` passes. The repair treats
  MySQL's timezone-less `DATETIME` readback as UTC before hashing, removing the
  WSL `Asia/Shanghai` representation-only drift that caused retry-02 to roll
  back before DML.
- Fresh read-only proposal and independent rebuild are under
  `reports/runtime/local-data-chain-closure/20260825/item-source-local-npc-admission/fresh-002347/`.
  They agree on `28` accepted, `283` quarantined, `0` blocked/unclassified,
  `103` inserts, `9` exact reconciliation rows, and `112` physical changes.
  Scope, selected, before, and after hashes are unchanged from the approved
  proposal; MySQL UUID remains `b4ae6728-4f72-11f1-bcc9-00155d37eadf`.
- A new decision-derived attempt `e503c8ac3693dc22c2131057e0b67fdb22d4cb7fe262b2b3ffdffa459806e8bb`
  is prepared with proposal, input, execution manifest, and request. Its
  decision identity is
  `owner-item-source-local-npc-admission-20260825-082759-retry-03`; request
  hash is `sha256:bc412f51940b2920cdd6c141a3bc15c5e84dd790dd6014a5492b8c1438e32900`.
  The bilingual approval sheet is `fresh-002347/owner-approval.zh-en.md`.
- This attempt is awaiting a new exact Owner approval. Retry-02 and all older
  decisions remain immutable consumed rollback evidence. No permit was
  consumed, no executor was run, no database DML occurred, and no staging,
  cleanup, reset, stash, or commit was performed.

## 2026-08-25 Item-source Admission Retry-04 Ready (08:54 CST)

- Retry-03 consumed its decision and rolled back during reconciliation
  readback for row `192286`. Root cause is now isolated: mysql2 returns MySQL
  `DATETIME` as a JavaScript `Date` in the process timezone, while the
  executor wrote ISO `Z` text as UTC wall-clock text. The new regression test
  reproduces the mismatch; the executor now converts ISO/`Date` values to the
  local MySQL `DATETIME` wall-clock value and preserves plain MySQL text.
- Focused Item-source validation is `30/30`; `git diff --check` passes. Fresh
  proposal and independent rebuild under `fresh-084753` still agree on the
  approved proposal (`28` accepted, `283` quarantine, `0` blocked/unclassified,
  `103` inserts, `9` reconciliations, `112` physical changes) and all frozen
  hashes. Retry-03 left no permit and no committed DML.
- New attempt root:
  `reports/authorization/canonical/canonical-item-source-local-npc-admission/74fdfa622c308da96af9245facba0fb51752de4609894b5571b9843f25e37da4/`.
  Decision identity is
  `owner-item-source-local-npc-admission-20260825-085312-retry-04`; request
  hash is `sha256:43b70907b09d04d5203b60f95662f175572476171076447a6989e98e55349577`.
  The bilingual approval sheet is
  `reports/runtime/local-data-chain-closure/20260825/item-source-local-npc-admission/fresh-084753/owner-approval.zh-en.md`.
- Awaiting a new exact Owner approval. No permit, executor, DML, cleanup,
  staging, reset, stash, or commit is allowed before it.

## 2026-08-25 Item-source Admission Retry-04 Completed (09:15 CST)

- The new exact approval was consumed once by the canonical runner. Packet hash
  `sha256:89022a3d2359fd697db3fcc5562b23a222188bd0d8b13ad2f93e83e4bdd6f0b9`;
  decision identity `owner-item-source-local-npc-admission-20260825-085312-retry-04`.
  The transaction committed with `112` physical changes and wrote
  `result.json`; the one-time permit was revoked and is absent. The durable
  decision ledger records the identity and permit hash.
- Independent database readback confirms all selected rows: landing `8/8`,
  maint `8/8`, relation facts `22/22`, relation details `22/22`, shop
  relations `21/21`, loot relations `1/1`, local source inserts `21/21`, and
  reconciliation rows `9/9` with matching canonical hashes. Dryad row `192286`
  has its audited revision; Mining Helmet row `194208` is active and stale
  duplicates `198053`/`198054` remain soft-deleted.
- Public and admin Item source APIs were read back for ten admitted Item IDs;
  all Item detail requests succeeded and the source endpoint returned the
  admitted NPC provenance. Fresh local smoke is `5/5`.
- Quick cross-DB integrity is `9 pass / 1 warning / 0 blocking`. The one
  warning is six pre-existing local acquisition rows without relation/maint
  trace; none are among the 21 newly inserted rows or the nine reconciled
  identities. This remains a residual compatibility warning, not an Item
  admission failure.
- Post-admission partition evidence is
  `reports/runtime/local-data-chain-closure/20260825/item-source-local-npc-admission/fresh-084753/item-source-partition-post-admission.json`:
  `28 accepted`, `1295 duplicates`, `283 quarantine`, `748 blocked`,
  `0 unclassified`. API evidence is `fresh-084753/api-readback.json` and
  cross-DB evidence is `fresh-084753/cross-db-referential-integrity.json`.

## 2026-08-25 Item Lane Final Validation And Parent Review (09:25 CST)

- The final independent evidence set is
  `reports/runtime/local-data-chain-closure/20260825/item-source-local-npc-admission/final-0925/`.
  Its bilingual plan-auditor review is `closed` for
  `canonical-item-source-local-npc-admission`, with `blockers=[]` and parent
  verdict `blocked-independent-lanes`.
- Final gate evidence records Item-source Node `34/34`, Maven
  `1573 pass / 10 skipped / 0 failures`, Public pass, Admin pass, isolated
  user-auth E2E pass, full quality gate pass, local smoke `5/5`, cross-DB
  `9 pass / 1 warning / 0 blocking`, relation health `0 blocking / 1 warning`,
  and Boss source-chain audit `10/10`.
- The only residual warning is six pre-existing local acquisition rows without
  relation/maint trace; none is among the `21` inserted or `9` reconciled rows.
  The `283` quarantined and `748` blocked source identities remain explicitly
  unpromoted. They require a separate exact source and operation if revisited;
  this handoff must not synthesize evidence or replay retry-01 through retry-04.
- Parent status remains `blocked` only for the independent NPC canonical/loot,
  five image-ownership, and Boss/Shimmer terminal-result lanes. Git state
  remains intentionally dirty and unstaged: no cleanup, reset, stash, staging,
  or commit was performed. The next safe action is the smallest governed step
  in one of those parent lanes, with fresh evidence and no permit reuse.

## 2026-08-25 Parent Final Review (11:45 CST)

- The final parent evidence is indexed at
  `reports/runtime/local-data-chain-closure/20260825/parent-final-1055/closure-index.json`
  with bilingual companion `closure-index.zh.md`. The parent remains
  `blocked`; the index records two independent root blockers and no current
  continuation DML, permit consumption, external request, staging, or commit.
- Boss and Shimmer terminal metadata are now reconciled from immutable binlog
  evidence without replay. Boss owner-05 is bound to `144` updates across the
  five owned tables; Shimmer owner-06 has `0` changes in its four owned data
  tables and `16` metadata/snapshot inserts plus `15` updates. These counts are
  audit continuity evidence only and do not authorize a replay. The durable
  read-only reconciliation is
  `parent-final-1055/operation-closeout-reconciliation.json` with bilingual
  companion `.zh.md`.
- Image ownership is closed by the bound-evidence report at
  `parent-final-1055/image-lineage-bound-evidence.json` (`7/7` ready). Domain
  source panels, core smoke, cross-DB, relation health, Maven, Admin, Public,
  isolated user-auth E2E, and the full quality gate all pass; the cross-DB and
  relation-health warnings remain non-blocking.
- The first root blocker is real NPC canonical source drift: current read-only
  crawler facts are `33` with no producer key, versus the T2 anchor of `25` and
  `canonical-npc-landing:sha256:69f61c3b3bfa21c636be10a26711972454bacf4305a41707ec4ac241eb781d6e`;
  the current maint hash is
  `sha256:35fde48c7e6e14ea0501093ab88c890de35a421be979c18f5e901c8a1f798a0e`,
  not the anchored `sha256:564aefa6d0191787c3433270f7229c2936e2c3ef128e38bf2978c241d38f1284`.
  Do not fabricate `canonical-npc-apply.input.json` or refresh downstream
  layers from the drifted set.
- The exact read-only DB fingerprint is persisted at
  `parent-final-1055/npc-source-drift-readback.json` with bilingual companion
  `.zh.md`; it records the current crawler-fact count, missing producer key, and
  maint snapshot hash without attempting a refresh.
- The second root blocker is one duplicate stable relation identity:
  `UndeadMiner -> MiningHelmet`, quantity `1`, chance `5%`, empty condition.
  Relation IDs `609` and `1551` come from different source tables and facts;
  local projection ID `82353` is a single row. No row may be deleted or
  rewritten without a fresh governed retirement operation, Owner approval,
  one-time permit, apply, and independent parity readback.
- A fresh exact retirement proposal is now generated without DML:
  operation `canonical-npc-loot-duplicate-relation-retirement`, proposal
  `sha256:20f605f8b7f5262089af4ff7f69f4ab98091d4fb9c1478d5955cd2ae6f1e4309`,
  scope `sha256:612a93c6e77e4700103356f10eeb4de15f2e36b7f4d18b3fa0bad35f3f4e1679`,
  expected changed rows `1`. The request is `AWAITING_OWNER`; no packet or
  permit exists and no relation row changed. The bilingual exact approval
  sheet is
  `parent-final-1055/npc-duplicate-relation-retirement.owner-approval.zh-en.md`.
- Machine-readable bilingual blocker detail is
  `parent-final-1055/residual-blockers.json` and `.zh.md`. Parent close is not
  permitted until both blockers are cleared and the full fresh validation is
  rerun.

## 2026-08-25 Duplicate Relation Proposal (12:45 CST)

- The duplicate relation lane now has a fresh governed operation
  `canonical-npc-loot-duplicate-relation-retirement`. It was generated from a
  read-only DB snapshot after confirming relation `1551`, survivor `609`,
  projection `44`, and local row `82353`.
- Exact proposal: SHA-256
  `sha256:20f605f8b7f5262089af4ff7f69f4ab98091d4fb9c1478d5955cd2ae6f1e4309`;
  scope SHA-256
  `sha256:612a93c6e77e4700103356f10eeb4de15f2e36b7f4d18b3fa0bad35f3f4e1679`;
  expected physical changes `1`. The operation owns only
  `relation.item_npc_loot_relations.status_deleted` and will soft-disable
  relation `1551`; it will not touch the canonical survivor, projection, local
  rows, source facts, or maint rows.
- Canonical request is `AWAITING_OWNER` with request hash
  `sha256:350b891c3bf911222bd381edba6a8860fe0fe09b94750eb6750143db44d90c67`.
  No decision, packet, permit, or DML exists. The exact bilingual approval
  sheet is
  `reports/runtime/local-data-chain-closure/20260825/parent-final-1055/npc-duplicate-relation-retirement.owner-approval.zh-en.md`.
- Read-only current-state assertions pass: relation `1551` is active,
  survivor `609` is active, projection `44` points to survivor `609`, and the
  local projection has one row. Parent remains `blocked` pending exact Owner
  approval and governed apply/readback.

## 2026-08-25 NPC Canonical Source Partition Reconciliation (13:07 CST)

- The previous NPC source-drift blocker was traced to a partitioning defect in
  readiness reconciliation, not to a changed canonical NPC source. The local
  database contains `25` `wiki.npc.crawler_fact:*` rows from the anchored T2
  producer and `8` `local-npc-admission:*` rows owned by the already-closed
  Item-source lane.
- `pipelines/npc-canonical/npc-canonical-readiness.mjs` now filters both landing
  and maint evidence by the canonical NPC source prefix, while preserving the
  anchored 25-row hash shape and rejecting canonical producer/hash drift.
  Regression coverage is in
  `pipelines/npc-canonical/npc-canonical-readiness.test.mjs`.
- Fresh read-only readiness is `pass`: canonical crawler facts `25/25`,
  normalized and audit `25/25`, producer key matches the T2 anchor, maint
  snapshot matches `sha256:564aefa6d0191787c3433270f7229c2936e2c3ef128e38bf2978c241d38f1284`,
  and both admin/public API probes succeeded. No crawler, source refresh,
  canonical input fabrication, database write, permit consumption, staging,
  or commit was performed.
- Updated evidence: `parent-final-1055/npc-source-drift-readback.json`,
  `residual-blockers.json`, `closure-index.json`, and bilingual companions.
  The parent now has one remaining root blocker: the exact approved retirement
  of relation `1551` for the `UndeadMiner -> MiningHelmet` duplicate identity.

## 2026-08-25 Session Handoff Prepared (13:50 CST)

### Observed

- Repository/worktree: `/home/lolben/TerraPedia`; branch
  `feat/supplementary-domains-readiness`; `HEAD`
  `2644d411d2ff48be41b6709dca1bb891cb3d2452`.
- Upstream: ahead `19`, behind `0`.
- Worktree: `1183` dirty/untracked paths (`137` tracked unstaged and `1046`
  untracked), `0` staged. Existing dirty paths are intentionally preserved;
  no reset, checkout-discard, clean, stash, staging, commit, or push occurred.
- Local stack remains available on the reused slot: MySQL `127.0.0.1:13306`,
  backend `18091`, public `5177`, admin `3004`, Redis `6380`.

### Recorded

- NPC canonical source partition is resolved read-only. The readiness report is
  `pass`; canonical crawler facts are `25/25`, maint normalized/audit facts are
  `25/25`, and the anchored producer key/hash match. Eight
  `local-npc-admission:*` rows are explicitly excluded as Item-source facts.
- Focused readiness/manifest/duplicate-retirement suite is `69/69 pass`;
  `git diff --check` passes.
- Current closure index reports exactly one root blocker: duplicate stable
  relation `UndeadMiner | MiningHelmet | 1 | 5% | ''`, retirement target
  relation `1551`, survivor `609`, projection `44`, local row `82353`.
- Exact proposal remains `AWAITING_OWNER`:
  proposal `sha256:20f605f8b7f5262089af4ff7f69f4ab98091d4fb9c1478d5955cd2ae6f1e4309`;
  scope `sha256:612a93c6e77e4700103356f10eeb4de15f2e36b7f4d18b3fa0bad35f3f4e1679`;
  request hash `sha256:350b891c3bf911222bd381edba6a8860fe0fe09b94750eb6750143db44d90c67`.
- Current evidence hashes:
  readiness `sha256:5975437b31e3cc4085d0ad36b5f04c3a61c096cd5ac4dbf6f061d4bfc41020a9`;
  source readback `sha256:55cb4823c36929c5a5e3f1f3750eabe198b9ab69acb64e7b5fb786855c139276`;
  residual blockers `sha256:68df6abc6c92e28f8e936d8f6e7106247cfb7f9c9333e7b8b07aedbb2e6ad803`.

### Next safe action

Owner must approve the exact duplicate-relation proposal. Only after that may
the next session create the decision-derived packet and one-time permit, apply
the single soft-disable of relation `1551`, independently read back relation,
projection, local/API parity, then rerun smoke, cross-DB, relation health,
quality gate, and plan-auditor review. Do not replay any prior Item operation,
reuse an old permit, fabricate NPC canonical input, or broaden the scope.

### Unknown / not run

- No duplicate-relation packet, permit, decision, DML, or post-apply readback
  exists yet because exact Owner approval is missing.
- Full post-apply gates and final plan-auditor review have not been rerun; the
  parent must remain `blocked` until that single root is cleared.

## 2026-08-25 Terminal Closeout (17:40 CST)

- Exact approval was supplied and consumed once:
  `owner-npc-loot-duplicate-relation-retirement-20260825-01`.
- Registered operation `canonical-npc-loot-duplicate-relation-retirement`
  completed with packet hash
  `sha256:f1e35e49f974168ec44376d1371e9271e947157e852bc058acad79f01b86688a`,
  scope hash
  `sha256:612a93c6e77e4700103356f10eeb4de15f2e36b7f4d18b3fa0bad35f3f4e1679`,
  and `changedPhysicalRows=1`. Relation `1551` is inactive; survivor `609`
  remains active.
- Independent post-apply readback is
  `parent-final-1055/npc-duplicate-relation-retirement.post-readback.json`.
  It confirms projection `44`, local row `82353`, and API all expose one
  `MiningHelmet` entry with quantity `1` and chance `5%`.
- Fresh runtime parity is `418/418` pass (`1542` relation/projection/local/API
  rows). Fresh NPC closure smoke passes with zero blockers. Domain acceptance is
  `47/47 pass`; cross-db is `9 pass / 1 warning / 0 blocking`; relation health
  is `0 blocking / 1 warning`.
- Final quality gate passes with local Playwright Chromium and isolated user-auth
  E2E on independent ports `18191/15177`. Maven is `1573 pass / 10 skipped` and
  automation is `189/189`.
- Final machine-readable closure index is
  `parent-final-1055/closure-index.json`; residual blockers are zero and the
  final plan-auditor review is `pass`.
- The parent is closed. The worktree remains intentionally dirty and `0 staged`;
  no cleanup, reset, checkout-discard, stash, commit, or push was performed.

## 2026-08-26 Fresh Read-only Continuation (04:10 CST)

### Observed

- The closed parent remains at
  `reports/runtime/local-data-chain-closure/20260825/parent-final-1055/closure-index.json`
  with zero blockers. The standard local stack is reachable on MySQL `13306`,
  Backend `18091`, Public `5177`, Admin `3004`, and Redis `6380`.
- The worktree remains intentionally dirty with zero staged paths. No data
  mutation, external request, permit consumption, cleanup, reset, stash,
  commit, or push was performed in this continuation.

### Recorded

- `bash ./platform/local/verify-local-stack.sh --skip-front` passed Backend
  compile and Admin typecheck. Direct read-only probes returned Backend
  actuator `200`, Public `200`, Admin `302`, and Redis `PONG`.
- `node platform/local/acceptance-test.mjs --db-host=127.0.0.1
  --db-port=13306` completed `19 passed, 0 failed, 0 skipped`.
- Fresh read-only core smoke is `OK: true`; cross-DB is `9 pass / 1 warning /
  0 blocking`; relation health is `0 blocking / 1 warning`; NPC source
  coverage is `762/762`; NPC domain-chain release blockers are `0`; and NPC
  closure smoke passes using the final independent `418/418` trusted parity
  evidence.
- Direct read-only MySQL readback still shows relation `609` active,
  relation `1551` inactive, projection `44` with one `MiningHelmet` (`1`,
  `5%`), and local row `82353` active with the same quantity/chance.
- Binding the current authorized
  `reports/runtime/local-data-chain-closure/20260824/fresh-183332-item-final/item-image-origin-evidence.json`
  produces a fresh `7/7` image-lineage report. The generic acceptance image
  step omits this required evidence binding and reports `6/7` with
  `invalid_item_image_projection_apply_evidence`; this is a validation-entry
  gap, not a current relation/projection image mismatch.

### Unknown / Not Run

- A fresh API parity replay was attempted with `--max-rate-limit-retries=0` and
  failed closed on loopback HTTP `429`; it did not alter the database. The
  final independent `418/418` parity report remains authoritative for this
  closed operation. A future acceptance-harness repair may bind the current
  origin evidence and enforce semantic readiness, but that is a separate code
  task and is not required to replay or reopen this data operation.

### Next Safe Action

- No required parent-closure action remains. Preserve the current closure
  index, final plan-auditor pass, zero blocker count, and intentionally dirty
  unstaged worktree. Do not replay DML, permits, Item operations, or the
  duplicate-relation retirement.
