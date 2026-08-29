# Devlog: remaining closure remediation

## Status

`active`

Formal plan is [2026-08-22-remaining-closure-remediation.md](../../superpowers/plans/2026-08-22-remaining-closure-remediation.md). It replaces no historical evidence and targets only the unclosed Item-source, strict projection-parity, quality-gate, and broad-Maven blockers.

## Scope

- Quality tests become hermetic without creating authorization records.
- Item source may write only through a new, exact canonical operation after a fresh accepted/quarantine partition.
- Items/NPCs/Bosses parity may write only relation-backed fields through three narrow canonical operations.
- NPC/Boss loot, Projectile, Biome, and Item image are regression-only lanes.

## Decisions

- Missing historical authorization paths are a test-fixture isolation defect, not permission to fabricate authorization history.
- A missing relation fact is a blocker, not permission to copy local fields into projection.
- The coordinator remains the only writer of `docs/devlog/current.md`; all mutation owners are serial.

## Validation

- Plan reviewed against goal/source-chain/boundary/evidence/continuity/ownership/closeout gates in its Formal Plan Review section.
- Plan must pass `git diff --check` and a placeholder scan before execution.

## Follow-up

- Fresh run roots:
  - pre-mutation: `reports/runtime/local-data-chain-closure/20260822/remaining-remediation/144449-remaining-remediation/`
  - post-parity: `reports/runtime/local-data-chain-closure/20260822/remaining-remediation/151930-remediation-post-parity/`
- Hermetic quality fixtures are repository-owned under `pipelines/test-fixtures/canonical/`; no historical authorization files were recreated or consumed by the three repaired contract suites (`22/22`).
- Admin contract repair is validated by focused Maven (`66/66`) and broad Maven (`1573 pass, 10 skipped`).
- A new narrow local parity adapter applied only named Items/NPCs projection fields in one transaction and readback; cross-DB and relation-health blocking counts remain `0`. This adapter is not yet registered in the canonical operation catalog or backed by a consumed formal permit, so it is retained as an active process-compliance follow-up rather than claimed as a formal governed apply. The strict smoke still blocks 5 local-only Item keys and 4 Boss pillar Chinese-title gaps because relation evidence is absent; no local-to-projection copy was performed.
- Item-source governed partition is read-only across `2354` source rows with
  `accepted=0`, `duplicate=1295`, `quarantine=311`, `blocked=748`, and
  `unclassified=0`; no Item-source DML, proposal, decision, packet, or permit
  was created.
- Quality-gate automation suite is `189/189`; the full gate exits `1` at domain acceptance because existing Item image/support recipe/support shimmer/B1 panels remain blocked. Public-web check reaches a local Chromium snap profile timeout; Admin check exits `0`.
- Formal closure remains blocked. Next bounded action is to obtain relation-backed evidence for the 5 Item identities and 4 Boss pillar titles, then create separate registered canonical operations with fresh scope hashes before any further DML.

## 2026-08-23 Progress Audit

- Fresh smoke report: `reports/relation/local-core-compat-smoke-20260823-progress.json`.
- NPCs, Projectiles, and Buffs remain passing. Items still have five missing projection keys (`HeartArrow`, `ValentineRing`, `TurkeyFeather`, `FestiveTopHat`, `Wiesnbrau`).
- Boss source-chain inspection found the four pillar rows in `data/generated/wiki-bosses.latest.json` with Chinese titles, while the current `terria_v1_local.source_dataset_landings`, `terria_v1_maint.maint_bosses`, and `terria_v1_relation.relation_bosses` rows contain null Chinese title fields. The existing parity adapter therefore has no relation-backed Boss value to authorize.
- No local-to-projection copy was performed. Closure remains `blocked` pending a fresh governed landing/source repair and formal parity operation registration.

## 2026-08-24 Progress Audit

- Fresh Boss source-chain evidence reconciles the August governed refresh with
  the live database. Relation-bound maint and landing keys are now selected
  explicitly, avoiding false failure from duplicate historical maint titles.
- Boss source-chain audit and parity proposal pass with zero projection rows to
  apply. Core smoke, cross-DB, and relation-health checks are fresh and have no
  blocking relation/core failures.
- Item source remains fail-closed at `accepted=0`, `duplicate=1295`,
  `quarantine=311`, `blocked=748`; the fresh bilingual blocker is the only
  valid Item result.
- Full Maven is green after a minimal test-only PID-file readiness repair; Admin
  is green. Public Chromium snap timeout and two domain acceptance blockers
  (Shimmer generation drift, missing canonical NPC input) remain open.

## 2026-08-24 Shimmer And Final-Gate Audit

- Shimmer generation drift is closed through governed operation
  `automation-shimmer-first-l1`, run `shimmer_l1_20260824closure01`, and fresh
  decision `automation-shimmer-first-l1-20260824-owner-06`. Run/apply terminal
  states are `COMPLETED`/`COMMITTED`; four generations are `9`, table counts are
  unchanged, seven current-generation snapshots read back, and the temporary
  permit is revoked. See git for code-level diff details.
- Shimmer readiness and its 69-test focused suite pass. Post-write core smoke,
  Boss source-chain, Maven, Admin, and Public pass; cross-DB and relation health
  retain zero blocking checks. Full quality automation is `189/189`, with
  domain acceptance `46 pass / 0 warning / 1 blocked`.
- Item source is still `accepted=0` and therefore has no
  operation/permit/DML. NPC readiness cannot be regenerated because
  `reports/authorization/canonical/canonical-npc-apply.input.json` is absent;
  the stale readiness panel fails closed. The quality-gate failure is a
  derived result of that NPC input blocker, not a separate root blocker.
- Latest evidence index and bilingual summary are under
  `reports/runtime/local-data-chain-closure/20260824/fresh-042509/`. Later Task
  7 evidence expands the known root-blocker set; Parent and this entry remain
  open, and no staging or commit is authorized.

## 2026-08-24 Task 7 Final Surface Audit

- Corrected Item partition tests pass `5/5`. The fresh artifact conserves
  `2354 = 0 accepted + 1295 duplicate + 311 quarantine + 748 blocked`, with
  no overlap and `unclassified=0`. See git for code-level diff details.
- NPC source coverage passes for `762` NPCs. Domain and runtime audits both
  block the same six `count_parity_only` rows: `CrimsonAxe`, `CursedHammer`,
  `CursedSkull`, `Hornet`, `JungleSlime`, and `ManEater`. Relation/projection
  use flattened chance text while local/API use the accepted Wiki modes
  template. A read-only eligibility check failed with `target set drifted`, so
  no NPC DML or consumed-permit replay was attempted.
- Independent review found the original Biome `47/47` result was a false pass:
  the audit used a legacy `localhost:9000` default and image lineage exempted
  every Biome projection fallback. One TDD owning-lane repair now uses the
  shared current-origin policy and removes that broad exemption. Focused tests
  pass `25/25`; fresh Biome readiness is warning (`7/47` managed, `40` legacy-
  origin unmanaged) and image lineage is ready for `2/7`. See git for code-level
  diff details.
- The first local stack smoke overlapped the fast NPC API audit and returned
  four HTTP 429 responses. After that audit reached terminal state, the one
  allowed rerun passed `5/5`; this is resolved transient evidence, not a root
  blocker or a MySQL restart requirement.
- Admin full `pnpm run test` passes `413/413`, Nuxt typecheck, and Nuxt build.
  Maven, Public, core smoke, cross-DB, relation health, and Shimmer retain their
  previously recorded final results.
- After the Biome audit repair, combined Item/Biome/image focused tests pass
  `41/41`. A fresh full quality gate again passes automation `189/189` and
  reports domain acceptance `46/47`; its sole blocked panel is still the
  missing NPC canonical input, with no new unexpected failure.
- Five blocker groups contain ten independent root causes: Item source (1);
  missing canonical NPC input and six-row NPC loot identity regression (2);
  five not-ready image ownership lanes (5); and missing exact changed-row
  closeout metadata for both Boss owner-05 and Shimmer owner-06 (2). Quality
  gate exit `1` remains derived only from the missing NPC input.

## 2026-08-24 Final Review Coordination

- Coordinator: Codex (`/root`); status: active; owns shared devlog state and
  all edits.
- Reviewer: `final_plan_audit`; status: completed; scope: read-only audit of the
  executed 12-step closure plan, the fresh closure index, residual blockers,
  plan-auditor report, and current handoff conclusions.
- Allowed paths: the plan, active closure devlog entries, and
  `reports/runtime/local-data-chain-closure/20260824/fresh-042509/` evidence.
  Forbidden: every file write, database/service mutation, external request,
  staging, commit, cleanup, and permit/authorization action.
- Result: reviewer found the Biome false pass, one stale indexed hash, a stale
  two-blocker plan-auditor report, and grouped blocker counts presented as
  independent roots. The coordinator repaired the two audit predicates,
  regenerated Biome/image reports, expanded 5 groups to 10 roots, and rebuilt
  the closure/plan-auditor evidence. Verdict remains `blocked`; source-chain,
  evidence, and commit-readiness gates are blocked.

## 2026-08-23 Item Reclassification Audit

- The five previously reported Item projection gaps are confirmed non-PC legacy entities: each local row points to a Wiki `旧版:` page and has no PC `maint_items`, `relation_items`, or projection row. The readiness audit now classifies Wiki legacy pages as explicit local-only exceptions; the focused audit/smoke tests pass and fresh smoke reports `items.ok=true` with `13` accepted local-only exceptions.
- This closes the Item *core projection parity* sub-chain only. It does not close the Item domain overall: the governed Item-source partition still has `accepted=0`, `duplicate=1295`, `quarantine=2022` and no source operation was authorized or applied.
- Boss closure is independently still blocked. The current generated Wiki snapshot contains the four Pillar `titleZh`/`sourceUrlZh` values, but the active landing rows are April `legacy_compat` records with null fields. The loss occurs at stale landing selection, before `maint_bosses` and `relation_bosses`; the synchronization code itself preserves `titleZh` when present.

## 2026-08-23 Continuation And Blocker Index

- Before any DML, the Boss source-refresh lane was corrected to match the operator-approved allow-list. The former implementation also wrote maint landing and Boss image columns; the repaired implementation writes local landing plus maint/relation/projection Chinese title ownership only and feeds maint sync from the local landing snapshot. The regression suite is `78/78`.
- The correct Boss parity proposal entrypoint is `pipelines/relation/apply-core-projection-parity.mjs`; it cannot generate a fresh proposal while MySQL is offline because it reads relation state. The old empty Boss proposal is explicitly stale and is not authorization evidence.
- Fresh runtime attempts fail closed at `127.0.0.1:13306` and `127.0.0.1:18091`. Full quality gate automation passes `189/189`; domain acceptance remains `45/47` with two blockers (Shimmer current-generation mismatch and NPC readiness report older than the freshness window).
- Item-source partition remains `accepted=0`, `duplicate=1295`, `quarantine=2022`, `unclassified=0`; no operation/permit/apply was created. Shimmer pointer drift and NPC stale readiness must be repaired by their owning lanes, not by editing old evidence.
- Final bilingual index: `reports/runtime/local-data-chain-closure/20260823/fresh-154455/closure-index.json` and `closure-index.zh.md`. Parent remains blocked; no commit or staging is permitted.
- Plan-auditor verdict is `blocked` in `reports/runtime/local-data-chain-closure/20260823/fresh-154455/plan-auditor-review.json`; six blockers remain. Final checks pass `git diff --check` and agent-skill parity, with `0 staged` and the intentionally dirty worktree preserved (`124 modified + 486 untracked`).

## 2026-08-24 Ten-Blocker Repair Approval

- The operator approved Scheme A: local evidence recovery, exact serial
  governed operations, consolidated proposal authorization, independent
  readback, and full final gates.
- Approved design:
  `docs/superpowers/specs/2026-08-24-ten-blocker-closure-design.md`.
- Executable plan:
  `docs/superpowers/plans/2026-08-24-ten-blocker-closure.md`.
- This approval authorizes implementation, freeze, and proposal generation.
  Database mutation remains behind one consolidated exact-proposal confirmation.
- Existing boundaries remain unchanged: no external access, direct SQL,
  fabricated Item evidence, consumed-permit replay, cleanup, staging, or commit.

## 2026-08-24 NPC Terminal Reconciliation Finding

- The missing private NPC input is no longer treated as authority to recreate
  an old authorization artifact. Fresh reconciliation is anchored to the exact
  passing T2 readiness Git object at commit
  `0ad73c20d1bb204ebfc9aeb8d63cd039a20f99bf` and reports current readback.
- That readback exposed the real loss: `terria_v1_relation.npc_buff_relations`
  has `0` rows while local has `1,270` active rows.
- Existing `secondary-relation-processor` regenerates exactly `1,270` rows from
  current maint NPC/Buff data plus 16 matched crawler facts (`1,141 immune`,
  `129 inflicts`). Its normalized tuple multiset exactly equals local evidence;
  both hashes are
  `sha256:60a4161436e2de406c45b3914807bd007543bf32f7b2550614a6c8b24f83e75a`.
- The plan now requires a separate Buff-owned exact proposal. Broad
  `sync-maint-to-relation`, local-to-relation copying, and database mutation
  before consolidated proposal confirmation remain forbidden.

## 2026-08-24 NPC Loot Identity Root-Cause Repair

- The previous six-row plan incorrectly treated this as chance-text-only drift.
  Fresh readback proves the six active rows belong to legacy
  `generated.item_relations_bundle:chunk:0001`; all six canonical
  `generated.npc_item_relations_bundle` relation keys are absent.
- Canonical authority remains complete without recreating private authorization
  input: landing `12474`, six active maint rows, six active source facts, the
  immutable T2 readiness object at
  `0ad73c20d1bb204ebfc9aeb8d63cd039a20f99bf`, and frozen accepted projection
  `sha256:2e499d5b089a83f9654828a69113c1994a71d52a026cf6ea377b094be0dec6a4`.
- Task 4 now owns exactly six canonical relation inserts, six legacy relation
  retirements, and six projection loot-array element replacements. Local rows
  already retain the accepted Wiki modes identities and are read-only; source
  facts/details, maint, and landing are also read-only. No DML, permit, packet,
  staging, cleanup, or commit was performed for this finding.
- The fresh registered operation is
  `canonical-npc-loot-identity-restoration`. Its proposal under the `072100`
  run root binds exact scope
  `sha256:b88dd7eedc5ca39292a4a1399600603bbc9531a27e25fe8febffc253e4273595`
  and byte hash
  `sha256:1f23a7f5dcdd0c5fe4a5f2db8a58b266c8902ce23cc64ac953c66c7dd05e8383`.
  Focused operation tests pass `13/13`, authorization/manifest integration
  passes `85/85`, and an independent locked readback matches before hash
  `sha256:60fd9c6b6b232f429271d6582710bb166ad87e6beaf9272e2d448741c321d204`.
- The landing is explicitly owned by
  `terria_v1_local.source_dataset_landings.id=12474`; the same numeric ID in
  `terria_v1_maint` is an unrelated Item page. The proposal freezes this
  cross-database ownership and distinguishes landing provider
  `terrapedia.generated` from relation source provider `terraria.wiki.gg`.
  No input, request, packet, permit, result, or DML exists for this proposal.

## 2026-08-24 Image-Lane Live-State Correction

- Fresh SELECT-only readback supersedes the Task 5 assumptions. Item has 6,131
  relation image values and 6,131 projection image values with exact current
  equality; it is evidence/classification-only unless a real delta appears.
- NPC has 758 relation/projection images and Projectile has 1,110, with exact
  equality but a stale absolute `localhost:9000` origin. Their bounded repairs
  may derive only the identical origin-free entity-bucket path and may write
  only the projection image column. Biome likewise has 40 legacy-origin rows
  plus seven already origin-free controls.
- Armor is not an adapter false negative: live `projection_armor_sets` has zero
  rows. The 2026-08-23 relation snapshot contains 63 sets, 470 set items, 175
  image facts, 246 armor attributes, and 320 equipment effects, and the current
  projection builder deterministically produces 63 Armor rows from it.
- Root cause: the aborted broad synchronizer cleared projection tables, while
  both `recover-projections-from-relation.mjs` and governed recovery v2 limited
  their allow-lists to the five core projection tables and never restored
  Armor. The historical 88-row projection is backup evidence only.
- The plan and design now require a separate insert-only 63-row Armor
  restoration before image reassessment. No proposal/packet/permit/DML was
  created for the corrected image lanes in this update. See git for code-level
  diff details.

## 2026-08-24 Resume State Reconciliation

- Resume verification at `2026-08-24 09:20 CST` matches the recorded worktree,
  branch, HEAD, and upstream distance. The worktree now has `958` status entries
  (`130` tracked dirty plus `828` untracked) and `0` staged, compared with the
  handoff's `937` (`127` plus `810`). This is recorded as stale workspace-count
  metadata; no reset, cleanup, stash, staging, or discard was performed.
- The standard local ports are listening on MySQL `13306`, backend `18091`,
  public `5177`, admin `3004`, MinIO `19000`, and Redis `6380`. The old generic
  `/actuator/health` probe returns the running Tomcat application's expected
  `404`; runtime identity will be verified through the repository smoke and
  manifest paths before any mutation.
- The `072100` run root contains no-write proposals for NPC Buff recovery, NPC
  loot identity restoration, NPC / Projectile / Biome origin normalization,
  and Armor projection restoration, plus Item-source exhausted evidence and
  Boss/Shimmer immutable reconciliation artifacts. Independent proposal
  rebuild/hash verification remains the next action. No request, packet,
  permit, result, or DML is inferred from proposal presence.

## 2026-08-24 Consolidated Proposal Readiness

- Boss owner-05 and Shimmer owner-06 terminal results are now reconciled from
  immutable binlog evidence: Boss has exactly `144` row events and Shimmer has
  exactly `31`. Neither operation was replayed and current table counts were not
  used as historical changed counts. Evidence is in the two
  `*-binlog-reconciliation.result.json` files under run `072100`.
- Seven live proposals independently rebuild byte-for-byte. Item is no longer a
  no-DML lane: `331` relation/projection identities both contain the obsolete
  `localhost:9000` origin, so the exact proposal updates `662` physical rows and
  preserves `15` projection-only legacy identities as quarantine. The remaining
  proposals cover NPC Buff `1270`, NPC loot `18`, NPC image `758`, Projectile
  image `1110`, Biome image `40`, and Armor projection `63` physical rows.
- The Buff root cause was proposal/authorization coupling. The initial proposal
  run also wrote fixed-name input/manifest/request files; later catalog drift
  made them stale while no-overwrite correctly prevented replacement. The
  implementation now separates proposal generation from authorization
  preparation and binds the current technical attempt to private
  `.retry-01.*` paths. The three original fixed-name files remain byte-preserved.
- TDD evidence: the new separation test failed first because the authorization
  entrypoint did not exist, then the focused Buff/manifest/authorization suite
  passed `78/78`. No retry input, manifest, request, packet, permit, result, or
  database mutation has been created.
- Current repository observation is `958` status entries (`130` tracked dirty,
  `828` untracked), `0` staged at HEAD `2644d411`; this supersedes earlier dirty
  counts without authorizing cleanup, staging, stash, or commit.
- Owner confirmed the exact seven-proposal batch at `2026-08-24 11:53 CST`
  using batch binding
  `sha256:bf56a7b9446d18c06188b2387d05c82874a00f646e29037f353e864c986cefcf`.
  A fresh read-only pre-write check reconstructed all proposal hashes and
  confirmed the exact before-counts, server UUID, `3921` total physical rows,
  and zero other active InnoDB transactions. Technical authorization generation
  and serial governed execution are now in progress.

## 2026-08-24 Post-Authorization Resume Reconciliation

- Read-only resume checks at `2026-08-24 12:09 CST` still match branch
  `feat/supplementary-domains-readiness`, HEAD `2644d411`, upstream distance
  `ahead 19 / behind 0`, `0 staged`, and the six expected listening local
  ports.
- Git status now reports `982` entries (`130` tracked dirty plus `852`
  untracked), exactly 24 additional untracked paths since the `11:53` snapshot.
  They are the owner-input, fingerprint/policy, and generated authorization
  preparation artifacts created after the exact batch confirmation; no tracked
  path changed in this discrepancy.
- The count change is classified as stale handoff metadata and is reconciled,
  not cleaned. Before any permit generation, every execution manifest must be
  checked against the current code bundle. Existing authorization artifacts
  remain immutable and any stale attempt must advance to a no-overwrite retry
  path.

- Buff owner-07 was then executed through the authorized canonical runner and
  committed exactly `1270` rows. A first independent readback script falsely
  mismatched because it hashed raw driver values without the operation's
  canonical row normalization. The corrected independent readback applies the
  explicit numeric/empty-string/ISO-timestamp/key-order mapping and matches
  the approved after hash
  `sha256:96109a7d338d4b122cd71e7f1a1c947cb818687324a036ea1c8f6ea826cb7bc9`.
  The false alarm caused no retry, rollback, or additional write.

## 2026-08-24 Serial Apply Stop At Armor Drift

- The authorized runner completed Buff (`1270`), NPC loot (`6/6/6`), Item
  image (`662` physical), NPC image (`758`), Projectile image (`1110`), and
  Biome image (`40`) with independent readbacks matching their approved after
  hashes. Their decisions are durably recorded in `used-decisions.json`.
- Armor owner-13 was dispatched last and stopped during the transaction's
  source-snapshot lock before permit consumption or any INSERT. The approved
  source hash was `sha256:e7426beb69ecc1eaa0be12c31d805e2eb022720874559b7f2f997c3fadf3e650`;
  the current read-only source hash is
  `sha256:7383382e906cd3cb735aa164718fd49c077c6558f9cedefc0b9557ab99b291b1`.
- Root cause is deterministic: the Armor source snapshot includes all
  `relation_item_images`, and the approved Item image lane legitimately
  changed 331 of those relation values before Armor ran. The Armor table is
  still empty and no Armor result file exists. The failed owner-13 decision
  and packet are retained evidence; they cannot be replayed.
- Database mutation is stopped. The next safe action is read-only closure
  auditing plus a fresh no-overwrite Armor proposal bound to the current
  Item-after source state. That proposal must receive a new exact owner
  confirmation before any permit or DML.
