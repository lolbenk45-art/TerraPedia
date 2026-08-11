# Shimmer Generation Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one coherent content-addressed Shimmer generation from a fresh raw page and frozen langlink evidence, import only that exact generation, and finish the repository closure with domain `45/0/0` and a full quality-gate exit of 0.

**Architecture:** The stable `domain-source-shimmer` action owns raw fetch, langlink resolution, deterministic transform, verification, and atomic pointer publication. The importer accepts only a content-addressed manifest, verifies every hash and the non-recursive `dataBundleSha256`, and requires a separate exact authorization packet for its provider-scoped transaction; final integration then refreshes NPC/API, cross-DB/relation, residue, and project facts.

**Tech Stack:** Node.js ESM and `node:test`, MediaWiki API, TerraPedia crawler progress/heartbeat helpers, canonical JSON/SHA-256 generation contracts, MySQL provider-scoped transactions, Spring Boot crawler monitor, repository quality gates.

---

## Scope And Safety Lock

- In scope: deterministic transform core, frozen langlink evidence, content-addressed generation publication, stable full-pipeline progress, manifest-only import, exact authorization, Shimmer domain evidence, and final closure verification/documentation.
- Out of scope: mixing 2026-05 shards with 2026-07 raw, implicit live-DB lookup, silent DB-to-file fallback, mutable latest files as import authority, source flips, another L1, L2/scheduler activation, and shared `18191/16380` lifecycle changes.
- `domain-source-shimmer` crawler execution and `canonical-shimmer-import` database apply are separate operation-level authorization checkpoints. Completion of the first does not authorize the second.

## File Structure

- Create `scripts/data/transform/shimmer-generation-builder.mjs`: deterministic offline transform and title resolution.
- Create `scripts/data/transform/shimmer-generation-builder.test.mjs`: frozen-input determinism and unresolved contracts.
- Refactor `scripts/data/transform/transform-wiki-shimmer-to-importable.mjs`: CLI wrapper over the offline core; no DB/network by default.
- Modify `scripts/data/transform/transform-wiki-shimmer-to-importable.test.mjs`: prohibit implicit DB/network behavior.
- Modify `scripts/data/maint/shimmer-structured-parser.mjs` and add its test: shared stable table-role parsing.
- Refactor `scripts/data/fetch/fetch-wiki-shimmer-page.mjs`: injectable raw fetch functions without child terminal ownership.
- Create `scripts/data/fetch/fetch-wiki-shimmer-langlinks.mjs` and its test: bounded normalized langlink map with progress callbacks.
- Create `scripts/data/transform/shimmer-generation-contract.mjs` and its test: generation ID, manifest, hashes, verifier, atomic publish/pointer.
- Rewrite `scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs` and add a test: sole progress/terminal owner.
- Modify backend crawler registry/service tests: dispatch the full pipeline and expose the current-generation pointer.
- Modify canonical operation catalog/manifest/authorization tests: register `canonical-shimmer-generation` and bind page/API scope, request cap, standardized inputs, and pipeline code.
- Modify `scripts/data/pipeline/run-shimmer-sync-pipeline.mjs`, `shimmer-sync-args.mjs`, and tests: prevent unauthorized apply bypass and use manifest input.
- Modify `scripts/data/import/import-wiki-shimmer-to-db.mjs` and its test: manifest-only preview/apply, authorization, provider-scope verification, rollback.
- Modify canonical operation catalog/manifest/authorization tests: bind the content-addressed manifest, bundle hash, preview diff, and target fingerprint.
- Modify `scripts/data/audit/domain-readiness-audit.mjs` and its test: accept only a completed hash-bound import result.
- Modify parent plan, active devlog, project-management facts, and current spec only when corresponding facts become true.

### Task 1: Establish One Deterministic Offline Transform Core

**Files:**
- Create: `scripts/data/transform/shimmer-generation-builder.mjs`
- Create: `scripts/data/transform/shimmer-generation-builder.test.mjs`
- Modify: `scripts/data/maint/shimmer-structured-parser.mjs`
- Create: `scripts/data/maint/shimmer-structured-parser.test.mjs`
- Modify: `scripts/data/transform/transform-wiki-shimmer-to-importable.mjs`
- Modify: `scripts/data/transform/transform-wiki-shimmer-to-importable.test.mjs`

- [x] **Step 1: Write RED deterministic transform tests**

Use a frozen 13-table raw fixture, standardized item/NPC fixtures, and a normalized langlink map. Build twice with different wall-clock time providers but the same explicit `generatedAt`; assert byte-identical canonical shard payloads and hashes.

```js
const first = buildShimmerGeneration({
  raw,
  itemRecords,
  npcRecords,
  langlinkEvidence,
  generatedAt: '2026-07-30T12:00:00.000Z',
});
const second = buildShimmerGeneration({
  raw,
  itemRecords,
  npcRecords,
  langlinkEvidence,
  generatedAt: '2026-07-30T12:00:00.000Z',
});
assert.deepEqual(second, first);
```

Assert missing langlink evidence, duplicate normalized titles, ambiguous item/NPC identity, and changed table-role order are explicit errors or unresolved entries; no row may disappear silently.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/maint/shimmer-structured-parser.test.mjs scripts/data/transform/shimmer-generation-builder.test.mjs scripts/data/transform/transform-wiki-shimmer-to-importable.test.mjs`

Expected: FAIL because the builder does not exist and the CLI still performs network/DB work.

- [x] **Step 3: Consolidate table-role parsing**

Export the stable role sequence and structured table output from `shimmer-structured-parser.mjs`. Preserve all 13 roles and add a table-role version string. The parser must return rows plus source ordinals; it must not resolve entity identity or access network/DB state.

- [x] **Step 4: Implement the offline builder**

Move title overrides and entity resolution into `shimmer-generation-builder.mjs`. Inputs are raw bytes/payload, exact standardized records, and normalized langlink evidence only.

```js
export function buildShimmerGeneration(input) {
  const parsed = extractShimmerStructuredRecords(input.raw);
  const titleMeta = resolveFrozenTitleMeta({
    parsed,
    itemRecords: input.itemRecords,
    npcRecords: input.npcRecords,
    langlinkEvidence: input.langlinkEvidence,
  });
  return {
    context: buildContextPayload(input.raw, input.generatedAt),
    itemTransforms: buildItemTransforms(parsed, titleMeta, input.generatedAt),
    decraftRules: buildDecraftRules(parsed, titleMeta, input.generatedAt),
    entityTransforms: buildEntityTransforms(parsed, titleMeta, input.generatedAt),
    npcTransforms: buildNpcTransforms(parsed, titleMeta, input.generatedAt),
    titleResolution: buildTitleResolutionEvidence(titleMeta, input.generatedAt),
  };
}
```

- [x] **Step 5: Turn the old transform into an offline wrapper**

Require `--langlinks=<frozen-evidence>` and explicit standardized inputs. Remove `createRequire`, `loadLocalStackConfig`, `enrichLookupsFromDb`, and live langlink calls. Reject `--use-db-lookup=true` with a clear contract error.

- [x] **Step 6: Run GREEN and commit**

Run the RED command again.

Expected: PASS; tests do not load `mysql2` or access the network.

```bash
git add scripts/data/maint/shimmer-structured-parser.mjs scripts/data/maint/shimmer-structured-parser.test.mjs scripts/data/transform/shimmer-generation-builder.mjs scripts/data/transform/shimmer-generation-builder.test.mjs scripts/data/transform/transform-wiki-shimmer-to-importable.mjs scripts/data/transform/transform-wiki-shimmer-to-importable.test.mjs
git commit -m "refactor(data): make shimmer transform deterministic"
```

### Task 2: Make Raw And Langlink Fetches Injectable Pipeline Children

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-shimmer-page.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs`
- Create: `scripts/data/fetch/fetch-wiki-shimmer-langlinks.mjs`
- Create: `scripts/data/fetch/fetch-wiki-shimmer-langlinks.test.mjs`

- [x] **Step 1: Write RED callback-order tests**

Assert `fetchWikiShimmerRaw` reports `fetch_revision`, `fetch_sections`, and `fetch_html` through an injected callback but never writes a terminal action state itself. Assert `fetchShimmerLanglinks` receives a frozen sorted title list, batches by 8, and reports before each network batch.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs scripts/data/fetch/fetch-wiki-shimmer-langlinks.test.mjs`

Expected: FAIL because fetch is top-level-only and langlinks remain embedded in transform.

- [x] **Step 3: Export injected fetch functions**

```js
export async function fetchWikiShimmerRaw({ pageTitle, apiUrl, onPhase }, { fetchJson = fetchWikiApiJson } = {}) {
  onPhase?.({ phase: 'fetch_revision', current: 0 });
  const revision = await fetchRevision(pageTitle, apiUrl, fetchJson);
  onPhase?.({ phase: 'fetch_sections', current: 1 });
  const sections = await fetchSections(pageTitle, apiUrl, fetchJson);
  onPhase?.({ phase: 'fetch_html', current: 2 });
  const html = await fetchRenderedHtml(pageTitle, apiUrl, fetchJson);
  return buildRawPayload({ revision, sections, html });
}
```

The standalone raw CLI may own progress only when explicitly invoked alone; when called by the extraction pipeline, parent progress is the only canonical action state.

- [x] **Step 4: Implement normalized langlink evidence**

Output exact requested title, resolved page title, redirect source, English title, response page/revision identity when available, and canonical response SHA-256. Preserve unresolved titles as records.

- [x] **Step 5: Run GREEN and commit**

Run the RED command again.

```bash
git add scripts/data/fetch/fetch-wiki-shimmer-page.mjs scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs scripts/data/fetch/fetch-wiki-shimmer-langlinks.mjs scripts/data/fetch/fetch-wiki-shimmer-langlinks.test.mjs
git commit -m "refactor(crawler): expose shimmer fetch phases"
```

### Task 3: Build And Atomically Publish A Content-Addressed Generation

**Files:**
- Create: `scripts/data/transform/shimmer-generation-contract.mjs`
- Create: `scripts/data/transform/shimmer-generation-contract.test.mjs`

**Contract repair (2026-08-01):** The generation directory contains exactly
eight physical files: the raw payload, context, five transformed/evidence
payloads, and `wiki-shimmer-manifest.json`. The manifest's non-recursive
`files` array describes the seven payload files only; frozen langlink evidence
is bound by its descriptor and SHA-256 in the manifest, not emitted as a ninth
generation file. This resolves the prior "eight files" shorthand without
changing the source or authorization boundary.

- [x] **Step 1: Write RED bundle-integrity tests**

Cover all eight generation files, a one-byte shard mutation, a missing shard, a raw from one generation with shards from another, wrong generation ID, wrong standardized input hash, wrong table-role version, and a failed publish that preserves the previous pointer.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/transform/shimmer-generation-contract.test.mjs`

Expected: FAIL because the generation contract is absent.

- [x] **Step 3: Implement canonical descriptor and verifier**

The generation ID is the SHA-256 hex of a canonical input descriptor. The manifest includes raw bytes/HTML hashes, standardized item/NPC hashes, langlink evidence hash, producer code hash, table-role version, and five shard descriptors. Compute `dataBundleSha256` over a non-recursive canonical descriptor that omits the manifest's own hash.

```js
const bundleDescriptor = {
  schemaVersion: 1,
  generationId,
  raw: rawDescriptor,
  standardizedInputs,
  langlinks: langlinkDescriptor,
  tableRoleVersion,
  producerCodeSha256,
  shards: shardDescriptors,
};
manifest.dataBundleSha256 = sha256Canonical(bundleDescriptor);
```

Export `verifyShimmerGeneration({ manifestPath })` and require exact relative child paths under that generation directory.

- [x] **Step 4: Implement staging publication and pointer swap**

Write all files under a private run-scoped staging directory, fsync/close, verify from disk, rename to `data/generated/shimmer/generations/<generationId>/`, then atomically temp+rename `data/generated/shimmer/wiki-shimmer-current-generation.json`. Never replace the pointer before generation verification succeeds.

- [x] **Step 5: Run GREEN and commit**

Run the RED command again.

```bash
git add scripts/data/transform/shimmer-generation-contract.mjs scripts/data/transform/shimmer-generation-contract.test.mjs
git commit -m "feat(data): verify shimmer generation bundles"
```

### Task 4: Make The Full Extraction Pipeline The Sole Progress Owner

**Files:**
- Rewrite: `scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs`
- Create: `scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.test.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: focused service tests
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: corresponding automation tests

- [ ] **Step 1: Write RED end-to-end progress tests**

Using frozen API responses, assert canonical `running` progress exists before raw revision and langlink requests, heartbeat advances during a delayed batch, phases occur in this order, and every thrown child error yields parent `failed`:

```text
preflight -> fetch_revision -> fetch_sections -> fetch_html ->
resolve_langlinks -> transform -> verify_bundle -> publish
```

Assert `completed` is written only after the pointer and referenced manifest verify from disk.

- [ ] **Step 2: Run RED**

Run: `node --test scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.test.mjs scripts/data/workflow/backend-data-refresh-plan.test.mjs`

Expected: FAIL because the current 39-line pipeline uses `spawnSync` and has no progress owner.

- [ ] **Step 3: Implement the in-process pipeline**

Export `runWikiShimmerExtractionPipeline(options, dependencies)`. Create one `createCrawlerProgressHeartbeat` instance. Pass phase callbacks into raw/langlink children, build offline shards, publish generation, and stop heartbeat in `finally`.

The direct CLI requires `loadAuthorizedOperationContext({ operationId: 'canonical-shimmer-generation' })`, matches the frozen input contract and request cap to the authorized data bundle, and consumes the dispatch permit before the first raw request. Unit tests invoke the exported function with injected authorization and frozen responses.

The output progress includes `generationId`, `dataBundleSha256`, `manifestPath`, `pointerPath`, raw/shard counts, unresolved count, `reportPath`, and `outputPath`.

- [ ] **Step 4: Route monitor and backend refresh to the pipeline**

Keep stable action ID `domain-source-shimmer`; change its command from `fetch-wiki-shimmer-page.mjs` to `run-wiki-shimmer-extraction-pipeline.mjs`. Change overview output to `data/generated/shimmer/wiki-shimmer-current-generation.json` and update labels/next step. The backend `shimmer-sync` step must extract/verify only; it must not invoke database apply.

Register `canonical-shimmer-generation` with static input contract `reports/authorization/canonical/canonical-shimmer-generation.input.json` and execution entrypoint `run-wiki-shimmer-extraction-pipeline.mjs`. Include raw/langlink fetch helpers, builder, parser, generation contract, progress runtime, and standardized inputs in its code/data bundle. A direct monitor dispatch without canonical packet/permit must fail before network access while remaining visible as failed progress.

- [ ] **Step 5: Run GREEN**

Run: `node --test scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.test.mjs scripts/data/workflow/backend-data-refresh-plan.test.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs`

Run from `back/`: `mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest test`

Expected: PASS; mocked tests create a complete generation with no live network or DB access.

- [ ] **Step 6: Authorization checkpoint and commit**

Build an exact `canonical-shimmer-generation` crawler request containing the stable action ID `domain-source-shimmer`, page/API scope, request estimate/cap, code hash, standardized input hashes, and progress path. Do not execute the live generation until that exact request hash receives operation-level Owner approval.

```bash
git add scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.test.mjs scripts/data/workflow/backend-data-refresh-plan.mjs scripts/data/workflow/backend-data-refresh-plan.test.mjs scripts/data/automation/canonical-operation-catalog.mjs scripts/data/automation/canonical-operation-execution-manifest.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java
git commit -m "feat(crawler): publish coherent shimmer generations"
```

### Task 5: Require A Verified Manifest For Preview And Import

**Files:**
- Modify: `scripts/data/import/import-wiki-shimmer-to-db.mjs`
- Modify: `scripts/data/import/import-wiki-shimmer-to-db.test.mjs`
- Modify: `scripts/data/pipeline/shimmer-sync-args.mjs`
- Modify: `scripts/data/pipeline/shimmer-sync-args.test.mjs`
- Modify: `scripts/data/pipeline/run-shimmer-sync-pipeline.mjs`

- [ ] **Step 1: Write RED manifest/import tests**

Assert the importer rejects no `--bundle-manifest`, mutable latest paths, manifest hash mismatch, shard mutation, missing `dataBundleSha256`, mixed generation, preview target-fingerprint drift, and direct `--apply=true` without packet/permit. Simulate a post-write count/hash mismatch and assert transaction rollback.

- [ ] **Step 2: Run RED**

Run: `node --test scripts/data/import/import-wiki-shimmer-to-db.test.mjs scripts/data/pipeline/shimmer-sync-args.test.mjs`

Expected: FAIL because the importer guesses seven fixed paths and apply is directly reachable.

- [ ] **Step 3: Load only the verified generation**

Resolve every input from `verifyShimmerGeneration({ manifestPath })`; do not read the current pointer during apply. Export `buildShimmerImportPreview`, which freezes target DB fingerprint, `wiki_zh` provider-owned logical key sets, per-table before/after counts and hashes, snapshot descriptor, manifest SHA-256, and `dataBundleSha256`.

- [ ] **Step 4: Harden apply authorization and transaction**

On apply, load `canonical-shimmer-import` context, match manifest/data bundle/preview/target fingerprint, consume the dispatch permit, begin one transaction, replace only `wiki_zh` + Shimmer owned scope, verify counts/hashes inside the transaction, then commit. On error, rollback and write a private failed result with the exact phase/reason.

```js
const authorized = loadAuthorizedOperationContext({ operationId: 'canonical-shimmer-import' });
assert.equal(authorized.dataBundleSha256, verified.manifest.dataBundleSha256);
consumeAuthorizedOperationDispatchPermit({
  authorizedContext: authorized,
  decisionLedgerPath: canonicalLedgerPath,
});
```

- [ ] **Step 5: Remove the sync-pipeline bypass**

`run-shimmer-sync-pipeline.mjs` may invoke extraction plus importer preview, never importer apply. `buildShimmerImportArgs` must require `bundleManifest` and default to `--apply=false`; reject `apply=true` outside the canonical runner.

- [ ] **Step 6: Run GREEN, preview, and commit**

Run the RED command again.

Run: `node scripts/data/import/import-wiki-shimmer-to-db.mjs --bundle-manifest=<generation-manifest> --apply=false --output=reports/wiki-shimmer-db-import-preview-2026-07-30.json`

Expected: tests PASS; preview binds one generation and makes no DB write.

```bash
git add scripts/data/import/import-wiki-shimmer-to-db.mjs scripts/data/import/import-wiki-shimmer-to-db.test.mjs scripts/data/pipeline/shimmer-sync-args.mjs scripts/data/pipeline/shimmer-sync-args.test.mjs scripts/data/pipeline/run-shimmer-sync-pipeline.mjs
git commit -m "fix(data): bind shimmer import to one manifest"
```

### Task 6: Bind Canonical Authorization And Domain Readiness

**Files:**
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- Create: `scripts/data/lib/private-repository-path.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- Create: `scripts/data/automation/canonical-shimmer-import-input-contract.mjs`
- Create: `scripts/data/automation/build-canonical-shimmer-import-proposal.mjs`
- Create: `scripts/data/automation/build-canonical-shimmer-import-proposal.test.mjs`
- Modify: `scripts/data/automation/run-authorized-canonical-operation.mjs`
- Modify: `scripts/data/automation/run-authorized-canonical-operation.test.mjs`
- Modify: `scripts/data/import/import-wiki-shimmer-to-db.mjs`
- Modify: `scripts/data/import/import-wiki-shimmer-to-db.test.mjs`
- Modify: `scripts/data/audit/domain-readiness-audit.mjs`
- Modify: `scripts/data/audit/domain-readiness-audit.test.mjs`
- Modify: `scripts/data/pipeline/shimmer-sync-args.mjs`
- Modify: `scripts/data/pipeline/shimmer-sync-args.test.mjs`
- Modify: `scripts/data/pipeline/run-shimmer-sync-pipeline.mjs`
- Modify: `scripts/data/pipeline/run-shimmer-sync-pipeline.test.mjs`

> **Active repair:** the legacy `run-shimmer-sync-pipeline.mjs` is a
> contract-only preview compatibility entrypoint. It may preview an existing
> canonical private input contract, but cannot invoke extraction, accept a
> direct manifest/raw/input path, or reach importer apply. This does not
> authorize either Task 7 checkpoint. A separate proposal entrypoint may read
> one verified content-addressed generation plus an injected read-only target
> snapshot to construct preview evidence and a candidate input contract; it
> cannot consume a packet, invoke apply, or write database rows.

- [ ] **Step 1: Write RED authorization/readiness tests**

Assert `canonical-shimmer-import` data inputs contain one private ordinary JSON input contract at `reports/authorization/canonical/canonical-shimmer-import.input.json`. The contract must name exactly one content-addressed manifest plus its `manifestSha256`, `dataBundleSha256`, `previewSha256`, `targetFingerprintSha256`, and the fixed `wiki_zh`/`微光` provider scope. Assert the old request with null bundle hash is incomplete and cannot be patched/reused. Assert every apply API rejects a missing private contract, ambiguous/unresolved/mixed/unreported references fail before connection, and a canonical write result must be both `apply=true` and `status='completed'`. Domain readiness must reject raw-only, generation-only, dry-run, failed, wrong-generation, wrong-bundle, wrong-preview, wrong-target, noncanonical identity evidence, and a generation symlink outside its canonical root.

- [ ] **Step 2: Run RED**

Run: `node --test scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs scripts/data/automation/run-authorized-canonical-operation.test.mjs scripts/data/audit/domain-readiness-audit.test.mjs`

Expected: FAIL against the old latest-file list and weak import semantics.

- [ ] **Step 3: Update the operation contract**

Replace fixed latest shard data paths with `reports/authorization/canonical/canonical-shimmer-import.input.json`. The execution manifest command passes `--input-contract=reports/authorization/canonical/canonical-shimmer-import.input.json` to the importer. The importer must resolve the manifest path only from that private contract, verify the contract's manifest/bundle identities against the on-disk generation, and bind the computed preview/target/scope back to the contract before apply. Include the importer, generation verifier/builder/parser, and contract reader in the code bundle.

Create a dependency-injected read-only proposal builder that accepts a verified content-addressed manifest only for proposal construction, freezes the preview and candidate contract, and writes a private proposal artifact. Materialize the canonical input contract only from a verified proposal through an atomic no-overwrite writer. Create a fresh request only after a generation, inspected proposal, and private contract exist. Never edit or reuse the old null-bundle request identity.

- [ ] **Step 4: Tighten domain semantics**

The Shimmer source panel must read the content-addressed `data/generated/shimmer/wiki-shimmer-current-generation.json` pointer and its referenced verified manifest; it must not require the retired mutable `wiki-shimmer-manifest.latest.json` path. The blocking panel must require `apply=true`, `status='completed'`, generation ID, bundle hash, manifest hash, preview hash, target fingerprint, the exact `wiki_zh`/`微光` scope, zero missing/mixed/unreported records, and exact manifest/preview/after counts and descriptors for context, item transforms, decraft rules, entity transforms, NPC transforms, and snapshots.

- [ ] **Step 5: Run GREEN and commit**

Run the RED command again.

```bash
git add scripts/data/automation/canonical-operation-catalog.mjs scripts/data/automation/canonical-operation-execution-manifest.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs scripts/data/automation/canonical-shimmer-import-input-contract.mjs scripts/data/automation/build-canonical-shimmer-import-proposal.mjs scripts/data/automation/build-canonical-shimmer-import-proposal.test.mjs scripts/data/automation/run-authorized-canonical-operation.mjs scripts/data/automation/run-authorized-canonical-operation.test.mjs scripts/data/import/import-wiki-shimmer-to-db.mjs scripts/data/import/import-wiki-shimmer-to-db.test.mjs scripts/data/audit/domain-readiness-audit.mjs scripts/data/audit/domain-readiness-audit.test.mjs scripts/data/pipeline/shimmer-sync-args.mjs scripts/data/pipeline/shimmer-sync-args.test.mjs scripts/data/pipeline/run-shimmer-sync-pipeline.mjs scripts/data/pipeline/run-shimmer-sync-pipeline.test.mjs
git commit -m "feat(automation): authorize exact shimmer bundles"
```

### Task 7: Execute Shimmer At Its Two Authorization Checkpoints

**Files:**
- Generated content-addressed generation and private authorization/evidence artifacts
- No shared service lifecycle files

- [ ] **Step 1: Dispatch only the approved generation request**

After exact Owner confirmation, dispatch `canonical-shimmer-generation` through `run-authorized-canonical-operation.mjs` while supplying the registered `domain-source-shimmer` progress path. Verify the monitor overview plus terminal progress, generation directory, current pointer, manifest, raw/shard hashes, normalized langlink evidence, and zero task/process/progress-temp residue. A completed generation is read-only source evidence, not DB authorization.

- [ ] **Step 2: Build and inspect a read-only import proposal**

Run the proposal entrypoint against the approved content-addressed manifest and `terria_v1_local` only after generation evidence exists. It may open the target in a read-only transaction and writes only a private `canonical-shimmer-import.proposal.json`; it records target fingerprint, provider-owned before/after counts/key hashes, snapshots, manifest hash, generation ID, data bundle hash, preview hash, and candidate input-contract bytes. It must reject `--apply`, packet/permit inputs, raw/input paths, and noncanonical manifests. Inspect the proposal before materializing any canonical input contract.

- [ ] **Step 3: Materialize the exact input contract and generate a request**

Use the verified private proposal to atomically create `canonical-shimmer-import.input.json` without overwriting an existing contract, then create the execution manifest and request from current bytes. Confirm the prior null-`dataBundleSha256` request remains unused/invalid history. Stop at `AWAITING_OWNER` until the new exact request hash receives all Owner fields and a new one-time decision identity.

- [ ] **Step 4: Dispatch the approved import once**

Run only through `run-authorized-canonical-operation.mjs`. Verify ledger consumption, private result mode, transaction commit, exact provider scope, generation/bundle/manifest/preview/target identities, and post-write counts/hashes.

- [ ] **Step 5: Refresh the Shimmer panel**

Run: `node scripts/data/audit/domain-readiness-audit.mjs --domain=support.shimmer --panel=blockingGate --write=false`

Expected: PASS only after the completed exact import result exists.

### Task 8: Run Final Integration, Residue, Facts, And Commit Closeout

**Files:**
- Modify: `docs/superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md`
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`
- Modify: `docs/project-management/decision-log.md` only for durable decisions
- Modify: `docs/project-governance/00_CURRENT_SPEC.md` only if durable source ownership/default workflow changed

- [ ] **Step 1: Run all focused code gates**

Run the image and Shimmer focused Node suites, crawler progress suites, canonical automation suites, focused backend registry/service tests, and syntax checks for every changed/untracked `.mjs` file.

Expected: all focused checks PASS with no skipped new contract.

- [ ] **Step 2: Refresh cross-DB and relation evidence**

Run quick and full cross-DB audits plus relation health. Expected: no blockers and no new warnings; the one relation-loot row, 4,316 legacy acquisitions, and 287 NPC audits remain explicitly out-of-scope warnings only if still present.

- [ ] **Step 3: Refresh all domain panels**

Run domain report generation from current bytes. Expected: exactly `45 pass / 0 warning / 0 blocked`, with no exemption or threshold relaxation.

- [ ] **Step 4: Refresh NPC freshness and API parity read-only**

Regenerate the private `0600` NPC readiness report, verify native `T1_VERIFIED` 65/65 or the current higher accepted level, and probe admin/public sample `-65` against the same local snapshot via shared backend `18191`. Do not restart the backend if parity fails; report the exact drift instead.

- [ ] **Step 5: Verify runtime residue and shared lifecycle**

Read back zero isolated databases, temporary accounts, external active transactions, Redis DB 13/14 keys/reservations, task processes, progress `.tmp` files, scoped task diagnostics, and worktree listeners. Confirm backend `18191` and Redis `16380` PIDs/lifecycle were not changed by this task.

- [ ] **Step 6: Run the full repository gate**

Run: `bash ./scripts/dev/quality-gate.sh`

Expected: data-workflow, automation, domain, backend, public, and admin stages all complete and the command exits 0. If domain remains non-green, record the real result and do not call the gate passed.

- [ ] **Step 7: Update project facts from actual evidence**

Check the parent closure tasks that truly completed; record exact generation/bundle/result hashes, counts, consumed identities, remaining source-flip/L1/L2/scheduler authorization boundaries, and residual warnings. Keep `00_CURRENT_SPEC.md` unchanged unless this work made a durable source-ownership or default-workflow fact true.

- [ ] **Step 8: Run final review and validation**

Run `git diff --check`, targeted term/path/hash scans, and the `terrapedia-plan-auditor` closure questions against the actual diff and evidence. Resolve every Critical/Important finding before closeout.

- [ ] **Step 9: Stage explicit paths and create focused commits**

Run `git status --short` and `git diff --cached --stat` before and after devlog closeout staging. Do not use `git add .`. Keep unrelated pre-existing dirty files unstaged. Use focused `type(scope): action` commits; leave the branch open because source flip and later automation authorization remain separate follow-ups.
