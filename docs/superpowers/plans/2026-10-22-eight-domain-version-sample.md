# Eight-Domain Wiki Version Sample Plan

> **For agentic workers:** Use the existing isolated version-sample branch and run these tasks serially. No database or canonical source writes are in scope.

**Goal:** Collect ten current Wiki samples for each of the eight product domains, inspect their upstream sources using only Terraria Desktop/PC version evidence, and retrieve the PC `1.4.5.8` update notes if the Wiki/API exposes them.

**Architecture:** Reuse the monitor-visible `wiki-monitor-domain-smoke` sampler for seven page domains, retaining only revision identity, content hash, and typed version hints from its already-fetched page text. Sample ten BGM asset metadata rows through the existing Audio sample lane with downloads disabled. Fetch the exact upstream pages/modules recorded by each domain's source mapping and use only the Desktop/PC field from Wiki `Template:Current versions`, saving run outputs under one ignored `.local/tmp` root. Compare explicit module-level claims with checked-in source metadata without treating page annotations or revision dates as game versions.

**Tech Stack:** Node.js ESM, MediaWiki API, existing Wiki request gate, `node:test`.

---

## Scope And Safety

- Sample `items`, `npcs`, `projectiles`, `buffs`, `armor_sets`, `bosses`, and `shimmer` with ten Wiki page revisions each.
- Sample ten BGM asset metadata records for Audio. Do not download audio binaries.
- Preserve page ID, revision ID/timestamp, content SHA-256, and explicit version-marker kind/value. Do not retain full page bodies in the report.
- Use serial requests through the existing Wiki request gate. Any cooldown or retry-after response is honored; do not clear the gate or add concurrency.
- Write raw sample reports and Audio metadata only below `.local/tmp/wiki-version-sample-20261022/`; use existing monitor-visible progress paths.
- Do not update source `latest` files, standardized/canonical data, the Wiki source manifest, databases, Redis, scheduler state, or formal authorization artifacts. Canonical monitor progress files are permitted outputs.
- A `wikiVersion`/`_terrariaversion` declaration is a domain source-version claim. `eicons` and source-code references are per-fact version annotations, not a global game-version claim. Missing evidence remains `unknown`.
- Version comparison is scoped to Desktop/PC only; ignore other platform version values.

## Tasks

### Task 1: Capture typed version evidence in the page sampler

Files:
- Modify `pipelines/monitor/wiki-monitor-domain-smoke.mjs`.
- Test `pipelines/monitor/wiki-monitor-domain-smoke.test.mjs`.

- [x] Add a failing unit test for `_terrariaversion`, `wikiVersion`, source-code `v=` references, `eicons` labels, duplicates, and text with no version marker.
- [x] Run `node --test pipelines/monitor/wiki-monitor-domain-smoke.test.mjs` and confirm the new test fails because the extraction helper is absent.
- [x] Add a pure extractor that returns typed, deduplicated evidence; add a content hash to each sample record; do not persist raw wikitext.
- [x] Run both smoke test files and `git diff --check`.

### Task 2: Capture seven ten-page Wiki samples

- [x] Recheck the smoke lock/progress and active writers immediately before execution.
- [x] Run the sampler serially with `limit=10` and domains `items,npcs,projectiles,buffs,armor_sets,bosses,shimmer`; direct all report/output paths to the run-scoped `.local/tmp` root while retaining the canonical smoke progress path.
- [x] Require exactly ten revision-bound records per selected domain; a partial result is reported as partial and is not silently filled from local data.

### Task 3: Capture ten Audio metadata rows

- [x] Run `fetch-wiki-audio-assets.mjs` in sample mode for BGM only, with `limit-per-scope=10`, `max-api-pages-per-prefix=1`, `max-total-files=10`, `skip-download=true`, and run-scoped output/manifest/report/lock paths.
- [x] Verify exactly ten metadata rows and no downloaded binary files.

### Task 4: Compare and report

- [x] Compare explicit version declarations against local source metadata; report source-code and `eicons` versions separately as row-level annotations.
- [x] Produce one run-scoped summary with per-domain requested/actual count, revision range, version claims/markers, comparison status, and request/failure summary.
- [x] Record that page search samples may include index/translation pages, are not exact local entity-ID matches, and do not prove current full-corpus parity.
- [x] Confirm no canonical source files, database tables, or Audio binaries changed; run `git diff --check`.

### Task 5: Fetch exact version-bearing modules

- [x] Fetch the current revisions of `Module:Iteminfo/data` and `Module:Npcinfo/data` serially through the existing Wiki request gate and monitor-visible smoke progress action.
- [x] Retain only page/revision identity, content hash, and typed `_terrariaversion` evidence in `.local/tmp/wiki-version-sample-20261022/version-source-probe/`.
- [x] Compare the fresh Iteminfo/Npcinfo module declarations with checked-in Items/NPCs metadata; inspect the remaining domain sources in Task 6.
- [x] Confirm the probe did not write canonical `latest` data, standardized data, databases, Redis, or audio binaries.

### Task 6: Probe the remaining domain sources

- [x] Fetch the exact Projectiles, Buffs, Armor Sets, Bosses, and Chinese Shimmer source pages serially through the shared Wiki request gate and monitor-visible progress action.
- [x] Reuse the existing ten-record Audio BGM metadata sample to check for any game-version field; do not download binaries.
- [x] Record each source revision and typed version evidence; compare only explicit domain-level declarations and leave missing values `unknown`.
- [x] Confirm all six domains are represented in the final comparison and no canonical source data or databases were written.

### Task 7: Verify remaining version sources through Wiki API

- [x] Query the Wiki API's Module namespace for explicit version-field occurrences, then fetch current revision content for the Projectile module and its documentation/generator pages, Buff template and its dependency modules, Bosses overview plus representative entries, and the Shimmer source page.
- [x] Fetch the current `Template:Current versions` page and record only its Desktop/PC version value.
- [x] Re-query a bounded BGM file metadata page set through Wiki `allimages` API and read the Chinese Music display-name page without downloading media.
- [x] Keep all requests serial through the shared request gate and monitor-visible progress; save revision identity, hashes, field matches, and source relationships only under the run-scoped `.local/tmp` directory.
- [x] Distinguish direct domain declarations, dependency versions, per-record references, and absent evidence; update the comparison from API findings.
- [x] Confirm progress is terminal, no throttle cooldown remains, no canonical source/DB data changed, and tests plus `git diff --check` pass.

### Task 8: Retrieve PC 1.4.5.8 update notes

- [x] Search the Wiki API for a dedicated Desktop/PC `1.4.5.8` update or version-history page.
- [x] Fetch current revision content for the most relevant result pages and extract only the PC `1.4.5.8` change list and source identity.
- [x] Distinguish a dedicated patch-note page from per-entity source-code references; do not infer update bullets from unrelated page citations.
- [x] Store a bounded report under `.local/tmp/wiki-version-sample-20261022/` and finish the monitor-visible progress as `completed` or `failed`.
