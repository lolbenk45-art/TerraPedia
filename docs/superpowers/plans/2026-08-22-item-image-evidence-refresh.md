# Item Image Evidence Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the final Item image-lineage evidence gap after the completed local MinIO origin repair, without crawling Wiki, changing image freshness timestamps, touching quarantined identities, or widening the existing data scope.

**Architecture:** Re-freeze the current local MySQL state on `127.0.0.1:13306`, build a new existing-row-only Item projection proposal, and execute a canonical zero-change apply that records the current `19000` managed URLs as authoritative before/after evidence. The apply owns only `terria_v1_relation.projection_items.image`; relation/source rows are read-only inputs. The final lineage auditor must validate the new result artifact and report Item ready, producing `7/7` ready entity contracts.

**Tech Stack:** Node.js ESM, `node:test`, MySQL 8 read-only transactions, existing Item image projection contract/runner, SHA-256 evidence hashes, maintained Spring API, and local MinIO.

---

## Closure And Boundaries

### In scope

- Eligible Item projection identities currently backed by `relation_item_images` and `projection_items`.
- Existing `projection_items.image` values after the completed origin repair.
- New proposal, snapshot, owner authorization, packet, permit, canonical apply result, and lineage/readiness evidence.
- Read-only API smoke and focused Item/image contract tests.

### Explicitly out of scope

- Wiki crawling, source verification requests, Steam/forum requests, or any external HTTP request.
- MinIO uploads, object copies, image-byte changes, or source URL changes.
- `item_images`/`maint_item_images`/`relation_item_images` DML.
- `last_verified_at` refresh for Item or Buff.
- The `23` missing Item rows, `15` `legacy_unowned_image_contract` rows, eight `ZH_RECIPE_*` rows, `FallenStar` (`75`), and `SeveredHandBanner` (`3398`).
- NPC, Projectile, Armor, Biome, Buff, Boss, local compatibility parity, production, L2, staging, commit, or cleanup.

### No-interactive-prompt rule

The executor must run serially and make all plan-defined decisions automatically. It must create a fresh scope hash and operation artifacts, consume the generated local owner authorization/permit, and continue through validation without asking the user. It may stop only on a safety failure: database fingerprint drift, key/count drift, artifact hash mismatch, unauthorized target, transaction/readback mismatch, or external service failure. A safety stop must write a failed result and rollback; it must not broaden scope or retry with guessed values.

### Current starting facts

- Branch: `feat/supplementary-domains-readiness`.
- MySQL: `127.0.0.1:13306`; backend: `18091`; public web: `5177`; admin: `3004`; MinIO: `19000`.
- Current Item projection: `6146` active rows; the relation-backed accepted scope is `6129` identities after exact exclusion of the two provenance quarantine identities, and all `6129` accepted projection values are managed under the `19000` policy. The relation table still contains `6131` primary-icon rows because it retains those two quarantine identities.
- Current image lineage: `6/7` ready only because Item evidence reports `invalid_item_image_projection_apply_evidence`.
- Existing origin repair evidence: `reports/runtime/local-data-chain-closure/20260822/remaining-image-repair/021851-db/item-image-origin-repair.result.json`, scope `sha256:282505ce4ca6b2d8348b4bfe71ea28848e87a8ba5d3c7408acf51d3bcb6f5d2a`.

## Source Chain

```text
relation_item_images.cached_url (read-only)
  -> projection_items.image (single owned write column)
  -> image-source-lineage-report
  -> backend /api/public/items/{id}
```

The managed URL policy must be loaded from `pipelines/relation/managed-image-url-policy.mjs` and resolve the local MinIO `items` prefixes. No URL is synthesized; every after value must equal the current relation cached URL for the same `internal_name`. Relation `record_key` and projection `relation_record_key` are separate layer identities and must each be frozen and rechecked; they are not required to be equal.

## Task 1: Fresh Read-Only Freeze

**Files/reports:**

- Generate only under `reports/runtime/local-data-chain-closure/20260822/item-image-evidence-refresh/<attempt>/`.
- Read `pipelines/audit/image-source-lineage-report.mjs`, `pipelines/audit/image-asset-readiness-audit.mjs`, and `pipelines/relation/item-image-projection-db.mjs`.

- [ ] Verify the configured MySQL fingerprint and start one `START TRANSACTION READ ONLY` snapshot.
- [ ] Select exactly the `6129` accepted Item keys, relation image rows, and projection before rows; exclude all named quarantine identities by exact key, not by count. Record the `6131` total relation rows and the two excluded rows in the freeze inventory.
- [ ] Verify every relation cached URL is managed, every projection key is unique, and the relation/projection key sets match.
- [ ] Compute `scopeHash = sha256(canonical JSON of operation id, database fingerprint, target database/table/column, ordered keys, relation before hashes, projection before hashes, managed-policy source hash, and origin-repair result hash)`.
- [ ] Write `freeze.json` with `readOnly=true`, `databaseWrites=false`, `externalRequests=false`, `targetRowCount=6129`, and the exact quarantine inventory.

Run:

```bash
export TERRAPEDIA_DB_HOST=127.0.0.1 TERRAPEDIA_DB_PORT=13306
export TERRAPEDIA_DB_USERNAME=root TERRAPEDIA_DB_PASSWORD=root
RUN_ROOT="reports/runtime/local-data-chain-closure/20260822/item-image-evidence-refresh/$(date +%H%M%S)"
mkdir -p "$RUN_ROOT"
node pipelines/audit/image-source-lineage-report.mjs --source=db --output="$RUN_ROOT/pre-lineage.json"
node pipelines/audit/image-asset-readiness-audit.mjs --source=db --output="$RUN_ROOT/pre-readiness.json"
node pipelines/relation/local-core-compat-smoke-check.mjs --throw-on-failure=false > "$RUN_ROOT/pre-local-core.log" 2>&1
```

Expected: the accepted Item projection scope is `6129/6129` managed; the two excluded quarantine rows and 15 legacy-unowned rows remain outside the proposal. Lineage remains not ready only because the prior apply evidence is not bound. Any count/key/prefix drift invalidates this attempt and causes a new attempt directory; it must not reuse the old hash.

## Task 2: Generate The Exact Proposal

**Files:**

- Modify only the existing proposal path in `pipelines/relation/build-item-image-projection-proposal.mjs` and `pipelines/relation/item-image-projection-contract.mjs` to bind the adapter output; preserve all generic callers.
- Create: `pipelines/relation/item-image-origin-repair-evidence-adapter.mjs`.
- Tests: `pipelines/relation/build-item-image-projection-proposal.test.mjs`, `pipelines/relation/item-image-projection-contract.test.mjs`, `pipelines/relation/item-image-origin-repair-evidence-adapter.test.mjs`.

- [ ] Build a proposal bound to the Task 1 freeze and a new decision-derived attempt root.
- [ ] Before invoking the existing proposal builder, create an explicit
  `origin-repair-bound` lineage evidence adapter from
  `item-image-origin-repair.result.json`. The adapter must copy the canonical
  6,129 identity/key set and current `19000` cached URLs, bind the origin-repair
  result hash, and fail if any identity, relation record key, or before hash
  differs. It must not claim a new source crawl or freshness verification.
- [ ] Add focused tests proving the adapter rejects a changed identity, changed
  origin-repair result, missing quarantine exclusion, or unmanaged URL. The
  existing historical lineage packet must never be silently reused.
- [ ] Wire the proposal builder to consume only the adapter's output paths for
  this operation; do not alter the generic lineage contract for other callers.
- [ ] Set `ownedDatabase=terria_v1_relation`, `ownedTable=projection_items`, `ownedColumn=image`, `targetRowCount=6129`, and `changedRowCount=0`.
- [ ] Require `projectionAfterRows` to equal the current managed relation cached URLs; reject any missing key, duplicate key, quarantine identity, unmanaged URL, or stale before hash.
- [ ] Write proposal, snapshot, and read-only owner authorization artifacts with mode `0600` where required by the existing contract.
- [ ] Generate a new request/packet/permit from this exact proposal; never reuse `admin-01`, `admin-02`, `admin-09`, or any prior Item decision.

Expected proposal invariants:

```json
{
  "ownedDatabase": "terria_v1_relation",
  "ownedTable": "projection_items",
  "ownedColumn": "image",
  "targetRowCount": 6129,
  "changedRowCount": 0,
  "dmlAllowed": true,
  "sourceWritesAllowed": false,
  "externalRequestsAllowed": false
}
```

### Deterministic artifact sequence

The executor must use one fresh decision identity, for example
`canonical-item-image-projection-apply-20260822-admin-10`, and derive every
private attempt path from it with
`buildItemImageProjectionAttemptPaths(decisionIdentity)`. It must run these
steps in order; no path may be hand-edited:

```bash
node pipelines/automation/canonical-operation-execution-manifest.mjs \
  --operation-id=canonical-item-image-projection-apply \
  --item-image-projection-attempt-root="$ATTEMPT_ROOT" \
  --output="$ATTEMPT_ROOT/execution-manifest.json"

node pipelines/automation/build-canonical-cutover-authorization.mjs \
  --mode=request \
  --operation-id=canonical-item-image-projection-apply \
  --execution-manifest="$ATTEMPT_ROOT/execution-manifest.json" \
  --server-fingerprint="$RUN_ROOT/server-fingerprint.json" \
  --policy-rows="$RUN_ROOT/policy-rows.json" \
  --output="$ATTEMPT_ROOT/request.json"

node pipelines/automation/build-canonical-cutover-authorization.mjs \
  --mode=authorize \
  --operation-id=canonical-item-image-projection-apply \
  --execution-manifest="$ATTEMPT_ROOT/execution-manifest.json" \
  --server-fingerprint="$RUN_ROOT/server-fingerprint.json" \
  --policy-rows="$RUN_ROOT/policy-rows.json" \
  --request="$ATTEMPT_ROOT/request.json" \
  --request-hash="$(node -p "require('./$ATTEMPT_ROOT/request.json').requestHash")" \
  --owner-input="$RUN_ROOT/owner-input.json" \
  --used-decisions=reports/authorization/canonical/used-decisions.json \
  --output="$ATTEMPT_ROOT/packet.json"

node pipelines/automation/run-authorized-canonical-operation.mjs \
  --packet="$ATTEMPT_ROOT/packet.json" \
  --server-fingerprint="$RUN_ROOT/server-fingerprint.json" \
  --policy-rows="$RUN_ROOT/policy-rows.json"
```

`owner-input.json` is generated automatically with actor `admin`, reason
`Bind the completed Item origin-only repair to a zero-change projection evidence refresh`,
authorization reference `devlog://2026-08-22/item-image-evidence-refresh`, and
the deterministic decision identity. The executor must verify that the identity
is absent from `used-decisions.json` before writing any request/packet. If an
artifact already exists, it must create a new decision identity and attempt
root rather than overwrite it.

Before the sequence, Task 1 must materialize the technical inputs from the same
read-only snapshot (not from memory or an older report):

```bash
node --input-type=module -e '
import { createRequire } from "node:module";
import { writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
const mysql = createRequire(resolve("apps/admin-console/package.json"))("mysql2/promise");
const c = await mysql.createConnection({host:"127.0.0.1", port:13306, user:"root", password:"root"});
const [[row]] = await c.query("SELECT @@server_uuid AS server_uuid");
await c.end();
writeFileSync(process.argv[1], JSON.stringify({host:"127.0.0.1",port:13306,serverUuid:row.server_uuid,databases:["terria_v1_local","terria_v1_maint","terria_v1_relation"]}, null, 2)+"\\n", {mode:0o600});
chmodSync(process.argv[1],0o600);
' "$RUN_ROOT/server-fingerprint.json"

node --input-type=module -e '
import { writeFileSync, chmodSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const mysql = createRequire(resolve("apps/admin-console/package.json"))("mysql2/promise");
const c = await mysql.createConnection({host:"127.0.0.1", port:13306, user:"root", password:"root", database:"terria_v1_local"});
const [rows] = await c.query("SELECT p.domain_id AS domainId, p.current_version AS policyVersion, pv.policy_hash AS policyHash FROM crawler_automation_policy p JOIN crawler_automation_policy_version pv ON pv.domain_id=p.domain_id AND pv.policy_version=p.current_version ORDER BY p.domain_id");
await c.end();
if (!Array.isArray(rows) || rows.length === 0) throw new Error("current policy rows are missing");
writeFileSync(process.argv[1], JSON.stringify(rows,null,2)+"\\n",{mode:0o600});
chmodSync(process.argv[1],0o600);
' "$RUN_ROOT/policy-rows.json"

node --input-type=module -e '
import { writeFileSync, chmodSync } from "node:fs";
const [path, decisionIdentity] = process.argv.slice(1);
writeFileSync(path, JSON.stringify({actor:"admin",reason:"Bind the completed Item origin-only repair to a zero-change projection evidence refresh",authorizationReference:"devlog://2026-08-22/item-image-evidence-refresh",decisionIdentity},null,2)+"\\n",{mode:0o600});
chmodSync(path,0o600);
' "$RUN_ROOT/owner-input.json" "$DECISION_IDENTITY"
```

The executor must compare the generated server UUID, policy source hash, and
managed prefix list with the Task 1 freeze before proceeding. A mismatch creates
a new run root and repeats Task 1; it never signs a packet against mixed inputs.

## Task 3: Canonical Zero-Change Apply

**Files:**

- `pipelines/relation/apply-item-image-projection.mjs`
- `pipelines/relation/item-image-projection-db.mjs`
- `pipelines/automation/run-authorized-canonical-operation.mjs`

- [ ] Load the new packet and consume its one-time dispatch permit before the transaction can complete.
- [ ] Start one transaction and lock exactly the frozen `6129` accepted relation/projection rows; the two quarantine rows must not be locked by this operation.
- [ ] Recompute the locked key-set, relation hash, projection-before hash, target fingerprint, and managed-policy hash. Roll back before DML if any differs.
- [ ] Detect `changedRowCount=0`; complete the apply as a valid evidence refresh without issuing `UPDATE`, `INSERT`, `DELETE`, DDL, or source-table writes.
- [ ] Read back all `6129` accepted projection rows inside the transaction, verify the after hash and managed-prefix invariant, commit, and write a completed result with `dmlAttempted=false`.
- [ ] On any failure, rollback and write a failed result containing the transaction rollback evidence; do not retry inside the same attempt root.

The execution manifest must contain only the existing Item projection entrypoint
and the exact attempt-root paths. Its dynamic import/code-bundle hash must be
verified before dispatch. The dispatch permit is one-time and is revoked after
the child result is terminal, whether completed or failed.

## Task 4: Final Chain Validation

- [ ] Run the lineage auditor using the exact new attempt root/evidence bundle. Expected: Item `contractReady=true`; summary `readyEntityTypes=7`, `notReadyEntityTypes=0`.
- [ ] Run asset readiness. Expected warnings remain Item missing `23`, Item stale `5`, Buff stale `388`, and NPC missing `4`; these warnings must not be converted into lineage failures or silently removed.
- [ ] Run Biome readiness and local-core compatibility; preserve unrelated local-core field parity warnings as separate findings.
- [ ] Smoke the maintained API:

```bash
curl -fsS http://127.0.0.1:18091/api/public/items/1
curl -fsS 'http://127.0.0.1:18091/api/npcs?page=1&limit=1'
curl -fsS http://127.0.0.1:18091/api/public/biomes
```

- [ ] Run focused tests:

```bash
node --test \
  pipelines/relation/build-item-image-projection-proposal.test.mjs \
  pipelines/relation/item-image-projection-contract.test.mjs \
  pipelines/relation/item-image-projection-db.test.mjs \
  pipelines/relation/apply-item-image-projection.test.mjs \
  pipelines/relation/item-image-origin-repair-evidence-adapter.test.mjs \
  pipelines/audit/image-source-lineage-report.test.mjs \
  pipelines/audit/image-asset-readiness-audit.test.mjs
git diff --check
```

The origin-bound authorization regression is run separately from the legacy
authorization catalog file so unrelated retired-path expectations cannot hide
the required gate:

```bash
node --test --test-name-pattern='origin-repair' \
  pipelines/automation/build-canonical-cutover-authorization.test.mjs
```

## Task 5: Documentation And Closeout

- [ ] Append the final attempt id, scope hash, result hash, `changedRowCount=0`, `dmlAttempted=false`, readback count, and validation outputs to `docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md`.
- [ ] Update `docs/devlog/current.md` to state Item lineage `7/7` only if the final report proves it; keep readiness warnings and quarantines listed separately.
- [ ] Leave the entry `active` if any safety validation failed or any required report is missing. Use `ready-for-commit` only after all checks pass; this plan does not authorize staging or committing.
- [ ] Run `git status --short`, `git diff --check`, and a targeted scan for stale claims of Item `5800/6131`, old `7/7` reports, or “Wiki crawl required” in the active docs.

## Mandatory Preflight Assertions

The executor must fail before proposal or authorization output if any assertion
is false:

```text
database host/port = 127.0.0.1:13306
target database = terria_v1_relation
target table/column = projection_items.image
eligible key count = 6129
projection managed count = 6129
changed row count = 0
quarantine identities absent from proposal = FallenStar, SeveredHandBanner
external request count = 0
image transfer count = 0
freshness timestamp updates = 0
```

The only permitted DML outcome is zero DML. If a fresh snapshot reports a
non-zero change, the run must write a new proposal and stop before apply; it
must not silently broaden this plan into an image projection repair.

## Failure And Continuation Rules

- Database unavailable: write a blocked freeze report and exit without creating a permit.
- Scope drift: discard the attempt root, create a new timestamped freeze, and continue automatically with the new hash.
- Proposal artifact mismatch: do not apply; regenerate the proposal from the same fresh freeze only if the freeze itself is unchanged.
- Permit/packet failure: write failed evidence and stop the write lane; never bypass authorization or use an old decision.
- Readback mismatch: rollback, preserve failure evidence, and do not retry with widened keys.
- Asset readiness warning: record it and continue; do not mix freshness writes into this evidence refresh.

## Plan Audit

- **Repair applied (2026-08-22):** the original `6131` eligible-count assertion
  was inconsistent with exact quarantine exclusion. The repaired plan defines
  `6129` as the accepted write/evidence scope, records the `6131` relation-row
  total plus the two excluded identities, and keeps both quarantine rows out
  of every lock, proposal, and readback. This is a boundary correction, not a
  data mutation or quarantine promotion.
- **Repair validation:** a fresh `START TRANSACTION READ ONLY` observed
  `6131` active relation primary-icon rows and `6129` non-quarantine accepted
  identities. The revised count is now explicit in Task 1, Task 2, Task 3,
  proposal invariants, and mandatory preflight assertions.
- Goal lock: closes the exact remaining Item lineage evidence gap, not freshness warnings.
- Source-chain lock: relation cached URL -> projection image -> lineage audit -> API is explicit.
- Boundary lock: no Wiki crawl, no MinIO transfer, no source/relation DML, no freshness update, no quarantine expansion.
- Evidence lock: fresh DB freeze, exact scope hash, new packet/permit, zero-change result, transaction readback, final audit, API smoke, and focused tests.
- Continuity: the accepted scope is explicitly `6129` and the two named provenance identities remain quarantine-only. Drift and validation failures create a new attempt or a failed result; the executor does not ask for interactive decisions.
- Commit boundary: no staging or commit is included.

## Execution Outcome (2026-08-22)

- The original plan defect was found before authorization: it required `6131`
  eligible identities even though exact quarantine exclusion leaves `6129`.
  The plan was repaired in-place to separate relation total (`6131`) from the
  accepted scope (`6129`) and to preserve `FallenStar` and
  `SeveredHandBanner` as quarantine-only.
- The repaired plan completed one fresh `13306` freeze, one new decision-derived
  attempt, and one canonical zero-change apply. The result is `6129` rows,
  `changedRowCount=0`, `dmlAttempted=false`, and `6129` readback rows; the
  bound lineage audit reports `7/7`.
- The focused Item/image suite is `66/66`, including explicit regression tests
  for origin-bound authorization bundle inclusion/hash drift and apply lineage
  verification before authorization/connection. The full authorization test
  file retains three unrelated legacy expectation failures (retired paths and
  operation catalog); those are outside this plan and are recorded in the
  active devlog entry.
