# Remaining Closure Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining local-only eight-domain blockers: hermetic quality gates, Item source lineage, strict Items/NPCs/Bosses projection parity, and final runtime evidence without replaying a consumed authorization or promoting unproven data.

**Architecture:** This is a serial, fail-closed remediation. First make tests self-contained without reconstructing authorization history. Then create two new narrow canonical operations: one for a frozen accepted Item-source set in `terria_v1_local.item_acquisition_sources`, and one for frozen projection-parity partitions in `terria_v1_relation`. Each operation gets an independent scope hash, manifest bundle, decision, packet, permit, transaction/readback, and API proof. Existing NPC/Boss loot, Projectile, Biome, and Item-image results are read-only regression inputs only.

**Tech Stack:** Node.js ESM pipelines, MySQL loopback (`127.0.0.1:13306`), Spring Boot, Nuxt, Maven, pnpm, canonical operation catalog and authorization runner.

---

## 1. Goal And Non-Negotiable Boundaries

### 1.1 Closure definition

The parent eight-domain task may become `closed` only when all of the following are fresh and pass:

1. Quality gate has no test dependent on an untracked historical authorization artifact, and exits `0`.
2. Every Item-source row is either:
   - accepted with `raw/maint -> relation -> local -> API` stable lineage and a committed governed result, or
   - explicitly quarantined with identity, source page, evidence hash, owner, and next bounded action.
   There are no unclassified ordinary rows, duplicate accepted identities, or display-text-only matches.
3. Strict local/projection parity has no Items, NPCs, or Bosses row/key/required-field drift.
4. Cross-DB integrity, relation health blocking count, NPC runtime parity, Item source API checks, Projectile readiness, Biome readiness, image lineage, local smoke, backend Maven, admin checks, public checks, and quality gate pass.

### 1.2 In scope

- Hermetic fixture repair for the five quality-gate test failures.
- The nine current Maven Admin contract failures.
- Item-source candidate identity normalization, row-level quarantine, canonical apply, and readback.
- Projection parity for `projection_items`, `projection_npcs`, and `projection_bosses` only.
- Fresh reports, review, devlog, risk, and closure index.

### 1.3 Out of scope

- Production, L2, direct SQL, table truncation, broad relation snapshot rebuild, unbounded crawl/fetch, image-byte transfer, replay of a consumed decision, and reuse of an existing permit/result root.
- Mutation of the already accepted Item-image scope, NPC/Boss loot, Projectile relation rows, or Biome images.
- Treating external evidence, family pages, expected-zero, or historical authorization bytes as ordinary Item source facts.

### 1.4 Determined preconditions

| Issue | Determination | Required action | Forbidden action |
| --- | --- | --- | --- |
| Five quality-gate failures | Tests read excluded historical authorization files as fixtures; the files are not runtime prerequisites. | Replace production-path reads with committed, minimal test fixtures or in-memory envelope builders that preserve the exact validation shape. | Recreate, copy, or synthesize authorization artifacts in `reports/authorization/canonical/`. |
| Maven Admin failures | Test fixtures expect data-source fallbacks that the current production paths no longer provide. | Trace each controller input to its output, make the intended fallback explicit, and test managed URL sanitization/caching. | Weaken image sanitizer or accept Wiki URLs to satisfy tests. |
| Item source | `1295` duplicate DB identities and `311` potential inserts prove the candidate plan is not an apply packet. | Build a deterministic accepted-key subset and quarantine all remaining rows before any proposal. | Pass `--allow-bulk=true --apply=true` to the existing compatibility writer. |
| Projection parity | `projection_*` schemas contain the fields, but the current projection rows lack values; broad `sync-maint-to-relation --apply=true` clears unrelated tables. | Add a narrow parity operation that locks and updates only named projection keys/columns from relation-backed facts. | Run broad relation sync, patch rows with mysql CLI, or blanket-copy local fields. |

### 1.5 Serial ownership

One coordinator owns `docs/devlog/current.md` and the parent entry. Mutation ownership is serialized:

1. `quality-and-admin-contracts`: repository code/tests only, no database writes.
2. `item-source`: `terria_v1_local.item_acquisition_sources` accepted key set only.
3. `projection-parity`: `terria_v1_relation.projection_items`, `projection_npcs`, `projection_bosses` named columns/keys only.
4. `runtime-closeout`: read-only reports, stack lifecycle, and documentation only.

No lane starts a DML transaction while another lane has an unknown transaction state.

## 2. Fresh Run And Recovery Contract

### Task 0: Establish a new run root and immutable baseline

**Files:**
- Create: `reports/runtime/local-data-chain-closure/${RUN_DAY}/remaining-remediation/${RUN_ID}/environment.json`
- Create: `reports/runtime/local-data-chain-closure/${RUN_DAY}/remaining-remediation/${RUN_ID}/freeze.json`
- Create: `reports/runtime/local-data-chain-closure/${RUN_DAY}/remaining-remediation/${RUN_ID}/checkpoint.json`
- Modify: `docs/devlog/entries/2026-08-22-local-remaining-closure-remediation.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Verify no active writer and the local service identity.**

Run:

```bash
ss -ltnp | rg ':(13306|18091|5177|3004|6380|19000)\\b'
mysql -h127.0.0.1 -P13306 -uroot -proot -N -e 'SELECT 1'
git status --short
git branch --show-current
git rev-parse HEAD
```

Expected: loopback MySQL is reachable; the six local services are listening; dirty paths are recorded and never removed.

- [ ] **Step 2: Generate all read-only baseline reports into the new run root.**

```bash
RUN_DAY="$(date +%Y%m%d)"
RUN_ID="$(date +%H%M%S)-remaining-remediation"
RUN_ROOT="reports/runtime/local-data-chain-closure/${RUN_DAY}/remaining-remediation/${RUN_ID}"
mkdir -p "$RUN_ROOT"
node pipelines/audit/cross-db-referential-integrity.mjs --write-report=true --output="$RUN_ROOT/cross-db.json"
node pipelines/relation/relation-health-report.mjs --date-tag="$(date +%F)" --write-report=true
node pipelines/relation/local-core-compat-smoke-check.mjs --date-tag="$(date +%F)-${RUN_ID}" --throw-on-failure=false
node pipelines/audit/build-item-source-candidate-import-plan.mjs --output="$RUN_ROOT/item-source-candidates.json"
node pipelines/relation/apply-item-source-candidate-local-compat.mjs --input="$RUN_ROOT/item-source-candidates.json" --allow-bulk=true --apply=false --database=terria_v1_local --output="$RUN_ROOT/item-source-dry-run.json"
TERRAPEDIA_DB_HOST=127.0.0.1 TERRAPEDIA_DB_PORT=13306 node pipelines/audit/image-source-lineage-report.mjs --attempt-root=reports/authorization/canonical/item-image-projection-apply/8e31d3c6d2e178b1985c05b43efa18a408a84afd98ed2ec6a7fd176eca891026 --output="$RUN_ROOT/image-lineage.json"
```

Expected: every report is parseable JSON. `cross-db` and image lineage are passing regression gates; Item source and parity numbers are recorded, never reused as an authorization scope.

- [ ] **Step 3: Freeze input hashes and continuation state.**

Implement a small run writer in `pipelines/audit/build-remaining-remediation-freeze.mjs` with a test in `pipelines/audit/build-remaining-remediation-freeze.test.mjs`.

The writer must emit exactly:

```js
{
  schemaVersion: 'remaining-remediation-freeze-v1',
  readOnly: true,
  databaseWrites: false,
  reportHashes: { crossDb, itemSourceCandidates, itemSourceDryRun, localCoreCompat, imageLineage },
  itemSource: { plannedRows, duplicates, toInsert, blockedCandidates },
  parity: { items, npcs, bosses },
  scopeHash: 'sha256:' + 64 lowercase hexadecimal characters
}
```

Test cases must reject a changed source report hash, an Item dry-run with `apply: true`, a missing parity domain, and a non-loopback database host.

- [ ] **Step 4: Checkpoint before any code or data mutation.**

Write `checkpoint.json` with `task: 'quality-and-admin-contracts'`, `status: 'ready'`, the freeze hash, no operation ID, and `repairCount: 0`.

**Failure branch:** unavailable MySQL/API or a malformed baseline emits `preflight-blocker.json`; only code/test remediation may continue. Any count/hash drift after a proposal requires a new run root and invalidates that proposal.

## 3. Hermetic Quality Gate And Admin Contracts

### Task 1: Remove authorization-history dependencies from tests

**Files:**
- Modify: `pipelines/item-groups/item-group-compatibility-publish.test.mjs`
- Modify: `pipelines/npc-canonical/npc-apply-ownership-preparation.test.mjs`
- Modify: `pipelines/npc-canonical/npc-owner-phase-contract.test.mjs`
- Create: `pipelines/test-fixtures/canonical/item-group-bootstrap.result.fixture.json`
- Create: `pipelines/test-fixtures/canonical/npc-apply.input.fixture.json`

- [ ] **Step 1: Write red tests proving fixtures are repository-owned and independent of `reports/authorization`.**

Add a test assertion in each affected file that fixture resolution is under `pipelines/test-fixtures/canonical/` and does not contain `reports/authorization/canonical`.

```js
assert.equal(path.relative(repoRoot, fixturePath).startsWith('pipelines/test-fixtures/canonical/'), true);
```

- [ ] **Step 2: Run the three tests before changing fixture resolution.**

```bash
node --test pipelines/item-groups/item-group-compatibility-publish.test.mjs pipelines/npc-canonical/npc-apply-ownership-preparation.test.mjs pipelines/npc-canonical/npc-owner-phase-contract.test.mjs
```

Expected: the current missing authorization-path error reproduces.

- [ ] **Step 3: Add minimal, non-authorizing fixtures.**

The item-group fixture must contain only fields consumed by `buildItemGroupCompatibilityPublicationFromSnapshot`: `status`, `runtimeSnapshotHash`, `compatibilitySnapshotHash`, `counts.local.groupCount`, and the required bootstrap run key. The NPC fixture must contain only the fields consumed by `buildNpcApplyOwnershipPreparation` and `buildNpcOwnerOperationPlan`, including the exact 25 evidence pairs and hashes already asserted by the tests. Mark both with:

```json
{ "fixtureOnly": true, "notAuthorization": true }
```

Production readers must reject `fixtureOnly: true`; tests load them only through explicit fixture helpers.

- [ ] **Step 4: Make each test inject its fixture path.**

Replace direct `reports/authorization` reads with a `fixturePath(name)` helper rooted at `pipelines/test-fixtures/canonical/`. Pass the parsed NPC input explicitly to builders; do not change canonical production default paths.

- [ ] **Step 5: Prove both boundaries.**

```bash
node --test pipelines/item-groups/item-group-compatibility-publish.test.mjs pipelines/npc-canonical/npc-apply-ownership-preparation.test.mjs pipelines/npc-canonical/npc-owner-phase-contract.test.mjs
rg -n "reports/authorization/canonical/(canonical-item-group-bootstrap\\.result|canonical-npc-apply\\.input)" pipelines -g '*.test.mjs'
```

Expected: three tests pass; the scan returns no test reader for the two excluded paths.

### Task 2: Repair the nine Admin contract failures at their source

**Files:**
- Modify: `services/catalog-api/src/main/java/com/terraria/skills/controller/AdminBossController.java`
- Modify: `services/catalog-api/src/main/java/com/terraria/skills/controller/AdminBuffController.java`
- Modify: `services/catalog-api/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Modify: `services/catalog-api/src/main/java/com/terraria/skills/controller/AdminTownNpcMaintenanceController.java`
- Modify tests: matching four `Admin*ControllerTest.java` files

- [ ] **Step 1: Add one red assertion per failing behavior.**

Required assertions:

```java
// AdminBossControllerTest: Retinazer reference member has a managed image URL.
// AdminBuffControllerTest: source-page fallback produces linkedSourceItems.size() == 1 and sourceItemCount == 1.
// AdminNpcControllerTest: generated QueenBee zh map yields "蜂王" and search matches "QueenBee".
// AdminTownNpcMaintenanceControllerTest: imageUrl is accepted for managed imageUrl, image_url, and rawJson image_url; Wiki URLs remain null.
```

For town NPC tests, stub the actual `resolveDataFile`/data-root path used by `loadNpcImageUrl` or use a temporary generated map file; do not mutate a cached field that the controller no longer reads. Remove the obsolete strict Mockito stub in the Wiki raw-json suppression test.

- [ ] **Step 2: Run only the four test classes and record exact failures.**

```bash
cd services/catalog-api
mvn -Dtest=AdminBossControllerTest,AdminBuffControllerTest,AdminNpcControllerTest,AdminTownNpcMaintenanceControllerTest test
```

Expected: the nine failures/error reproduce before implementation.

- [ ] **Step 3: Implement only the traced fallback rules.**

1. `AdminBossController`: when a reference member row exists, resolve `imageUrl` through the same preferred managed image expression used by the item lookup; preserve `null` for unmanaged URLs.
2. `AdminBuffController`: when direct `buff_source_items` is empty and `sourceItemsJson` is empty, parse the declared source-page fallback, query the matching local Item row, and use the resulting linked list for both detail and list count.
3. `AdminNpcController`: load the generated NPC zh map through the current project-data resolver before list mapping/search; cache only immutable parsed maps and invalidate cache in test setup.
4. `AdminTownNpcMaintenanceController`: resolve the generated record from the same project-data root tested by `loadNpcImageUrl`; preserve precedence `imageUrl -> image_url -> rawJson.imageUrl -> rawJson.image_url`, applying `managedImageOrNull` at every step.

- [ ] **Step 4: Run focused tests, then broad Maven.**

```bash
cd services/catalog-api
mvn -Dtest=AdminBossControllerTest,AdminBuffControllerTest,AdminNpcControllerTest,AdminTownNpcMaintenanceControllerTest,ItemSourceServiceImplTest,PublicNpcAggregateControllerTest,PublicNpcServiceImplImageTest,ItemImageControllerTest,PublicItemServiceImplTest,RelationCompatibilityServiceImplTest test
mvn test
```

Expected: both commands exit `0`. A new red outside these controllers is classified against the pre-run baseline and repaired only if caused by this lane.

**Failure branch:** if a test expects a Wiki URL, change the test expectation to `null`; never weaken the managed-image policy. If a generated data fixture is missing, add it under `src/test/resources` or use a temporary test data root, not `data/generated` runtime state.

## 4. Item Source Closure

### Task 3: Produce accepted, duplicate, and quarantine partitions before an operation exists

**Files:**
- Create: `pipelines/audit/build-item-source-governed-partition.mjs`
- Create: `pipelines/audit/build-item-source-governed-partition.test.mjs`
- Modify: `pipelines/audit/build-item-source-candidate-import-plan.mjs`
- Modify: `pipelines/relation/apply-item-source-candidate-local-compat.mjs`

- [ ] **Step 1: Define the stable source identity.**

Use exactly this normalized key, preserving `null` as an error rather than an empty string:

```js
const sourceIdentity = {
  itemId,
  sourceType,
  sourceRefType,
  sourceRefId,
  sourceRefInternalName: normalizeIdentity(sourceRefInternalName),
  sourceRefName: normalizeIdentity(sourceRefName),
  sourcePage: normalizeIdentity(sourcePage),
  chanceText: normalizeIdentity(chanceText),
  quantityText: normalizeIdentity(quantityText),
  conditions: normalizeIdentity(conditions),
};
```

Hash canonical JSON as `sha256:` followed by 64 lowercase hexadecimal characters. The partitioner rejects two accepted rows with the same identity, any row without exact Item ID, and any row lacking maint/relation trace evidence.

- [ ] **Step 2: Write red partition tests.**

Test at minimum: duplicate same identity -> `duplicate`; same display text but distinct stable IDs -> separate accepted rows; family/external/manual rows -> `quarantine`; a stale item ID/internal-name mismatch -> `blocked`; and an accepted row with all four lineage keys -> `accepted`.

- [ ] **Step 3: Implement partition output and fail-closed report.**

Emit:

```js
{
  schemaVersion: 'item-source-governed-partition-v1',
  acceptedRows: [],
  duplicateRows: [],
  quarantineRows: [],
  blockedRows: [],
  summary: { accepted, duplicates, quarantine, blocked },
  scopeHash: 'sha256:' + 64 lowercase hexadecimal characters
}
```

Every non-accepted row includes `itemInternalName`, `itemId`, source identity when available, reason, raw path/source page, evidence hash, and `nextAction` chosen from `repair_identity`, `parser_policy`, `local_evidence_required`, `external_evidence_required`, or `manual_review`.

- [ ] **Step 4: Rebuild the fresh Item source chain and assert partition invariants.**

```bash
node pipelines/audit/build-item-source-governed-partition.mjs --candidate-plan="$RUN_ROOT/item-source-candidates.json" --dry-run-report="$RUN_ROOT/item-source-dry-run.json" --output="$RUN_ROOT/item-source-partition.json"
node --test pipelines/audit/build-item-source-governed-partition.test.mjs pipelines/relation/apply-item-source-candidate-local-compat.test.mjs
```

Expected: `acceptedRows.length + duplicateRows.length + quarantineRows.length + blockedRows.length` equals the selected candidate row count. Only `acceptedRows` may be offered to a proposal.

### Task 4: Add a governed Item source operation and apply only the accepted partition

**Files:**
- Create: `pipelines/relation/item-source-canonical-apply-contract.mjs`
- Create: `pipelines/relation/item-source-canonical-apply-db.mjs`
- Create: `pipelines/relation/build-item-source-canonical-proposal.mjs`
- Create: `pipelines/relation/apply-item-source-canonical.mjs`
- Create tests for each new module under `pipelines/relation/`
- Modify: `pipelines/automation/canonical-operation-catalog.mjs`
- Modify: `pipelines/automation/canonical-operation-execution-manifest.mjs`
- Modify: `pipelines/automation/canonical-operation-execution-manifest.test.mjs`

- [ ] **Step 1: Register exactly one new operation.**

Add `canonical-item-source-local-compat-apply` with allowed target:

```js
{
  database: 'terria_v1_local',
  table: 'item_acquisition_sources',
  writeMode: 'insert_only_idempotent',
  requiredInputs: ['freeze', 'partition', 'proposal'],
  forbiddenTables: ['items', 'maint_items', 'relation_items', 'projection_items']
}
```

Manifest inputs must include the four new relation files and the partitioner. Add a test that rejects the operation if any code path imports the existing broad writer as a DML executor.

- [ ] **Step 2: Implement proposal and database adapter contracts.**

The proposal must include only `acceptedRows`, their identity hash, partition hash, current target-row fingerprint, and `changedRowCount`. The adapter must:

1. begin one transaction;
2. lock each frozen duplicate lookup and accepted identity using `FOR UPDATE`;
3. recompute partition/proposal hashes;
4. reject any existing non-identical row as drift;
5. insert only missing accepted keys;
6. re-read every accepted key, compare canonical hashes, commit once; and
7. on every exception roll back and write no successful result.

Tests must prove idempotent zero-change replay is rejected at authorization level, duplicate identity rolls back, a changed DB row rolls back, and the adapter never accesses another table.

- [ ] **Step 3: Generate fresh authorization only after the dry run is clean.**

Gate condition:

```bash
node pipelines/relation/build-item-source-canonical-proposal.mjs --freeze="$RUN_ROOT/freeze.json" --partition="$RUN_ROOT/item-source-partition.json" --output="$RUN_ROOT/item-source-proposal.json"
```

The command must exit nonzero if `acceptedRows.length === 0`, any accepted duplicate exists, or any accepted row lacks all four lineage keys. In that case write `item-source-blocker.json`, do not create a packet, and continue to projection parity.

- [ ] **Step 4: Authorize and execute once when proposal is eligible.**

Use `build-canonical-cutover-authorization.mjs` and `run-authorized-canonical-operation.mjs` with a new decision identity and new private attempt root derived from the fresh scope hash. The result must state `dmlAttempted`, commit status, `changedRowCount`, exact inserted identity hashes, and no permit remains.

- [ ] **Step 5: Read back every layer and the public API.**

Run the Item source closure reports and sample each inserted identity from:

```text
maint evidence -> relation item_source_facts/item_source_details -> local item_acquisition_sources -> public Item source DTO
```

The API assertion must compare stable `itemId` plus source identity hash, never only display text.

**Failure branch:** external, family, manual, or duplicate rows remain quarantined and do not block the next lane. If their count is nonzero, the parent cannot close; a final state must say precisely which row class remains and why.

## 5. Strict Projection Parity

### Task 5: Build a minimal projection parity repair plan from relation-backed facts

**Files:**
- Create: `pipelines/relation/build-core-projection-parity-plan.mjs`
- Create: `pipelines/relation/build-core-projection-parity-plan.test.mjs`
- Modify: `pipelines/relation/projection-sync.mjs`
- Modify tests: `pipelines/relation/projection-sync.test.mjs` and `pipelines/relation/local-core-compat-smoke-check.test.mjs`

- [ ] **Step 1: Derive only the known parity fields and keys.**

The plan must own exactly:

```js
const OWNED_FIELDS = {
  items: ['knockback', 'sell'],
  npcs: ['life_max', 'knock_back_resist', 'scale'],
  bosses: ['name_zh'],
};
```

It must also classify the five Item local-only keys (`HeartArrow`, `ValentineRing`, `TurkeyFeather`, `FestiveTopHat`, `Wiesnbrau`) as either a source-backed insert candidate or a named `local_only_quarantine` record. No key may be silently excluded.

- [ ] **Step 2: Write red tests for source authority and zero-value preservation.**

Required cases: Item `knockback: 0` survives projection; NPC decimal `scale` and `knock_back_resist` survive; missing relation source is blocked rather than copied from local; four pillars receive their Chinese name from relation boss facts; five local-only keys are explicitly reported.

- [ ] **Step 3: Implement plan builder using relation sources only.**

For each candidate, emit `domain`, stable key, source relation record key, before/after values, source hash, reason, and `action` (`update_existing_projection`, `insert_source_backed_projection`, or `quarantine`). The builder refuses a local field as the source of a projection value.

- [ ] **Step 4: Dry-run against fresh DB state.**

```bash
node pipelines/relation/build-core-projection-parity-plan.mjs --local-database=terria_v1_local --relation-database=terria_v1_relation --output="$RUN_ROOT/core-projection-parity-plan.json"
node --test pipelines/relation/build-core-projection-parity-plan.test.mjs pipelines/relation/projection-sync.test.mjs pipelines/relation/local-core-compat-smoke-check.test.mjs
```

Expected: only named fields/keys are proposed, every value has a relation source record key, and unbacked rows become quarantine.

### Task 6: Add a narrow canonical parity operation and run independent domain partitions

**Files:**
- Create: `pipelines/relation/core-projection-parity-contract.mjs`
- Create: `pipelines/relation/core-projection-parity-db.mjs`
- Create: `pipelines/relation/apply-core-projection-parity.mjs`
- Create tests for each new module
- Modify: `pipelines/automation/canonical-operation-catalog.mjs`
- Modify: `pipelines/automation/canonical-operation-execution-manifest.mjs`

- [ ] **Step 1: Register three operation IDs with disjoint table/column scopes.**

```text
canonical-item-projection-parity-apply  -> projection_items.(knockback,sell) plus source-backed named inserts
canonical-npc-projection-parity-apply   -> projection_npcs.(life_max,knock_back_resist,scale)
canonical-boss-projection-parity-apply  -> projection_bosses.name_zh
```

Each registry entry rejects any target not in its exact table/column allow-list. The Item operation cannot insert a local-only identity; it can insert only an identity backed by frozen relation item facts.

- [ ] **Step 2: Implement transaction guardrails.**

Each adapter locks frozen target keys and source relation keys, recomputes the plan hash, checks pre-update values, writes only changed fields, reads rows back, and commits once. Tests must prove that an unexpected column, target key, relation source drift, or changed pre-value rolls back and produces no completed result.

- [ ] **Step 3: Run a fresh proposal/authorization/apply per eligible partition.**

For each domain with a nonempty, fully source-backed update set, preview all three domains with this exact loop; the command must create a blocker artifact rather than a proposal for a non-eligible domain:

```bash
for DOMAIN in items npcs bosses; do
  node pipelines/relation/apply-core-projection-parity.mjs --apply=false --domain="$DOMAIN" --plan="$RUN_ROOT/core-projection-parity-plan.json" --output="$RUN_ROOT/${DOMAIN}-parity-proposal.json"
done
```

Then generate a new operation-specific packet and permit. Execute once through the canonical runner. A domain with no fully backed rows writes `${DOMAIN}-parity-blocker.json` and is not authorized.

- [ ] **Step 4: Verify strict parity and APIs.**

```bash
node pipelines/relation/local-core-compat-smoke-check.mjs --date-tag="$(date +%F)-post-parity" --throw-on-failure=false
```

Require `ok: true`, zero failed domains, and no unclassified local-only Items. Verify one Item zero knockback, one NPC scale/resistance, and all four pillars through maintained API endpoints and both public/admin consumers.

**Failure branch:** a missing relation fact is a real source-chain blocker, not a fallback license. The plan writes a domain quarantine report and leaves the parent active.

## 6. Full Runtime Closure

### Task 7: Re-run every acceptance surface from the final state

**Files:**
- Create: `$RUN_ROOT/final/*.json`
- Modify: `docs/devlog/entries/2026-08-22-local-remaining-closure-remediation.md`
- Modify: `docs/devlog/current.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`

- [ ] **Step 1: Run data and runtime reports.**

```bash
node pipelines/audit/cross-db-referential-integrity.mjs --write-report=true --output="$RUN_ROOT/final/cross-db.json"
node pipelines/relation/relation-health-report.mjs --date-tag="$(date +%F)-final" --write-report=true
node pipelines/audit/npc-source-coverage-inventory.mjs --write-report=true
node pipelines/audit/npc-domain-loot-chain-audit.mjs --write-report=true --output="$RUN_ROOT/final/npc-domain.json" --date-tag="$(date +%F)"
node pipelines/audit/npc-loot-runtime-parity-audit.mjs --api-base-url=http://127.0.0.1:18091 --fast-local-api --write-report=true --output="$RUN_ROOT/final/npc-runtime.json" --date-tag="$(date +%F)"
node pipelines/audit/audit-biome-icon-readiness.mjs --output="$RUN_ROOT/final/biome.json"
TERRAPEDIA_DB_HOST=127.0.0.1 TERRAPEDIA_DB_PORT=13306 node pipelines/audit/image-source-lineage-report.mjs --attempt-root=reports/authorization/canonical/item-image-projection-apply/8e31d3c6d2e178b1985c05b43efa18a408a84afd98ed2ec6a7fd176eca891026 --output="$RUN_ROOT/final/image-lineage.json"
node pipelines/relation/local-core-compat-smoke-check.mjs --date-tag="$(date +%F)-final" --throw-on-failure=false
```

- [ ] **Step 2: Run code, UI, and stack gates.**

```bash
cd services/catalog-api && mvn test
cd ../../apps/admin-console && pnpm run check && pnpm run test
cd ../public-web && CHROMIUM_BIN=$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome pnpm run check
cd ../.. && bash ./platform/local/smoke-local-stack.sh --backend-base-url=http://127.0.0.1:18091 --admin-base-url=http://127.0.0.1:3004 --front-base-url=http://127.0.0.1:5177 --skip-auth
CHROMIUM_BIN=$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome bash ./platform/local/quality-gate.sh
```

Expected: every command exits `0`. Any failure is repaired only in its owning lane, followed by rerunning that lane plus this Task.

### Task 8: Final review, index, and closeout decision

- [ ] **Step 1: Build `final/closure-index.json`.**

Include every report path and SHA-256, operation ID, decision identity, permit terminal state, `dmlAttempted`, commit state, changed row counts, API response assertions, and exact quarantine counts.

- [ ] **Step 2: Perform the required plan audit.**

Apply `terrapedia-plan-auditor` gates to the executed evidence:

```text
goal lock -> source-chain lock -> boundary lock -> evidence lock -> execution continuity -> serial ownership -> commit readiness
```

Any critical/important finding returns the parent entry to the owning task; it is not deferred as a generic follow-up.

- [ ] **Step 3: Validate documentation and repository state.**

```bash
git diff --check
node platform/tooling/sync-agent-skills.mjs --check
git status --short
git diff --cached --stat
```

- [ ] **Step 4: Decide closure from evidence only.**

Set the parent entry to `closed` only when Tasks 0-8 pass and all in-scope blockers are zero. Otherwise leave it `active` with the exact final blocker path, row count, owner, and next bounded action. Do not commit or stage unrelated dirty work.

## 7. Automatic Continuation Matrix

| Condition | Automatic action | Retry limit | Parent state |
| --- | --- | ---: | --- |
| Missing excluded authorization fixture | Make tests use committed `fixtureOnly` data and prove production rejects it. | 1 code repair | active until gate passes |
| Maven Admin red | Trace controller source -> mapper/data file -> DTO, add red test, fix one controller, rerun focused and full Maven. | 1 per root cause | active until all pass |
| Proposal input hash drift | Discard proposal/packet/permit and create a new run freeze. | unlimited read-only | active |
| Unknown transaction outcome | Read result and DB fingerprints before any action; never rerun DML blindly. | 0 blind retries | blocked until known |
| Item duplicate/unproven source | Quarantine exact rows and exclude them from proposal. | none | active |
| No accepted Item rows | Emit Item-source blocker; continue parity/runtime lanes. | none | active |
| Relation source missing for parity | Emit domain quarantine; do not copy from local. | none | active |
| Runtime service failure | Restart maintained local stack once, then rerun smoke. | 1 | active/blocker |
| Quality gate red after all repairs | Classify each test; repair only in-scope root causes, then rerun whole gate. | 1 per root cause | active |

## 8. Formal Plan Review

## Verdict

- Status: execution-ready after Task 0 fresh freeze.
- Main goal: close the remaining Item source, strict projection parity, and validation blockers without weakening data authority.
- Closure definition: all four conditions in section 1.1 are fresh and passing; otherwise the parent stays active.

## Blocking Plan Defects

- Critical: none. Every mutation has a narrower target, proposal gate, authorization path, rollback/readback, and failure branch.
- Important: Item-source accepted-row count and relation-backed parity count are intentionally unknown until the fresh partition/plan. The plan resolves this before it can create any authorization artifact.

## Plan Repairs

- Change: authorization-history tests become hermetic fixture consumers.
- Reason: excluded historical result/input bytes cannot be reconstructed safely and are not production runtime dependencies.
- Validation added: production paths reject `fixtureOnly` bytes; focused tests and full quality gate must pass.
- Change: Item source and parity each receive a dedicated canonical operation rather than reuse of broad writers.
- Reason: existing writers are too broad or do not provide proposal/permit/transaction evidence for these scopes.
- Validation added: exact target-table/column tests, drift rollback tests, four-layer/API readback, and final strict parity smoke.

## Execution-Ready Plan

- Scope: quality fixtures/Admin contracts, Item source, Items/NPCs/Bosses projection parity, runtime closure only.
- Agent split: one coordinator; four serialized owners defined in section 1.5. No concurrent DB or devlog writers.
- Smoke test: final local core compatibility, Item source stable identity API readback, stack smoke, and full quality gate.
- Final validation: Task 7 commands plus closure-index hash validation and Task 8 audit.

## Residual Risk

- Risk: a true absence of local source/relation evidence cannot be repaired by this plan without an external-evidence task.
- Follow-up trigger: any final Item quarantine or parity source-missing count above zero creates a separate evidence-acquisition plan; it is never converted to an expected-zero or authorized write.
