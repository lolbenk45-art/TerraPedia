# Supplementary Domain Source Probes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `audio`, `bosses`, and `shimmer` changed-only automatic L1 preview domains by probing and acknowledging complete, stable upstream source snapshots.

**Architecture:** A shared Node probe module produces canonical hashes for the three source families. The source monitor compares those hashes to the shared manifest; the existing supplementary preview wrapper probes before and after source work and acknowledges only matching terminal-success snapshots. The registry uses the same source keys and re-enables precisely the eight source-probed default domains.

**Tech Stack:** Node.js ESM, `node:test`, MediaWiki API, Java 17, Spring Boot, JUnit 5, Redis V2 queue.

---

### Task 1: Add Deterministic Supplementary Source Probes

**Files:**
- Create: `scripts/data/monitor/supplementary-source-probes.mjs`
- Create: `scripts/data/monitor/supplementary-source-probes.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-audio-assets.mjs`

- [ ] **Step 1: Write failing probe contracts**

```js
import {
  probeSupplementarySource,
  SUPPLEMENTARY_SOURCE_DEFINITIONS
} from './supplementary-source-probes.mjs';

assert.deepEqual(Object.keys(SUPPLEMENTARY_SOURCE_DEFINITIONS).sort(), ['audio', 'bosses', 'shimmer']);
const first = await probeSupplementarySource({ domainId: 'audio' }, { fetchJson });
const reordered = await probeSupplementarySource({ domainId: 'audio' }, { fetchJson: fetchSameRowsReordered });
assert.equal(first.contentHash, reordered.contentHash);
assert.equal(first.sourceKey, 'wiki.audio_assets.catalog');
assert.equal(binaryRequestCount, 0);

await assert.rejects(
  probeSupplementarySource({ domainId: 'audio' }, { fetchJson: fetchTruncatedAudioPage }),
  /continuation.*governed limit/i
);
```

Add equivalent fixtures for Bosses and Shimmer. Assert Bosses uses section and
revision/langlink metadata batches but never a Boss-page parse-text request;
assert Shimmer reads only the one Chinese source revision and one source-page
render needed by the existing table parser, then batches candidate langlink
revisions, and never calls `runWikiShimmerExtractionPipeline`.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/data/monitor/supplementary-source-probes.test.mjs
```

Expected: FAIL because the probe module does not exist.

- [ ] **Step 3: Implement the probe module and metadata-only audio primitive**

Export these stable interfaces:

```js
export const SUPPLEMENTARY_SOURCE_DEFINITIONS = Object.freeze({
  audio: { sourceKey: 'wiki.audio_assets.catalog', locator: 'Music|NPC_Hit|NPC_Killed|Item_', entityFamily: 'audio', sourceKind: 'media_catalog' },
  bosses: { sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: 'bosses', sourceKind: 'page_catalog' },
  shimmer: { sourceKey: 'wiki.shimmer.page_and_langlinks', locator: '微光', entityFamily: 'shimmer', sourceKind: 'page_and_langlinks' }
});

export async function probeSupplementarySource({ domainId, wikiApiUrl, zhWikiApiUrl } = {}, dependencies = {}) {
  const definition = SUPPLEMENTARY_SOURCE_DEFINITIONS[domainId];
  if (!definition) throw new Error(`unsupported supplementary source domain: ${domainId}`);
  const snapshot = await PROBE_BY_DOMAIN[domainId]({ definition, wikiApiUrl, zhWikiApiUrl, ...dependencies });
  return { ...definition, ...snapshot, contentHash: createContentHash(canonicalJson(snapshot)) };
}
```

Audio reuses an exported `fetchAudioCatalogMetadata` from
`fetch-wiki-audio-assets.mjs`. It calls the existing `allimages` API per fixed
prefix with `aiprop=sha1|timestamp|mime|size`, follows continuation only to
the governed full-corpus limit, and returns sorted metadata. It does not call
`downloadAsset`. Query the Chinese `音乐` page revision separately.

Bosses reuse the existing Boss-section discovery algorithm, then batch English
metadata plus zh langlinks through `fetchWikiPageMetadataBatch`; batch the
resolved Chinese titles against the zh API. Shimmer queries the Chinese `微光`
revision and the one source-page HTML needed by the existing
`collectShimmerCandidateTitles` parser, then batches candidate revision/langlink
metadata. It never fetches candidate page HTML or runs generation work.
Normalize every record before hashing and reject missing/revisionless or
over-limit inputs.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test scripts/data/monitor/supplementary-source-probes.test.mjs
```

Expected: PASS; fixtures prove deterministic ordering, upstream-field
sensitivity, bounded continuation, and zero media/crawler invocation.

- [ ] **Step 5: Commit the probe contract checkpoint**

```bash
git add scripts/data/monitor/supplementary-source-probes.mjs scripts/data/monitor/supplementary-source-probes.test.mjs scripts/data/fetch/fetch-wiki-audio-assets.mjs
git commit -m "feat(crawler): add supplementary source probes"
```

### Task 2: Extend Monitor And Manifest With Probe Identity

**Files:**
- Modify: `scripts/data/monitor/check-source-updates.mjs`
- Modify: `scripts/data/monitor/check-source-updates.test.mjs`
- Modify: `scripts/data/lib/wiki-sync-manifest.mjs`
- Modify: `scripts/data/lib/wiki-sync-manifest.test.mjs`

- [ ] **Step 1: Write failing monitor and acknowledgement tests**

```js
assert.deepEqual(
  state.sources.filter((source) => source.key.startsWith('wiki.audio_assets') || source.key.startsWith('wiki.bosses') || source.key.startsWith('wiki.shimmer')).map((source) => source.key).sort(),
  ['wiki.audio_assets.catalog', 'wiki.bosses.catalog', 'wiki.shimmer.page_and_langlinks']
);
assert.equal(audio.changed, true);

const afterAck = acknowledgeWikiProbeSnapshot({ manifestPath, snapshot: audioSnapshot, outputPath });
assert.equal(resolveIngestedRecord(afterAck, audioSnapshot).contentHash, audioSnapshot.contentHash);
assert.equal(runMonitor({ manifestPath }).sources.find((source) => source.key === audioSnapshot.sourceKey).changed, false);
```

Test stable acknowledgement, changed pre/post snapshot, unreadable output, and
probe failure. For every failure case, retain an exact copy of manifest bytes
and assert the file is unchanged.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/data/monitor/check-source-updates.test.mjs scripts/data/lib/wiki-sync-manifest.test.mjs
```

Expected: FAIL because no supplementary monitor records or explicit probe
acknowledgement helper exists.

- [ ] **Step 3: Implement monitor registration and explicit acknowledgement**

Import the probe module into `check-source-updates.mjs`, add the three sources
to `buildWikiSources`, and dispatch their lookup through
`probeSupplementarySource`. Preserve the existing `compareWikiSourceFingerprint`
path by returning `{ contentHash, revisionId, revisionTimestamp }` from each
probe. Do not add a scheduler command to `recommendedActions`.

Add this manifest helper rather than using generated-output bytes as a source
hash:

```js
export function acknowledgeWikiProbeSnapshot({ manifestPath, snapshot, outputPath } = {}) {
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error('probe acknowledgement requires a readable terminal output');
  }
  const manifest = loadWikiSourceManifest(manifestPath);
  const nextManifest = upsertManifestRecord(manifest, {
    contentHash: snapshot.contentHash,
    entityFamily: snapshot.entityFamily,
    lang: 'en',
    lastFetchedAt: snapshot.checkedAt,
    lastParsedAt: snapshot.checkedAt,
    localPath: normalizePathForOutput(outputPath),
    pageTitle: snapshot.locator,
    requestedPageTitle: snapshot.locator,
    sourceKey: snapshot.sourceKey,
    sourceKind: snapshot.sourceKind,
    status: 'ok'
  });
  saveWikiSourceManifest(manifestPath, nextManifest);
  return nextManifest;
}
```

Return the saved normalized manifest from the helper. Ensure an acknowledgement
for the same snapshot replaces its exact record and is idempotent.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test scripts/data/monitor/check-source-updates.test.mjs scripts/data/lib/wiki-sync-manifest.test.mjs
```

Expected: PASS; all three monitor records compare to the shared manifest and
only stable, readable probe snapshots become unchanged.

- [ ] **Step 5: Commit the monitor/manifest checkpoint**

```bash
git add scripts/data/monitor/check-source-updates.mjs scripts/data/monitor/check-source-updates.test.mjs scripts/data/lib/wiki-sync-manifest.mjs scripts/data/lib/wiki-sync-manifest.test.mjs
git commit -m "fix(crawler): track supplementary source snapshots"
```

### Task 3: Acknowledge Only Stable Supplementary Preview Results

**Files:**
- Modify: `scripts/data/automation/prepare-supplementary-domain-l1-preview.mjs`
- Modify: `scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs`

- [ ] **Step 1: Write failing pre/post probe tests**

```js
const successive = (...snapshots) => async () => snapshots.shift();
const result = await prepareSupplementaryDomainL1Preview({ domainId: 'bosses', repoRoot }, {
  probeSource: async () => stableSnapshot,
  acknowledgeSource: (input) => acknowledgements.push(input),
  runSource,
  loadPolicyContext,
  buildImportPlan
});
assert.equal(result.sourceAcknowledged, true);
assert.equal(acknowledgements.length, 1);

const drifted = await prepareSupplementaryDomainL1Preview({ domainId: 'audio', repoRoot }, {
  probeSource: successive(stableSnapshot, { ...stableSnapshot, contentHash: 'next' }),
  acknowledgeSource: () => { throw new Error('must not acknowledge drift'); },
  runSource,
  loadPolicyContext,
  buildImportPlan
});
assert.equal(drifted.sourceAcknowledged, false);
assert.equal(drifted.sourceAcknowledgementReason, 'source_changed_during_preview');
```

Add tests for source failure, unreadable bundle/source output, and failed
post-probe; all must leave the manifest unchanged.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs
```

Expected: FAIL because the wrapper neither probes nor reports acknowledgement.

- [ ] **Step 3: Implement stable acknowledgement around existing source work**

Inject `probeSource` and `acknowledgeSource` dependencies with production
defaults from Task 1 and Task 2. For `audio`, `bosses`, and `shimmer`, capture
the first snapshot before `runDomainSource`; after the existing frozen bundle
is written, capture a second snapshot. Acknowledge only when:

```js
const sourceAcknowledged = firstSnapshot.contentHash === secondSnapshot.contentHash
  && fs.existsSync(result.bundlePath)
  && fs.statSync(result.bundlePath).size > 0;
if (sourceAcknowledged) {
  acknowledgeSource({ manifestPath, snapshot: firstSnapshot, outputPath: result.bundlePath });
}
```

Surface `sourceAcknowledged` and its explicit reason in the terminal preview
payload/report without changing the existing terminal `completed` result for a
valid frozen bundle. A second-probe error is fail-closed for acknowledgement;
it does not replace the original source failure handling.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs
```

Expected: PASS; only stable successful bundles advance manifest state.

- [ ] **Step 5: Commit the acknowledgement checkpoint**

```bash
git add scripts/data/automation/prepare-supplementary-domain-l1-preview.mjs scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs
git commit -m "fix(crawler): acknowledge stable supplementary previews"
```

### Task 4: Reconnect Registry Keys And Re-enable Automatic Domains

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] **Step 1: Write failing backend assertions**

```java
assertEquals(
    Set.of("items", "npcs", "projectiles", "armor_sets", "buffs", "audio", "bosses", "shimmer"),
    CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS
);
assertFalse(CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS.contains("boss_loot"));
assertEquals("wiki.audio_assets.catalog", audio.sourceKey());
assertEquals("wiki.bosses.catalog", bosses.sourceKey());
assertEquals("wiki.shimmer.page_and_langlinks", shimmer.sourceKey());
```

Add a V2 sweep fixture with a changed `wiki.bosses.catalog` source and assert
it selects only `domain-source-bosses`, preserves its source fingerprint, and
does not select `boss-loot-backfill` or any apply action.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest test
```

Expected: FAIL because the allowlist has five domains and the three action
definitions still use unmatched legacy source keys.

- [ ] **Step 3: Implement exact source-key alignment**

Set the public `AUTO_DISPATCH_DOMAINS` exactly to the eight domains above.
Replace the source keys on the three source/preview definitions as follows:

```java
"wiki.bosses.catalog"              // domain-source-bosses
"wiki.shimmer.page_and_langlinks"  // domain-source-shimmer
"wiki.audio_assets.catalog"        // wiki-audio-assets-refresh
```

Use the Audio catalog key for the paired Audio import action as well so monitor
plans remain source-consistent, while leaving it ineligible because `apply`
actions are not default automatic rules. Do not change commands, progress
paths, resume support, authorization mode, or any Boss loot definition.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest test
```

Expected: PASS; the V2 sweep maps each changed probe record to its L1 preview
source action only.

- [ ] **Step 5: Commit the registry checkpoint**

```bash
git add back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java
git commit -m "feat(crawler): enable probed supplementary domains"
```

### Task 5: Run Integrated Regression And Update Handoff

**Files:**
- Modify: `docs/devlog/entries/2026-08-14-crawler-auto-domain-consumption-resume.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Run the complete focused contract suite**

```bash
node --test \
  scripts/data/monitor/supplementary-source-probes.test.mjs \
  scripts/data/monitor/check-source-updates.test.mjs \
  scripts/data/lib/wiki-sync-manifest.test.mjs \
  scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs \
  scripts/data/fetch/fetch-wiki-audio-assets.test.mjs \
  scripts/data/fetch/fetch-wiki-bosses.test.mjs \
  scripts/data/fetch/fetch-wiki-bosses-resume.test.mjs \
  scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.test.mjs
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest,CrawlerAttemptSupervisorTest,CrawlerQueueV2ApplicationServiceTest test
git diff --check
```

Expected: every focused Node and Maven test passes; no whitespace errors.

- [ ] **Step 2: Record result and residual runtime acceptance**

Update the active entry with the exact test counts, source keys, stable
acknowledgement behavior, and the remaining post-restart authenticated
read-only scheduler observation. Update `current.md` to state that all eight
source-probed domains are enabled only after Task 4 validation; retain no
automatic DB/L2/Boss-loot boundary.

- [ ] **Step 3: Review the final staged scope**

```bash
git status --short
git diff --cached --stat
git diff --cached --check
```

Expected: only Task 5 documentation is staged; unrelated
`armor_sets.standardized.json` and authorization artifacts remain unstaged.

- [ ] **Step 4: Commit the validated handoff**

```bash
git add docs/devlog/entries/2026-08-14-crawler-auto-domain-consumption-resume.md docs/devlog/current.md
git commit -m "docs(crawler): record supplementary probe validation"
```

### Task 6: Perform Post-Restart Read-Only Acceptance

**Files:**
- Modify: `docs/devlog/entries/2026-08-14-crawler-auto-domain-consumption-resume.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Restart through the V2 queue cutover runbook**

Run only after Tasks 1-5 pass and review is clear:

```bash
bash ./scripts/dev/stop-local-stack.sh
bash ./scripts/dev/start-local-stack.sh
```

Expected: backend starts with the new registry code; no manual crawler or
database apply command is run.

- [ ] **Step 2: Collect authenticated, read-only scheduler evidence**

Use the existing authorized crawler-monitor access route from
`docs/runbooks/crawler-monitor-queue-v2-cutover.md` to read the next sweep and
attempt overview. Do not bypass authentication, reveal credentials, or invoke
the mutation endpoint. Confirm all unchanged source snapshots create zero new
attempts, while any real changed snapshot is represented by only its matching
L1 preview action.

- [ ] **Step 3: Record acceptance or fail closed**

Record the observation timestamp, attempt IDs (if any), and result. If the
read-only observation cannot be collected or indicates duplicate dispatch,
restore the three domains to fail-closed in a separate fix before declaring
acceptance.

- [ ] **Step 4: Commit runtime acceptance evidence when it changes docs**

```bash
git add docs/devlog/entries/2026-08-14-crawler-auto-domain-consumption-resume.md docs/devlog/current.md
git commit -m "docs(crawler): record supplementary scheduler acceptance"
```
