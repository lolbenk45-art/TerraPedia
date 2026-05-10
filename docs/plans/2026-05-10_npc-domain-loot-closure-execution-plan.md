# NPC Domain Loot Closure Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. This is a whole NPC-domain closure plan, not a Mimic, Present Mimic, Hornet, Zombie, or any other family patch. Read-only discovery may run in parallel; crawler/parser edits, relation materialization edits, projection/local sync writes, API fallback edits, DB apply commands, and stack restarts are serial. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close NPC loot as a full domain so every active NPC has either trusted direct loot, reviewed inherited loot, reviewed expected-zero status, or a release-blocking defect with no hidden runtime fallback pollution.

**Architecture:** Use the existing governance/audit layer as the gate and fix the canonical chain upstream: `wiki/crawler source -> standardized NPC loot -> landing/maint source rows -> item_source_facts/source_details -> item_npc_loot_relations -> projection_npcs -> npc_loot_entries -> API/UI`. Runtime fallback may remain visible for diagnostics, but final trusted loot must be backed by relation/projection/local/API row identity.

**Tech Stack:** Node.js crawler/audit/relation scripts, MySQL `terria_v1_maint` / `terria_v1_relation` / `terria_v1_local`, Spring Boot admin/public NPC APIs, Nuxt admin UI, public frontend.

---

## Current Baseline

Baseline reports from 2026-05-10:

- `reports/audit/npc-domain-loot-chain-2026-05-10-execution-final.json`
- `reports/audit/npc-source-coverage-inventory-2026-05-10-execution-final.json`
- `reports/audit/npc-loot-runtime-parity-2026-05-10-execution-final.json`

Current blockers:

| Gate | Current value | Meaning |
| --- | ---: | --- |
| `activeNpcs` | `762` | Full closure scope. |
| `unknown` | `0` | Audit can classify every active NPC. |
| `unclassifiedZero` | `319` | Zero-loot NPCs still lack reviewed expected-zero, inheritance, source-gap, or materialization explanation. |
| `blockedSourceGap` | `193` | Source missing or group page variant extraction missing. |
| `relationGap` | `6` | Materializable source exists but relation row is missing. |
| `apiGap` | `214` | Relation/projection/local evidence does not match API/runtime evidence. |
| `duplicateOrPolluted` | `30` | Domain audit found duplicate or polluted rows. |
| `releaseBlockingCount` | `2323` | Includes NPC status blockers and blocked source-row classes. |
| Runtime `blockingCount` | `265` | API-visible chain still has row identity or pollution blockers. |
| Runtime `count_parity_only` | `79` | Counts match but stable row identity differs, often condition text drift. |
| Runtime `duplicate_or_polluted` | `186` | Runtime exposes fallback or extra rows without trusted relation provenance. |
| Source `source_page_present_with_loot` | `394` | Source exists and should be reconciled to materialized rows or reviewed blockers. |
| Source `source_page_present_no_loot` | `158` | Must be reviewed into expected-zero or parser defect. |
| Source `source_page_missing` | `114` | Must become source coverage fix, expected-zero contract, or explicit blocker. |
| Source `group_page_present_variant_not_extracted` | `96` | Variant/group-page parser coverage problem; this is the main anti-special-case lane. |

Interpretation:

- The previous governance work prevents false closure; it does not close NPC loot data.
- The next implementation must reduce all blockers by class across the whole NPC domain, not by manually fixing a visible family.
- A family sample such as Crimson Mimic is useful only as a regression sample. It is not an acceptance scope.

---

## Hard Boundaries

- Do not hand-edit `npc_loot_entries`, `item_npc_loot_relations`, `projection_npcs`, or `npcs.loot_items_json`.
- Do not use direct wiki/crawler output as runtime truth in API/UI.
- Do not auto-fan-out generic buckets such as `Mimics`, `Hornets`, `Slimes`, `Mummies`, `Ghouls`, `Jellyfish`, `Pigrons`, `Sand Sharks`, `The Twins`, or `Celestial Pillars`.
- Do not turn runtime fallback rows into `trustedStructured=true` unless a checked-in inheritance contract and relation/projection/local/API parity support it.
- Do not claim closure while any final gate has `unclassifiedZero`, `blockedSourceGap`, `relationGap`, `projectionGap`, `localGap`, `apiGap`, `duplicateOrPolluted`, `runtimeFallbackOnly`, `projectionOnly`, `countParityOnly`, `unknown`, or blocked materializable source rows.
- Do not run DB-writing commands until read-only classification, dry-run diff, rollback target, and serial apply owner are recorded.
- Do not use `git add .`; stage exact files only.
- If an audit script cannot distinguish expected-zero, inheritance, source gap, relation gap, and API pollution, fix the audit before applying data writes.

---

## Final Acceptance Gates

Run all final gates after apply and stack restart:

```powershell
node scripts/data/audit/npc-domain-loot-chain-audit.mjs --write-report=true --date-tag=2026-05-10-final; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-10-final; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/data/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --date-tag=2026-05-10-final; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --test scripts/data/audit/npc-domain-loot-chain-audit.test.mjs scripts/data/audit/npc-source-coverage-inventory.test.mjs scripts/data/audit/npc-loot-runtime-parity-audit.test.mjs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --test scripts/data/crawler/tests/npc-parser.test.mjs scripts/data/crawler/tests/build-npc-standardized-bridge.test.mjs scripts/data/fetch/build-npc-item-relations-bundle.test.mjs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --test scripts/data/lib/npc-loot-source-taxonomy.test.mjs scripts/data/relation/item-source-relation-processor.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Push-Location back; mvn "-Dtest=PublicNpcServiceImplImageTest,AdminNpcControllerTest" test; $code=$LASTEXITCODE; Pop-Location; if ($code -ne 0) { exit $code }
Push-Location data-query-app; node --test tests/npc-projection-json-visibility.test.mjs; $code=$LASTEXITCODE; Pop-Location; if ($code -ne 0) { exit $code }
Push-Location front; pnpm exec vitest run src/tests/npc-detail-entry.spec.ts; $code=$LASTEXITCODE; Pop-Location; if ($code -ne 0) { exit $code }
Push-Location front; pnpm run check; $code=$LASTEXITCODE; Pop-Location; if ($code -ne 0) { exit $code }
git diff --check; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

Required final values:

- `npc-domain-loot-chain`: `auditStatus = pass`
- `unclassifiedZero = 0`
- `blockedSourceGap = 0`
- `relationGap = 0`
- `projectionGap = 0`
- `localGap = 0`
- `apiGap = 0`
- `duplicateOrPolluted = 0`
- `runtimeFallbackOnly = 0`
- `projectionOnly = 0`
- `countParityOnly = 0`
- `unknown = 0`
- `blockedGenericBucket = 0`, unless the audit is first changed to report reviewed non-materializable generic buckets as a separate non-blocking status
- `blockedAmbiguousVariant = 0`, unless the audit is first changed to report reviewed non-materializable ambiguous variants as a separate non-blocking status
- `blockedMissingItemOrNpcIdentity = 0`, unless the audit is first changed to report reviewed non-materializable identity gaps as a separate non-blocking status
- `blockedNonNpcSource = 0`, unless the audit is first changed to report reviewed non-NPC exclusions as a separate non-blocking status
- `blockedNonNpcSourcePromoted = 0`
- `npc-loot-runtime-parity`: `auditStatus = pass`, `blockingCount = 0`
- No API-visible loot row may have `trustedStructured=true` without relation-backed stable identity.

If any source blocker is intentionally non-materializable, the accepted closure path is not to leave it in `blocked*` summary fields. The audit must expose a separate reviewed non-blocking field, and `releaseBlockingCount` must still be `0`.

Release waivers may be documented for product release, but a waiver is not NPC domain closure.

---

## Multi-Agent Work Split

| Lane | Owner scope | Parallel allowed | Serial boundary |
| --- | --- | --- | --- |
| Agent A | `unclassifiedZero` classification and expected-zero contract candidates | Read-only report/DB review | Contract row edits are serialized through one editor. |
| Agent B | Source coverage gaps and group-page variant extraction patterns | Read-only crawler artifacts and parser fixtures | Crawler/parser source edits are serial. |
| Agent C | Source-row taxonomy and relation materialization defects | Unit tests and helper design | `item-source-relation-processor.mjs` and `sync-maint-to-relation.mjs` edits are serial. |
| Agent D | Projection/local/API/runtime parity and fallback pollution | Read-only SQL/API checks and backend/frontend tests | Backend API fallback behavior and DTO changes are serial. |
| Agent E | Dry-run/apply choreography, rollback checkpoints, and closeout evidence | Dry-run report review | Any `--apply=true`, import, backfill, load, DB mutation, or restart is serial. |
| Agent F | Independent review | Plan/code/test review only | Does not edit files owned by active implementation lanes. |

Coordination rules:

- Parallel agents may inspect the same DB only through read-only commands.
- One shared file has one writer at a time.
- If two lanes need the same script, stop and merge ownership before editing.
- No lane may define success with a named-family sample. Every lane must report whole-domain counts.
- DB writes must be executed by Agent E only after all read-only exit gates for the relevant phase pass.

---

## Phase 0: Branch, Baseline, And No-Write Lock

**Purpose:** Create an execution branch and freeze the current blockers before implementation.

**Files:**

- Create: `docs/audits/2026-05-10_npc-domain-loot-closure-baseline.md`
- Read: `docs/plans/2026-05-10_npc-domain-loot-data-chain-governance-plan.md`
- Read: `docs/contracts/npc-domain-expected-zero-contract.md`
- Read: `docs/contracts/npc-domain-loot-inheritance-contract.md`
- Read: `docs/contracts/npc-loot-source-taxonomy-contract.md`

- [ ] Create the implementation branch:

```powershell
git switch -c fix/npc-domain-loot-closure
```

- [ ] Confirm branch/worktree state:

```powershell
git status --short --branch
git branch -vv
git worktree list
```

Expected:

- Branch is not `main`.
- No unrelated uncommitted files.
- No other task is writing NPC source, relation, projection, local, or API tables.

- [ ] Regenerate the read-only baseline reports:

```powershell
node scripts/data/audit/npc-domain-loot-chain-audit.mjs --write-report=true --date-tag=2026-05-10-closure-baseline; $domainCode=$LASTEXITCODE
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-10-closure-baseline; $coverageCode=$LASTEXITCODE
node scripts/data/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --date-tag=2026-05-10-closure-baseline; $runtimeCode=$LASTEXITCODE
```

Current baseline audits are expected to return blocked exit codes (`npc-domain-loot-chain-audit` exits `2`; `npc-loot-runtime-parity-audit` exits non-zero when blocked). Phase 0 must treat those non-zero exits as expected only if the report file is written and readable. A missing report, unreadable JSON, DB connection error, or `evidenceHealth` other than `sufficient` is a Phase 0 blocker.

Allowed Phase 0 baseline exit codes:

- `$domainCode` may be `0` or `2`; any other value blocks the plan.
- `$coverageCode` must be `0`; any non-zero value blocks the plan.
- `$runtimeCode` may be `0` or `1`; any other value blocks the plan.

- [ ] Write `docs/audits/2026-05-10_npc-domain-loot-closure-baseline.md` with:

- Baseline report paths.
- All summary counts listed in "Current Baseline".
- Explicit no-write statement.
- DB target names: `terria_v1_maint`, `terria_v1_relation`, `terria_v1_local`.
- Statement that visible user examples are regression samples, not scope.

**Exit gate:**

- Baseline docs and reports exist.
- No DB writer ran.
- Baseline confirms `activeNpcs = 762` or explains any changed count with exact report path.

---

## Phase 1: Classify `unclassifiedZero = 319`

**Purpose:** Convert every zero-loot NPC into an explicit reviewed state before fixing parser/materialization. This avoids treating "current DB has zero rows" as proof.

**Files:**

- Modify if needed: `scripts/data/audit/npc-domain-loot-chain-audit.mjs`
- Modify if needed: `scripts/data/audit/npc-domain-loot-chain-audit.test.mjs`
- Modify: `docs/contracts/npc-domain-expected-zero-contract.md`
- Modify: `docs/contracts/npc-domain-loot-inheritance-contract.md`
- Create: `docs/audits/2026-05-10_npc-unclassified-zero-triage.md`

- [ ] Export the 319 NPC list from the baseline report into triage groups:

```text
expected_zero_candidate
inheritance_candidate
source_present_materialization_defect
source_missing_or_group_variant_gap
parser_or_identity_defect
needs_human_review
```

- [ ] Use these classification rules:

| Input evidence | Required classification |
| --- | --- |
| Town/bound/critter/helper/effect with reviewed no-loot source | `expected_zero_candidate` |
| Segment/body/tail/prototype with reviewed source representative | `inheritance_candidate` |
| `source_page_present_with_loot` and zero relation/local rows | `source_present_materialization_defect` |
| `group_page_present_variant_not_extracted` | `source_missing_or_group_variant_gap` |
| Missing item/NPC identity or generic bucket | `parser_or_identity_defect` |
| Ambiguous or unsupported evidence | `needs_human_review` |

- [ ] Add expected-zero contract rows only when all required fields are known:

```text
npcInternalName | npcType | reason | evidenceSource | reviewedBy | reviewedAt
```

- [ ] Add inheritance contract rows only when target/source/reason are reviewed:

```text
targetNpcInternalName | sourceNpcInternalName | inheritanceKind | evidenceSource | reviewedBy | reviewedAt
```

- [ ] If the audit still classifies a contract-backed expected-zero NPC as `blocked_source_gap`, fix the audit precedence before continuing.

Contract-backed statuses short-circuit only source-gap and fallback-only checks. They do not bypass duplicate, pollution, projection, local, API, or row-identity checks.

**Exit gate:**

- Every `unclassifiedZero` row is assigned to exactly one triage group.
- `unclassifiedZero = 0` is required before Phase 5 dry-run and Phase 6 apply.
- `needs_human_review` may continue into Phase 2/3 read-only or code work only as a tracked blocker; it cannot enter dry-run/apply as an accepted remainder.
- No expected-zero contract row is based only on current DB absence.
- No inheritance contract row is based only on matching display name.

---

## Phase 2: Close Source Coverage Gaps By Pattern

**Purpose:** Fix missing source/page/variant extraction classes across the domain, not one family at a time.

**Files:**

- Modify if needed: `scripts/data/crawler/src/domains/npc-loot-parser.mjs`
- Modify if needed: `scripts/data/crawler/src/domains/npc-parser.mjs`
- Modify if needed: `scripts/data/crawler/src/bridge/build-npc-standardized-bridge.mjs`
- Modify if needed: `scripts/data/crawler/src/coverage/build-npc-coverage-targets.mjs`
- Modify tests: `scripts/data/crawler/tests/npc-parser.test.mjs`
- Modify tests: `scripts/data/crawler/tests/build-npc-standardized-bridge.test.mjs`
- Modify tests: `scripts/data/crawler/tests/npc-coverage-targets.test.mjs`
- Modify if needed: `scripts/data/fetch/build-npc-item-relations-bundle.mjs`
- Modify tests: `scripts/data/fetch/build-npc-item-relations-bundle.test.mjs`

- [ ] Split `blockedSourceGap = 193` into:

```text
source_page_missing
group_page_present_variant_not_extracted
source_page_present_parse_failed
source_page_present_no_loot_but_hostile
coverage_alias_or_internal_name_mismatch
```

- [ ] For `group_page_present_variant_not_extracted = 96`, fix parser/bridge behavior by layout pattern:

| Pattern | Required behavior |
| --- | --- |
| Multi-infobox page | Extract section/infobox-scoped drops to the matching variant NPC internal name. |
| Shared display-name variants | Preserve internal-name identity; do not collapse to display name. |
| Size/AI variants with identical drops | Use reviewed inheritance contract, not implicit same-name fallback. |
| Group page with generic bucket rows | Keep generic rows blocked unless exact variant section evidence exists. |

- [ ] Add fixtures for at least these pattern classes, not as final scope:

```text
multi_infobox_variant_page
same_display_name_multiple_internal_names
hostile_page_with_no_extracted_loot
generic_bucket_row_rejected
segment_or_body_expected_inheritance
```

- [ ] Regenerate read-only source coverage inventory after parser/bridge changes:

```powershell
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-10-source-coverage-r1
```

**Exit gate:**

- `group_page_present_variant_not_extracted = 0` is required before Phase 5 dry-run and Phase 6 apply.
- Any remaining group-page variant gap must stay as a tracked blocker and prevents closure.
- `source_page_missing` is not hidden by expected-zero unless contract-backed.
- `source_page_missing` for a killable or hostile NPC is either resolved to a source artifact, moved to a reviewed expected-zero/inheritance contract, or remains a tracked blocker that prevents dry-run/apply.
- No generic bucket auto-fan-out was introduced.
- Parser tests prove pattern behavior, not only Mimic examples.

---

## Phase 3: Repair Source-Row Taxonomy And Relation Materialization

**Purpose:** Make materializable source rows reach `item_npc_loot_relations`; keep unsafe rows out of trusted NPC loot without leaving unresolved release blockers.

**Files:**

- Modify if needed: `scripts/data/lib/npc-loot-source-taxonomy.mjs`
- Modify tests: `scripts/data/lib/npc-loot-source-taxonomy.test.mjs`
- Modify if needed: `scripts/data/relation/item-source-relation-processor.mjs`
- Modify tests: `scripts/data/relation/item-source-relation-processor.test.mjs`
- Modify if needed: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify tests: `scripts/data/relation/sync-maint-to-relation.test.mjs`

- [ ] Group source-row blockers from `npc-domain-loot-chain`:

```text
blocked_generic_bucket = 68
blocked_ambiguous_variant = 7
blocked_non_npc_source = 381
blocked_missing_item_or_npc_identity = 51
relationGap = 6
```

- [ ] Fix only rows that meet `accepted_materializable` rules:

| Rule | Required evidence |
| --- | --- |
| Exact NPC identity | `sourceRefInternalName` resolves to active NPC internal name. |
| Exact item identity | `itemInternalName` resolves to known item. |
| Stable row identity | NPC, item, chance, quantity, condition, source fact key are deterministic. |
| Source type is NPC | Chest/crate/present/bag/tree/shop rows cannot become NPC loot. |
| Generic bucket resolved | Requires exact section evidence or reviewed item-scoped mapping. |

- [ ] Resolve blocked source rows by class:

| Current blocker | Valid closure action |
| --- | --- |
| `blocked_generic_bucket` | Replace with exact variant source rows, add reviewed item-scoped mapping, or leave as a blocker that prevents dry-run/apply. |
| `blocked_ambiguous_variant` | Resolve to exact NPC identity with reviewed evidence, or leave as a blocker that prevents dry-run/apply. |
| `blocked_missing_item_or_npc_identity` | Fix parser/identity mapping, or leave as a blocker that prevents dry-run/apply. |
| `blocked_non_npc_source` | Remove from NPC loot source scope, reclassify as reviewed non-NPC exclusion, or leave as a blocker that prevents dry-run/apply. |
| `duplicate_source_identity` | Deduplicate by stable identity, or leave as a blocker that prevents dry-run/apply. |

Do not simply delete blocker accounting. If non-NPC rows are legitimate source records for other domains, the audit must stop counting them as NPC loot release blockers by giving them a checked, non-blocking status such as `reviewed_non_npc_exclusion`. If the audit cannot express that distinction, fix the audit first; otherwise final `auditStatus=pass` is impossible.

- [ ] For the six `relationGap` rows, identify the class first. If they are representatives of a broader class, add tests for the class before implementation.

**Exit gate:**

- `relationGap = 0`.
- `blockedGenericBucket = 0`, or all reviewed non-materializable generic buckets have moved to a non-blocking audit field and `releaseBlockingCount` is still `0`.
- `blockedAmbiguousVariant = 0`, or all reviewed non-materializable ambiguous variants have moved to a non-blocking audit field and `releaseBlockingCount` is still `0`.
- `blockedMissingItemOrNpcIdentity = 0`, or all reviewed non-materializable identity gaps have moved to a non-blocking audit field and `releaseBlockingCount` is still `0`.
- `blockedNonNpcSource = 0`, or all reviewed non-NPC exclusions have moved to a non-blocking audit field and `releaseBlockingCount` is still `0`.
- `blocked_non_npc_source_promoted = 0`.
- No new accepted relation row comes from generic bucket fan-out without reviewed mapping.
- Relation processor tests cover accepted, blocked generic, blocked ambiguous, non-NPC, and missing identity rows.

---

## Phase 4: Normalize Projection, Local, And API Row Identity

**Purpose:** Remove count-only parity and API mismatches without masking bad data.

**Files:**

- Modify if needed: `scripts/data/relation/projection-sync.mjs`
- Modify if needed: `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- Modify if needed: `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- Modify related tests under `scripts/data/relation/*.test.mjs`
- Modify if needed: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Modify if needed: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Modify tests: `back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java`
- Modify tests: `back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplImageTest.java`
- Modify if needed: `front/src/types/npcDomain.ts`
- Modify if needed: `front/src/api/npcDomain.ts`
- Modify if needed: `front/src/views/npcDetailEntry.ts`
- Modify if needed: `front/src/views/NpcDetailView.vue`
- Modify tests: `front/src/tests/npc-detail-entry.spec.ts`

- [ ] Resolve `count_parity_only = 79` by canonical row identity normalization:

| Drift class | Required fix |
| --- | --- |
| Condition text such as `"Normal mode row"` vs blank | Normalize at the source/projection boundary or preserve equivalent canonical condition. |
| Quantity/chance formatting drift | Normalize before stable key generation and projection/local sync. |
| Local/API missing relation keys | Carry relation/source provenance into DTO where available; do not invent keys. |

- [ ] Resolve `apiGap = 214` by making API output match trusted local/relation identities.

- [ ] Keep fallback rows visible only as untrusted diagnostics:

| Runtime mode | Final trusted? |
| --- | --- |
| `direct` with relation-backed identity | Yes |
| `prototype` | No, unless inheritance contract promotes it and parity passes. |
| `same_name` | No, unless inheritance contract promotes it and parity passes. |
| `derived` | No |
| `projection_only` | No |

**Exit gate:**

- Row identity normalization code and tests are complete before dry-run/apply.
- Current runtime audit blockers are split into `requires_data_apply` and `requires_code_fix`; no `requires_code_fix` row may enter Phase 5.
- If `count_parity_only`, `duplicate_or_polluted`, or `apiGap` remains before apply, the dry-run document must show the exact planned data delta expected to remove it.
- API tests prove fallback rows remain `trustedStructured=false`.

Final zero counts for runtime `count_parity_only`, runtime `duplicate_or_polluted`, and domain `apiGap` are Phase 7/8 acceptance gates after data apply and stack restart, not a pre-apply requirement.

---

## Phase 5: Dry-Run Sync And Diff Review

**Purpose:** Prove the intended write path before touching DB.

**Files:**

- Read: `scripts/data/maint/sync-landing-to-maint.mjs`
- Read: `scripts/data/relation/sync-maint-to-relation.mjs`
- Read: `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- Read: `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- Create: `docs/audits/2026-05-10_npc-domain-loot-closure-dry-run.md`

- [ ] Run dry-run commands only:

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --scopes=npcs,item_sources --output=reports/maint-sync-npc-domain-loot-2026-05-10-dry-run.json
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --scopes=npc --relation-database=terria_v1_relation --maint-database=terria_v1_maint --local-database=terria_v1_local
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --domains=npcs --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --relation-database=terria_v1_relation --local-database=terria_v1_local
```

- [ ] If any command writes despite `--apply=false`, stop and fix that script/test before continuing.

`sync-landing-to-maint` must include both scopes:

- `npcs` reads `npc_item_relations_bundle_raw`, which is the NPC page / group-page forward loot path.
- `item_sources` reads `item_relations_bundle_raw`, which is the item-page reverse source path.
- In current `sync-landing-to-maint` behavior, requesting `npcs` also allows extracted `item_sources` and `backfill_candidates` rows from `npc_item_relations_bundle_raw`; dry-run review must inspect `summary.rows.byScope` and reject unexpected scopes or row deltas unrelated to NPC loot closure.

Running only `--scopes=item_sources` is not valid for this plan because it would repeat the previous source-strategy bug: item-page reverse evidence could be processed while variant-specific NPC page drops stay out of maint.

- [ ] Document dry-run expected deltas:

```text
maint item source row delta
item_source_facts/source_details delta
item_npc_loot_relations delta
projection_npcs loot JSON delta
npc_loot_entries delta
npcs.loot_items_json delta
expected trusted direct NPC count
expected inherited NPC count
expected expected-zero NPC count
expected blocker count
```

**Exit gate:**

- Dry-run deltas match Phase 1 to Phase 4 classification.
- `npc-domain-loot-chain-audit` has no unresolved Phase 1, Phase 2, or Phase 3 blockers except rows classified as `requires_data_apply` by the dry-run delta or reviewed non-blocking fields explicitly excluded from `releaseBlockingCount`.
- Any blocker classified as `requires_data_apply` must name the exact writer command and expected table delta that will clear it.
- `maint-sync` dry-run `summary.rows.byScope` contains only expected NPC loot closure scopes and no unrelated product-domain updates.
- `sync-relation-to-local-compat-tables` has no domain filter in current code; its dry-run report must explicitly review `item_acquisition_sources`, `npc_loot_entries`, `npc_shop_entries`, and `npc_shop_conditions` planned rows before apply.
- No unclassified generic bucket row is scheduled to materialize.
- No direct write to runtime tables is planned outside the canonical sync chain.

---

## Phase 6: Serial DB Apply

**Purpose:** Apply only after dry-run evidence proves the write set.

**Files:**

- Create: `docs/audits/2026-05-10_npc-domain-loot-closure-apply.md`

- [ ] Record rollback checkpoint before apply:

```sql
SELECT COUNT(*) FROM terria_v1_relation.item_npc_loot_relations WHERE deleted = 0 AND status = 1;
SELECT COUNT(*) FROM terria_v1_relation.projection_npcs WHERE deleted = 0 AND status = 1 AND JSON_LENGTH(loot_items_json) > 0;
SELECT COUNT(*) FROM terria_v1_local.npc_loot_entries WHERE deleted = 0;
SELECT COUNT(*) FROM terria_v1_local.item_acquisition_sources WHERE deleted = 0;
SELECT COUNT(*) FROM terria_v1_local.npc_shop_entries WHERE deleted = 0;
SELECT COUNT(*) FROM terria_v1_local.npc_shop_conditions WHERE deleted = 0;
```

`sync-relation-to-local-compat-tables` currently deletes and reinserts four compatibility tables: `item_acquisition_sources`, `npc_loot_entries`, `npc_shop_entries`, and `npc_shop_conditions`. This is acceptable only if Phase 5 dry-run proves the shop and acquisition-source row counts are expected and unrelated product-domain behavior is not regressed. If the task needs NPC-loot-only apply semantics, add a scoped mode and tests before running `--apply=true`.

- [ ] Run apply commands serially:

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --scopes=npcs,item_sources --output=reports/maint-sync-npc-domain-loot-2026-05-10-apply.json
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --scopes=npc --relation-database=terria_v1_relation --maint-database=terria_v1_maint --local-database=terria_v1_local
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --domains=npcs --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --relation-database=terria_v1_relation --local-database=terria_v1_local
```

- [ ] Record post-apply counts and report paths in the apply audit doc.

**Exit gate:**

- Apply commands ran serially.
- Post-apply counts match dry-run expectations.
- Post-apply `item_acquisition_sources`, `npc_shop_entries`, and `npc_shop_conditions` counts match dry-run expectations.
- Any mismatch stops execution and triggers rollback/diagnosis before continuing.

---

## Phase 7: Runtime Verification And Regression Samples

**Purpose:** Prove API/UI sees the canonical rows and user-reported examples are no longer misleading.

**Files:**

- Modify tests if needed: `data-query-app/tests/npc-projection-json-visibility.test.mjs`
- Modify tests if needed: `front/src/tests/npc-detail-entry.spec.ts`
- Modify tests if needed: backend NPC tests listed above
- Create: `docs/audits/2026-05-10_npc-domain-loot-closure-runtime.md`

- [ ] Restart local stack only after data apply:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\stop-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
```

- [ ] Validate regression samples as examples:

```text
BigMimicCrimson
PresentMimic
BigHornetStingy
LittleHornetStingy
BigHornetSpikey
LittleHornetSpikey
AnglerFish
Any NPC from the current duplicate_or_polluted sample set
Any NPC from the current count_parity_only sample set
```

Hornet entries above are concrete NPC internal names from the current source coverage inventory. They are regression samples for same-display-name handling, not authorization to expand a generic `Hornets` bucket.

- [ ] For each sample, record:

```text
relation row count
projection row count
local row count
API row count
runtime lootSourceMode values
trustedStructured values
UI visible direct/fallback separation
```

**Exit gate:**

- Samples pass only if full-domain audit gates pass.
- No sample can override a failing whole-domain gate.
- Fallback rows are visually separated and not counted as trusted direct loot.

---

## Phase 8: Final Closeout And Commit

**Purpose:** Leave a reproducible closure record and a focused commit.

**Files:**

- Create: `docs/audits/2026-05-10_npc-domain-loot-closure-closeout.md`
- Modify if needed: `docs/todo/backlog.md`

- [ ] Run final gates from "Final Acceptance Gates".

- [ ] Write closeout doc with:

```text
baseline report paths
dry-run report paths
apply report paths
final audit report paths
final blocker counts
sample validation results
known non-closure waivers, if any
rollback note
```

- [ ] Stage exact files only:

```powershell
git status --short
git add docs/plans/2026-05-10_npc-domain-loot-closure-execution-plan.md
git add docs/audits/2026-05-10_npc-domain-loot-closure-baseline.md
git add docs/audits/2026-05-10_npc-unclassified-zero-triage.md
git add docs/audits/2026-05-10_npc-domain-loot-closure-dry-run.md
git add docs/audits/2026-05-10_npc-domain-loot-closure-apply.md
git add docs/audits/2026-05-10_npc-domain-loot-closure-runtime.md
git add docs/audits/2026-05-10_npc-domain-loot-closure-closeout.md
git add docs/contracts/npc-domain-expected-zero-contract.md
git add docs/contracts/npc-domain-loot-inheritance-contract.md
```

Add code/test files explicitly as they are modified. Do not use `git add .`.

- [ ] Commit only after final gates pass or closeout explicitly says the task remains blocked:

```powershell
git diff --cached --stat
git commit -m "fix: close NPC loot data chain"
```

**Exit gate:**

- Worktree has no unrelated changes.
- Commit scope matches this plan.
- If any blocker remains, the commit message and closeout must say this is not closure.

---

## Self-Review

Checklist result:

- Scope is whole NPC domain: the plan gates on all `762` active NPCs and all current blocker classes.
- The plan does not accept named-family samples as completion.
- Expected-zero and inheritance are contract-backed, not inferred from zero rows or display names.
- Generic bucket fan-out is forbidden unless exact section evidence or reviewed item-scoped mapping exists.
- DB writes are delayed until read-only classification, dry-run review, and rollback counts exist.
- Runtime fallback remains diagnostic and untrusted unless promoted by contract plus parity.
- Final gates require both domain audit and runtime parity to pass with zero blockers.
- PowerShell examples avoid `--%` and quote-free wildcard-sensitive paths are not used.
