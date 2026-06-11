# Item Source Family And Polluted Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining item acquisition source gaps that are still blocked as `family_page_candidate` and `polluted_candidate`, without copying unsafe page-level sources onto individual items.

**Architecture:** Keep the already imported high-confidence chain as the safety baseline. Add a read-only family policy layer that can promote only explicitly approved family pages, and add targeted polluted-page extraction repairs for Goodie Bag, Torches, Ropes, Block-placing wands, Flairon, and Shucked Oyster. Every promoted row must go through candidate plan -> dry-run -> additive local compat apply -> DB/API/page smoke.

**Tech Stack:** Node data audit scripts, JSON policy fixtures, MySQL `terria_v1_local`, Spring Boot public item source API, Nuxt public item page.

---

## Current State

- High-confidence item source rows already imported: `271` candidates, `454` source rows.
- Remaining blocked report:
  - `data/reports/item-source-remaining-lists-2026-06-10/family_page_candidate.md`
  - `data/reports/item-source-remaining-lists-2026-06-10/polluted_candidate.md`
- Remaining blocked categories:
  - `family_page_candidate`: `1129` items across `71` pages.
  - `polluted_candidate`: `88` items across `24` pages.
- Main latest final plan evidence:
  - `data/reports/item-source-candidate-import-plan.after-vendor-composite-cleanup.json`
  - `data/reports/item-source-full-classification-review-2026-06-10.md`

## Hard Boundaries

- Do not run crawler/fetch/import/backfill/pipeline/sync.
- Do not run any full refresh or broad materialization.
- Do not write production DB.
- Do not apply `family_page_candidate` or `polluted_candidate` directly from current reports.
- All DB writes must use `scripts/data/relation/apply-item-source-candidate-local-compat.mjs` with:
  - `--apply=true`
  - `--confirm-local-compat=true`
  - reviewed batch input only
  - dry-run report first
  - rollback SQL report after apply

## Multi-Agent Ownership

- Agent A, data safety: policy schema, read-only report generation, dry-run/apply guard review.
- Agent B, extraction rules: family promotion and polluted page normalization tests/scripts.
- Agent C, backend/API smoke: verify `/api/public/items/{id}/sources` output, boss/NPC/item metadata integrity.
- Agent D, public UI smoke: verify affected `/items/{id}` pages render non-empty source groups and no obvious polluted cross-item sources.

No two agents write the same file. Agents that inspect DB or API are read-only unless they are the designated final batch executor.

## Files

- Modify: `scripts/data/audit/audit-item-source-gap-candidates.mjs`
- Modify: `scripts/data/audit/audit-item-source-gap-candidates.test.mjs`
- Modify: `scripts/data/audit/build-item-source-candidate-import-plan.mjs`
- Modify: `scripts/data/audit/build-item-source-candidate-import-plan.test.mjs`
- Create: `scripts/data/audit/item-source-family-page-policy.mjs`
- Create: `scripts/data/audit/item-source-family-page-policy.test.mjs`
- Create: `data/config/item-source-family-page-policy.json`
- Create: `data/reports/item-source-family-policy-review-2026-06-10.md`
- Create: `data/reports/item-source-polluted-repair-review-2026-06-10.md`
- Reuse: `scripts/data/relation/apply-item-source-candidate-local-compat.mjs`
- Reuse: `data/reports/item-source-remaining-lists-2026-06-10/*.md`

## Phase 0: Freeze Baseline

- [ ] **Step 0.1: Verify clean branch state**

Run:

```bash
git status --short --branch
```

Expected:

```text
## main...origin/main
?? data/reports/item-source-remaining-lists-2026-06-10/
?? docs/superpowers/plans/2026-06-10-item-source-family-polluted-repair.md
```

Only this plan and the remaining-list reports may be untracked. If there are unrelated edits, stop and split the work.

- [ ] **Step 0.2: Stage the plan and remaining-list reports as the planning baseline**

Run:

```bash
git add docs/superpowers/plans/2026-06-10-item-source-family-polluted-repair.md
git add data/reports/item-source-remaining-lists-2026-06-10/family_page_candidate.md \
  data/reports/item-source-remaining-lists-2026-06-10/family_page_candidate.json \
  data/reports/item-source-remaining-lists-2026-06-10/polluted_candidate.md \
  data/reports/item-source-remaining-lists-2026-06-10/polluted_candidate.json
git diff --cached --stat
```

Expected: only this plan and the four remaining-list reports are staged.

## Phase 1: Family Page Policy Contract

- [ ] **Step 1.1: Write failing family policy tests**

Create `scripts/data/audit/item-source-family-page-policy.test.mjs` with tests for three decisions:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyFamilyPagePolicy,
  isFamilyPageAllowedForSharedSource
} from './item-source-family-page-policy.mjs';

test('family policy allows explicitly shared worldgen furniture pages', () => {
  assert.equal(isFamilyPageAllowedForSharedSource({
    pageTitle: 'Bookcases',
    sourceType: 'worldgen',
    sourceRefType: 'world'
  }), true);
});

test('family policy blocks paintings until item-specific placement is proven', () => {
  assert.equal(isFamilyPageAllowedForSharedSource({
    pageTitle: 'Paintings',
    sourceType: 'worldgen',
    sourceRefType: 'world'
  }), false);
});

test('family policy reports unknown pages as manual review', () => {
  assert.deepEqual(classifyFamilyPagePolicy('Unknown Family Page'), {
    pageTitle: 'Unknown Family Page',
    policy: 'manual_review',
    reason: 'no_policy_entry'
  });
});
```

Run:

```bash
node --test scripts/data/audit/item-source-family-page-policy.test.mjs
```

Expected: fail because `item-source-family-page-policy.mjs` does not exist.

- [ ] **Step 1.2: Add first policy fixture**

Create `data/config/item-source-family-page-policy.json`:

```json
{
  "version": 1,
  "allowSharedWorldgenPages": [
    "Bookcases",
    "Pianos",
    "Tables",
    "Grandfather Clocks",
    "Work Benches"
  ],
  "blockUntilItemSpecificPages": [
    "Paintings",
    "Statues",
    "Music Boxes",
    "Torches",
    "Block-placing wands"
  ],
  "manualReviewPages": [
    "Altars",
    "Biome Chests",
    "Magic Mirrors"
  ]
}
```

This first fixture intentionally promotes only low-risk shared worldgen furniture pages. Do not add all 71 family pages in the first pass.

- [ ] **Step 1.3: Implement policy helper**

Create `scripts/data/audit/item-source-family-page-policy.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_POLICY_PATH = path.join(process.cwd(), 'data', 'config', 'item-source-family-page-policy.json');

export function loadFamilyPagePolicy(policyPath = DEFAULT_POLICY_PATH) {
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
}

export function classifyFamilyPagePolicy(pageTitle, policy = loadFamilyPagePolicy()) {
  const normalized = String(pageTitle ?? '').trim();
  if ((policy.allowSharedWorldgenPages ?? []).includes(normalized)) {
    return { pageTitle: normalized, policy: 'allow_shared_worldgen', reason: 'explicit_allowlist' };
  }
  if ((policy.blockUntilItemSpecificPages ?? []).includes(normalized)) {
    return { pageTitle: normalized, policy: 'block_item_specific_required', reason: 'explicit_blocklist' };
  }
  if ((policy.manualReviewPages ?? []).includes(normalized)) {
    return { pageTitle: normalized, policy: 'manual_review', reason: 'explicit_manual_review' };
  }
  return { pageTitle: normalized, policy: 'manual_review', reason: 'no_policy_entry' };
}

export function isFamilyPageAllowedForSharedSource(source, policy = loadFamilyPagePolicy()) {
  const decision = classifyFamilyPagePolicy(source?.pageTitle, policy);
  return decision.policy === 'allow_shared_worldgen'
    && source?.sourceType === 'worldgen'
    && source?.sourceRefType === 'world';
}
```

Run:

```bash
node --test scripts/data/audit/item-source-family-page-policy.test.mjs
```

Expected: 3 pass.

## Phase 2: Promote Only Allowlisted Family Rows

- [ ] **Step 2.1: Write failing candidate-plan test for allowlisted family pages**

In `scripts/data/audit/build-item-source-candidate-import-plan.test.mjs`, add a test that `AetheriumBookcase` from `Bookcases` becomes eligible when source is `worldgen/world`, while `Paintings` remains blocked.

Run:

```bash
node --test scripts/data/audit/build-item-source-candidate-import-plan.test.mjs
```

Expected: fail because family policy is not integrated.

- [ ] **Step 2.2: Integrate policy in candidate plan**

Modify `scripts/data/audit/build-item-source-candidate-import-plan.mjs`:

- Import `isFamilyPageAllowedForSharedSource`.
- When `classification === 'family_page_candidate'`, allow a candidate only if every extracted source row passes `isFamilyPageAllowedForSharedSource({ pageTitle: candidate.pageTitle, sourceType, sourceRefType })`.
- Keep all other family pages blocked with `blockedReason='family_page_candidate'`.

Run:

```bash
node --test scripts/data/audit/build-item-source-candidate-import-plan.test.mjs scripts/data/audit/item-source-family-page-policy.test.mjs
```

Expected: all pass.

- [ ] **Step 2.3: Generate family policy review report**

Run read-only:

```bash
node scripts/data/audit/build-item-source-candidate-import-plan.mjs \
  --output=data/reports/item-source-candidate-import-plan.after-family-policy.json
```

Then summarize promoted rows:

```bash
node --input-type=module -e "import fs from 'node:fs'; const p=JSON.parse(fs.readFileSync('data/reports/item-source-candidate-import-plan.after-family-policy.json','utf8')); console.log(JSON.stringify(p.summary,null,2));"
```

Expected: `eligibleCandidates` increases only by allowlisted shared-worldgen family pages. If `Paintings`, `Statues`, or `Music Boxes` become eligible, stop and fix policy.

- [ ] **Step 2.4: Multi-agent review before DB writes**

Agent A checks:

- The after-family-policy plan contains no `Paintings`, `Statues`, `Music Boxes`.
- All newly eligible family rows have `sourceType='worldgen'` and `sourceRefType='world'`.

Agent B checks:

- No polluted candidate moved into eligible because of family policy.
- `blockedReasonCounts.polluted_candidate` remains unchanged.

Approval condition: both agents say no critical/important issues.

- [ ] **Step 2.5: Build reviewed family delta batch**

Create `data/reports/item-source-family-policy-batches/batch-01.json` containing only newly eligible family candidates not already inserted.

Run:

```bash
mkdir -p data/reports/item-source-family-policy-batches
node --input-type=module <<'NODE'
import fs from 'node:fs';

const baseline = JSON.parse(fs.readFileSync('data/reports/item-source-candidate-import-plan.after-vendor-composite-cleanup.json', 'utf8'));
const after = JSON.parse(fs.readFileSync('data/reports/item-source-candidate-import-plan.after-family-policy.json', 'utf8'));
const baselineKeys = new Set((baseline.eligibleCandidates ?? []).map((candidate) => candidate.itemInternalName));
const allowedPages = new Set(['Bookcases', 'Pianos', 'Tables', 'Grandfather Clocks', 'Work Benches']);
const eligibleCandidates = (after.eligibleCandidates ?? [])
  .filter((candidate) => !baselineKeys.has(candidate.itemInternalName))
  .filter((candidate) => allowedPages.has(candidate.pageTitle))
  .filter((candidate) => (candidate.plannedSources ?? []).every((source) => source.sourceType === 'worldgen' && source.sourceRefType === 'world'));

const blockedPages = new Set(eligibleCandidates.map((candidate) => candidate.pageTitle));
for (const forbidden of ['Paintings', 'Statues', 'Music Boxes', 'Torches', 'Block-placing wands']) {
  if (blockedPages.has(forbidden)) throw new Error(`forbidden page promoted: ${forbidden}`);
}

fs.writeFileSync('data/reports/item-source-family-policy-batches/batch-01.json', JSON.stringify({
  ...after,
  summary: {
    ...after.summary,
    eligibleCandidates: eligibleCandidates.length,
    plannedSourceRows: eligibleCandidates.flatMap((candidate) => candidate.plannedSources ?? []).length
  },
  eligibleCandidates,
  blockedCandidates: []
}, null, 2));
console.log(JSON.stringify({
  eligibleCandidates: eligibleCandidates.length,
  pages: [...new Set(eligibleCandidates.map((candidate) => candidate.pageTitle))].sort()
}, null, 2));
NODE
```

Expected: `pages` contains only `Bookcases`, `Grandfather Clocks`, `Pianos`, `Tables`, and `Work Benches`.

Run dry-run:

```bash
node scripts/data/relation/apply-item-source-candidate-local-compat.mjs \
  --input=data/reports/item-source-family-policy-batches/batch-01.json \
  --allow-bulk=true \
  --batch-id=item-source-family-policy-batch-01-2026-06-10 \
  --output=data/reports/item-source-family-policy-batch-01-dry-run.json
```

Expected:

- `blockedRows=0`
- `validationErrors=0`
- `duplicates=0` or only exact duplicates from prior work

- [ ] **Step 2.6: Apply family batch**

Only after Step 2.5 and multi-agent approval:

```bash
node scripts/data/relation/apply-item-source-candidate-local-compat.mjs \
  --input=data/reports/item-source-family-policy-batches/batch-01.json \
  --allow-bulk=true \
  --apply=true \
  --confirm-local-compat=true \
  --batch-id=item-source-family-policy-batch-01-2026-06-10 \
  --output=data/reports/item-source-family-policy-batch-01-apply.json
```

Expected: inserted count equals reviewed dry-run `toInsert`.

## Phase 3: Polluted Candidate Repair

- [ ] **Step 3.1: Split polluted pages into repair lanes**

Create `data/reports/item-source-polluted-repair-review-2026-06-10.md` with these lanes:

```md
# Item Source Polluted Repair Review - 2026-06-10

## Lane A: Goodie Bag unknown source
- Pages: Cat set, Creeper set, Fox set, Karate Tortoise set, Leprechaun set, Mummy set, Princess set, Pumpkin set, Robot set, Space Creature set, Unicorn set, Vampire set, Witch set, Wolf set, Bride of Frankenstein set, Ghost set, Pixie set, Reaper set, Treasure Hunter set
- Rule: sourceRefName "Goodie Bag" must map to item-backed ref `TreasureBag` only if local item lookup resolves an item named "Goodie Bag".
- Risk: low after item-backed resolution.

## Lane B: Flairon
- Page: Flairon
- Rule: keep Duke Fishron direct boss and Treasure Bag rows; drop or convert "Expert Mode" unknown only if it is condition text, not a source.
- Risk: medium; requires page-specific fixture.

## Lane C: Torches and Ropes
- Pages: Torches, Ropes
- Rule: do not copy full page source matrix to each item; require row-to-item matching by item name or section.
- Risk: high; extractor repair required.

## Lane D: Block-placing wands
- Page: Block-placing wands
- Rule: require item-specific table row mapping; do not reuse all wand sources for every wand.
- Risk: high; extractor repair required.
```

- [ ] **Step 3.2: Write failing Goodie Bag mapping test**

In `scripts/data/audit/build-item-source-candidate-import-plan.test.mjs`, add a fixture where `CatMask` source is `drop/unknown/Goodie Bag`, and local items include `{ id: 1774, internalName: 'GoodieBag', name: 'Goodie Bag' }`.

Expected after implementation:

```js
assert.equal(plan.summary.eligibleCandidates, 1);
assert.equal(plan.eligibleCandidates[0].plannedSources[0].sourceRefType, 'item');
assert.equal(plan.eligibleCandidates[0].plannedSources[0].sourceRefName, 'Goodie Bag');
assert.equal(plan.eligibleCandidates[0].plannedSources[0].resolutionStatus, 'resolved_item_ref');
```

Run:

```bash
node --test scripts/data/audit/build-item-source-candidate-import-plan.test.mjs
```

Expected: fail before implementation.

- [ ] **Step 3.3: Implement Goodie Bag normalization**

Modify `buildSourcePlan` in `scripts/data/audit/build-item-source-candidate-import-plan.mjs`:

- If `sourceType === 'drop'`, `sourceRefType === 'unknown'`, and `sourceRefName === 'Goodie Bag'`, rewrite to:
  - `sourceType='drop'`
  - `sourceRefType='item'`
  - `sourceRefName='Goodie Bag'`
- Resolve through `itemLookup`.

Run:

```bash
node --test scripts/data/audit/build-item-source-candidate-import-plan.test.mjs
```

Expected: pass.

- [ ] **Step 3.4: Write and implement Flairon page-specific test**

Add a test where `Flairon` has rows:

- `drop/boss/Duke Fishron`
- `treasure_bag/treasure_bag/Treasure Bag (Duke Fishron)`
- `drop/unknown/Expert Mode`

Expected:

- Direct boss row remains.
- Treasure bag row remains.
- `Expert Mode` becomes `conditions='Expert Mode'` on treasure bag row or is dropped if already represented by treasure bag source.
- Candidate becomes eligible with no unknown row.

Run:

```bash
node --test scripts/data/audit/build-item-source-candidate-import-plan.test.mjs
```

Expected: red, then green after implementation.

- [ ] **Step 3.5: Rebuild polluted plan and review**

Run:

```bash
node scripts/data/audit/build-item-source-candidate-import-plan.mjs \
  --output=data/reports/item-source-candidate-import-plan.after-polluted-lane-ab.json
```

Expected:

- Goodie Bag set pages move out of `polluted_candidate` only if source rows are now item-backed and resolved.
- `Flairon` moves out only if no unknown row remains.
- `Torches`, `Ropes`, and `Block-placing wands` remain blocked.

- [ ] **Step 3.6: Apply only reviewed polluted Lane A/B delta**

Create `data/reports/item-source-polluted-lane-ab-batches/batch-01.json` with only newly eligible Lane A/B candidates.

Run:

```bash
mkdir -p data/reports/item-source-polluted-lane-ab-batches
node --input-type=module <<'NODE'
import fs from 'node:fs';

const baseline = JSON.parse(fs.readFileSync('data/reports/item-source-candidate-import-plan.after-family-policy.json', 'utf8'));
const after = JSON.parse(fs.readFileSync('data/reports/item-source-candidate-import-plan.after-polluted-lane-ab.json', 'utf8'));
const baselineKeys = new Set((baseline.eligibleCandidates ?? []).map((candidate) => candidate.itemInternalName));
const allowedPages = new Set([
  'Cat set',
  'Creeper set',
  'Fox set',
  'Karate Tortoise set',
  'Leprechaun set',
  'Mummy set',
  'Princess set',
  'Pumpkin set',
  'Robot set',
  'Space Creature set',
  'Unicorn set',
  'Vampire set',
  'Witch set',
  'Wolf set',
  'Bride of Frankenstein set',
  'Ghost set',
  'Pixie set',
  'Reaper set',
  'Treasure Hunter set',
  'Flairon'
]);
const forbiddenPages = new Set(['Torches', 'Ropes', 'Block-placing wands']);
const eligibleCandidates = (after.eligibleCandidates ?? [])
  .filter((candidate) => !baselineKeys.has(candidate.itemInternalName))
  .filter((candidate) => allowedPages.has(candidate.pageTitle));

for (const candidate of eligibleCandidates) {
  if (forbiddenPages.has(candidate.pageTitle)) throw new Error(`forbidden polluted page promoted: ${candidate.pageTitle}`);
  for (const source of candidate.plannedSources ?? []) {
    if (source.sourceRefType === 'unknown') throw new Error(`unknown source remains for ${candidate.itemInternalName}`);
  }
}

fs.writeFileSync('data/reports/item-source-polluted-lane-ab-batches/batch-01.json', JSON.stringify({
  ...after,
  summary: {
    ...after.summary,
    eligibleCandidates: eligibleCandidates.length,
    plannedSourceRows: eligibleCandidates.flatMap((candidate) => candidate.plannedSources ?? []).length
  },
  eligibleCandidates,
  blockedCandidates: []
}, null, 2));
console.log(JSON.stringify({
  eligibleCandidates: eligibleCandidates.length,
  pages: [...new Set(eligibleCandidates.map((candidate) => candidate.pageTitle))].sort()
}, null, 2));
NODE
```

Expected: `pages` contains only Goodie Bag vanity set pages and `Flairon`; it must not contain `Torches`, `Ropes`, or `Block-placing wands`.

Dry-run:

```bash
node scripts/data/relation/apply-item-source-candidate-local-compat.mjs \
  --input=data/reports/item-source-polluted-lane-ab-batches/batch-01.json \
  --allow-bulk=true \
  --batch-id=item-source-polluted-lane-ab-batch-01-2026-06-10 \
  --output=data/reports/item-source-polluted-lane-ab-batch-01-dry-run.json
```

Apply only if dry-run has `blockedRows=0` and `validationErrors=0`:

```bash
node scripts/data/relation/apply-item-source-candidate-local-compat.mjs \
  --input=data/reports/item-source-polluted-lane-ab-batches/batch-01.json \
  --allow-bulk=true \
  --apply=true \
  --confirm-local-compat=true \
  --batch-id=item-source-polluted-lane-ab-batch-01-2026-06-10 \
  --output=data/reports/item-source-polluted-lane-ab-batch-01-apply.json
```

## Phase 4: High-Risk Polluted Extractor Repairs

- [ ] **Step 4.1: Keep Torches/Ropes/Wands blocked until item-specific row mapping exists**

Add tests proving these pages remain blocked unless extracted source rows include an item-specific key:

```js
assert.equal(plan.blockedCandidates.some((candidate) => candidate.pageTitle === 'Torches'), true);
assert.equal(plan.blockedCandidates.some((candidate) => candidate.pageTitle === 'Block-placing wands'), true);
```

- [ ] **Step 4.2: Design item-specific extractor contract**

Create `docs/superpowers/plans/2026-06-10-item-source-polluted-row-mapping.md` only if a read-only raw HTML inspection proves stable row matching is available. The follow-up plan must require these fields before any Torches/Ropes/Wands apply step:

- `sourceItemInternalName`
- `sourceItemName`
- `sourceRowHeader`
- `sourceSectionTitle`

Do not apply Torches/Ropes/Wands before this contract exists and has fixtures.

## Phase 5: Final Validation

- [ ] **Step 5.1: DB validation**

Run:

```bash
node --input-type=module <<'NODE' >/tmp/item-source-newly-inserted-ids.txt
import fs from 'node:fs';

const reports = [
  'data/reports/item-source-family-policy-batch-01-apply.json',
  'data/reports/item-source-polluted-lane-ab-batch-01-apply.json'
].filter((file) => fs.existsSync(file));
const ids = reports.flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')).insertedIds ?? []);
console.log([...new Set(ids)].join(','));
NODE
cat /tmp/item-source-newly-inserted-ids.txt
```

If the file is empty, no DB write happened in this execution path and DB validation should be skipped. If it contains IDs, run:

```bash
IDS="$(cat /tmp/item-source-newly-inserted-ids.txt)"
MYSQL_PWD="${TERRAPEDIA_DB_PASSWORD:-root}" mysql \
  -h "${TERRAPEDIA_DB_HOST:-127.0.0.1}" \
  -P "${TERRAPEDIA_DB_PORT:-13306}" \
  -u "${TERRAPEDIA_DB_USERNAME:-root}" \
  "${TERRAPEDIA_DB_NAME:-terria_v1_local}" \
  -e "SELECT COUNT(*) AS inserted_rows FROM item_acquisition_sources WHERE id IN (${IDS}) AND status=1 AND deleted=0;
      SELECT COUNT(*) AS bad_item_refs
      FROM item_acquisition_sources s
      LEFT JOIN items i ON i.id=s.item_id AND i.status=1 AND i.deleted=0
      WHERE s.id IN (${IDS}) AND i.id IS NULL;
      SELECT COUNT(*) AS bad_item_backed_refs
      FROM item_acquisition_sources s
      LEFT JOIN items ref ON ref.id=s.source_ref_id AND ref.status=1 AND ref.deleted=0
      WHERE s.id IN (${IDS}) AND s.source_ref_type IN ('item','container','crate','treasure_bag') AND ref.id IS NULL;
      SELECT COUNT(*) AS bad_npc_backed_refs
      FROM item_acquisition_sources s
      LEFT JOIN npcs n ON n.id=s.source_ref_id AND n.status=1 AND n.deleted=0
      WHERE s.id IN (${IDS}) AND s.source_ref_type IN ('npc','boss') AND n.id IS NULL;"
```

Expected: `inserted_rows` equals the inserted ID count; all `bad_*` counts are `0`.

- [ ] **Step 5.2: API smoke**

Run representative checks:

```bash
node --input-type=module <<'NODE' >/tmp/item-source-smoke-item-ids.txt
import fs from 'node:fs';

const reports = [
  'data/reports/item-source-family-policy-batch-01-apply.json',
  'data/reports/item-source-polluted-lane-ab-batch-01-apply.json'
].filter((file) => fs.existsSync(file));
const itemIds = reports.flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')).plannedRows ?? [])
  .map((row) => row.itemId)
  .filter((id) => Number.isInteger(id));
console.log([...new Set(itemIds)].slice(0, 8).join('\n'));
NODE
while read -r ITEM_ID; do
  [ -n "$ITEM_ID" ] || continue
  curl -fsS "http://127.0.0.1:18088/api/public/items/${ITEM_ID}/sources" | node -e "let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{const j=JSON.parse(s); if(!j.data || j.data.length===0) process.exit(1); console.log('${ITEM_ID}', j.data.length);});"
done </tmp/item-source-smoke-item-ids.txt
```

Expected: every sampled item prints a non-zero source count. Manually inspect at least one family item and one polluted Lane A/B item for correct source names and no polluted cross-item rows.

- [ ] **Step 5.3: UI smoke**

Run:

```bash
while read -r ITEM_ID; do
  [ -n "$ITEM_ID" ] || continue
  curl -fsS -o "/tmp/item-source-${ITEM_ID}.html" -w "${ITEM_ID} %{http_code} %{content_type}\n" "http://127.0.0.1:5174/items/${ITEM_ID}"
  rg -n "来源|Source|source" "/tmp/item-source-${ITEM_ID}.html"
done </tmp/item-source-smoke-item-ids.txt
```

Expected: each page returns `200 text/html;charset=utf-8`; rendered HTML includes the source section text.

- [ ] **Step 5.4: Test suite**

Run:

```bash
node --test scripts/data/audit/item-source-family-page-policy.test.mjs \
  scripts/data/audit/build-item-source-candidate-import-plan.test.mjs \
  scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs
mvn test -Dtest=ItemSourceServiceImplTest,PublicItemRelationControllerTest
git diff --check
```

Expected: all pass.

## Commit Scope

- Commit 1: remaining-list reports and plan.
- Commit 2: family policy helper and read-only plan promotion.
- Commit 3: reviewed family apply reports/backups.
- Commit 4: polluted Lane A/B repairs and reviewed apply reports/backups.

Do not include crawler outputs, raw wiki refreshes, production DB dumps, or unrelated UI changes.

## Residual Risks

- `Paintings`, `Statues`, and `Music Boxes` are large and likely need item-specific source extraction; they remain blocked until policy proves safe.
- `Torches`, `Ropes`, and `Block-placing wands` are polluted matrix pages; keep blocked until table row-to-item mapping exists.
- A family allowlist mistake can create many incorrect rows quickly, so every family batch needs explicit page-level review before apply.
