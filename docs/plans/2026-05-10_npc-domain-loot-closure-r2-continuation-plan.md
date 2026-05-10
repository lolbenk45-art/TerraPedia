# NPC Domain Loot Closure R2 Continuation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for execution. This continuation starts after commits `c9b6d34`, `7bc7377`, and `670fe9c` on branch `fix/npc-domain-loot-closure-r2`. Steps use checkbox (`- [ ]`) syntax for tracking. This is a whole NPC-domain closure plan, not a Mimic, Scarecrow, Hornet, Zombie, Present Mimic, or other family patch.

**Goal:** Drive NPC loot from the R2 blocked baseline to a reproducible closure path where every active NPC has direct trusted loot, reviewed inherited loot, reviewed expected-zero status, or an explicit remaining blocker with no hidden public API fallback pollution.

**Architecture:** Preserve the canonical chain: `wiki/crawler source -> standardized NPC loot -> landing/maint source rows -> item_source_facts/source_details -> item_npc_loot_relations -> projection_npcs -> npc_loot_entries -> public API/UI`. R2 has already removed public fallback pollution and strengthened scoped variant evidence; this plan now turns those code fixes into domain-wide evidence, dry-run deltas, controlled apply, and final audit gates.

**Tech Stack:** Node.js crawler/audit/relation scripts, MySQL `terria_v1_maint` / `terria_v1_relation` / `terria_v1_local`, Spring Boot public/admin NPC APIs, Nuxt/Vue public/admin UI, Markdown contracts and audit docs.

---

## R2 Starting State

Branch: `fix/npc-domain-loot-closure-r2`

Committed prerequisites:

- `c9b6d34 docs: record NPC loot closure r2 baseline`
- `7bc7377 fix: keep fallback NPC loot out of public aggregate`
- `670fe9c fix: preserve scoped NPC variant loot evidence`

Baseline reports:

- `reports/audit/npc-source-coverage-inventory-2026-05-10-r2-baseline.json`
- `reports/audit/npc-domain-loot-chain-2026-05-10-r2-baseline.json`
- `reports/audit/npc-loot-runtime-parity-2026-05-10-r2-baseline.json`

Current baseline blockers:

| Gate | R2 baseline value | Closure meaning |
| --- | ---: | --- |
| `activeNpcs` | `762` | Full domain scope. |
| `unclassifiedZero` | `319` | Must become contract-backed expected-zero, contract-backed inheritance, materialized direct loot, or explicit blocker. |
| `blockedSourceGap` | `193` | Source missing or group-page variant extraction still blocks closure. |
| `blockedGenericBucket` | `68` | Must not be fanned out without exact reviewed evidence. |
| `blockedAmbiguousVariant` | `7` | Must resolve to exact evidence or reviewed non-materializable blocker. |
| `blockedNonNpcSource` | `407` | Must become reviewed non-NPC exclusions or leave closure blocked. |
| `blockedMissingItemOrNpcIdentity` | `25` | Must resolve item/NPC identity or remain blocker. |
| `relationGap` | `6` | R2 materialization allowlist should clear this after canonical dry-run/apply. |
| `apiGap` | `214` | Must be remeasured after public fallback code is running and data has been synced. |
| `duplicateOrPolluted` | `30` | Must be split into code-vs-data causes. |
| Runtime `blockingCount` | `397` | Must be remeasured after stack restart on R2 code. |
| Runtime `duplicate_or_polluted` | `397` | Expected to drop after `7bc7377`, but only a post-restart audit can prove it. |

Read-only agent findings that shape this plan:

- `319 unclassifiedZero` splits into `147 source_page_present_no_loot` expected-zero review candidates and `172 source_page_present_with_loot` hard blockers.
- Coverage inventory gaps are raw counts: `source_page_missing = 114`, `group_page_present_variant_not_extracted = 96`; domain release blockers are different counts and must not be mixed.
- `group_page_present_variant_not_extracted = 96` roughly splits into same-display/internal-name variants and segment/body/multipart inheritance candidates.
- Source-row blocker counts are dominated by non-NPC/pseudo-source rows and duplicate source identities; they are not safe NPC loot rows.

---

## Hard Boundaries

- Do not hand-edit `npc_loot_entries`, `item_npc_loot_relations`, `projection_npcs`, `npcs.loot_items_json`, or `item_acquisition_sources`.
- Do not run `--apply=true`, import, backfill, load, or DB mutation commands before Phase 6.
- Do not auto-fan-out generic buckets such as `Mimics`, `Hornets`, `Zombies`, `Skeletons`, `Scarecrows`, `Pigrons`, `Mummies`, `Ghouls`, `The Twins`, or segment-family display names.
- Do not classify expected-zero from current zero counts. Contract evidence must exist.
- Do not classify inheritance from same display name alone. Contract evidence and a trusted source NPC must exist.
- Do not treat runtime fallback as public trusted loot. Public `aggregate.loot` must contain only direct structured rows.
- Do not use named examples as acceptance. Examples are regression samples only.
- Do not commit generated reports, console captures, or crawler outputs unless the plan explicitly names them as audit evidence.
- Do not use `git add .`.

---

## Parallel Work Lanes

Read-only work can run in parallel:

- Lane A: zero-loot classification and contract candidate review.
- Lane B: source coverage / group-page extraction evidence review.
- Lane C: source-row taxonomy blockers and reviewed non-NPC exclusions.
- Lane D: runtime parity after R2 public API fallback removal.

Serial write boundaries:

- Contract docs have one editor at a time.
- `npc-parser.mjs` / bridge / bundle crawler files have one editor at a time.
- Relation/audit script files have one editor at a time.
- DB dry-run/apply is owned by one coordinator.
- Stack restart happens only after code commits are complete and before runtime audits.

---

## Phase 0: Post-R2 Rebaseline

**Purpose:** Prove the R2 code changes changed runtime/API evidence before doing more data work.

**Files:**

- Create: `docs/audits/2026-05-10_npc-domain-loot-closure-r2-post-code.md`
- Read: `reports/audit/*2026-05-10-r2-baseline*.json`

- [ ] Confirm clean branch state.

```powershell
git status --short --branch
git log --oneline -6
```

Expected:

- Branch is `fix/npc-domain-loot-closure-r2`.
- Worktree is clean.
- Latest commits include `7bc7377` and `670fe9c`.

- [ ] Restart local stack only to load R2 code, not to apply data.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\stop-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
```

- [ ] Generate read-only post-code audits.

```powershell
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-10-r2-post-code
node scripts/data/audit/npc-domain-loot-chain-audit.mjs --write-report=true --date-tag=2026-05-10-r2-post-code
node scripts/data/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --date-tag=2026-05-10-r2-post-code
```

Allowed exit codes:

- Source coverage must exit `0`.
- Domain audit may exit `0` or `2`.
- Runtime parity may exit `0` or `1`.

- [ ] Write the post-code audit doc with before/after counts.

Required comparison:

```text
runtime blockingCount: r2-baseline -> r2-post-code
runtime duplicate_or_polluted: r2-baseline -> r2-post-code
domain apiGap: r2-baseline -> r2-post-code
domain duplicateOrPolluted: r2-baseline -> r2-post-code
domain relationGap: r2-baseline -> r2-post-code
```

**Exit gate:**

- Public fallback pollution must decrease or be explained with exact API/runtime evidence.
- If `runtimeMode` is still missing for direct rows, stop and fix API serialization/audit extraction before data work.
- No DB writer ran.

---

## Phase 1: Zero-Loot Classification And Contracts

**Purpose:** Eliminate `unclassifiedZero` by evidence classification, not by current database absence.

**Files:**

- Modify: `docs/contracts/npc-domain-expected-zero-contract.md`
- Modify: `docs/contracts/npc-domain-loot-inheritance-contract.md`
- Create: `docs/audits/2026-05-10_npc-domain-loot-r2-zero-classification.md`
- Modify if needed: `scripts/data/audit/npc-domain-loot-chain-audit.mjs`
- Modify if needed: `scripts/data/audit/npc-domain-loot-chain-audit.test.mjs`

- [ ] Export rows where `npcStatus = unclassified_zero` from the post-code domain report.

Use this read-only helper command:

```powershell
@'
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('reports/audit/npc-domain-loot-chain-2026-05-10-r2-post-code.json', 'utf8'));
const rows = report.npcStatuses.filter((row) => row.npcStatus === 'unclassified_zero');
const byCoverage = rows.reduce((acc, row) => {
  acc[row.sourceCoverageStatus] = (acc[row.sourceCoverageStatus] ?? 0) + 1;
  return acc;
}, {});
console.log(JSON.stringify({ total: rows.length, byCoverage }, null, 2));
console.log(rows.slice(0, 50).map((row) => `${row.npcInternalName}\t${row.npcName}\t${row.sourceCoverageStatus}\t${row.maintSourceCount}`).join('\n'));
'@ | node -
```

- [ ] Split each row into exactly one triage class.

Allowed classes:

| Class | Rule |
| --- | --- |
| `expected_zero_candidate` | Source/review evidence says this NPC is not a killable direct loot owner. |
| `inheritance_candidate` | Target does not own loot directly but has reviewed representative/source NPC. |
| `source_present_materialization_defect` | `maintSourceCount > 0` or source page has loot but canonical relation/local/API is zero. |
| `source_missing_or_group_variant_gap` | Coverage is missing or group-page extraction is incomplete. |
| `parser_or_identity_defect` | Evidence exists but item/NPC identity cannot resolve safely. |
| `needs_human_review` | Anything not safely classified above. |

- [ ] Add expected-zero rows only for reviewed candidates.

Required row format:

```md
| npcInternalName | npcType | reason | evidenceSource | reviewedBy | reviewedAt |
```

Accepted reasons must be one of the reasons already listed in `npc-domain-expected-zero-contract.md`.

- [ ] Add inheritance rows only for reviewed representative mappings.

Required row format:

```md
| targetNpcInternalName | sourceNpcInternalName | inheritanceKind | evidenceSource | reviewedBy | reviewedAt |
```

Accepted inheritance kinds must be one of:

```text
segment_family
prototype_variant
same_name_variant
```

- [ ] Add or update audit tests if contract precedence regresses.

Required test behavior:

```text
expected_zero contract row must not become blocked_source_gap
inheritance contract row must not become runtime_fallback_only when source NPC has trusted structured loot
invalid contract row must not authorize closure
```

**Exit gate:**

- `unclassifiedZero = 0`, or every remaining row is listed as `needs_human_review` and closure remains blocked.
- No expected-zero row is based on current zero DB count.
- No inheritance row is based on same display name alone.
- Contract tables contain no `_none yet_` placeholder once real rows are added.

---

## Phase 2: Source Coverage And Group-Page Variant Extraction

**Purpose:** Reduce `blockedSourceGap` and raw `group_page_present_variant_not_extracted` through pattern-level crawler/bridge fixes.

**Files:**

- Modify if needed: `scripts/data/crawler/src/domains/npc-parser.mjs`
- Modify if needed: `scripts/data/crawler/src/bridge/build-npc-standardized-bridge.mjs`
- Modify if needed: `scripts/data/crawler/src/bridge/npc-bridge-match.mjs`
- Modify if needed: `scripts/data/crawler/src/coverage/build-npc-coverage-targets.mjs`
- Modify if needed: `scripts/data/fetch/build-npc-item-relations-bundle.mjs`
- Tests: `scripts/data/crawler/tests/npc-parser.test.mjs`
- Tests: `scripts/data/crawler/tests/build-npc-standardized-bridge.test.mjs`
- Tests: `scripts/data/crawler/tests/npc-coverage-targets.test.mjs`
- Tests: `scripts/data/fetch/build-npc-item-relations-bundle.test.mjs`
- Create: `docs/audits/2026-05-10_npc-domain-loot-r2-source-coverage.md`

- [ ] Categorize raw source coverage gaps from the post-code source coverage report.

Required categories:

```text
source_page_missing_exact_alias_needed
source_page_missing_true_gap
group_page_same_display_variant
group_page_image_scoped_variant
group_page_segment_inheritance_candidate
group_page_shared_generic_bucket
source_page_present_no_loot_review
source_page_present_with_loot_parse_or_materialization_gap
```

- [ ] Add fixtures before each parser/bridge change.

Minimum fixture classes:

| Fixture | Required behavior |
| --- | --- |
| Scarecrow-style same-name variants | Image-derived scope may match `Scarecrow1`; generic `Scarecrow.png` must not fan out. |
| Phantasm Dragon multipart | Body/tail entries must not claim direct loot unless contract-backed. |
| The Destroyer multipart | Segment rows require inheritance contract, not implicit fallback. |
| Leech/Dune Splicer style segmented enemies | Same-family segments do not auto-materialize. |
| Generic bucket row | Remains blocked unless exact sourceInfobox or reviewed mapping exists. |

- [ ] Run narrow tests after each change.

```powershell
node --test scripts/data/crawler/tests/npc-parser.test.mjs
node --test scripts/data/crawler/tests/build-npc-standardized-bridge.test.mjs
node --test scripts/data/fetch/build-npc-item-relations-bundle.test.mjs
node --test scripts/data/crawler/tests/npc-coverage-targets.test.mjs
```

- [ ] Regenerate source coverage report after parser/bridge code changes, without DB writes.

```powershell
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-10-r2-source-coverage
```

**Exit gate:**

- Raw `group_page_present_variant_not_extracted` decreases, or the audit doc explains why generated crawler artifacts must be refreshed before the count can move.
- No generic bucket fan-out is introduced.
- Same-display variants require `autoId`, image-derived identity, or explicit reviewed contract.
- `source_page_missing` exact alias fixes are exact-page aliases only, not family expansions.

---

## Phase 3: Source-Row Taxonomy And Reviewed Non-NPC Exclusions

**Purpose:** Separate real NPC loot rows from non-NPC/pseudo-source records so the audit does not count legitimate non-NPC sources as NPC closure blockers.

**Files:**

- Modify if needed: `scripts/data/lib/npc-loot-source-taxonomy.mjs`
- Modify tests: `scripts/data/lib/npc-loot-source-taxonomy.test.mjs`
- Modify if needed: `scripts/data/relation/item-source-relation-processor.mjs`
- Modify tests: `scripts/data/relation/item-source-relation-processor.test.mjs`
- Modify if needed: `scripts/data/audit/npc-domain-loot-chain-audit.mjs`
- Modify tests: `scripts/data/audit/npc-domain-loot-chain-audit.test.mjs`
- Create: `docs/contracts/npc-loot-reviewed-non-npc-source-exclusions.md`
- Create: `docs/audits/2026-05-10_npc-domain-loot-r2-source-row-review.md`

- [ ] Group `blockedRows` from the post-code domain report by `sourceRowStatus` and `sourceRefName`.

Required output groups:

```text
blocked_non_npc_source
duplicate_source_identity
blocked_generic_bucket
blocked_ambiguous_variant
blocked_missing_item_or_npc_identity
accepted_materializable_without_relation
```

- [ ] Create reviewed non-NPC exclusion contract for rows that are real item/acquisition sources but not NPC loot.

Required row format:

```md
| sourceRefName | sourceType | reason | evidenceSource | reviewedBy | reviewedAt |
```

Allowed reasons:

```text
chest_or_crate_source
treasure_bag_source
present_or_seasonal_container
tree_or_environment_source
pseudo_source_label
bonus_or_mode_label
```

- [ ] Update audit logic only after tests prove the distinction.

Required behavior:

```text
reviewed non-NPC exclusion increments reviewedNonNpcExclusion
reviewed non-NPC exclusion does not increment releaseBlockingCount
unreviewed non-NPC source remains blockedNonNpcSource
non-NPC source must never materialize into item_npc_loot_relations
```

- [ ] Re-run source taxonomy and relation processor tests.

```powershell
node --test scripts/data/lib/npc-loot-source-taxonomy.test.mjs scripts/data/relation/item-source-relation-processor.test.mjs scripts/data/audit/npc-domain-loot-chain-audit.test.mjs
```

**Exit gate:**

- `blockedNonNpcSource` is either `0` or every remaining row is an explicit blocker.
- Reviewed non-NPC exclusions are visible in a separate non-blocking summary field.
- No reviewed exclusion can become trusted NPC loot.
- `blockedNonNpcSourcePromoted = 0`.

---

## Phase 4: Relation Gap And Materialization Dry-Run Readiness

**Purpose:** Prove that R2 relation materialization changes will clear `relationGap = 6` through canonical sync, not hand edits.

**Files:**

- Read: `scripts/data/maint/sync-landing-to-maint.mjs`
- Read: `scripts/data/relation/sync-maint-to-relation.mjs`
- Read: `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- Read: `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- Create: `docs/audits/2026-05-10_npc-domain-loot-r2-dry-run-readiness.md`

- [ ] Run dry-run commands only.

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --scopes=npcs,item_sources --output=reports/maint-sync-npc-domain-loot-2026-05-10-r2-dry-run.json
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --scopes=npc --relation-database=terria_v1_relation --maint-database=terria_v1_maint --local-database=terria_v1_local
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --domains=npcs --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --relation-database=terria_v1_relation --local-database=terria_v1_local
```

- [ ] Document expected table deltas.

Required fields:

```text
maint source row delta
item_source_facts delta
source_details delta
item_npc_loot_relations delta
projection_npcs loot JSON delta
npc_loot_entries delta
item_acquisition_sources delta
npc_shop_entries delta
npc_shop_conditions delta
```

- [ ] Explicitly verify `sync-relation-to-local-compat-tables` side effects.

This script touches compatibility tables beyond NPC loot. The dry-run doc must include row counts for:

```text
item_acquisition_sources
npc_loot_entries
npc_shop_entries
npc_shop_conditions
```

**Exit gate:**

- Dry-run shows no generic bucket fan-out.
- Dry-run includes both `npcs` and `item_sources` scope for maint sync.
- `summary.rows.byScope` contains only expected NPC-closure scopes.
- Every `requires_data_apply` blocker names the exact writer command and expected table delta.
- If dry-run cannot explain `relationGap = 6`, stop and fix relation/materialization before apply.

---

## Phase 5: Post-Dry-Run Audits

**Purpose:** Ensure remaining blockers are either code/contract blockers or data-apply blockers before any DB mutation.

**Files:**

- Create: `docs/audits/2026-05-10_npc-domain-loot-r2-pre-apply.md`

- [ ] Re-run read-only audits after dry-run report review.

```powershell
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-10-r2-pre-apply
node scripts/data/audit/npc-domain-loot-chain-audit.mjs --write-report=true --date-tag=2026-05-10-r2-pre-apply
node scripts/data/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --date-tag=2026-05-10-r2-pre-apply
```

- [ ] Write a blocker disposition table.

Required columns:

```text
blockerField
count
disposition: fixed_by_code | fixed_by_contract | requires_data_apply | remains_blocking
evidencePath
nextCommandOrFile
```

**Exit gate:**

- No `fixed_by_code` blocker remains without a committed test.
- No `fixed_by_contract` blocker remains without a contract row.
- No `requires_data_apply` blocker lacks an exact dry-run delta.
- Any `remains_blocking` row stops Phase 6 apply.

---

## Phase 6: Serial Apply

**Purpose:** Mutate DB only after dry-run and pre-apply evidence are complete.

**Files:**

- Create: `docs/audits/2026-05-10_npc-domain-loot-r2-apply.md`

- [ ] Record rollback counts before apply.

```sql
SELECT COUNT(*) FROM terria_v1_relation.item_npc_loot_relations WHERE deleted = 0 AND status = 1;
SELECT COUNT(*) FROM terria_v1_relation.projection_npcs WHERE deleted = 0 AND status = 1 AND JSON_LENGTH(loot_items_json) > 0;
SELECT COUNT(*) FROM terria_v1_local.npc_loot_entries WHERE deleted = 0;
SELECT COUNT(*) FROM terria_v1_local.item_acquisition_sources WHERE deleted = 0;
SELECT COUNT(*) FROM terria_v1_local.npc_shop_entries WHERE deleted = 0;
SELECT COUNT(*) FROM terria_v1_local.npc_shop_conditions WHERE deleted = 0;
```

- [ ] Run apply commands serially, only if Phase 5 has no `remains_blocking` rows.

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --scopes=npcs,item_sources --output=reports/maint-sync-npc-domain-loot-2026-05-10-r2-apply.json
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --scopes=npc --relation-database=terria_v1_relation --maint-database=terria_v1_maint --local-database=terria_v1_local
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --domains=npcs --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --relation-database=terria_v1_relation --local-database=terria_v1_local
```

- [ ] Record post-apply counts and compare to dry-run.

**Exit gate:**

- Post-apply row counts match dry-run expectations.
- Compatibility table changes are expected and documented.
- Any mismatch stops execution and triggers diagnosis before stack restart.

---

## Phase 7: Runtime Verification And Final Gates

**Purpose:** Prove public API/UI sees canonical direct rows and no hidden fallback pollution remains.

**Files:**

- Create: `docs/audits/2026-05-10_npc-domain-loot-r2-runtime.md`
- Create: `docs/audits/2026-05-10_npc-domain-loot-r2-closeout.md`
- Modify if needed: `front/src/tests/npc-detail-entry.spec.ts`
- Modify if needed: `back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java`
- Modify if needed: `data-query-app/tests/npc-projection-json-visibility.test.mjs`

- [ ] Restart stack after apply.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\stop-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
```

- [ ] Run final audits.

```powershell
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-10-r2-final
node scripts/data/audit/npc-domain-loot-chain-audit.mjs --write-report=true --date-tag=2026-05-10-r2-final
node scripts/data/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --date-tag=2026-05-10-r2-final
```

- [ ] Run final tests.

```powershell
node --test scripts/data/audit/npc-domain-loot-chain-audit.test.mjs scripts/data/audit/npc-source-coverage-inventory.test.mjs scripts/data/audit/npc-loot-runtime-parity-audit.test.mjs
node --test scripts/data/crawler/tests/npc-parser.test.mjs scripts/data/crawler/tests/build-npc-standardized-bridge.test.mjs scripts/data/fetch/build-npc-item-relations-bundle.test.mjs
node --test scripts/data/lib/npc-loot-source-taxonomy.test.mjs scripts/data/relation/item-source-relation-processor.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs
Push-Location back; mvn "-Dtest=PublicNpcServiceImplImageTest,PublicNpcAggregateControllerTest,AdminNpcControllerTest" test; $code=$LASTEXITCODE; Pop-Location; if ($code -ne 0) { exit $code }
Push-Location front; pnpm exec vitest run src/tests/npc-detail-entry.spec.ts; $code=$LASTEXITCODE; Pop-Location; if ($code -ne 0) { exit $code }
git diff --check
```

Final required values:

```text
npc-domain-loot-chain.auditStatus = pass
unclassifiedZero = 0
blockedSourceGap = 0
relationGap = 0
projectionGap = 0
localGap = 0
apiGap = 0
duplicateOrPolluted = 0
runtimeFallbackOnly = 0
projectionOnly = 0
countParityOnly = 0
unknown = 0
releaseBlockingCount = 0
npc-loot-runtime-parity.auditStatus = pass
npc-loot-runtime-parity.blockingCount = 0
blockedNonNpcSourcePromoted = 0
```

If reviewed non-materializable rows exist, they must appear in separate reviewed non-blocking fields and `releaseBlockingCount` must still be `0`.

Regression samples:

```text
BigMimicCrimson
PresentMimic
Scarecrow1 or another Scarecrow exact variant
BigHornetStingy
LittleHornetSpikey
AnglerFish
one current duplicate_or_polluted sample
one current source_page_present_no_loot expected-zero sample
one current segment-family inheritance sample
```

For every sample, record:

```text
relation row count
projection row count
local row count
API row count
lootSourceMode values
trustedStructured values
UI direct/fallback separation
```

**Exit gate:**

- Samples cannot override final whole-domain audit failure.
- Closeout document records baseline, post-code, dry-run, apply, runtime, and final report paths.
- If any final value is non-zero, closeout must say the task remains blocked and must not claim closure.

---

## Commit Plan

Use focused commits:

1. `docs: plan NPC loot closure r2 continuation`
2. `docs: classify NPC zero loot contracts`
3. `fix: expand NPC source coverage safely`
4. `fix: review NPC source-row blockers`
5. `docs: record NPC loot dry-run evidence`
6. `chore: apply NPC loot canonical sync`
7. `docs: close NPC loot r2 runtime evidence`

Stage exact files only. Example:

```powershell
git status --short
git add docs/plans/2026-05-10_npc-domain-loot-closure-r2-continuation-plan.md
git diff --cached --stat
git commit -m "docs: plan NPC loot closure r2 continuation"
```

---

## Self-Review

- This plan covers all R2 baseline blocker classes, not only visible NPC examples.
- DB writes are delayed until post-code audits, contracts, parser/source-row fixes, dry-run evidence, and pre-apply disposition are complete.
- Generic bucket fan-out remains forbidden.
- Expected-zero and inheritance require checked-in contract rows.
- Public fallback pollution is treated as a runtime/API blocker, not display-only.
- Raw source coverage counts and domain release blocker counts are explicitly kept separate.
- Final closure requires machine gates, not manual sample approval.
