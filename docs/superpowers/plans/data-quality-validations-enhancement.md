# Data Quality Validations Enhancement

This document specifies the data quality validation enhancements to be added to the plan at `/home/lolben/.config/superpowers/worktrees/TerraPedia/plan-item-category-taxonomy-repair-2026-05-29/docs/superpowers/plans/2026-05-29-item-category-standardized-inference-fallback.md`.

## Enhancement 1: Data Freshness Check

**Location:** Task 2, Step 3 (Implement sync fallback mode)

**Addition:** Add validation step that checks timestamp/version of standardized data files before inference.

### Implementation Details

In `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`, add at the beginning of the sync function:

```js
// Data freshness validation
async function validateDataFreshness(repoRoot) {
  const itemsPath = path.join(repoRoot, 'data/standardized/items.standardized.json');
  const itemPagesPath = path.join(repoRoot, 'data/standardized/item_pages.standardized.json');
  
  const itemsStats = await fs.stat(itemsPath);
  const itemPagesStats = await fs.stat(itemPagesPath);
  
  const now = Date.now();
  const itemsAge = now - itemsStats.mtimeMs;
  const itemPagesAge = now - itemPagesStats.mtimeMs;
  
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  const warnings = [];
  if (itemsAge > MAX_AGE_MS) {
    warnings.push({
      file: 'items.standardized.json',
      ageInDays: Math.floor(itemsAge / (24 * 60 * 60 * 1000)),
      lastModified: itemsStats.mtime.toISOString(),
    });
  }
  if (itemPagesAge > MAX_AGE_MS) {
    warnings.push({
      file: 'item_pages.standardized.json',
      ageInDays: Math.floor(itemPagesAge / (24 * 60 * 60 * 1000)),
      lastModified: itemPagesStats.mtime.toISOString(),
    });
  }
  
  return {
    itemsLastModified: itemsStats.mtime.toISOString(),
    itemPagesLastModified: itemPagesStats.mtime.toISOString(),
    warnings,
  };
}
```

Add to report fields:

```js
{
  dataFreshness: {
    itemsLastModified: '2026-05-20T10:30:00.000Z',
    itemPagesLastModified: '2026-05-20T10:30:00.000Z',
    warnings: [
      {
        file: 'items.standardized.json',
        ageInDays: 9,
        lastModified: '2026-05-20T10:30:00.000Z',
      }
    ],
  },
}
```

Call this function when `fallbackMode === 'standardized_inference'` and include results in the report.

---

## Enhancement 2: Field Fallback Logging

**Location:** Task 1, Step 3 (Implement minimal inference library)

**Addition:** Modify the inference library implementation to log warnings when falling back from camelCase to snake_case.

### Implementation Details

In `scripts/data/lib/item-category-inference.mjs`, replace the inference function with:

```js
export function inferCategoryFromStandardizedRecord({ item, itemPage = null } = {}) {
  // Supports both camelCase (standardized JSON) and snake_case (DB rows) field names
  // This dual-format support is permanent to handle both data sources
  const internalName = text(item?.internalName ?? item?.internal_name);
  
  // Log field fallback warnings
  logFieldFallback(item, 'internalName', 'internal_name', internalName);
  
  if (!internalName || !hasMatchingItemPage(internalName, itemPage)) {
    return createFailureResult(internalName, itemPage, 'missing_metadata');
  }

  const currentCategoryCode = code(item?.categoryCode ?? item?.category_code);
  const stackSize = Number(item?.stack?.stackSize ?? item?.stack_size ?? 0);
  const damage = Number(item?.stats?.damage ?? item?.damage ?? 0);
  const defense = Number(item?.stats?.defense ?? item?.defense ?? 0);

  // Log field fallback warnings for all fields
  logFieldFallback(item, 'categoryCode', 'category_code', currentCategoryCode);
  if (!item?.stack?.stackSize && item?.stack_size !== undefined) {
    console.warn(`[inference] Field fallback: using snake_case 'stack_size' for ${internalName}`);
  }
  if (!item?.stats?.damage && item?.damage !== undefined) {
    console.warn(`[inference] Field fallback: using snake_case 'damage' for ${internalName}`);
  }
  if (!item?.stats?.defense && item?.defense !== undefined) {
    console.warn(`[inference] Field fallback: using snake_case 'defense' for ${internalName}`);
  }

  const baseEvidence = {
    internalName,
    itemPageMatch: true,
    currentCategoryCode,
    stackSize,
    damage,
    defense,
  };

  if (
    currentCategoryCode === 'MATERIAL'
    && stackSize === 1
    && damage === 0
    && defense === 0
  ) {
    if (MOUNT_ALLOWLIST.has(internalName)) {
      return result('MOUNT', 'mount_allowlist', baseEvidence);
    }
    if (internalName.endsWith('MountItem') || internalName.endsWith('MountSaddle')) {
      return result('MOUNT', 'mount_internal_suffix', baseEvidence);
    }
  }

  // Determine specific failure reason for insufficient evidence
  if (currentCategoryCode !== 'MATERIAL') {
    return createFailureResult(internalName, itemPage, 'wrong_current_category', { currentCategoryCode });
  }
  if (stackSize !== 1 || damage !== 0 || defense !== 0) {
    return createFailureResult(internalName, itemPage, 'wrong_stats', { stackSize, damage, defense });
  }

  return createFailureResult(internalName, itemPage, 'ambiguous');
}

function logFieldFallback(item, camelCase, snake_case, value) {
  if (!item?.[camelCase] && item?.[snake_case] !== undefined) {
    console.warn(`[inference] Field fallback: using snake_case '${snake_case}' (value: ${value})`);
  }
}

function hasMatchingItemPage(internalName, itemPage) {
  if (!itemPage || itemPage.entityType !== 'item') return false;
  // Case-sensitive exact match required - data sources must have consistent casing
  const pageInternalName = text(itemPage.itemInternalName);
  if (pageInternalName !== internalName) {
    console.warn(`[inference] Case mismatch: item '${internalName}' vs page '${pageInternalName}'`);
    return false;
  }
  return true;
}
```

---

## Enhancement 3: Failure Reason Diagnostics

**Location:** Task 1, Step 3 (Implement minimal inference library) and Task 2, Step 3 (Implement sync fallback mode)

**Addition:** Enhance skippedInsufficientEvidence to include breakdown by failure reason.

### Implementation Details

Add helper function to inference library:

```js
function createFailureResult(internalName, itemPage, failureReason, extraData = {}) {
  return {
    categoryCode: null,
    confidence: null,
    source: STANDARDIZED_INFERENCE_MODE,
    reason: null,
    reportOnly: false,
    evidence: null,
    failureReason,
    failureData: { internalName, hasItemPage: !!itemPage, ...extraData },
  };
}
```

Modify inference function to return failure results instead of `null`:

- `missing_metadata` - when internalName is missing or itemPage doesn't match
- `case_mismatch` - when itemPage.itemInternalName doesn't match item.internalName (case-sensitive)
- `wrong_current_category` - when currentCategoryCode !== 'MATERIAL'
- `wrong_stats` - when stackSize !== 1 or damage !== 0 or defense !== 0
- `ambiguous` - when all evidence is present but no rule matches

In sync script, track failure reasons:

```js
const failureReasons = {
  missing_metadata: 0,
  case_mismatch: 0,
  wrong_current_category: 0,
  wrong_stats: 0,
  ambiguous: 0,
};

// When inference returns a failure result:
if (inferenceResult && inferenceResult.failureReason) {
  failureReasons[inferenceResult.failureReason]++;
  skippedInsufficientEvidence++;
}
```

Add to report:

```js
{
  skippedInsufficientEvidence: 42,
  insufficientEvidenceBreakdown: {
    missing_metadata: 10,
    case_mismatch: 2,
    wrong_current_category: 15,
    wrong_stats: 8,
    ambiguous: 7,
  },
}
```

---

## Enhancement 4: Source Conflict Detection

**Location:** Task 2, Step 3 (Implement sync fallback mode)

**Addition:** Add validation that logs warnings when raw wiki and standardized data disagree on category.

### Implementation Details

In `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`, add conflict detection:

```js
function detectSourceConflicts(item, wikiCategory, standardizedCategory, rawWikiSource) {
  const conflicts = [];
  
  if (rawWikiSource && standardizedCategory && wikiCategory !== standardizedCategory) {
    const conflict = {
      internalName: item.internal_name,
      currentCategory: item.current_category_code,
      rawWikiCategory: wikiCategory,
      standardizedCategory: standardizedCategory,
      source: 'category_mismatch',
    };
    
    console.warn(
      `[sync] Source conflict detected for ${item.internal_name}: ` +
      `raw wiki suggests ${wikiCategory}, standardized data has ${standardizedCategory}`
    );
    
    conflicts.push(conflict);
  }
  
  return conflicts;
}
```

Track conflicts during sync and add to report:

```js
{
  sourceConflicts: [
    {
      internalName: 'DrillContainmentUnit',
      currentCategory: 'MATERIAL',
      rawWikiCategory: 'CONSUMABLE',
      standardizedCategory: 'MATERIAL',
      source: 'category_mismatch',
    }
  ],
  sourceConflictCount: 1,
}
```

---

## Enhancement 5: Pre-Apply Snapshot

**Location:** Task 4, Step 1 (Add no-crawl fallback section to runbook)

**Addition:** Add a step before apply that creates an automatic database backup/snapshot.

### Implementation Details

Add new step to runbook before the "Manual apply" section:

````md
**Pre-apply database snapshot:**

Before running `--apply=true`, create a database snapshot for rollback safety:

```bash
# Create snapshot with timestamp
SNAPSHOT_NAME="item_categories_pre_inference_$(date +%Y%m%d_%H%M%S)"

# For MySQL/MariaDB
mysqldump terria_v1_local items category > "backups/${SNAPSHOT_NAME}.sql"

# Verify snapshot was created
ls -lh "backups/${SNAPSHOT_NAME}.sql"
```

Store the snapshot name for potential rollback:

```bash
echo "${SNAPSHOT_NAME}" > .last_category_snapshot
```
````

Add automated snapshot creation to sync script in Task 2, Step 3:

```js
async function createPreApplySnapshot(db, repoRoot) {
  if (!db || !db.database) {
    console.warn('[sync] Cannot create snapshot: database config missing');
    return null;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const snapshotName = `item_categories_pre_inference_${timestamp}`;
  const backupDir = path.join(repoRoot, 'backups');
  const snapshotPath = path.join(backupDir, `${snapshotName}.json`);
  
  await fs.mkdir(backupDir, { recursive: true });
  
  // Export current category assignments
  const connection = await createConnection(db);
  const [items] = await connection.query(
    'SELECT id, internal_name, category_id FROM items WHERE status = 1'
  );
  await connection.end();
  
  const snapshot = {
    timestamp: new Date().toISOString(),
    database: db.database,
    itemCount: items.length,
    items,
  };
  
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
  
  console.log(`[sync] Created pre-apply snapshot: ${snapshotPath}`);
  
  return {
    snapshotName,
    snapshotPath,
    itemCount: items.length,
  };
}
```

Call this function when `apply === 'true'` and `fallbackMode === 'standardized_inference'`:

```js
if (apply === 'true' && fallbackMode === 'standardized_inference') {
  report.preApplySnapshot = await createPreApplySnapshot(db, repoRoot);
}
```

Add rollback instructions to runbook:

````md
**Rollback from snapshot:**

If issues are detected after apply, restore from the snapshot:

```bash
# Get the last snapshot name
SNAPSHOT_NAME=$(cat .last_category_snapshot)

# For MySQL/MariaDB
mysql terria_v1_local < "backups/${SNAPSHOT_NAME}.sql"

# Or restore from JSON snapshot using the sync script
node scripts/data/sync/restore-category-snapshot.mjs \
  --snapshot="backups/${SNAPSHOT_NAME}.json" \
  --apply=true
```
````

---

## Summary of Locations

1. **Data freshness check** → Task 2, Step 3 (before inference logic)
2. **Field fallback logging** → Task 1, Step 3 (in inference library implementation)
3. **Failure reason diagnostics** → Task 1, Step 3 (inference library) + Task 2, Step 3 (sync report aggregation)
4. **Source conflict detection** → Task 2, Step 3 (during sync when both sources available)
5. **Pre-apply snapshot** → Task 2, Step 3 (before database updates) + Task 4, Step 1 (runbook documentation)

## Additional Report Fields

The final sync report should include these new fields:

```js
{
  // Existing fields...
  fallbackMode: 'standardized_inference',
  standardizedInferred: 12,
  skippedInsufficientEvidence: 42,
  
  // NEW: Data quality fields
  dataFreshness: {
    itemsLastModified: '2026-05-20T10:30:00.000Z',
    itemPagesLastModified: '2026-05-20T10:30:00.000Z',
    warnings: [],
  },
  insufficientEvidenceBreakdown: {
    missing_metadata: 10,
    case_mismatch: 2,
    wrong_current_category: 15,
    wrong_stats: 8,
    ambiguous: 7,
  },
  sourceConflicts: [],
  sourceConflictCount: 0,
  preApplySnapshot: {
    snapshotName: 'item_categories_pre_inference_20260529_143022',
    snapshotPath: '/path/to/backups/item_categories_pre_inference_20260529_143022.json',
    itemCount: 5234,
  },
}
```

## Testing Requirements

Add tests for each enhancement:

1. **Data freshness** - Test with old and new files, verify warnings
2. **Field fallback** - Test with snake_case data, verify console warnings
3. **Failure diagnostics** - Test each failure reason, verify breakdown counts
4. **Source conflicts** - Test with mismatched categories, verify conflict detection
5. **Pre-apply snapshot** - Test snapshot creation, verify rollback capability
