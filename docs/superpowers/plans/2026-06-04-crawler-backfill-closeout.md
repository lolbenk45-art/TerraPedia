# Crawler Backfill Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining TerraPedia crawler/backfill gaps after item page parsing by proving which lanes are already complete, only fetching true missing evidence, and importing verified data through maint/relation/local with monitor-visible progress for any network crawler.

**Architecture:** Treat existing local evidence and DB rows as source candidates before crawling. Each lane has a read-only audit first, then a narrow refresh only if the audit proves missing source evidence, then dry-run/apply checkpoints. All network fetch work must write a stable progress file before the first request and must be visible on the standalone monitor at `http://127.0.0.1:3099/` or through a registered crawler-monitor progress lane. Crawler progress paths must not overwrite the completed item page progress lane.

**Tech Stack:** Node.js ESM scripts, Python town NPC fetch where already established, MySQL `terria_v1_maint` / `terria_v1_relation` / `terria_v1_local`, existing TerraPedia data scripts, `node:test`, standalone crawler monitor on port `3099`.

---

## Current Baseline - 2026-06-04

- Item pages are not part of this work except as upstream context: raw `6131`, landing current `6131`, maint item pages current `6131`, monitor `item-raw-pages-parse completed 6131/6131`.
- Armor DB: `maint_armor_sets=63`, `maint_armor_set_images=175`, armor item image evidence report `armorItemCount=671`, `candidateCount=578`, `unresolvedCount=0`.
- Town NPC source report: `recordCount=39`, `scrapedCount=39`, `livingPreferenceCount=191`, `errorCount=0`.
- Projectiles: standardized `1111`, maint `1111`, image missing `1`, zh name missing `105`, backfill apply report exists.
- Buffs: standardized `388`, maint `388`, image missing `0`, zh tooltip missing `48`, `buff-evidence-refresh completed 48/48`.
- Standalone monitor: `http://127.0.0.1:3099/`, read-only, currently up.
- Some 2026-06-04 generated reports are untracked artifacts in the main worktree (`/home/lolben/TerraPedia/reports`) and may not exist in this clean plan worktree. Execution must either read those reports by absolute path or regenerate equivalent read-only reports before depending on them.

## Scope

In scope:
- Read-only audits for armor images, town NPC living preferences, projectile residual zh/image, and buff missing tooltips.
- Narrow source refresh only where an audit proves local evidence is absent or stale.
- Dry-run/apply import steps through existing maint/relation/local scripts.
- Progress-contract repair before any network fetch that lacks live monitor progress.
- Focused commits per lane or per completed checkpoint.

Out of scope:
- Re-crawling item pages.
- Deleting raw item-page source files.
- Running broad `import-standardized-to-db.mjs` or broad local materialization as a first step.
- Treating standardized top-level image absence as missing when DB/API/projection already has managed images.
- Processing all 762 NPCs for living preferences; only 39 town NPCs are in scope.

## Files And Surfaces

Likely read-only audit/report scripts:
- `scripts/data/audit/audit-armor-set-source-coverage.mjs`
- `scripts/data/audit/audit-armor-set-completeness.mjs`
- `scripts/data/audit/audit-town-npc-shop-runtime.mjs`
- `scripts/data/backfill/backfill-projectile-zh-and-images.mjs`

Important mutation boundaries:
- `scripts/data/workflow/run-image-sync.mjs` mutates its input when `--apply=true`; use `--apply=false` first.
- `scripts/data/fetch/refresh-target-buff-page-evidence.mjs` and `scripts/data/fetch/refresh-buff-page-evidence-batch.mjs` can rewrite `data/standardized/buffs.standardized.json` unless `--output` is redirected to a temp file or `--dry-run=true` is supported for the chosen entrypoint.
- `scripts/data/pipeline/run-town-npc-sync-pipeline.mjs` chains fetch, image sync, and import; do not use it for the first write. Split fetch/image/import when executing this plan.

Likely write/import scripts, only after dry-run review:
- `scripts/data/workflow/run-image-sync.mjs`
- `scripts/data/maint/sync-armor-item-image-evidence-to-maint.mjs`
- `scripts/data/relation/upsert-armor-item-image-evidence-to-local.mjs`
- `scripts/data/pipeline/run-town-npc-sync-pipeline.mjs`
- `scripts/data/import/import-wiki-town-npcs-to-db.mjs`
- `scripts/data/relation/sync-maint-to-relation.mjs`

Crawler/fetch scripts that require progress validation before execution:
- `scripts/data/fetch/fetch-wiki-armor-set-images.mjs`
- `scripts/data/fetch/fetch-wiki-armor-sets.mjs`
- `scripts/data/fetch/refresh-buff-page-evidence-batch.mjs`
- `scripts/data/fetch/refresh-target-buff-page-evidence.mjs`
- `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py`

Progress-path safety:
- Armor set fetch currently defaults to `data/generated/wiki-sync-progress.latest.json`; do not run it until a dedicated registered path or backend-refresh child status is in place so it cannot overwrite item progress.
- Buff batch refresh must use the monitor-registered path `data/generated/fetch-wiki-buffs-progress.latest.json` or the script/monitor must be repaired before rerun.
- Town NPC maintenance fetch is registered as `domain-source-town-npc-maintenance` with `data/generated/domain-source-town-npc-maintenance-progress.latest.json`.

DB tables to validate:
- `terria_v1_maint.maint_armor_sets`
- `terria_v1_maint.maint_armor_set_images`
- `terria_v1_maint.maint_item_images`
- `terria_v1_maint.maint_npcs`
- `terria_v1_maint.maint_projectiles`
- `terria_v1_maint.maint_buffs`
- `terria_v1_local.npcs` for town NPC living preferences.
- `terria_v1_local.item_images` and `terria_v1_relation.projection_armor_sets` for public armor image display.
- relation/local projection tables identified by the lane dry-runs.

Generated reports are not committed unless they are compact evidence needed for closure.

---

### Task 1: Baseline Closeout Audit

**Files:**
- Create: `reports/crawler-backfill-closeout-baseline-2026-06-04.json` if a compact generated report is useful; do not commit by default.
- Modify: none initially.

- [ ] **Step 1: Verify monitor and current DB counts**

Run:

```bash
curl -sS http://127.0.0.1:3099/api/state | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); const p=j.progress?.payload||{}; const b=j.buffProgress?.payload||{}; console.log(JSON.stringify({item:{raw:j.itemPages?.rawCount,actionId:p.actionId,status:p.status,current:p.current,total:p.total},buff:{actionId:b.actionId,status:b.status,current:b.current,total:b.total}},null,2));})"
mysql -h 127.0.0.1 -P 13306 -uroot -proot -N -e "SELECT 'item_pages', COUNT(*) FROM terria_v1_maint.maint_item_pages WHERE deleted=0 AND status=1; SELECT 'armor_sets', COUNT(*) FROM terria_v1_maint.maint_armor_sets WHERE deleted=0 AND status=1; SELECT 'armor_set_images', COUNT(*) FROM terria_v1_maint.maint_armor_set_images WHERE deleted=0 AND status=1; SELECT 'npcs', COUNT(*) FROM terria_v1_maint.maint_npcs WHERE deleted=0 AND status=1; SELECT 'projectiles', COUNT(*) FROM terria_v1_maint.maint_projectiles WHERE deleted=0 AND status=1; SELECT 'buffs', COUNT(*) FROM terria_v1_maint.maint_buffs WHERE deleted=0 AND status=1;"
ps -eo pid,etimes,cmd | rg 'node .*crawl|node .*fetch-wiki|node .*run-wiki-sync|node .*run-backend-data-refresh|python.*fetch-wiki-town|refresh-buff|armor-set|projectile' || true
```

Expected:
- item parse completed `6131/6131`.
- buff refresh completed `48/48`.
- maint counts match the current baseline.
- no active crawler writer is using the same output or progress path.

- [ ] **Step 1.5: Locate reusable generated evidence**

In a clean worktree, generated reports may be absent. Prefer the main worktree report if it exists; otherwise regenerate a read-only report before using that lane.

```bash
MAIN_WORKTREE=/home/lolben/TerraPedia
for f in \
  reports/armor-item-image-evidence-2026-06-04.json \
  reports/projectile-zh-image-backfill-apply-2026-06-04.json \
  reports/projectile-zh-image-residual-classification-2026-06-04.json \
  reports/buffs/buff-evidence-refresh-missing-tooltips-2026-06-04.json \
  reports/wiki-town-npc-maintenance-2026-06-03T10-11-45-819Z.json
do
  test -f "$f" && echo "worktree:$f" && continue
  test -f "$MAIN_WORKTREE/$f" && echo "main:$MAIN_WORKTREE/$f" && continue
  echo "missing:$f"
done
```

Expected:
- No lane may depend on a `missing:` report.
- If the report only exists in the main worktree, pass its absolute path to later commands and do not commit the report by default.

- [ ] **Step 2: Classify each lane as fetch-needed or import/parse-needed**

Run read-only report summaries:

```bash
node - <<'NODE'
const fs = require('fs');
const base = process.env.MAIN_WORKTREE || process.cwd();
const files = [
  'reports/armor-item-image-evidence-2026-06-04.json',
  'reports/projectile-zh-image-backfill-apply-2026-06-04.json',
  'reports/projectile-zh-image-residual-classification-2026-06-04.json',
  'reports/buffs/buff-evidence-refresh-missing-tooltips-2026-06-04.json',
  'reports/wiki-town-npc-maintenance-2026-06-03T10-11-45-819Z.json'
];
for (const file of files) {
  const candidate = fs.existsSync(file) ? file : `${base}/${file}`;
  if (!fs.existsSync(candidate)) throw new Error(`missing required report: ${file}`);
  const payload = JSON.parse(fs.readFileSync(candidate, 'utf8'));
  console.log(file);
  console.log(JSON.stringify(payload.summary || payload, null, 2).slice(0, 1600));
}
NODE
```

Closure:
- Do not crawl lanes where source evidence already exists and the remaining issue is import/API/UI mapping.
- Repair this plan if the report files are missing or stale.

---

### Task 2: Armor Image Chain Acceptance First

**Files:**
- Use: `scripts/data/backfill/build-armor-item-image-evidence.mjs`
- Use: `scripts/data/maint/sync-armor-item-image-evidence-to-maint.mjs`
- Use: `scripts/data/relation/upsert-armor-item-image-evidence-to-local.mjs`
- Use: `scripts/data/workflow/run-image-sync.mjs`
- Test: `scripts/data/backfill/build-armor-item-image-evidence.test.mjs`
- Test: `scripts/data/maint/sync-armor-item-image-evidence-to-maint.test.mjs`
- Test: `scripts/data/relation/upsert-armor-item-image-evidence-to-local.test.mjs`

Armor chain separation:
- Armor set wear/display images: `maint_armor_set_images` -> `terria_v1_relation.projection_armor_sets.male_images/female_images/special_images`.
- Armor single item icon fallback images: armor item evidence -> `maint_item_images` -> `terria_v1_local.item_images` -> public armor API fallback or related-item images.

- [ ] **Step 1: Run focused tests for existing armor image chain**

```bash
node --test scripts/data/backfill/build-armor-item-image-evidence.test.mjs scripts/data/maint/sync-armor-item-image-evidence-to-maint.test.mjs scripts/data/relation/upsert-armor-item-image-evidence-to-local.test.mjs scripts/data/workflow/armor-set-managed-image-index.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Audit current DB/API coverage before crawling**

```bash
mysql -h 127.0.0.1 -P 13306 -uroot -proot -N -e "SELECT 'maint_armor_sets', COUNT(*) FROM terria_v1_maint.maint_armor_sets WHERE deleted=0 AND status=1; SELECT 'maint_armor_set_images', COUNT(*) FROM terria_v1_maint.maint_armor_set_images WHERE deleted=0 AND status=1; SELECT image_role, COUNT(*) FROM terria_v1_maint.maint_armor_set_images WHERE deleted=0 AND status=1 GROUP BY image_role ORDER BY image_role; SELECT 'maint_item_images', COUNT(*) FROM terria_v1_maint.maint_item_images WHERE deleted=0 AND status=1; SELECT 'local_item_images', COUNT(*) FROM terria_v1_local.item_images WHERE deleted=0 AND status=1;"
MAIN_WORKTREE=/home/lolben/TerraPedia node - <<'NODE'
const fs = require('fs');
const file = fs.existsSync('reports/armor-item-image-evidence-2026-06-04.json')
  ? 'reports/armor-item-image-evidence-2026-06-04.json'
  : `${process.env.MAIN_WORKTREE}/reports/armor-item-image-evidence-2026-06-04.json`;
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const candidates = Array.isArray(j.candidates) ? j.candidates : [];
const cached = candidates.filter((r) => r.cachedUrl).length;
console.log(JSON.stringify({
  armorItemCount: j.summary?.armorItemCount,
  candidateCount: j.summary?.candidateCount,
  unresolvedCount: j.summary?.unresolvedCount,
  candidates: candidates.length,
  cachedUrlCandidates: cached
}, null, 2));
NODE
```

Expected:
- Confirms whether armor set images are already present in maint.
- Does not infer missing from `armor_sets.standardized.json` top-level image absence alone.
- Evidence must show `armorItemCount=671`, `candidateCount=578`, `unresolvedCount=0`, and `cachedUrlCandidates=578` before maint/local import is considered.

- [ ] **Step 3: If current evidence is enough, run managed image sync dry-run before relation/local dry-run**

Use existing reports first. If a fresh dry-run is required:

```bash
EVIDENCE=/home/lolben/TerraPedia/reports/armor-item-image-evidence-2026-06-04.json
node scripts/data/workflow/run-image-sync.mjs --apply=false --scopes=armor_item_images --input="$EVIDENCE" --output=reports/workflow-image-sync-armor-item-images-dry-run-2026-06-04-rerun.json --progress-path=data/generated/armor-item-image-sync-progress.latest.json
node scripts/data/maint/sync-armor-item-image-evidence-to-maint.mjs --apply=false --evidence="$EVIDENCE" --output=reports/relation/armor-item-image-evidence-maint-sync-dry-run-2026-06-04-rerun.json
node scripts/data/relation/upsert-armor-item-image-evidence-to-local.mjs --apply=false --evidence="$EVIDENCE" --output=reports/relation/armor-item-image-evidence-local-upsert-dry-run-2026-06-04-rerun.json
```

Expected:
- `unresolvedCount=0` remains true for armor item evidence.
- Writes are understandable before apply.
- `run-image-sync` reports no missing managed URL fields before maint/local sync.

- [ ] **Step 3.5: Add public API smoke validation before calling armor complete**

```bash
curl -sS http://127.0.0.1:8080/api/public/armor-sets | head -c 2000
```

Expected:
- Public list/detail responses expose managed URLs in set image fields or fallback item image fields.
- If the backend port differs, verify the actual public armor API route before marking the lane closed.

- [ ] **Step 4: Only if missing source evidence remains, repair or verify fetch progress before running armor fetch**

Before any network fetch, run:

```bash
node --test scripts/data/fetch/fetch-wiki-armor-set-images.test.mjs scripts/data/fetch/fetch-wiki-armor-sets-progress.test.mjs
```

Required before execution:
- stable action id,
- dedicated progress path that does not overwrite `data/generated/wiki-sync-progress.latest.json`,
- running heartbeat before first request,
- final completed/failed status,
- monitor visibility on 3099 or registered backend monitor lane.

Do not run `fetch-wiki-armor-set-images.mjs` until this gate passes. If no dedicated registered path exists, repair the progress contract first instead of fetching.

---

### Task 3: Town NPC Living Preference Import Chain

**Files:**
- Use: `data/generated/wiki-town-npc-maintenance.latest.json`
- Use: `reports/wiki-town-npc-maintenance-2026-06-03T10-11-45-819Z.json`
- Use: `scripts/data/pipeline/run-town-npc-sync-pipeline.mjs`
- Use: `scripts/data/import/import-wiki-town-npcs-to-db.mjs`
- Test: `scripts/data/pipeline/town-npc-sync-args.test.mjs`
- Test: `scripts/data/import/import-wiki-town-npcs-to-db.test.mjs`
- Test: `back/src/test/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapperTest.java`

- [ ] **Step 1: Confirm source evidence covers 39 town NPCs**

```bash
MAIN_WORKTREE=/home/lolben/TerraPedia node - <<'NODE'
const fs = require('fs');
const report = fs.existsSync('reports/wiki-town-npc-maintenance-2026-06-03T10-11-45-819Z.json')
  ? 'reports/wiki-town-npc-maintenance-2026-06-03T10-11-45-819Z.json'
  : `${process.env.MAIN_WORKTREE}/reports/wiki-town-npc-maintenance-2026-06-03T10-11-45-819Z.json`;
const latest = fs.existsSync('data/generated/wiki-town-npc-maintenance.latest.json')
  ? 'data/generated/wiki-town-npc-maintenance.latest.json'
  : `${process.env.MAIN_WORKTREE}/data/generated/wiki-town-npc-maintenance.latest.json`;
const reportPayload = JSON.parse(fs.readFileSync(report, 'utf8'));
const latestPayload = JSON.parse(fs.readFileSync(latest, 'utf8'));
console.log(JSON.stringify({
  reportSummary: reportPayload.summary,
  latestRecords: latestPayload.records?.length,
  latestLivingPreferences: latestPayload.records?.reduce((sum, r) => sum + (Array.isArray(r.livingPreferences) ? r.livingPreferences.length : 0), 0)
}, null, 2));
NODE
```

Expected:
- `recordCount=39`, `scrapedCount=39`, `livingPreferenceCount=191`, `errorCount=0`.
- latest source file has 39 records; if it only exists in the main worktree, use an absolute input path for import tests/dry-runs.

- [ ] **Step 2: Verify existing import/runtime path before crawling**

```bash
node --test scripts/data/pipeline/town-npc-sync-args.test.mjs scripts/data/import/import-wiki-town-npcs-to-db.test.mjs
cd back && mvn "-Dtest=TownNpcMaintenanceDomainMapperTest" test
```

Expected:
- Tests pass or reveal the exact missing import/API mapping.

- [ ] **Step 3: Inspect DB/API projection fields**

```bash
mysql -h 127.0.0.1 -P 13306 -uroot -proot -N -e "SHOW COLUMNS FROM terria_v1_local.npcs; SELECT 'local_all_npcs', COUNT(*) FROM terria_v1_local.npcs WHERE deleted=0 AND status=1; SELECT 'local_town_npcs', COUNT(*) FROM terria_v1_local.npcs WHERE deleted=0 AND status=1 AND COALESCE(is_town_npc,0)=1; SELECT 'town_pref', COUNT(*) FROM terria_v1_local.npcs WHERE deleted=0 AND status=1 AND COALESCE(is_town_npc,0)=1 AND living_preferences_json IS NOT NULL AND living_preferences_json<>''; SELECT 'non_town_pref', COUNT(*) FROM terria_v1_local.npcs WHERE deleted=0 AND status=1 AND COALESCE(is_town_npc,0)=0 AND living_preferences_json IS NOT NULL AND living_preferences_json<>'';"
```

Expected:
- `local_town_npcs=39`.
- `non_town_pref=0`.
- Any missing town preference count is an import/API mapping issue unless the source report is missing or stale.

If living preference fields are absent from DB/API, implement the smallest mapper/import repair. Do not crawl all 762 NPCs.

- [ ] **Step 3.5: Split any town NPC writes**

Do not run `run-town-npc-sync-pipeline.mjs` as the first write because it combines fetch, image sync, and import. If import is needed, run the importer in dry-run mode or with a temp output/report first, review the target DB/tables, then apply only to `terria_v1_local.npcs` and related town NPC shop/profile tables.

- [ ] **Step 4: Only if source evidence is missing or stale, verify progress then rerun town NPC fetch**

```bash
python3 -c "import bs4"
node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs
```

Do not run `fetch-wiki-town-npc-maintenance.py` until progress contract passes and 3099 visibility is known for `domain-source-town-npc-maintenance` / `data/generated/domain-source-town-npc-maintenance-progress.latest.json`.

---

### Task 4: Projectile Residual Classification, Not Broad Crawling

**Files:**
- Use: `scripts/data/backfill/backfill-projectile-zh-and-images.mjs`
- Test: `scripts/data/backfill/backfill-projectile-zh-and-images.test.mjs`
- Use: `reports/projectile-zh-image-backfill-apply-2026-06-04.json`
- Use: `reports/projectile-zh-image-residual-classification-2026-06-04.json`

- [ ] **Step 1: Run projectile backfill tests**

```bash
node --test scripts/data/backfill/backfill-projectile-zh-and-images.test.mjs
```

Expected: pass.

- [ ] **Step 2: Verify current residuals**

```bash
node - <<'NODE'
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('data/standardized/projectiles.standardized.json','utf8'));
const records = Array.isArray(p) ? p : p.records;
const noImage = records.filter((r) => !(r.imageUrl || r.image_url || r.image || r.localized?.imageUrl));
const noZh = records.filter((r) => !(r.nameZh || r.name_zh || r.zhName || r.localized?.zh?.name));
console.log(JSON.stringify({ total: records.length, noImage: noImage.length, noZh: noZh.length, noImageSample: noImage.slice(0, 10).map((r) => r.internalName || r.name), noZhSample: noZh.slice(0, 20).map((r) => r.internalName || r.name) }, null, 2));
NODE
```

Expected:
- `noImage=1`, `noZh=105` unless previous work changed it.

- [ ] **Step 3: Classify 105 zh residuals**

Use existing residual classification report first. If stale, generate a new read-only report with no apply:

```bash
MAIN_WORKTREE=/home/lolben/TerraPedia node - <<'NODE'
const fs = require('fs');
const report = fs.existsSync('reports/projectile-zh-image-residual-classification-2026-06-04.json')
  ? 'reports/projectile-zh-image-residual-classification-2026-06-04.json'
  : `${process.env.MAIN_WORKTREE}/reports/projectile-zh-image-residual-classification-2026-06-04.json`;
if (!fs.existsSync(report)) throw new Error('missing projectile residual classification report; rerun backfill in no-apply/report mode before crawling');
const j = JSON.parse(fs.readFileSync(report, 'utf8'));
console.log(JSON.stringify({
  totalProjectiles: j.totalProjectiles,
  unresolvedZh: j.unresolvedZh,
  unresolvedImage: j.unresolvedImage,
  unresolvedZhByReason: j.unresolvedZhByReason,
  actionableApplyWithoutManualTranslation: j.actionableApplyWithoutManualTranslation
}, null, 2));
NODE
```

Closure categories:
- missing language-pack key,
- projectile variant shares another zh name,
- internal/test projectile,
- needs manual mapping.

Expected:
- classification total covers all `unresolvedZh=105`.
- `unresolvedImage=1` has a reason before any fetch is considered.
- `actionableApplyWithoutManualTranslation=0` means this lane is not crawl-fixable without manual mapping.

Do not run new network crawling unless the one missing image points to a source that is absent from local managed images and wiki evidence.

---

### Task 5: Buff Tooltip Residual Classification

**Files:**
- Use: `scripts/data/fetch/refresh-target-buff-page-evidence.mjs`
- Use: `scripts/data/fetch/refresh-buff-page-evidence-batch.mjs`
- Test: `scripts/data/fetch/refresh-target-buff-page-evidence.test.mjs`
- Test: `scripts/data/fetch/refresh-buff-page-evidence-batch.test.mjs`
- Use: `reports/buffs/buff-evidence-refresh-missing-tooltips-2026-06-04.json`

- [ ] **Step 1: Run buff evidence tests**

```bash
node --test scripts/data/fetch/refresh-target-buff-page-evidence.test.mjs scripts/data/fetch/refresh-buff-page-evidence-batch.test.mjs
```

Expected: pass.

- [ ] **Step 2: Verify 48 missing tooltip residuals**

```bash
node - <<'NODE'
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('data/standardized/buffs.standardized.json','utf8'));
const records = Array.isArray(p) ? p : p.records;
const missing = records.filter((r) => !r.localized?.zh?.tooltip);
console.log(JSON.stringify({ total: records.length, missingTooltipZh: missing.length, sample: missing.slice(0, 30).map((r) => ({ id: r.id, internalName: r.internalName, name: r.englishName || r.name, page: r.localized?.en?.page })) }, null, 2));
NODE
```

Expected:
- `missingTooltipZh=48` unless previous work changed it.

- [ ] **Step 3: Classify why refresh patched zero rows**

Read:

```bash
MAIN_WORKTREE=/home/lolben/TerraPedia node - <<'NODE'
const fs = require('fs');
const report = fs.existsSync('reports/buffs/buff-evidence-refresh-missing-tooltips-2026-06-04.json')
  ? 'reports/buffs/buff-evidence-refresh-missing-tooltips-2026-06-04.json'
  : `${process.env.MAIN_WORKTREE}/reports/buffs/buff-evidence-refresh-missing-tooltips-2026-06-04.json`;
if (!fs.existsSync(report)) throw new Error('missing buff evidence report; rerun only after progress path is monitor-registered');
const j = JSON.parse(fs.readFileSync(report, 'utf8'));
console.log(JSON.stringify({totalSelected:j.totalSelected,categories:j.categories,entries:j.entries?.slice(0,20)},null,2));
NODE
```

Closure:
- If entries are legacy/redirect/not_modified with no usable tooltip, classify them as not crawl-fixable.
- If a language-pack source can fill them, plan a mapping patch instead of another wiki page fetch.
- If any fetch actually failed, rerun only those targets after progress contract is verified.
- If rerun is needed, use `--progress-path=data/generated/fetch-wiki-buffs-progress.latest.json` or repair the script/monitor mismatch first.
- If rerun writes standardized data, redirect `--output` to a temp path for review before applying.

---

### Task 6: Final Verification And Commit

**Files:**
- Commit only plan and code/test changes produced by this branch.
- Do not commit bulky generated reports unless explicitly selected as compact evidence.

- [ ] **Step 1: Run lane tests touched by execution**

Minimum if no code changed:

```bash
node --test scripts/data/backfill/build-armor-item-image-evidence.test.mjs scripts/data/backfill/backfill-projectile-zh-and-images.test.mjs scripts/data/fetch/refresh-target-buff-page-evidence.test.mjs scripts/data/fetch/refresh-buff-page-evidence-batch.test.mjs scripts/data/pipeline/town-npc-sync-args.test.mjs scripts/data/import/import-wiki-town-npcs-to-db.test.mjs
```

Add Java/API/UI tests if importer/API/frontend surfaces are changed.

- [ ] **Step 2: Verify monitor and DB state**

```bash
curl -sS http://127.0.0.1:3099/api/state | head -c 1000
mysql -h 127.0.0.1 -P 13306 -uroot -proot -N -e "SELECT 'armor_set_images', COUNT(*) FROM terria_v1_maint.maint_armor_set_images WHERE deleted=0 AND status=1; SELECT 'projectiles', COUNT(*) FROM terria_v1_maint.maint_projectiles WHERE deleted=0 AND status=1; SELECT 'buffs', COUNT(*) FROM terria_v1_maint.maint_buffs WHERE deleted=0 AND status=1; SELECT 'npcs', COUNT(*) FROM terria_v1_maint.maint_npcs WHERE deleted=0 AND status=1;"
```

- [ ] **Step 3: Commit focused branch work**

```bash
git status --short
git diff --name-only
git diff --cached --name-only
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only | rg '^(reports|data/generated|data/raw|logs|\\.tmp)' && { echo "generated artifact staged unexpectedly"; exit 1; } || true
git add docs/superpowers/plans/2026-06-04-crawler-backfill-closeout.md <changed-code-files-only>
git commit -m "docs(data): plan crawler backfill closeout"
```

If execution also changes scripts/imports, use a second focused commit for implementation.

## Multi-Agent Review Plan

- Agent A: armor image chain reviewer. Owns read-only review of armor evidence, maint/relation/local image flow, and whether additional wiki crawling is justified.
- Agent B: NPC/projectile/buff residual reviewer. Owns read-only review of town NPC living preference import path, projectile residual categories, and buff missing tooltip categories.
- Agent C: plan safety reviewer. Owns progress-contract, DB write boundary, monitor visibility, and commit-scope review.

Agents must not write files or run mutating DB/network commands during review.

## Acceptance Criteria

- Item is explicitly marked complete and excluded from new crawling.
- Every remaining lane has a current state, source of truth, next action, and no-crawl/crawl decision.
- Any crawler/fetch execution is monitor-visible before it starts.
- DB writes are preceded by dry-run reports and followed by DB/API validation.
- Town NPC closure proves `local_town_npcs=39`, source evidence covers `39/39`, and `non_town_pref=0`.
- Projectile closure proves the `105` zh residuals and `1` image residual are classified; no broad projectile crawler is needed unless the single image residual has no local/wiki evidence.
- Buff closure proves the `48` tooltip residuals are classified; repeated fetch is only allowed for real failed targets and must use the monitor-registered progress path.
- Armor closure proves set wear/display images and single-item fallback images separately; API smoke must show managed image URLs in public armor responses or explain the remaining projection gap.
- The branch ends with focused commits and no unrelated staged files.
