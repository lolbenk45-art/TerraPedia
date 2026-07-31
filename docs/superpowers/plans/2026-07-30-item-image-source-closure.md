# Item Image Source Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish raw/Wiki-backed image sources for all 6,131 item identities, promote them atomically, and publish exact managed-image and landing/maint/relation/local lineage without treating local database rows as source evidence.

**Architecture:** The lane is split into a read-only evidence producer, a bounded monitor-visible Wiki verifier for unresolved identities, an immutable promotion bundle, and separately authorized file/MinIO/database apply operations. Every downstream operation consumes a hash-bound predecessor result; local, maint, and relation values are comparison evidence only and never become upstream image sources.

**Tech Stack:** Node.js ESM and `node:test`, bounded MediaWiki API calls, TerraPedia crawler progress contracts, canonical authorization packets, MySQL landing/maint/relation/local schemas, MinIO image upload, Spring Boot crawler monitor.

---

## Scope And Safety Lock

- In scope: item image member evidence, candidate/promotion contracts, bounded unresolved verification, standardized image-field promotion, items-only managed sync, real landing/maint/relation/local lineage, image readiness evidence, and the authorization catalog needed for those exact operations.
- Out of scope: copying local image rows into standardized data, heuristic best-score promotion, changing non-image item fields, source-contract flips, L1/L2/scheduler activation, unrelated 4,316 legacy acquisition rows, the existing one-row relation-loot warning, and the shared backend/Redis lifecycle.
- Shared `18191/16380` is read-only. Do not start, stop, restart, or take ownership of either process.
- A crawler, standardized-file apply, MinIO apply, or database apply must stop until its own current exact request hash has the required Owner fields and a one-time decision identity.

## File Structure

- Create `scripts/data/lib/item-image-member-evidence.mjs`: bounded structural HTML extraction for one requested item identity.
- Create `scripts/data/lib/item-image-member-evidence.test.mjs`: row/block identity and quarantine contracts.
- Modify `scripts/data/parse/parse-item-raw-pages.mjs`: expose member evidence while preserving group-page field quarantine.
- Modify `scripts/data/parse/parse-item-raw-pages.test.mjs`: parser integration coverage.
- Modify `scripts/data/audit/item-image-source-candidate-audit.mjs`: schema v2 evidence and comparison classifications.
- Modify `scripts/data/audit/item-image-source-candidate-audit.test.mjs`: candidate-only and no-local-as-source contracts.
- Create `scripts/data/generate/generate-item-image-source-promotion.mjs`: build immutable review/bundle artifacts and hard closure counters.
- Create `scripts/data/generate/generate-item-image-source-promotion.test.mjs`: input/hash/identity/ambiguity fail-close contracts.
- Create `scripts/data/fetch/fetch-item-image-source-verification.mjs`: bounded unresolved-only MediaWiki verifier and progress owner.
- Create `scripts/data/fetch/fetch-item-image-source-verification.test.mjs`: request cap, first-request progress, heartbeat, and terminal-state contracts.
- Modify `scripts/data/workflow/backend-data-refresh-plan.mjs` and its test: register the backend-refresh child step.
- Modify `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java` and its test: register `item-image-source-verification` for domain `items`.
- Modify canonical operation catalog/manifest/authorization tests: register `canonical-item-image-source-verification` and bind its frozen unresolved set and request cap.
- Create `scripts/data/transform/promote-item-image-sources.mjs`: exact authorized atomic standardized-file apply.
- Create `scripts/data/transform/promote-item-image-sources.test.mjs`: before-hash, field whitelist, atomicity, and result contracts.
- Modify `scripts/data/workflow/run-image-sync.mjs` and its test: exact items-only result, failed uploads, authorization, and key sets.
- Create `scripts/data/generate/generate-item-image-lineage-bundle.mjs` and its test: combine original source evidence with managed cached URLs.
- Modify `scripts/data/landing/source-dataset-landing-schema.mjs`, locator/import tests, and `scripts/data/maint/sync-landing-to-maint.mjs`: add governed `item_image_sources_raw` lineage.
- Modify `scripts/data/maint/sync-standardized-item-images-to-maint.mjs` and its test: reject zero/fabricated landing lineage and distinguish original/cached URLs.
- Modify `scripts/data/relation/sync-maint-to-relation.mjs`, `scripts/data/relation/sync-relation-item-images-to-local.mjs`, and focused tests: exact owned-scope projection and unsafe-delete guard.
- Modify `scripts/data/audit/image-source-lineage-report.mjs`, `scripts/data/audit/domain-readiness-audit.mjs`, and focused tests: require 6,131 traceable identities and the completion equation.
- Create `scripts/data/relation/apply-item-image-lineage.mjs` and its test: governed staged database operation with snapshots and result evidence.
- Modify canonical operation catalog/manifest/authorization tests: register source promotion and lineage apply, and strengthen `canonical-image-sync` inputs.

### Task 1: Extract Member-Level Group Image Evidence

**Files:**
- Create: `scripts/data/lib/item-image-member-evidence.mjs`
- Create: `scripts/data/lib/item-image-member-evidence.test.mjs`
- Modify: `scripts/data/parse/parse-item-raw-pages.mjs`
- Modify: `scripts/data/parse/parse-item-raw-pages.test.mjs`

- [x] **Step 1: Write failing structural-evidence tests**

Add fixtures inline for a matching table row, an image in a neighboring row, a list item, two same-block candidates, and a decorative placed/demo image. Assert this public contract:

```js
const evidence = extractItemImageMemberEvidence({
  html,
  identityTargets: ['AdamantiteLeggings', 'Adamantite Leggings'],
});

assert.deepEqual(evidence.summary, {
  matchingBlockCount: 1,
  candidateCount: 1,
  status: 'verified',
});
assert.deepEqual(evidence.candidates[0], {
  evidenceKind: 'table_row',
  blockOrdinal: 2,
  anchorTitle: 'Adamantite Leggings',
  fileTitle: 'Adamantite Leggings.png',
  url: 'https://terraria.wiki.gg/images/Adamantite_Leggings.png',
  width: 18,
  height: 26,
  contentType: 'image/png',
});
```

Assert cross-row and decorative images produce `status: 'unresolved'`; two valid files in one block produce `status: 'ambiguous'`.

- [x] **Step 2: Run the RED tests**

Run: `node --test scripts/data/lib/item-image-member-evidence.test.mjs scripts/data/parse/parse-item-raw-pages.test.mjs`

Expected: FAIL because `extractItemImageMemberEvidence` and `memberImageEvidence` do not exist.

- [x] **Step 3: Implement the bounded structural extractor**

Implement an HTML helper that scans complete `<tr>`, `<li>`, and explicit item-block fragments; accepts a block only when an anchor/title in that same fragment exactly normalizes to one identity target; and extracts images only from that fragment. Reuse `decodeHtmlEntities` and the existing file-title/MIME conventions. Return deterministic ordinals and sorted candidates.

```js
export function extractItemImageMemberEvidence({ html, identityTargets } = {}) {
  const targets = new Set((identityTargets ?? []).map(normalizeIdentity).filter(Boolean));
  const blocks = extractEvidenceBlocks(String(html ?? ''));
  const matches = blocks
    .filter((block) => block.anchorTitles.some((title) => targets.has(normalizeIdentity(title))))
    .flatMap((block) => buildBlockCandidates(block));
  const candidates = dedupeCandidates(matches);
  return {
    summary: {
      matchingBlockCount: new Set(matches.map((entry) => `${entry.evidenceKind}:${entry.blockOrdinal}`)).size,
      candidateCount: candidates.length,
      status: candidates.length === 1 ? 'verified' : candidates.length > 1 ? 'ambiguous' : 'unresolved',
    },
    candidates,
  };
}
```

Reject file titles or alt/title text containing placed, map, demo, inventory-slot, banner, or `Auto_icon` markers unless the exact member anchor and image are in the same accepted block.

- [x] **Step 4: Integrate without weakening group-page quarantine**

In `parseItemRawPagePayload`, keep `images=[]`, `sell=null`, and `safeDescription=null` for group pages. Add `groupPageEvidence.memberImageEvidence` and preserve the existing page-level images as non-promotable evidence.

```js
const memberImageEvidence = isGroupPage
  ? extractItemImageMemberEvidence({
      html,
      identityTargets: [itemInternalName, itemName, requestedPageTitle],
    })
  : null;
```

- [x] **Step 5: Run GREEN and commit**

Run: `node --test scripts/data/lib/item-image-member-evidence.test.mjs scripts/data/parse/parse-item-raw-pages.test.mjs`

Expected: PASS with group sell/description/page-level images still quarantined.

```bash
git add scripts/data/lib/item-image-member-evidence.mjs scripts/data/lib/item-image-member-evidence.test.mjs scripts/data/parse/parse-item-raw-pages.mjs scripts/data/parse/parse-item-raw-pages.test.mjs
git commit -m "feat(data): extract member item image evidence"
```

### Task 2: Produce Candidate Schema V2 And A Hard Promotion Bundle

**Files:**
- Modify: `scripts/data/audit/item-image-source-candidate-audit.mjs`
- Modify: `scripts/data/audit/item-image-source-candidate-audit.test.mjs`
- Create: `scripts/data/generate/generate-item-image-source-promotion.mjs`
- Create: `scripts/data/generate/generate-item-image-source-promotion.test.mjs`

- [x] **Step 1: Write RED tests for authority and classifications**

Assert candidates carry raw file SHA-256, page ID/revision, evidence kind/block ordinal/anchor, and exact original image metadata. Pass a conflicting local comparison row and assert it appears only under `comparison.local`, never under `source`.

```js
assert.equal(candidate.source.authority, 'raw_wiki_evidence');
assert.match(candidate.source.rawFileSha256, /^sha256:[a-f0-9]{64}$/);
assert.equal(candidate.comparison.local.status, 'conflict');
assert.equal(candidate.source.fileTitle, 'Torch.png');
```

Add promotion tests for duplicate item identity, changed standardized hash, changed raw hash, ambiguous evidence, missing source, and a valid two-item miniature closure.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/audit/item-image-source-candidate-audit.test.mjs scripts/data/generate/generate-item-image-source-promotion.test.mjs`

Expected: FAIL on missing schema-v2 fields and missing generator.

- [x] **Step 3: Upgrade the candidate report**

Use `schemaVersion: '2.0.0'`. Classify each missing-source identity as `raw_verified`, `ambiguous`, or `unresolved`. Keep counters for `localAgreement`, `localConflict`, `existingLineage`, and `localOnly`; do not combine them into candidate approval.

```js
source: {
  authority: 'raw_wiki_evidence',
  evidenceKind,
  blockOrdinal,
  anchorTitle,
  rawSourceFile: sourceFile,
  rawFileSha256: sha256Bytes(rawBytes),
  pageId: parsed.pageId,
  sourceRevisionTimestamp: parsed.revisionTimestamp,
  fileTitle: image.fileTitle,
  originalUrl: image.url,
  width: image.width,
  height: image.height,
  contentType: image.contentType,
}
```

- [x] **Step 4: Implement the promotion generator**

Export `buildItemImageSourcePromotionArtifacts`. It combines validated existing standardized sources, schema-v2 raw candidates, and an optional bounded verification report. Canonically sort all rows by numeric item ID then internal name.

```js
export function buildItemImageSourcePromotionArtifacts(input) {
  const descriptor = buildInputDescriptor(input);
  const rows = resolveExactlyOneSourcePerIdentity(input);
  const counters = summarize(rows, input.standardizedRecords.length);
  const review = { schemaVersion: 1, descriptor, counters, rows };
  if (counters.unresolved !== 0 || counters.ambiguous !== 0 || counters.duplicate !== 0) {
    return { review, bundle: null };
  }
  return {
    review,
    bundle: {
      schemaVersion: 1,
      generationId: sha256Canonical(descriptor).slice('sha256:'.length),
      descriptor,
      counters,
      rows,
      bundlePayloadSha256: sha256Canonical({ descriptor, counters, rows }),
    },
  };
}
```

Require the identity-set hash and exact standardized/item-page/candidate/verification/raw evidence hashes. A review artifact may be written while unresolved; an apply bundle may not.

- [x] **Step 5: Run GREEN and a read-only real-data audit**

Run: `node --test scripts/data/audit/item-image-source-candidate-audit.test.mjs scripts/data/generate/generate-item-image-source-promotion.test.mjs`

Run: `node scripts/data/audit/item-image-source-candidate-audit.mjs --output=reports/audit/item-image-source-candidates-2026-07-30-v2.json`

Run: `node scripts/data/generate/generate-item-image-source-promotion.mjs --candidate-report=reports/audit/item-image-source-candidates-2026-07-30-v2.json --review-output=reports/audit/item-image-source-promotion-review-2026-07-30.json`

Expected: tests PASS; the real generator writes review evidence and exits non-zero or reports `bundleWritten=false` while any identity remains unresolved. Standardized bytes remain unchanged.

- [x] **Step 6: Commit**

```bash
git add scripts/data/audit/item-image-source-candidate-audit.mjs scripts/data/audit/item-image-source-candidate-audit.test.mjs scripts/data/generate/generate-item-image-source-promotion.mjs scripts/data/generate/generate-item-image-source-promotion.test.mjs
git commit -m "feat(data): bind item image source promotion"
```

### Task 3: Add The Bounded Monitor-Visible Wiki Verifier

**Files:**
- Create: `scripts/data/fetch/fetch-item-image-source-verification.mjs`
- Create: `scripts/data/fetch/fetch-item-image-source-verification.test.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: corresponding automation tests

- [x] **Step 1: Write RED progress and scope tests**

Use injected `fetchJson` and `writeProgress`. Assert the first progress write occurs before the first network call, every request identity is in the frozen unresolved set, total requests never exceed `maxRequests`, batches never exceed `batchSize`, and success/failure ends in `completed`/`failed`.

```js
await runItemImageSourceVerification({
  unresolved: frozenRows,
  batchSize: 8,
  maxRequests: 16,
  progressPath,
}, { fetchJson, writeProgress, now });

assert.equal(events[0].kind, 'progress');
assert.equal(events.at(-1).payload.status, 'completed');
```

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/fetch/fetch-item-image-source-verification.test.mjs scripts/data/workflow/backend-data-refresh-plan.test.mjs`

Expected: FAIL because the verifier and backend step are absent.

- [x] **Step 3: Implement the unresolved-only verifier**

The script must require a private or ordinary immutable unresolved input file with its declared SHA-256, reject duplicate identities, and query only exact page/file identities. Output one record per requested identity with `verified`, `ambiguous`, `unresolved`, or `failed` and preserve response hashes.

Revision semantics (amended 2026-07-31 after the first real run): page scope is enforced on `pageId`, not on revision equality. A response whose `pageId` does not match the frozen identity fails closed as `page_identity_mismatch`. A response whose article revision has moved on since the frozen raw cache does **not** fail; the verifier resolves image evidence from the live response and records `sourceRevisionTimestamp` (live), `frozenSourceRevisionTimestamp`, and `revisionDrifted`. Rationale: the file candidates come from the `File:` pages in the same response and are already bounded by the frozen `fileTitles` and identity keys, so revision equality added no scope safety while making the operation rot as soon as any host page was edited. The first real run failed 531 of 877 identities purely on this check across only 48 host pages.

Use action ID `item-image-source-verification`; resolve progress from `--progress-path` or `TERRAPEDIA_CRAWLER_PROGRESS_PATH`; publish `running` before any API call; heartbeat during each batch; and terminal progress in `finally`/`catch`. The direct CLI requires `loadAuthorizedOperationContext({ operationId: 'canonical-item-image-source-verification' })`, matches the frozen input hash/request cap to `dataBundleSha256`, and consumes the dispatch permit before its first network request. Tests call the exported runner with injected authorization dependencies and no live packet.

- [x] **Step 4: Register the child action and monitor contract**

Add a manual-only backend refresh plan step whose command includes explicit frozen input, request cap, and `<progressPath>` through the wrapper environment. Register an `items` action with the stable action ID, fresh-only restart behavior, network access true, and no database access.

```java
backend(
    "items", "核验未解析物品图片来源", "wiki.item.image_source_verification",
    "Frozen unresolved item image identity set",
    "item-image-source-verification", "verify", "direct_crawl", "fresh",
    "仅核验冻结列表中的未解析物品图片来源。",
    "写入图片来源核验证据和进度", "none", null, false,
    "summary", false, true, true
)
```

Register `canonical-item-image-source-verification` in the canonical catalog. Its static data input is `reports/authorization/canonical/canonical-item-image-source-verification.input.json`; the execution manifest command runs `run-backend-data-refresh.mjs --mode=apply --steps=item-image-source-verification`, so the wrapper supplies the attempt child progress path and the verifier child consumes the packet-bound permit. A monitor dispatch without canonical packet/permit must fail before network access.

- [x] **Step 5: Run GREEN**

Run: `node --test scripts/data/fetch/fetch-item-image-source-verification.test.mjs scripts/data/workflow/backend-data-refresh-plan.test.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs`

Run from `back/`: `mvn -Dtest=CrawlerMonitorActionRegistryTest test`

Expected: PASS; no real network request runs in tests.

- [x] **Step 6: Authorization checkpoint and commit**

Generate a frozen verification request only after the read-only review artifact names the exact unresolved set, request cap, and input hash. Do not dispatch the real crawler until the user confirms that exact request hash with Owner actor, reason, authorization reference, expiry, and a new one-time decision identity.

```bash
git add scripts/data/fetch/fetch-item-image-source-verification.mjs scripts/data/fetch/fetch-item-image-source-verification.test.mjs scripts/data/workflow/backend-data-refresh-plan.mjs scripts/data/workflow/backend-data-refresh-plan.test.mjs scripts/data/automation/canonical-operation-catalog.mjs scripts/data/automation/canonical-operation-execution-manifest.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java
git commit -m "feat(crawler): verify bounded item image sources"
```

Execution checkpoint (2026-07-31): Task 1 is committed at `cce1aafe`, Task 2 at
`dbf433fc`, and the Task 3 code is now committed at `8f9be88d`. It freezes 877
identities at batch/request bounds `8/877`, registers monitor action 24 and
canonical operation 29, and uses a dedicated single-attempt Wiki request profile
so one identity can cause at most one real HTTP attempt. Fresh focused validation
passes `node --check` 8/8, Node 51/51, and Maven 11/11 in the worktree, and the
same Node suite passes 51/51 against a detached checkout of the commit's content
alone.

That commit is deliberately wider than this task's `git add` list. The canonical
operation modules could not be split into a Task-3-only revision: the execution
manifest now imports `canonicalServerFingerprint` and
`NPC_ITEM_RELATION_LINEAGE_REPAIR_OPERATION`, neither of which existed at
`dbf433fc`, and the shared operation-count contracts cover all five new operation
IDs in one assertion. `8f9be88d` therefore also lands the already-implemented NPC
T1 acceptance, base-maint non-town/town apply, and item-relation lineage-repair
operation registrations, plus `npc-base-maint-apply.mjs`, which the base-maint
code bundles require on disk. Its sibling `npc-base-maint-apply.test.mjs` is
intentionally still untracked. Fourteen paths were staged by explicit name; the
other 52 modified tracked files were left out of the commit.

The private `0600` request `requestHash`
`sha256:1b180787790b11b8f9f7440561f141290667e1b870c3fd67e2a0aa0ddf4eb164`
was re-derived as fully current after the commit: all eight technical identity
fields recompute to the request's own values from the preflight server
fingerprint and policy rows, and its frozen input `sha256:9ee3daf4...2bd5b` and
execution manifest `sha256:68550ea6...c73a0437` re-verify byte-for-byte.

Task 3 Step 6's authorization checkpoint is now met. The Owner authorized that
exact request hash on `2026-07-31T10:56:00Z`, producing private `0600` packet
`sha256:a66e97ea1133ecf7a5f88eba0748548a38a475f7a8a49d68e4ce774ab9169c45`
with actor `admin`, a one-time decision identity
`canonical-item-image-source-verification-20260731-01`, and expiry
`2026-08-01T09:45:00Z`. The packet re-verifies against current repository state
with zero missing Owner or technical fields and carries the `8/877` bounds over
877 identities. Its owner input is retained at
`canonical-item-image-source-verification.owner-input.json` (`0600`).

Task 8 Step 2 is now satisfied by retry-03 after two repairs and one lost
decision. Retry-01 consumed `...-20260731-01` and terminated `failed` at
`877 = 346 verified + 531 failed`, every failure `page_revision_mismatch` and
none `request_failed`; the drift contract, not the network, was at fault, and
the 531 collapsed onto only 48 host pages. Commit `be8a9272` repaired that
contract. Retry-02 consumed `...-20260731-02` but was killed by session
interruption at 488/877 with no report; that decision is burned for nothing and
its stale `running` progress was fail-closed by hand. Retry-03 consumed
`...-20260731-03` under packet `sha256:90ce69f9...dc0ee800`, run detached via
`setsid`, and completed: runner exit 0, progress `completed 877/877`, result
`sha256:f66b1afd...88d1b308` recording `877 = 868 verified + 9 ambiguous +
0 unresolved + 0 failed` at exactly 877 requests, 877/877 in-scope records, zero
duplicates, no cap overrun. 868 resolved to `.png` and 522 of those had drifted
revisions.

Rebuilding the promotion review then hit a second defect — `duplicate 877`,
because candidate and verification evidence were concatenated rather than
superseded, on a merge path no fixture covered. Repaired at commit `e11e2bc5`.

Current lane state is `total 6131 = existing 2119 + promoted 4003 +
unresolved 0 + ambiguous 9 + duplicate 0 + conflict 0`, so the bundle is still
`null` and Steps 3-6 stay blocked. The 9 are the collected fail-closed
remainder: four coins and three jellyfish genuinely host both a `.gif` and a
`.png`; `Flairon` collides with the misspelled wiki duplicate `Flairoon.png`;
`Shellphone` collides with the variant `Shellphone (Home).png`. Clearing them
requires a promotion preference rule that does not exist yet — a product
decision, not a defect. Tasks 4-7 remain unimplemented and their downstream
operations remain unregistered, so no downstream authorization can be
pre-generated.

Amendment (2026-08-01): dual-format retention is now implemented, under the
corrected rules of `D-2026-08-01-01`. `buildVerificationRecord` no longer returns
`ambiguous` for every multi-candidate identity. It applies display-name
precedence first, then format precedence, and emits an optional
`secondarySources[]` array beside the unchanged `source` object; the key is
omitted entirely when there is no secondary, so single-candidate records stay
byte-identical to the 868 already verified. More than one `.png`, or none, still
fails closed as `ambiguous`. `generate-item-image-source-promotion.mjs` verifies
each retained format against raw evidence with the same contract as the primary,
requires `sortOrder` to ascend from 1, and carries the array through review rows
and bundle rows.

`D-2026-07-31-01`'s two special rules were recorded with inverted outcomes and
are superseded; do not implement "parenthesised variant demoted".

Execution checkpoint (2026-08-01): Task 8 Step 2 is complete. retry-04 consumed
decision `canonical-item-image-source-verification-20260801-01` under packet
`sha256:1e94a381...f59c15ad`, bounds `8/9` over 9 identities, run detached via
`setsid`: runner exit 0, `9 = 9 verified + 0 ambiguous` at exactly 9 requests.
Every outcome matched the readiness review's prediction, including the four
coins and three jellyfish taking a `.png` primary with a `.gif` secondary, and
items 2611 and 5358 taking `Flairoon.png` and `Shellphone (Home).png` alone.

That round also destroyed the retry-03 report: the frozen output path was the
fixed `item-image-source-verification.latest.json`, and no copy existed anywhere.
`D-2026-08-01-02` records the rebuild from the promotion review's preserved
evidence, and two guards now prevent a repeat — the frozen output path is
round-tagged, and the verifier refuses to start when its output already exists,
before the permit is consumed and before any request.

The promotion review now reads `total 6131 = existing 2119 + promoted 4012 +
unresolved 0 + ambiguous 0 + duplicate 0 + conflict 0`, and the bundle published
for the first time at generation
`79159314be3f282b8b117491711f95c7985bd7f189b08ee0c44126bbfd0d3f34`. Tasks 4-7
and Task 8 Steps 3-6 are unblocked.

### Task 4: Apply Standardized Sources Atomically

**Files:**
- Create: `scripts/data/transform/promote-item-image-sources.mjs`
- Create: `scripts/data/transform/promote-item-image-sources.test.mjs`
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: corresponding automation tests

- [x] **Step 1: Write RED atomicity tests**

Assert apply rejects a wrong bundle hash, stale before SHA-256, changed identity set, any unresolved row, conflict with an existing standardized source, changed non-image field, and missing authorized dispatch context. Inject a rename failure and assert original bytes remain intact.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/transform/promote-item-image-sources.test.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs`

Expected: FAIL because the operation and implementation are absent.

- [x] **Step 3: Implement preview and exact apply**

Export `buildPromotedItemsPayload` and `runItemImageSourcePromotion`. Only these fields may differ: `imageFileTitle`, `imageUrl`, `imageWidth`, `imageHeight`, and `imageContentType`.

```js
const IMAGE_FIELDS = new Set([
  'imageFileTitle', 'imageUrl', 'imageWidth', 'imageHeight', 'imageContentType',
]);

const temporaryPath = `${itemsPath}.${process.pid}.tmp`;
fs.writeFileSync(temporaryPath, serializedAfter, { mode: originalMode, flag: 'wx' });
verifyWrittenPayload(temporaryPath, expectedAfterHash, expectedIdentitySetHash);
fs.renameSync(temporaryPath, itemsPath);
```

On `--apply=true`, require `loadAuthorizedOperationContext({ operationId: 'canonical-item-image-source-promotion' })`, match `dataBundleSha256`, then consume the dispatch permit before reading writable output state. Write a private canonical result binding before/after hashes and the exact field diff.

- [x] **Step 4: Register the governed operation**

Add `canonical-item-image-source-promotion` to the catalog. Its static input is `reports/authorization/canonical/canonical-item-image-source-promotion.input.json`, which binds the content-addressed bundle path/hash and standardized before hash. The manifest command uses `--input-contract=... --apply=true`; it does not follow a mutable latest pointer.

- [x] **Step 5: Run GREEN, preview, and commit**

Run: `node --test scripts/data/transform/promote-item-image-sources.test.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs scripts/data/automation/run-authorized-canonical-operation.test.mjs`

Run: `node scripts/data/transform/promote-item-image-sources.mjs --bundle=<content-addressed-bundle> --apply=false`

Expected: tests PASS; preview reports exactly 6,131 identities and changes only empty image fields. Do not run apply without its exact packet.

```bash
git add scripts/data/transform/promote-item-image-sources.mjs scripts/data/transform/promote-item-image-sources.test.mjs scripts/data/automation/canonical-operation-catalog.mjs scripts/data/automation/canonical-operation-execution-manifest.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs
git commit -m "feat(data): authorize atomic item image promotion"
```


Execution checkpoint (2026-08-01): Steps 1-5 are complete. `promote-item-image-sources.mjs`
exports `buildPromotedItemsPayload` and `runItemImageSourcePromotion`, changes only the five
image fields and only on items carrying no source yet, re-hashes the written bytes and the
identity set before the rename, and requires a packet whose `dataBundleSha256` equals the
contract's bundle hash *before* the one-time permit is spent. A retained `.gif` secondary is
deliberately ignored here: the standardized record holds one image and the extra rows belong
to Task 6's lineage lane, which is asserted by test.

`canonical-item-image-source-promotion` is registered as governed operation 30 of 31; its
manifest command carries `--input-contract=... --apply=true` and names no mutable latest
pointer, which is asserted by test.

The real preview over bundle generation `79159314...fd0d3f34` reports
`total 6131 = existing 2119 + promoted 4012`, `unchanged 2119`, an unchanged identity set
`sha256:85b9fc4e...c9da7ea0`, before `sha256:4e06da09...d6ef2520` and after
`sha256:986fc39b...d1a5f1b3`. The standardized file and its hash are untouched by the preview
and no result artifact was written.

Apply is executed. The Owner authorized request `sha256:60f01ed8...1bc43571a` with decision
`canonical-item-image-source-promotion-20260801-01` and expiry `2026-08-02T12:00:00Z`, producing
packet `sha256:971b06f1...ca19b91c0` over the `0600` frozen contract
`sha256:e61f7e7d...91e4f7b0`. The run was detached via `setsid`, exit 0, and the standardized file
now hashes to the contract's bound `standardizedAfter` value `sha256:986fc39b...d1a5f1b3` with an
unchanged identity set. All 6,131 records now carry an `imageFileTitle`.

Independent readback against `HEAD`: with the five image fields stripped, the before and after
payloads are byte-identical as canonical JSON; 20,060 image values were filled from empty
(4,012 x 5) and zero pre-existing values were overwritten. The `tooltip` lines in the textual
diff are trailing-comma churn only, because the promoted records did not previously carry the
image keys at all.

One defect was found and fixed before authorization: the apply gate compared the packet's
`dataBundleSha256` against the promotion bundle's own hash, but a packet binds the operation's
canonical data paths through `hashOrderedBundleBytes`. As written no real packet could have
matched. Repaired at `60567e0c`.

### Task 5: Harden Exact Managed Image Sync

**Files:**
- Modify: `scripts/data/workflow/run-image-sync.mjs`
- Modify: `scripts/data/workflow/run-image-sync.test.mjs`
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: corresponding automation tests

- [x] **Step 1: Write RED completion and authorization tests**

Assert an items-only dry run reports ordered `candidateKeys`, `alreadyManagedKeys`, `uploadKeys`, and `missingSourceKeys`. Assert apply fails if any upload returns null, never writes terminal `completed`, and cannot run directly without the packet/permit. Assert:

```js
assert.equal(result.total, 6131);
assert.equal(result.missingSource, 0);
assert.equal(result.candidates, result.uploaded + result.alreadyManaged);
assert.deepEqual(result.completedKeys, [...result.uploadedKeys, ...result.alreadyManagedKeys].sort());
```

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/workflow/run-image-sync.test.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs`

Expected: FAIL on absent key sets, false-success upload behavior, and direct apply.

- [x] **Step 3: Refactor to an exported runner**

Move top-level execution into `runImageSync(options, dependencies)`. Record original URL, managed URL, content hash, and key for every candidate. Write the report before terminal progress; when failures exist, report `status: 'failed'`, publish failed progress, and throw after preserving evidence.

Require the promotion result/bundle identity in `canonical-image-sync` data paths and input contract. Apply must match the current standardized after hash from source promotion.

- [x] **Step 4: Run GREEN, dry-run, and commit**

Run: `node --test scripts/data/workflow/run-image-sync.test.mjs scripts/data/lib/minio-image-upload.test.mjs scripts/data/audit/domain-readiness-audit.test.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs`

Run: `node scripts/data/workflow/run-image-sync.mjs --scopes=items --apply=false --output=reports/workflow-image-sync-items-preview-2026-07-30.json`

Expected after source promotion: `total=6131`, `missingSource=0`, and exact completion equation. Do not run MinIO apply without a new exact `canonical-image-sync` packet.

```bash
git add scripts/data/workflow/run-image-sync.mjs scripts/data/workflow/run-image-sync.test.mjs scripts/data/automation/canonical-operation-catalog.mjs scripts/data/automation/canonical-operation-execution-manifest.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs
git commit -m "fix(data): make item image sync exact"
```


Execution checkpoint (2026-08-01): Steps 1-4 are complete. `run-image-sync.mjs` no longer
executes at import: everything moved into an exported `runImageSync(options, dependencies)`
with injectable uploader, progress, JSON IO, wiki resolver, and clock, and the CLI is guarded
by a direct-execution check. Every module returns ordered `candidateKeys`,
`alreadyManagedKeys`, `uploadKeys`, `uploadedKeys`, `missingSourceKeys`, `completedKeys`, and
`failedKeys`, plus per-image `managedImages` evidence carrying original URL, managed URL, and
content hash. The summary aggregates the same fields across scopes, so a single-scope run
exposes them at the top level.

A null upload is now a failure rather than a silent skip: the report is written first with
`status: 'failed'` and the failing keys, terminal progress publishes `failed`, and the runner
throws. `completed` is never published for a partial upload set.

Two apply-only gates run before anything reaches MinIO. The standardized bytes must hash to
the `after` value of a COMPLETED `canonical-item-image-source-promotion` result, and the
authorized packet must load and its permit be consumed. Both are scoped to the `items` scope
only, because the governed operation freezes `--scopes=items`; the other scopes are separate
lanes and are not covered by that packet. `canonical-image-sync` now binds the promotion
result in both its canonical data paths and its manifest input paths.

The real items dry run reports `total 6131`, `missingSource 0`, `candidates 6131 =
uploadKeys 4343 + alreadyManagedKeys 1788`, `uploaded 0`, `failedKeys 0`, status `completed`.
`missingSource` reaching zero is the direct consequence of Task 4's promotion. The MinIO apply
still requires its own `canonical-image-sync` packet and a running local stack.

Execution checkpoint (2026-08-01, Task 5 apply): the managed sync ran under decision
`canonical-image-sync-20260801-02` and stopped `failed` at
`6131 = alreadyManaged 2119 + reused 3914 + uploaded 94 + failed 4`, exit 1, with no
`completed` progress ever published.

Local reuse replaced 3914 of the 4012 planned downloads. Measured beforehand read-only:
3914 identities whose stored file title equals the verified one, all 3914 reachable; the
other 98 hold a placed, demo, or animated variant and were uploaded.

The 4 failures are `RainbowMoss`, `FishingBobberGlowingRainbow`, `RainbowPhaseblade`, and
`RainbowPhasesaber`. Every one is a `.gif`, and every one of the 94 successful uploads is a
`.png`. The backend image endpoint answers
`400 仅支持有效的 JPEG、PNG 或 WebP 图片文件`. GIF acceptance exists only on this branch
(`ac13f0e0`); the shared backend on 18191 runs `ux/detail-pages-redesign` classes from
`/home/lolben/TerraPedia/back/target/classes`, whose source has no GIF acceptance branch. The
plan's safety lock forbids restarting that process, so the four stay unapplied.

Data readback against the previous revision: only `imageUrl` differs, the rest is byte
identical, 4008 rows moved off wiki URLs, and exactly the four GIF identities still point at
the wiki.

Open defect introduced by the reuse path: reused rows store an absolute
`http://127.0.0.1:19100/...` URL, while the backend returns a relative
`/terrapedia-images/...` path and 1788 pre-existing correct rows are relative. That is the same
shape that produced the 331 stale `localhost:9000` rows this lane already has to special-case.
Reuse must store the path and re-origin only when probing. Fix this before the lineage lane
carries the shape into maint, relation, and local.

### Task 6: Land Original And Managed Image Evidence With Real Lineage

**Files:**
- Create: `scripts/data/generate/generate-item-image-lineage-bundle.mjs`
- Create: `scripts/data/generate/generate-item-image-lineage-bundle.test.mjs`
- Modify: `scripts/data/landing/source-dataset-landing-schema.mjs`
- Modify: `scripts/data/landing/source-dataset-landing-schema.test.mjs`
- Modify: `scripts/data/landing/source-dataset-locator.mjs`
- Modify: `scripts/data/landing/source-dataset-locator.test.mjs`
- Modify: `scripts/data/landing/import-source-dataset-landings.test.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.test.mjs`
- Modify: `scripts/data/maint/sync-standardized-item-images-to-maint.mjs`
- Modify: `scripts/data/maint/sync-standardized-item-images-to-maint.test.mjs`

- [x] **Step 1: Write RED lineage tests**

Build a two-row promotion plus managed result. Assert each `itemImages` row has source `originalUrl`, managed `cachedUrl`, and exact source/managed predecessor hashes. Assert a missing managed row, swapped URL semantics, zero landing ID, or broad `item_relations_bundle_raw` descriptor is rejected.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/generate/generate-item-image-lineage-bundle.test.mjs scripts/data/landing/source-dataset-landing-schema.test.mjs scripts/data/landing/source-dataset-locator.test.mjs scripts/data/landing/import-source-dataset-landings.test.mjs scripts/data/maint/sync-landing-to-maint.test.mjs scripts/data/maint/sync-standardized-item-images-to-maint.test.mjs`

Expected: FAIL because `item_image_sources_raw` and strict original/cached lineage do not exist.

- [x] **Step 3: Generate the bounded lineage bundle**

```js
itemImages: promotion.rows.map((source) => ({
  itemId: source.itemId,
  itemInternalName: source.itemInternalName,
  itemName: source.itemName,
  role: 'icon',
  provider: 'terraria.wiki.gg',
  sourceFileTitle: source.fileTitle,
  sourcePage: source.sourcePage,
  sourceRevisionTimestamp: source.sourceRevisionTimestamp,
  originalUrl: source.originalUrl,
  cachedUrl: managedByIdentity.get(source.itemInternalName).managedUrl,
  width: source.width,
  height: source.height,
  contentType: source.contentType,
  isPrimary: true,
  sortOrder: 0,
}))
```

Require 6,131 unique rows and bind both predecessor results in the bundle descriptor.

- [x] **Step 4: Add governed landing and maint extraction**

Register `item_image_sources_raw` as a governed canonical dataset with `artifactRole: 'source_evidence'`. The locator reads only the immutable lineage bundle named by the input contract. In maint extraction, map this dataset only to `maint_item_images`; retain nonzero landing ID and the distinct original/cached URL fields.

Change `sync-standardized-item-images-to-maint.mjs` into a compatibility diagnostic that requires a supplied landing record and managed result; remove construction of `landingSourceId: 0` and never use standardized `imageUrl` for both URL columns.

- [x] **Step 5: Run GREEN and commit**

Run the RED command again.

Expected: PASS; the broad relation bundle remains supported for legacy relations but is no longer the formal item-image source lane.

```bash
git add scripts/data/generate/generate-item-image-lineage-bundle.mjs scripts/data/generate/generate-item-image-lineage-bundle.test.mjs scripts/data/landing/source-dataset-landing-schema.mjs scripts/data/landing/source-dataset-landing-schema.test.mjs scripts/data/landing/source-dataset-locator.mjs scripts/data/landing/source-dataset-locator.test.mjs scripts/data/landing/import-source-dataset-landings.test.mjs scripts/data/maint/sync-landing-to-maint.mjs scripts/data/maint/sync-landing-to-maint.test.mjs scripts/data/maint/sync-standardized-item-images-to-maint.mjs scripts/data/maint/sync-standardized-item-images-to-maint.test.mjs
git commit -m "feat(data): land exact item image lineage"
```


Execution checkpoint (2026-08-01): Steps 1-5 are complete, with one contract amended against
the real data.

`generate-item-image-lineage-bundle.mjs` binds both predecessors by hash and requires a managed
image per identity, a cached URL inside managed storage, and a source original that is not a
managed URL. It rejects a missing managed row, a managed URL presented as a source original, a
cached URL outside managed storage, an unclosed promotion bundle, a failed image sync, and the
broad `item_relations_bundle_raw` dataset type.

Amendment: the plan's row shape assumed every identity has a source `originalUrl`. It does not.
Of the 6,131 bundle rows, only the 4,012 promoted rows carry a wiki original; all 2,119
`existing` rows carry a managed URL in that field already — 1,788 relative
`/terrapedia-images/...` and 331 absolute at the historical port. Writing that value into both
columns is precisely the fabricated lineage this task removes, so those rows carry
`originalUrl: null` with `originalUrlStatus: 'not_recorded'`, counted separately. Recovering
their true originals would need a bounded re-verification of 2,119 identities under its own
Owner authorization; until then the image panel cannot claim full source traceability, and it
must not pretend otherwise.

Retained secondary formats have no managed image, because image sync covers one image per item.
They are emitted as `deferredSecondaryRows` with `reason: 'no_managed_image'` rather than
invented cached URLs.

`item_image_sources_raw` is registered as a governed canonical dataset with artifact role
`source_evidence`, and maps to `maint_item_images` alone — a payload in this lane that also
carries `recipes` yields only image rows. The extraction requires a nonzero landing id and
refuses a row whose cached URL repeats its original.

`sync-standardized-item-images-to-maint.mjs` is now a compatibility diagnostic. It requires a
supplied landing record and managed result, no longer constructs `landingSourceId: 0`, no longer
reuses the standardized `imageUrl` as the cached URL, and loads `mysql2` lazily so its contract
tests run without a database driver. Its missing `fileURLToPath` import, which made the CLI throw
at load, is fixed.

Focused validation: the plan's RED command passes 101/101.

The 331 historical-port URLs are also why the items dry run counted them as upload candidates.
`run-image-sync` now merges the historical managed prefixes for classification only; the
`resolveManagedImageUrlPrefixes` policy stays fail-closed, because weakening it would have made
an unconfigured environment trust `localhost:9000`. The dry run is now `total 6131,
missingSource 0, alreadyManaged 2119, uploadKeys 4012, failedKeys 0`.

### Task 7: Project Exact Maint, Relation, And Local Image Scope

**Files:**
- Create: `scripts/data/relation/apply-item-image-lineage.mjs`
- Create: `scripts/data/relation/apply-item-image-lineage.test.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/sync-relation-item-images-to-local.mjs`
- Modify: `scripts/data/relation/sync-relation-item-images-to-local.test.mjs`
- Modify: `scripts/data/audit/image-source-lineage-report.mjs`
- Modify: `scripts/data/audit/image-source-lineage-report.test.mjs`
- Modify: `scripts/data/audit/domain-readiness-audit.mjs`
- Modify: `scripts/data/audit/domain-readiness-audit.test.mjs`
- Modify: canonical operation catalog/manifest/authorization tests

- [x] **Step 1: Write RED owned-scope and rollback tests**

Assert preview requires 6,131 landing/maint/relation target keys, produces an owned-scope snapshot before mutation, rejects delete candidates outside the exact key set, and preserves unrelated local image roles. Simulate a relation/local post-verify mismatch and assert the operation is failed with the rollback/snapshot next step rather than completed.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/relation/apply-item-image-lineage.test.mjs scripts/data/relation/sync-relation-item-images-to-local.test.mjs scripts/data/audit/image-source-lineage-report.test.mjs scripts/data/audit/domain-readiness-audit.test.mjs`

Expected: FAIL on missing orchestrator and exact parity fields.

- [x] **Step 3: Implement the staged governed apply**

Register `canonical-item-image-lineage-apply`. Its input contract binds the lineage bundle, landing preview, maint preview, relation preview, local preview, server fingerprint, and owned-scope snapshot. Apply stages are serialized:

1. import one governed `item_image_sources_raw` landing generation;
2. project `maint_item_images` from that landing;
3. project `relation_item_images` from those maint rows;
4. project local `item_images/items.image` from relation rows;
5. verify exact key/hash/count parity and write a private canonical result.

Each database stage uses its own transaction; the pre-apply snapshot and stage marker remain available if a later stage fails. No stage may report global completion until all post-verifiers pass.

- [x] **Step 4: Strengthen readiness evidence**

Require distinct count 6,131 at standardized source, managed result, landing, maint, relation, and local layers. Require traceability of source title/original URL/cached URL/landing ID, zero unresolved/conflict-after-apply, and the image-sync equation. Keep the existing domain threshold; add no exemption.

- [ ] **Step 5: Run GREEN, previews, and commit**

Run the RED command again plus:

`node scripts/data/relation/apply-item-image-lineage.mjs --input-contract=reports/authorization/canonical/canonical-item-image-lineage-apply.input.json --apply=false`

`node scripts/data/audit/image-source-lineage-report.mjs`

Expected before formal apply: tests PASS; previews are exact; live audit remains blocked without pretending the unapplied lineage is green.

```bash
git add scripts/data/relation/apply-item-image-lineage.mjs scripts/data/relation/apply-item-image-lineage.test.mjs scripts/data/relation/sync-maint-to-relation.mjs scripts/data/relation/sync-relation-item-images-to-local.mjs scripts/data/relation/sync-relation-item-images-to-local.test.mjs scripts/data/audit/image-source-lineage-report.mjs scripts/data/audit/image-source-lineage-report.test.mjs scripts/data/audit/domain-readiness-audit.mjs scripts/data/audit/domain-readiness-audit.test.mjs scripts/data/automation/canonical-operation-catalog.mjs scripts/data/automation/canonical-operation-execution-manifest.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs
git commit -m "feat(data): govern item image lineage apply"
```


Execution checkpoint (2026-08-01): Steps 1-3 are complete as code.
`apply-item-image-lineage.mjs` validates the contract against the lineage bundle by hash,
requires all four layer previews to carry the identical identity set, and refuses any delete
candidate outside that set. Execution takes one owned-scope snapshot before the first mutation,
runs landing then maint then relation then local with each stage separately applied, stops the
chain on the first stage error leaving later stages `skipped`, and verifies per-layer parity
before reporting anything. A parity mismatch or a stage failure returns `FAILED` with the
snapshot id and a restore-then-re-authorize next step; `COMPLETED` is unreachable unless every
layer matches. Preserved local roles outside the owned scope are carried into the result.

`canonical-item-image-lineage-apply` is registered as governed operation 31 of 32, with
`databaseWrites: true` and `networkAccess: false`.

The database adapter is deliberately not wired yet: `--apply=true` throws rather than pretending
to project. Steps 4-5 need the four real previews, which require the database and the lineage
bundle, which in turn requires a completed image sync.

Focused validation: 8/8 for the orchestrator, 42/42 across the orchestrator plus the operation
catalog and authorization contracts.


Step 4 amendment (2026-08-01): the items image readiness equation counted only
`uploaded + alreadyManaged`, so a run that reuses local objects instead of re-downloading them
read as broken. It now counts `uploaded + reused + alreadyManaged`, and additionally blocks on a
non-`completed` report status and on any failed image key, at both module and report level.

Against the real 2026-08-01 sync the panel reports `blocked` with four reasons, all naming the
four GIF identities the running backend refuses. That is the correct outcome: the lane is not
green and the panel does not pretend it is.

### Task 8: Execute The Image Lane At Explicit Authorization Checkpoints

**Files:**
- Generated private authorization artifacts under `reports/authorization/canonical/`
- Generated evidence under `reports/audit/`, `reports/relation/`, and `reports/`
- Modify only after real results: parent plan, active devlog, and project-management facts

- [x] **Step 1: Rebuild read-only source evidence**

Run focused tests, regenerate candidate v2 and the promotion review, and verify all referenced input hashes. If unresolved remains, generate the bounded crawler request and stop that operation at `AWAITING_OWNER` until its exact hash is approved.

- [x] **Step 2: Dispatch only an approved verification packet**

After exact approval, dispatch `canonical-item-image-source-verification` through `run-authorized-canonical-operation.mjs`; its execution manifest enters the backend-refresh child step and uses the registered monitor progress contract. Verify terminal progress, output hash, request cap, zero out-of-scope identity, and no task process or progress `.tmp` residue. Rebuild the promotion artifacts from the exact verification result.

- [x] **Step 3: Apply standardized promotion only after a complete bundle exists**

Hard preconditions: 6,131 identities, one source each, unresolved/ambiguous/duplicate all zero, all input hashes current. Generate a fresh `canonical-item-image-source-promotion` request, obtain exact approval, dispatch once, and verify before/after result hashes.

- [x] **Step 4: Apply managed image sync only with its own packet**

Run a fresh items-only dry run. Generate and approve a fresh `canonical-image-sync` request bound to the promotion result and current standardized bytes. Dispatch once. Require no failed upload and the exact completion equation.


Execution checkpoint (2026-08-01, Step 4 complete): the managed sync closed under decision
`canonical-image-sync-20260801-04`, status `completed`, exit 0, at
`6131 = alreadyManaged 6127 + uploaded 4 + reused 0`, `missingSource 0`, `failedKeys 0`, and
`normalizedKeys 3914`. The items image readiness panel now reports `pass` with zero blocking and
zero warning reasons.

Standardized URL shapes moved from `relative 1882 + absolute:19100 3914 + absolute:9000 331 +
wiki 4` to `relative 5800 + absolute:9000 331`. Only `imageUrl` differs from the previous
revision; every other field is byte identical. The 331 historical-origin rows are deliberately
untouched.

Three decisions were burned before this one, all diagnosed and fixed rather than worked around:
`-01` used an `apiBase` without the `/api` segment; `-02` hit a backend that rejects `image/gif`;
`-03` hit my own promotion-lineage gate, which required byte equality with the promotion output
and therefore made sync single-shot. The gate now verifies lineage instead, so a retry after a
failed run is possible at all.

GIF acceptance is served by a second backend built from this branch on port 18291 with
`spring.flyway.enabled=false`, so the shared 18191 process was never restarted and no
unauthorized migration ran against the shared databases. That instance and the 19100 MinIO were
later stopped by an environment restart; the uploaded objects persist on disk at
`~/.local/share/terrapedia/minio/data`, including the four GIFs written at 04:42.

- [ ] **Step 5: Apply database lineage only with its own packet**

Generate the lineage bundle and four-layer preview. Generate and approve `canonical-item-image-lineage-apply`, dispatch once, and verify snapshot/stage/result evidence plus 6,131 parity at every layer.

- [ ] **Step 6: Run image closure verification**

Run:

```bash
node scripts/data/audit/image-source-lineage-report.mjs
node scripts/data/audit/domain-readiness-audit.mjs --domain=items --panel=imageReadiness --write=false
node scripts/data/audit/cross-db-referential-integrity.mjs --quick
node scripts/data/relation/relation-health-report.mjs
```

Expected: item image panel PASS, no new cross-DB blocker, and only the explicitly out-of-scope legacy warnings remain.

- [ ] **Step 7: Record the exact image-lane handoff**

Update the active devlog and parent plan with actual hashes/counts/decision identities. Keep the entry active for Shimmer and final integration. Do not record anticipated success.
