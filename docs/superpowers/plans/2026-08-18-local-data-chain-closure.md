# Local Data-Chain Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining local NPC/Boss loot, Item source lineage, image, Projectile relation, projection, API, and UI acceptance gaps using only existing local evidence, without an unbounded Wiki crawl.

**Architecture:** The work stays inside the local three-database chain `maint -> relation -> local -> API -> UI`. Source bundles, standardized files, reports, and database rows already present locally are authoritative for this run. A local-only fast API mode disables the backend HTTP rate limiter through an explicit environment variable; it must never be enabled for a non-loopback target or production.

**Tech Stack:** Node.js ESM and `node:test`, MySQL 8 via `mysql2`, Spring Boot, Nuxt, Redis-backed local stack, governed import/relation operations, JSON audit reports.

---

## Non-Negotiable Boundaries

- No full Wiki, Steam, or forum crawl in this plan.
- No external request is allowed unless a local evidence-gap report is produced and the user explicitly approves a separate source-refresh task first.
- Use only `terria_v1_maint`, `terria_v1_relation`, and `terria_v1_local` on loopback MySQL.
- No direct SQL repair, ad-hoc importer, retired `scripts/**` path, production database, L2 promotion, or unrelated UI work.
- Non-boss loot and Boss loot remain disjoint owner scopes.
- Every write uses a frozen local bundle, operation authorization, transaction/write fence, readback, and a dated report.
- Fast API mode is only `TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=false` with a loopback backend. Restore the default (`true`) after the run.

## Closure Definition

The plan is complete only when all of the following are fresh and green:

1. NPC runtime parity has zero `api_gap` and zero `duplicate_or_polluted` rows.
2. Item source facts, details, NPC loot/shop relations, and local acquisition rows have stable lineage and parity; the 6,056-row warning is either closed or explicitly quarantined with evidence.
3. Non-boss and Boss loot audits have no unresolved, ambiguous, polluted, or rejected rows that are eligible for publication.
4. Item image lineage and readiness pass using existing managed assets.
5. Projectile item/NPC relations use only explicit local `shoot`/`projectileId` evidence and pass relation readiness.
6. Cross-DB, relation-health, loot-closure, runtime-parity, backend/public/admin smoke, and the local quality gate pass.

If any required evidence is absent locally, stop that lane, write a blocker report, and tell the user before requesting or running external source work.

## Task 0: Freeze Local Runtime Boundary And Fast API Mode

**Files:**
- Modify: `pipelines/audit/npc-loot-runtime-parity-audit.mjs`
- Test: `pipelines/audit/npc-loot-runtime-parity-audit.test.mjs`
- Modify: `platform/local/start-local-stack.sh`
- Test: `platform/local/local-stack.test.mjs`
- Document: `platform/local/config/README.md`

- [ ] **Step 1: Add a loopback-only fast option for parity requests.** Keep the normal default interval for rate-limited runs. Add an explicit `--fast-local-api` option that accepts only `localhost`, `127.0.0.1`, or `::1`, sets the request interval to zero, and fails closed for any other host.
- [ ] **Step 2: Implement the option in both CLI parsing and injected options.** Use this exact shape so a caller cannot bypass host validation:

```js
fastLocalApi: booleanOption(raw['fast-local-api'] ?? raw.fastLocalApi, false),
// After apiBaseUrl is normalized:
if (fastLocalApi) {
  assertLoopbackApiBaseUrl(apiBaseUrl);
  requestIntervalMs = 0;
}
```

`assertLoopbackApiBaseUrl` must parse with `new URL`, accept only `localhost`, `127.0.0.1`, and `[::1]`, and throw `fast local API mode requires a loopback api base URL` otherwise. Use `nonNegativeIntegerOption` for the interval only after the loopback check.
- [ ] **Step 3: Add tests for loopback acceptance and remote rejection.** Run `node --test pipelines/audit/npc-loot-runtime-parity-audit.test.mjs` and require the focused suite to pass.
- [ ] **Step 4: Export and record the local override in the local-stack manifest.** Add this before backend startup, preserving an inherited explicit value and defaulting ordinary local use to `true`:

```bash
export TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED="${TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED:-true}"
```

Add `httpRateLimitEnabled: process.env.TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED !== 'false'` to the backend section of the generated local-stack manifest. Cover both the default and explicit-false cases in `platform/local/local-stack.test.mjs`.
- [ ] **Step 5: Start the local backend for this acceptance run with the limiter disabled:**

```bash
RUN_DATE="$(date +%Y%m%d)"
RUN_ROOT="reports/runtime/local-data-chain-closure/$RUN_DATE"
mkdir -p "$RUN_ROOT"
TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=false \
  bash ./platform/local/start-local-stack.sh
bash ./platform/local/verify-local-stack.sh --skip-front
```

- [ ] **Step 6: Verify the manifest reports `httpRateLimitEnabled: false`, run a loopback burst smoke with no `429`, and record both results under `$RUN_ROOT`.** Do not change `application.yml` defaults and do not carry this environment into production or normal local development.

## Task 1: Rebaseline Existing Local Evidence (Read-Only)

**Files / reports:**
- `pipelines/audit/cross-db-referential-integrity.mjs`
- `pipelines/relation/relation-health-report.mjs`
- `pipelines/audit/npc-source-coverage-inventory.mjs`
- `pipelines/audit/npc-domain-loot-chain-audit.mjs`
- `pipelines/audit/npc-loot-closure-smoke-check.mjs`
- `pipelines/audit/npc-loot-runtime-parity-audit.mjs`
- `pipelines/audit/build-item-source-final-closure-status-report.mjs`

- [ ] **Step 1: Capture the local database, branch, process, and current report baseline.** Confirm no crawler/import writer is active.
- [ ] **Step 2: Create one date-scoped evidence root and run all read-only audits against the three local databases.**

```bash
node pipelines/audit/cross-db-referential-integrity.mjs --write-report=true --output="$RUN_ROOT/cross-db.json"
node pipelines/relation/relation-health-report.mjs --date-tag="$RUN_DATE" --write-report=true
RELATION_HEALTH_REPORT="reports/relation/relation-health-$RUN_DATE.json"
node pipelines/audit/npc-source-coverage-inventory.mjs --write-report=true --output="$RUN_ROOT/npc-source-coverage.json"
node pipelines/audit/npc-domain-loot-chain-audit.mjs --write-report=true --output="$RUN_ROOT/npc-loot-domain.json"
node pipelines/audit/npc-loot-runtime-parity-audit.mjs --api-base-url=http://127.0.0.1:18091 --fast-local-api --write-report=true --output="$RUN_ROOT/npc-loot-runtime.json"
node pipelines/audit/npc-loot-closure-smoke-check.mjs --write-report=true --domain-report="$RUN_ROOT/npc-loot-domain.json" --coverage-report="$RUN_ROOT/npc-source-coverage.json" --runtime-report="$RUN_ROOT/npc-loot-runtime.json" --relation-health-report="$RELATION_HEALTH_REPORT" --output="$RUN_ROOT/npc-loot-closure.json"
node pipelines/audit/build-item-source-final-closure-status-report.mjs --verify-local-db=true --output="$RUN_ROOT/item-source-closure.json"
```
- [ ] **Step 3: Classify every finding as repairable from local evidence, expected-zero, or external-evidence blocked.** Never turn an unknown row into expected-zero merely to reduce the count.
- [ ] **Step 4: If a lane is external-evidence blocked, stop only that lane and report the exact missing local artifact before continuing independent lanes.**

## Task 2: Repair NPC API Runtime Parity

**Files:**
- Modify: `pipelines/audit/npc-loot-runtime-parity-audit.mjs`
- Test: `pipelines/audit/npc-loot-runtime-parity-audit.test.mjs`
- Inspect/modify only as required: `services/catalog-api/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java`, `services/catalog-api/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Tests: matching Spring controller/service tests under `services/catalog-api/src/test/java/**`

- [ ] **Step 1: Add RED fixtures for one segmented NPC (`body/tail`) and one duplicated head.** The fixtures must include relation, projection, local, structured API, and legacy JSON fields.
- [ ] **Step 2: Trace the API response to its SQL and identify whether structured loot and `lootItemsJson` are merged twice.** Record the chosen canonical source in the test name and plan entry.
- [ ] **Step 3: Implement one canonical API row path.** Emit each stable loot identity once, preserve quantity/chance/condition, and keep the runtime mode explicit (`direct` or approved inheritance); do not hide mismatches in the audit normalizer.
- [ ] **Step 4: Resolve segmented NPC semantics from the existing local inheritance contract.** If an approved relation/local row should be visible, make API lookup return it. If the row lacks approved local evidence, keep it blocked and do not invent inheritance.
- [ ] **Step 5: Run focused Node and Maven tests, then run fast local parity against all 418 NPCs.** Expected result: no rate-limit failures and a report that lists only data/semantic blockers.

## Task 3: Close Item Source, Drop, And Relation Lineage

**Files:**
- `pipelines/fetch/build-item-relations-bundle.mjs`
- `pipelines/fetch/build-npc-item-relations-bundle.mjs`
- `pipelines/relation/item-source-relation-processor.mjs`
- `pipelines/relation/sync-maint-to-relation.mjs`
- `pipelines/relation/sync-relation-to-local-compat-tables.mjs`
- Audits: `pipelines/audit/audit-items-without-active-sources.mjs`, `pipelines/audit/audit-item-source-existing-evidence-layers.mjs`, `pipelines/audit/build-item-source-final-closure-status-report.mjs`

- [ ] **Step 1: Build a read-only lineage inventory for the 6,056 local acquisition rows without maint/relation trace.** Group by stable item identity, source type, and available local record key.
- [ ] **Step 2: Reconcile only rows backed by existing local `maint_item_sources`, `maint_npc_crawler_facts`, or frozen relation bundles.** Preserve non-NPC taxonomies such as recipe, worldgen, fishing, event, crate, and Shimmer.
- [ ] **Step 3: Generate a frozen preview showing source facts, details, shop relations, loot relations, and target local rows separately.** Require zero out-of-scope table mutations.
- [ ] **Step 4: Apply through the existing governed relation operation only after preview approval and local evidence checks.** No direct SQL and no new Wiki fetch.
- [ ] **Step 5: Read back all three layers and rerun source closure plus cross-DB audits.** Any row without a stable lineage remains quarantined and is reported.

## Task 4: Finish Non-Boss And Boss Loot Closure From Local Bundles

**Files:**
- `pipelines/import/import-normal-npc-loot-to-db.mjs`
- `pipelines/import/import-boss-loot-to-db.mjs`
- `pipelines/generate/generate-boss-loot-bundle.mjs`
- `pipelines/audit/npc-loot-correctness-gate.mjs`
- `pipelines/audit/npc-loot-gap-closure-audit.mjs`

- [ ] **Step 1: Re-run the non-boss and Boss audits using existing standardized inputs and frozen bundles only.** Keep `npc_loot` and `boss_loot` owner scopes separate.
- [ ] **Step 2: Preview any remaining eligible rows and prove that unresolved/ambiguous/polluted/rejected rows are not silently dropped.**
- [ ] **Step 3: Apply non-boss loot, read back, then apply Boss loot separately with `drop_source_kind` preserved.** Never combine the two operations.
- [ ] **Step 4: Run loot correctness, source coverage, closure, and runtime parity audits.** Stop and report if a missing row requires new upstream evidence.

## Task 5: Complete Item Image Lineage From Existing Managed Assets

**Files:**
- `pipelines/audit/image-source-lineage-report.mjs`
- Existing governed image lineage/apply scripts under `pipelines/relation/` and `pipelines/workflow/`
- `reports/domain/items/image-readiness-*.json`

- [ ] **Step 1: Inventory existing managed image objects and relation rows without network access.**
- [ ] **Step 2: Generate a frozen image lineage preview and reject raw Wiki URLs or missing managed objects.**
- [ ] **Step 3: Apply only the existing canonical image projection operation if all source objects are local and hashes match.**
- [ ] **Step 4: Verify item API, public image proxy, admin image path, and image readiness.** Missing assets become a user-visible blocker report; no Wiki download is started.

## Task 6: Complete Projectile Source Relations From Local Explicit Fields

**Files:**
- Existing relation processors under `pipelines/relation/`
- `pipelines/audit/domain-readiness-audit.mjs`
- Projectile relation tests and reports under `pipelines/relation/` and `reports/domain/projectiles/`

- [ ] **Step 1: Extract only local `shoot`, `projectileId`, or `projectile_id` fields from maint raw JSON.**
- [ ] **Step 2: Produce an unresolved audit for missing or ambiguous IDs; never infer from `aiStyle`, names, or display text.**
- [ ] **Step 3: Preview and apply item/NPC Projectile relations through the governed relation operation.**
- [ ] **Step 4: Read back relation/projection/local/API rows and require Projectile relation readiness to pass.**

## Task 7: Final Fast Local Runtime Acceptance

**Files / commands:**
- `platform/local/smoke-local-stack.sh`
- `platform/local/quality-gate.sh`
- All dated reports under `reports/runtime/local-data-chain-closure/$RUN_DATE/`

- [x] **Step 1: Run fast local NPC parity with the explicit loopback flag:**

```bash
TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=false \
node pipelines/audit/npc-loot-runtime-parity-audit.mjs \
  --api-base-url=http://127.0.0.1:18091 \
  --fast-local-api \
  --write-report=true
```

- [x] **Step 2: Run closure, cross-DB, relation-health, domain-readiness, image-readiness, and Projectile relation audits.** Domain/loot/projectile lanes pass; relation-health and cross-DB are warning-only; item-source/image lanes remain blocked as recorded below.
- [x] **Step 3: Run backend focused tests, public/admin checks, local API smoke, and `bash ./platform/local/quality-gate.sh`.** Spring `48/48`, admin check pass, basic smoke `200`; public check fails on missing sitemap evidence, managed-image smoke is blocked by unreachable image origin, and quality gate is `322/327` with five fail-closed fixture failures.
- [x] **Step 4: Restore normal local API protection, rerun one small smoke request, and record that the fast override was not retained.**
- [ ] **Step 5: Mark the chain ready only if every closure condition in this plan is green.** Otherwise leave the plan active/blocked with the exact report paths and next owner.

## Task 8: Documentation And Handoff

- [x] **Step 1: Update the bilingual plan checkboxes with commands, report paths, and evidence counts.**
- [x] **Step 2: Update `docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md` and `docs/devlog/current.md` with the real residual state; remove stale blocker counts only when replaced by fresh evidence.**
- [x] **Step 3: Run `git diff --check`, `git status --short`, and `git diff --cached --stat` before any commit.**

## Execution Stop / Escalation Rule

If any task needs a Wiki/Steam/forum request, the executor must stop before making that request and report: lane, missing local artifact, exact entities affected, why local data cannot decide, and the proposed bounded external command. Execution resumes only after explicit user approval.

## Execution Record (2026-08-18)

- [x] Tasks 0-1 completed with read-only evidence and loopback fast-mode smoke.
- [x] Task 2 completed: segmented API identity repaired; shop/buff representative
  semantics preserved; focused Node `22/22` and Spring `48/48` pass, including
  the combined structured/legacy fixture.
- [x] Task 3 completed read-only: `269` candidates, `276` planned duplicates,
  `0` dry-run source rows; no apply performed.
- [x] Task 3 treatment recheck confirms `292` focused candidates, `276`
  duplicate planned rows, `toInsert=0`, and `10` projection-required rows
  (CenxsWings plus nine Biome rows). CenxsWings has no current maint/relation
  lineage; the historical town-NPC import is not replayable evidence.
- [x] Task 4 audits pass; no loot apply performed.
- [x] Task 5 lineage inventory completed; apply blocked by missing managed
  projection values for non-boss entities.
- [x] Task 5 environment recheck completed with both legacy and canonical
  managed-image prefixes. Corrected readiness is `4/7`: NPC, Boss, Projectile,
  and Armor pass; Item lacks governed projection authorization evidence, Buff
  projection image values are empty, and Biome lineage tables/field are absent.
  No apply or download performed.
- [x] Task 6 Projectile relation readiness audit passes; unresolved image
  backfill remains non-blocking.
- [x] Task 7 completed after the exact duplicate quarantine. Fresh loopback
  parity is `418/418` trusted direct loot with `0` API gaps and `0`
  `duplicate_or_polluted` rows; relation/projection/local/API each contain
  `1542` active rows. Evidence:
  `reports/runtime/local-data-chain-closure/20260818/post-quarantine/npc-loot-runtime-parity.json`.
- [x] Post-quarantine closure smoke passes with `0` domain blockers, `0`
  runtime blockers, and `0` open loot audits. Relation health remains warning-only
  (`21 pass / 1 warning / 6 info / 0 blocking`); cross-DB remains `9 pass / 1
  warning / 0 blocking`. Evidence:
  `reports/runtime/local-data-chain-closure/20260818/post-quarantine/npc-loot-closure.json`,
  `reports/relation/relation-health-20260818-fresh.json`, and
  `reports/runtime/local-data-chain-closure/20260818/cross-db-20260818-fresh.json`.
- [x] Exact quarantine readback confirms the eight targeted rows are soft-disabled
  (`status=0`, `deleted=1`), four survivor rows remain active, and each canonical
  identity has exactly one active local row. Evidence:
  `reports/authorization/canonical/canonical-npc-duplicate-quarantine.result.json`.
- [x] Fast-mode verification was followed by stack restart with ordinary protection;
  the final manifest reports `backend.httpRateLimitEnabled=true`. Basic local smoke
  endpoints returned `200`; managed-image probing remains blocked because the
  configured image origin is unreachable.
- [x] Duplicate-governance audit completed read-only. Report:
  `reports/runtime/local-data-chain-closure/20260818/npc-duplicate-governance-audit.json`
  (`verdict=blocked_no_current_exact_authorization`). No current request,
  packet, bundle, preview, or readback binds the four duplicate rows
  (`Clothier` relation `623/1543`, local `82367/83287`; `DyeTrader` relation
  `755/1544`, local `82499/83288`). Historical non-boss/Boss decisions are
  consumed and partition-wide; they cannot be reused for row-scoped repair.
  No API dedupe, SQL delete, broad partition apply, crawler, or external request
  was run.
- [x] Review-only frozen duplicate preview generated at
  `reports/runtime/local-data-chain-closure/20260818/npc-duplicate-owner-scope-preview.json`
  (`applyAllowed=false`; relation IDs `623/1543/755/1544`; local IDs
  `82367/83287/82499/83288`). No canonical winner was selected and no packet was
  created.
- [x] Continuation verification: NPC/closure/domain Node suites `107/107`;
  lineage/owner-phase contracts `17/18` with the single expected failure on
  missing `reports/authorization/canonical/canonical-npc-apply.input.json`.
- [x] Task 8 evidence recorded in the bilingual plans and active devlog, including
  the post-quarantine parity and closure reports. The overall plan remains active:
  item-source closure still reports `269` read-only candidates, `276` duplicates,
  `0` insertable rows, and `17` projection rows (one not covered by a public
  contract); image readiness is not green; the local contract gate is `322/327`
  with five fail-closed missing-artifact failures; public `pnpm run check` fails on
  the pre-existing missing `public/sitemap.xml` evidence.
- [x] Final local contract gate attempted read-only with
  `bash ./platform/local/quality-gate.sh --skip-front --skip-admin`: `322/327`
  passed and `5` failed on absent fail-closed authorization fixtures. The
  closure plan remains blocked; missing artifacts were not synthesized.

## External Evidence Extension (2026-08-18, User-Approved)

- [x] Added request-gate safety before external traffic. A `429` now stops the
  current request immediately, persists `Retry-After` seconds/date as shared
  cooldown state, and does not retry the same request. Focused gate tests pass
  `14/14`.
- [x] Frozen target manifest:
  `reports/runtime/local-data-chain-closure/20260818/external-refresh-target-manifest.json`
  (`sha256:f8fde04e5cd413d2b8bc44444219223b32e961e02b1d376fde8c296a60d17c14`).
  Current inputs contain `113` group-page variant rows across `33` pages and
  `368` unique open backfill candidate keys (`117` item, `251` projectile),
  deduplicated to `299` Wiki pages with `25` group/backfill overlaps. The old
  handoff count `185/247` is preserved as stale comparison evidence, not used
  as the target source.
- [x] One-page smoke (`Hornet`) passed with terminal monitor progress and no
  throttle. The detached serial refresh then completed `299/299` pages with
  `0` observed `429`, no gate cooldown, and no database write. Progress,
  normalized, canonical, and audit outputs are under
  `reports/runtime/local-data-chain-closure/20260818/external-refresh/`.
- [x] Read-only evidence freeze generated at
  `reports/runtime/local-data-chain-closure/20260818/external-refresh-evidence-freeze.json`
  (`sha256:b2eb6df8053c34e74a6bb40d2a5d0a1e876faf7192c901011910f751e120e259`).
  All `299` pages have output files; audits are `295 pass / 4 warn / 0 fail`.
  The bridge has `0` unmatched crawler records but `20` conflict samples.
  The candidate bundle has `1269` records and `357` still-open candidates
  (`116` item, `241` projectile), so `11` candidate keys were closed by fresh
  evidence. `applyAllowed=false` remains explicit.
- [x] Bridge conflict recheck completed read-only after fixing expanded shared-page
  member matching. The `Town Slimes` page's page-wide infobox IDs no longer fan
  out across members: the recheck reports `306` crawler records, `0` unmatched,
  and `0` conflict samples; targeted bridge/crawler tests pass `41/41`.
- [x] The four parser warnings were classified without suppression: Cattiva and
  Foxparks are item/minion pages with embedded NPC infoboxes, The Torch God is a
  domain-separated event reward page, and Mimics is a valid multi-infobox group
  page with scoped loot. None is promoted to an ordinary NPC relation.
- [x] Generated a read-only owner-scope preview from the repaired bridge:
  `reports/runtime/local-data-chain-closure/20260818/external-refresh/bridge-recheck/npc-relation-owner-scope-preview.json`;
  `1269` records (`841` loot, `428` shop), `357` open candidates (`116`
  NPC-item, `241` NPC-projectile), scope hash
  `sha256:268049c1a7e63e49fa3a2f0ee45bcd201af75ee3d00aff56dd6bfba6c48b7de7`.
  `applyAllowed=false` remains explicit; this is the immutable
  pre-authorization snapshot. The later exact-scope packet is recorded below;
  no database write has occurred.
- [x] A fresh full NPC parity retry was attempted read-only; it did not emit a
  terminal report after roughly 4.5 minutes and was stopped. One loopback
  aggregate smoke returned `200`; the prior complete `418/418` report remains
  the latest full parity evidence.
- [x] User authorized the exact scope
  `sha256:268049c1a7e63e49fa3a2f0ee45bcd201af75ee3d00aff56dd6bfba6c48b7de7`.
  The governed operation `canonical-npc-external-relation-scope-apply` binds
  the bundle hash `sha256:56463a70f0e68cf5f1b39db3e8f892274474b43a51b101ffc9610f932ad4981f`,
  preview hash `sha256:ef81ca4a970635c98ef839933679f15165806fb793f53005f93144c4147ddfbd`,
  current server fingerprint, nine owner targets, and `357` unresolved
  candidates as quarantine-only. Dry-run, request, packet, manifest, owner
  input, and fingerprint artifacts are recorded under the dated reports.
- [ ] Apply remains blocked until a concrete affected-key database handler is
  registered and readback-verified. No permit was consumed and no database
  write ran. Full-table relation/local rebuild, `CenxsWings`, image downloads,
  direct SQL, and all non-Wiki lanes remain excluded.
- [ ] **2026-08-19 handler replay blocker:** the one-connection affected-key
  writer and payload scope guard are implemented and focused tests pass
  `55/55`, but a static replay of the frozen bundle shows the generic
  item-source processor yields only `654` loot / `427` shop relations from
  `841/428` preview rows and leaves `179` facts non-resolved. Evidence:
  `reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-static-replay.json`.
  Freeze and authorize an explicit accepted/quarantine projection before
  generating or consuming a permit; do not bypass taxonomy or dedupe.

## Fresh Read-Only Rebaseline (2026-08-19)

- [x] MySQL was confirmed on loopback `127.0.0.1:13306`; the canonical stack
  started with runtime-only 32+ character auth secrets and
  `TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=false`. Backend health is `UP`; no secret
  or config file was changed.
- [x] Read-only source/domain/closure audits are fresh: `762` active NPCs,
  `0` domain blockers, `418/418` trusted-direct runtime parity, `1542` rows at
  each relation/projection/local/API stage, and `0` open loot audits. The
  replay used `--fast-local-api --max-rate-limit-retries=0` and completed with
  no `429`.
- [x] Cross-DB is `9 pass / 1 warning` with the known `6056` local acquisition
  rows lacking relation/maint trace; relation health is warning-only with no
  blocking checks. Fresh reports are under
  `reports/runtime/local-data-chain-closure/20260819/` and
  `reports/relation/relation-health-20260819.json`.
- [x] Projectile relation/image and NPC relation readiness pass. Item image
  readiness remains blocked because the available image-sync evidence has no
  `items` scope. DB image lineage is ready only for Bosses (`33/33`); the other
  six entity types retain projection or managed-image gaps.
- [x] The original parser-count scope was replaced with an explicit accepted/
  quarantine projection and separately authorized. The governed apply completed
  with decision identity `npc-external-relation-scope-20260819-07` and read back
  landing `1`, maint `1071`, relation facts/details `1071/1071`, loot/shop
  `655/408`, and local loot/shop `655/408`; `198` unresolved/ambiguous facts
  remained quarantine-only. Result:
  `reports/authorization/canonical/canonical-npc-external-relation-scope-apply.result.json`.
- [ ] The overall plan remains active/blocked after apply. Runtime parity now
  reports `200` duplicate/polluted NPCs because old active generated lineage
  remains alongside the new bundle (relation `2197`, projection `1542`, local
  `1600`, API `1600`). Old-lineage cleanup and local tuple cleanup are outside
  the exact authorization and were not performed. Cross-DB remains `9 pass / 1
  warning / 0 blocking`; relation health is warning-only. No crawler, external
  request, image download, direct SQL, staging, commit, or cleanup was run.

- [x] Real maint identity replay froze and applied the revised projection at
  `reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-accepted-quarantine-projection.json`:
  `1071` source facts/details, `655` loot, `408` shop, and `198` quarantine
  facts. Proposal scope hash:
  `sha256:759c022a34a243ed17c93630727bb07d965b95064ed296740ecdf5d01cc6ca39`.
  The authorized scope hash is
  `sha256:759c022a34a243ed17c93630727bb07d965b95064ed296740ecdf5d01cc6ca39`.
  The post-apply runtime and closure reports remain blocked by stale generated
  lineage as recorded above.

## Task 9: Freeze A Stale-Lineage Repair Preview (Read Only)

**Files:**
- Create: `pipelines/audit/npc-stale-lineage-repair-preview.mjs`
- Create: `pipelines/audit/npc-stale-lineage-repair-preview.test.mjs`
- Output: `reports/runtime/local-data-chain-closure/20260819/npc-stale-lineage-repair-preview.json`
- Update: this plan, its Chinese counterpart, and the active closure devlog

- [x] **Step 1: Add RED unit cases for exact retirement, metadata drift, and
  non-lineaged local rows.** The pure builder accepts active accepted rows,
  incumbent relation rows, parent facts/details, local tuples, and projection
  payloads. A stale relation can be proposed only when its complete semantic
  tuple equals an accepted row and the parent fact has no other active child;
  otherwise it must be emitted in `quarantine`.

```js
const preview = buildNpcStaleLineageRepairPreview({
  acceptedLoot: [acceptedLootRow],
  incumbentLoot: [exactGeneratedLootRow, metadataDriftLootRow],
  factsByKey,
  detailsByFactKey,
  localLoot: [matchingLocalTuple],
  projectionLoot: [],
});
assert.equal(preview.proposed.relationLoot.length, 1);
assert.equal(preview.quarantine.metadataDrift.length, 1);
assert.equal(preview.quarantine.projectionRequired.length, 1);
assert.equal(preview.local.loot.preserve.length, 1);
```

- [x] **Step 2: Run the new test file before implementation.**

```bash
node --test pipelines/audit/npc-stale-lineage-repair-preview.test.mjs
```

Expected: failure because `buildNpcStaleLineageRepairPreview` does not exist.

- [x] **Step 3: Implement the pure classifier without SQL writes.** Use the
  same loot stable identity as `npc-loot-runtime-parity-audit.mjs`:
  NPC/item internal name, quantity text, chance text, and `Normal mode row`
  normalization. Require all persisted relation condition fields to match for
  a proposed retirement. Preserve exact local tuples because compatibility
  tables have no relation key; never infer an old local owner or target a local
  row for disable.

- [x] **Step 4: Add a read-only MySQL loader and a fail-closed CLI.** It may
  read the three local databases, write only the JSON preview, set
  `applyAllowed=false`, `databaseWrites=false`, and `externalRequests=false`,
  and reject `--apply` or unknown write modes. It must retain record keys,
  source fact/detail keys, full landing lineage, expected survivor keys, and
  per-row disposition in the report.

```bash
node pipelines/audit/npc-stale-lineage-repair-preview.mjs \
  --write-report=true \
  --output=reports/runtime/local-data-chain-closure/20260819/npc-stale-lineage-repair-preview.json
```

- [x] **Step 5: Validate and stop for authorization.** Run the focused test,
  parse the generated JSON, re-run `git diff --check`, and record the preview
  SHA-256 in both plan languages and the devlog. Do not create a manifest,
  authorization packet, permit, operation handler, database apply, crawler,
  external request, or local tuple cleanup. Ask the user to authorize only the
  exact proposed relation/fact/detail scope after the preview is reviewed.

**Task 9 evidence (2026-08-19):**

- Focused test `node --test pipelines/audit/npc-stale-lineage-repair-preview.test.mjs` — `4/4` pass; `node --check` pass; `git diff --check` pass.
- Read-only output: `reports/runtime/local-data-chain-closure/20260819/npc-stale-lineage-repair-preview.json`.
- Exact retirable lineage is locked to provider `terrapedia.generated`, landing hash `07cd3493b61def7dfb576846cab011e1e2c82fd398d5de711697a47444eae8b3`, landing source key `generated.npc_item_relations_bundle`, and maint table `maint_item_sources`. Inventory is `2135` facts, `2135` details, `1172` loot, and `938` shop rows.
- Full row lineage retains `landingSourceId`; all exact old relation rows currently point to `12447`. This pointer is diagnostic only and is not used as an authorization predicate.
- Proposed scope is `513` loot relations, `408` shop relations, `921` source facts, and `921` source details. Local compatibility rows are preserve-only (`655` loot, `446` shop); `38` duplicate local tuples remain quarantined.
- Quarantine counts are metadata drift `0`, parent-with-other-active-relation `84`, source-detail-incomplete `0`, independent-lineage `1153`, unmatched-incumbent `1423`, projection-required `7`, unmapped-local-tuple `0`, and local-duplicate-tuple `38`.
- The report is fail-closed: `applyAllowed=false`, `databaseWrites=false`, `externalRequests=false`. Scope hash is `sha256:09869c305cb89e5dfd084f5dc01f06d55e7cec9f17a666c1516586e92d87fb5d`; file SHA-256 is `5b8d66ab3ba91bdf06a2bfbae2dcdf7d04bdde89eef82f88e834d40f0330039a`.
- No manifest, packet, permit, handler, apply, crawler, external request, direct SQL, local tuple cleanup, staging, commit, or discard was performed. A new exact authorization is required before any stale-lineage operation.

**Task 9 authorized execution and residual (2026-08-19):**

- New governed operation `canonical-npc-stale-lineage-retirement` was added with an execution manifest, exact input bundle, packet, and one-time dispatch permit. The user authorization bound scope `sha256:09869c305cb89e5dfd084f5dc01f06d55e7cec9f17a666c1516586e92d87fb5d`.
- Transaction committed successfully under decision `canonical-npc-stale-lineage-retirement-20260819-admin-02`, packet hash `sha256:efca6036bb4e55545bdd3388aca8a306c34595dee462ed3029369d8fc32edd0e`. Affected/read back: `513` loot, `408` shop, `921` facts, `921` details; `activeTargets=0`. Result: `reports/authorization/canonical/canonical-npc-stale-lineage-retirement.result.json`, output hash `sha256:6ee2b679886a903549e22ff8d2635de994f9e172dfd735584ea12015bd301b0d`.
- Loopback-only parity was re-run with rate limiting disabled and no 429: `418` NPCs, `362` trusted, `53` duplicate/polluted, `3` projection gaps, `56` runtime blockers. Closure smoke remains blocked only by those runtime blockers; domain blockers `0`, coverage blockers `0`, open loot audits `0`, relation health warning-only.
- Post-operation cross-DB is `9 pass / 1 warning / 0 blocking`; the warning is `6657` local item-acquisition rows without relation/maint trace. The exact preview scope is exhausted, but `1214` old generated facts/details, `659` old loot, and `530` old shop rows remain active because they were quarantine/ambiguous or parent-conflict rows outside the authorized scope. No broad cleanup or projection/local mutation was performed.
- Fast loopback stack was stopped and restarted with ordinary `TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=true`; runtime-only secrets were not written to disk. Image origin remains unreachable, unrelated to this retirement lane.

**Task 9 residual classification (2026-08-19, read-only):**

- Added `reports/runtime/local-data-chain-closure/20260819/post-stale-lineage/npc-runtime-residual-classification.json`, file SHA-256 `sha256:c87508e2ac789a78b3cde8fb9fab9f8695347667afddab13dae02fb648386038`. The report binds the post-retirement parity JSON to active reads from local `terria_v1_relation.item_npc_loot_relations` and `projection_npcs`; `readOnly=true`, `databaseWrites=false`, and `externalRequests=false`.
- The `53` duplicate NPCs contain `136` duplicate stable-identity groups and `272` active relation rows (`136` extra rows): `84` groups are `terrapedia.generated + terraria.wiki.gg`, while `52` are `terraria.wiki.gg + wiki_gg`. The former is accepted-versus-old-generated parent conflict; the latter is an independent `wiki_gg` lineage. Both remain quarantine-only; the consumed scope cannot authorize a new deletion.
- The `3` projection gaps (CursedSkull/Nazar, JungleSlime/SlimeStaff, and ManEater/Vine) each have an accepted relation plus local and API rows. Projection contains the same item with bare probability text while the accepted relation uses `{{modes|...}}`; this is a projection text-identity mismatch, not missing loot. No governed operation currently binds these NPC projection rows, so they remain blocked.
- The blocker relation lineage inventory is `367` rows: accepted `215`, old generated `84`, and `wiki_gg` format variant `68`; all `367/367` rows join an active `maint_item_sources` row. For audit-only canonical grouping (unwrap `{{modes|a|b}}`), accepted+legacy has `84` groups, accepted+format-variant `59`, variant-only `9`, and accepted-only `72`; format variants must not be treated as stale legacy.
- Read-only validation passed: JSON parse, all `3` gaps have accepted lineage, `localApiGapCount=0`, and `git diff --check`. No projection rebuild, local sync, SQL write, authorization packet, permit, crawler, external request, staging, commit, or discard was performed.

**Task 10: Freeze exact parent-conflict preview (read-only):**

- Added `reports/runtime/local-data-chain-closure/20260819/post-stale-lineage/npc-stale-lineage-parent-conflict-preview.json`; output SHA-256 is `sha256:ca964ae6746553e8ae39a1cf6c973ae1649e92313d4e11f03b42dd81cf2d6134`, with candidate scope `sha256:51efc81d854b9ff9bb3bf508e04edc4ac39ac3dab6b3c194d23710fbf697d001`.
- Current readback confirms `84/84` old generated loot relations, `84/84` source facts, and `84/84` source details remain active; `84/84` accepted survivors remain active. Those old facts have `361` active child relations in total. The scope excludes shop, local tuples, projection, and `wiki_gg` variants.
- The report is `applyAllowed=false`, `databaseWrites=false`, and `externalRequests=false`. Because each parent fact has multiple active children, the existing fact/detail retirement operation cannot be safely reused; no new write operation, packet, permit, or mutation was created. Any mutation requires a relation-only governed owner operation and a separate authorization for this exact scope.

**Task 10 execution and verification (2026-08-19):**

- Added and registered `canonical-npc-stale-lineage-parent-conflict-retirement`, a relation-only governed operation whose only write target is `relation.item_npc_loot_relations.parent_conflict_old_generated`; facts/details, local, projection, `wiki_gg` variants, crawler, and external requests are forbidden.
- The user authorized scope `sha256:51efc81d854b9ff9bb3bf508e04edc4ac39ac3dab6b3c194d23710fbf697d001`. Final decision: `canonical-npc-stale-lineage-parent-conflict-retirement-20260819-admin-03`; packet hash: `sha256:d7090f5fb13ffd3ab599f7270a1904ec265eb1568f3c9682a3c1a9fcaeff5041`. Two earlier contract mismatches failed closed before SQL and produced no writes.
- The transaction committed and read back `relationLoot=84`, `activeTargets=0`. Result: `reports/authorization/canonical/canonical-npc-stale-lineage-parent-conflict-retirement.result.json`; output hash `sha256:1cde357d50e976f1e5250299cfc2e2959a65ca37cc45ab9b7d114be66ea0af4d`. All 84 targets are `status=0, deleted=1`; accepted loot is `655/655` active and projection NPCs are `762/762` active. Facts/details/local/projection were not mutated.
- Fresh evidence under `reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/`: loopback parity completed without 429 at `418` NPCs (`377` trusted, `37` duplicate/polluted, `4` projection gaps), stage rows `1600/1542/1600/1600`; domain retains six `countParityOnly` blockers; closure remains blocked; relation health is warning-only (`0` blocking, `0` open loot audits).
- Backend first failed because a pre-existing runtime token secret was 30 characters. No config or secret was written; a shell-only 48-byte random secret was used for the temporary loopback run. The final stack manifest records `httpRateLimitEnabled=true`; the single 429 is retained as runtime evidence and the fast rerun had no 429.
- Focused validation: parent-conflict/manifest/catalog `47/47`, authorized-operation suites `35/35`, `node --check`, and `git diff --check` pass. The plan remains `active/blocked`; no crawler, external request, loot/projection/local apply, additional SQL write, staging, commit, cleanup, or discard ran.

## Task 11: Freeze Projection And Local Residual Reconciliation (Read Only)

**Goal:** Produce one exact, fail-closed preview for the remaining runtime
duplicates without treating lineage-blind local/API compatibility rows as
relation-owned records.

- [x] Build a pure classifier and tests that consume active accepted relations,
  inactive relation references in `projection_npcs`, projection loot entries,
  local tuples, and API tuples. It must separately classify exact accepted
  survivor replacements, no-survivor rows, ambiguous survivors, stale
  projection keys, and lineage-blind local/API tuples.
- [x] Add a read-only local MySQL loader and JSON report under
  `reports/runtime/local-data-chain-closure/20260819/post-final/`. The report
  must bind every candidate to stable identity keys and state zero write
  targets by default; it must reject `--apply`.
- [x] Treat the five one-survivor active `wiki_gg` rows as projection/local
  reconciliation candidates only after the preview proves each target. Keep
  DesertLamiaLight/MoonMask (no survivor), IceMimic/SnowballCannon (ambiguous),
  and every locally lineage-blind tuple in quarantine.
- [x] Validate focused tests, JSON parsing, `git diff --check`, and a fast
  loopback parity rerun with rate limiting explicitly disabled. Restore the
  ordinary rate limiter afterwards. Do not create a write operation, packet,
  permit, crawler task, external request, direct SQL, or broad rebuild.

**Task 11 baseline (2026-08-19):** The completed four-row relation-only
projection-gap `wiki_gg` variant retirement has scope
`sha256:880fa2d9f9b14b3071400cfeac9af4de9e59757843481dbc0d65714c444ae4c8`
and readback `4/0/4` for relation loot/active targets/active survivors. Fresh
runtime parity remains blocked at `418` NPCs, `377` trusted, `41`
duplicate/polluted, and stages `1544/1542/1600/1600`. `59` stale `wiki_gg`
and `73` stale generated projection keys point to inactive relations; local/API
rows lack lineage. Independent-variant rerun candidates are zero, with `314`
no-survivor rows quarantined. Cross-DB is `9 pass / 1 warning / 0 blocking`
(`6056` item acquisition trace warning); relation health is warning-only.

**Task 11 result (2026-08-19):**

- The residual preview and coordinated relation/projection/local repair were
  completed under the exact user-authorized scope
  `sha256:09869c305cb89e5dfd084f5dc01f06d55e7cec9f17a666c1516586e92d87fb5d`.
  The governed result is
  `reports/authorization/canonical/canonical-npc-projection-text-identity-residual-repair.result.json`;
  old relation rows `128/129` and old local rows `81872/81873` are retired,
  projections `179/83` now reference accepted Nazar identities, and accepted
  relation/local/source rows remain readable. No external request or direct
  SQL was used.
- Fresh loopback parity after the repair is
  `418/418` trusted direct loot with `blockingCount=0`; relation, projection,
  local, and API stages each contain `1542` rows. The report is
  `reports/runtime/local-data-chain-closure/20260819/post-final/npc-loot-runtime-parity-after-residual-repair.json`.
- The final closure report is
  `reports/runtime/local-data-chain-closure/20260819/post-final/npc-loot-closure-final-after-normal-rate.json`.
  It remains `blocked` because the domain report has `17` `unclassifiedZero`
  rows (`releaseBlockingCount=18`) and `evidenceHealth=source_coverage_unavailable`;
  this is independent of runtime parity. Relation health is warning-only with
  `0` blocking checks and `0` open loot audits.
- The fast stack was stopped and restarted with ordinary protection. The final
  manifest `reports/local-start/run-manifest.json` records
  `backend.httpRateLimitEnabled=true`. The ordinary local smoke recorded
  backend Item, category, admin root, and admin proxy responses as HTTP `200`;
  managed-image probing remains blocked because the configured image origin is
  unreachable.
- Focused preview/repair and manifest/catalog suites pass (`9/9` residual
  preview/repair, `63/63` combined manifest/catalog/capability tests);
  `node --check`, JSON parsing, and
  `git diff --check` pass. The long-running plan remains `active` because
  item-source lineage, image readiness, and domain evidence blockers remain.
