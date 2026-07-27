import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { URL } from 'node:url';

const capabilitiesUrl = new URL(
  './fixtures/crawler-automation-capabilities.json',
  import.meta.url,
);
const registryUrl = new URL(
  '../../../back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java',
  import.meta.url,
);
const repositoryRootUrl = new URL('../../../', import.meta.url);

const PROGRESS_OWNER_WORK_BOUNDARIES = new Map([
  ['scripts/data/workflow/run-backend-data-refresh.mjs', 'const result = await runAction'],
  ['scripts/data/fetch/fetch-wiki-buffs.mjs', 'const result = await fetchWikiModuleContent'],
  ['scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs', 'const payload = await fetchWikiApiJson'],
  ['scripts/data/fetch/fetch-wiki-bosses.mjs', 'const overview = await fetchBossSections'],
  ['scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs', 'const { records, scraped, skipped } = await crawlRecords'],
  ['scripts/data/fetch/fetch-wiki-shimmer-page.mjs', 'const revision = await fetchRevision'],
  ['scripts/data/item-groups/item-group-canonical-action.mjs', 'const result = await execute'],
]);

async function loadCapabilities() {
  const raw = await readFile(capabilitiesUrl, 'utf8');
  return JSON.parse(raw);
}

// Canonical 21-operation action IDs derived from CrawlerMonitorActionRegistry.defaultActions()
const EXPECTED_ACTION_IDS = new Set([
  'wiki-items-refresh',
  'wiki-items-force-refresh',
  'wiki-npcs-refresh',
  'wiki-npcs-force-refresh',
  'wiki-projectiles-refresh',
  'wiki-projectiles-force-refresh',
  'buff-page-immunity-refresh',
  'domain-source-armor-sets',
  'recipe-reference-sync',
  'recipe-reference-apply',
  'biome-preview',
  'biome-sync',
  'domain-source-bosses',
  'domain-source-town-npc-maintenance',
  'domain-source-shimmer',
  'npc-loot-backfill',
  'npc-loot-apply',
  'boss-loot-backfill',
  'boss-loot-apply',
  'item-group-canonical-preview',
  'item-group-canonical-apply',
]);

// Operations that write the database must declare owned tables
const WRITE_OPS_REQUIRE_OWNED_TABLES = true;

test('capabilities fixture has correct schema version', async () => {
  const capabilities = await loadCapabilities();
  assert.strictEqual(capabilities.schemaVersion, 1);
  assert.ok(Array.isArray(capabilities.operations));
});

test('capabilities fixture covers exactly the 21 registered operations', async () => {
  const capabilities = await loadCapabilities();
  const registry = await readFile(registryUrl, 'utf8');
  const fixtureIds = new Set(capabilities.operations.map((op) => op.actionId));

  assert.strictEqual(fixtureIds.size, 21, `expected 21 unique actionIds, found ${fixtureIds.size}`);

  for (const expected of EXPECTED_ACTION_IDS) {
    assert.ok(fixtureIds.has(expected), `missing actionId: ${expected}`);
    assert.ok(registry.includes(`"${expected}"`), `backend registry missing actionId: ${expected}`);
  }

  for (const found of fixtureIds) {
    assert.ok(EXPECTED_ACTION_IDS.has(found), `unexpected actionId: ${found}`);
  }
});

test('every preview or crawl operation is backed by a monitor progress contract', async () => {
  const capabilities = await loadCapabilities();
  const registry = await readFile(registryUrl, 'utf8');
  for (const operation of capabilities.operations.filter((row) => row.mode !== 'apply')) {
    assert.ok(registry.includes(`"${operation.actionId}"`), `${operation.actionId}: missing registry progress owner`);
  }
  assert.match(registry, /<progressPath>/);
  assert.match(registry, /childStatusPath|progressPath/);
});

test('every preview or crawl operation declares executable progress evidence', async () => {
  const capabilities = await loadCapabilities();
  for (const operation of capabilities.operations.filter((row) => row.mode !== 'apply')) {
    const contract = operation.progressContract;
    assert.ok(contract && typeof contract === 'object', `${operation.actionId}: missing progressContract`);
    assert.ok(contract.ownerScript, `${operation.actionId}: missing progress ownerScript`);
    assert.ok(contract.canonicalPath, `${operation.actionId}: missing canonical progress path`);
    assert.ok(contract.isolatedTestPath, `${operation.actionId}: missing isolated progress test path`);
    assert.strictEqual(contract.initialBeforeWork, true, `${operation.actionId}: initial progress is not guaranteed`);
    assert.strictEqual(contract.heartbeat, true, `${operation.actionId}: heartbeat is not guaranteed`);
    assert.deepEqual(
      contract.terminalStatuses,
      ['completed', 'failed'],
      `${operation.actionId}: terminal progress contract is incomplete`
    );
  }
});

test('declared progress owners write running before work and own heartbeat plus terminal states', async () => {
  const capabilities = await loadCapabilities();
  const registry = await readFile(registryUrl, 'utf8');
  const sourceCache = new Map();
  const testCache = new Map();

  for (const operation of capabilities.operations.filter((row) => row.mode !== 'apply')) {
    const contract = operation.progressContract;
    const ownerSource = await readRepositoryFile(contract.ownerScript, sourceCache);
    const isolatedTest = await readRepositoryFile(contract.isolatedTestPath, testCache);
    const workBoundary = PROGRESS_OWNER_WORK_BOUNDARIES.get(contract.ownerScript);

    assert.ok(workBoundary, `${operation.actionId}: unknown progress owner ${contract.ownerScript}`);
    assert.ok(registry.includes(`"${operation.actionId}"`), `${operation.actionId}: registry action missing`);
    assert.ok(ownerSource.includes("status: 'running'"), `${operation.actionId}: owner lacks running payload`);
    assert.ok(
      ownerSource.indexOf("status: 'running'") < ownerSource.indexOf(workBoundary),
      `${operation.actionId}: owner starts work before publishing running progress`
    );
    assert.match(
      ownerSource,
      contract.ownerScript.includes('/workflow/')
        ? /setInterval\(\(\) => \{\s*writeActionHeartbeat/s
        : /createCrawlerProgressHeartbeat/,
      `${operation.actionId}: owner lacks heartbeat`
    );
    assert.match(ownerSource, /'completed'/, `${operation.actionId}: owner lacks completed terminal state`);
    assert.match(ownerSource, /'failed'/, `${operation.actionId}: owner lacks failed terminal state`);

    if (contract.canonicalPath.startsWith('reports/backend-refresh/history/')) {
      assert.match(
        registry,
        /reports\/backend-refresh\/history\/<run>\.runtime\/" \+ actionId \+ "\.child-status\.json/,
        `${operation.actionId}: backend canonical progress template is missing`
      );
    } else {
      assert.ok(
        ownerSource.includes(path.basename(contract.canonicalPath)),
        `${operation.actionId}: owner does not name canonical progress file`
      );
      assert.ok(ownerSource.includes(operation.actionId), `${operation.actionId}: owner lacks stable actionId`);
    }

    assert.match(isolatedTest, /mkdtempSync\(/, `${operation.actionId}: test does not isolate filesystem state`);
    assert.match(isolatedTest, /WORKTREE_ROOT/, `${operation.actionId}: test does not isolate worktree paths`);
    assert.match(isolatedTest, /progress/i, `${operation.actionId}: test does not exercise progress output`);
  }
});

async function readRepositoryFile(relativePath, cache) {
  if (!cache.has(relativePath)) {
    cache.set(relativePath, await readFile(new URL(relativePath, repositoryRootUrl), 'utf8'));
  }
  return cache.get(relativePath);
}

test('every operation defaults to L0 + DISABLED', async () => {
  const capabilities = await loadCapabilities();

  for (const op of capabilities.operations) {
    assert.strictEqual(
      op.automationLevel, 'L0',
      `${op.actionId}: automationLevel must be L0, found ${op.automationLevel}`
    );
    assert.strictEqual(
      op.operationalState, 'DISABLED',
      `${op.actionId}: operationalState must be DISABLED, found ${op.operationalState}`
    );
  }
});

test('write operations declare at least one owned table', async () => {
  const capabilities = await loadCapabilities();

  for (const op of capabilities.operations) {
    if (op.writesDatabase) {
      assert.ok(
        Array.isArray(op.ownedTables) && op.ownedTables.length > 0,
        `${op.actionId}: writesDatabase=true but ownedTables is empty`
      );
    }
  }
});

test('owned tables have required fields: databaseRole, table, fieldGroup, logicalPredicate', async () => {
  const capabilities = await loadCapabilities();

  for (const op of capabilities.operations) {
    for (const owned of (op.ownedTables || [])) {
      assert.ok(owned.databaseRole, `${op.actionId}: owned table missing databaseRole`);
      assert.ok(owned.table, `${op.actionId}: owned table missing table`);
      assert.ok(owned.fieldGroup, `${op.actionId}: owned table missing fieldGroup`);
      assert.ok(
        owned.logicalPredicate && typeof owned.logicalPredicate === 'object',
        `${op.actionId}: owned table missing logicalPredicate`
      );
      assert.ok(
        ['maint', 'relation', 'local'].includes(owned.databaseRole),
        `${op.actionId}: unknown databaseRole ${owned.databaseRole}`
      );
    }
  }
});

test('read-only operations have no owned tables', async () => {
  const capabilities = await loadCapabilities();

  for (const op of capabilities.operations) {
    if (!op.writesDatabase) {
      assert.strictEqual(
        (op.ownedTables || []).length, 0,
        `${op.actionId}: writesDatabase=false but has ownedTables`
      );
    }
  }
});

test('write operations require snapshot and declare rollback mode', async () => {
  const capabilities = await loadCapabilities();

  for (const op of capabilities.operations) {
    if (op.writesDatabase) {
      assert.strictEqual(
        op.snapshotRequired, true,
        `${op.actionId}: writesDatabase=true but snapshotRequired=false`
      );
      assert.ok(
        op.rollbackMode && op.rollbackMode !== 'none',
        `${op.actionId}: writesDatabase=true but rollbackMode is none`
      );
    }
  }
});

test('preview/apply pairs are symmetric', async () => {
  const capabilities = await loadCapabilities();
  const byId = Object.fromEntries(capabilities.operations.map((op) => [op.actionId, op]));

  for (const op of capabilities.operations) {
    if (op.previewPairOf) {
      const partner = byId[op.previewPairOf];
      assert.ok(partner, `${op.actionId}: previewPairOf references unknown actionId ${op.previewPairOf}`);
      assert.strictEqual(
        partner.applyPairOf, op.actionId,
        `${op.actionId}: preview/apply pairing is not symmetric`
      );
    }
    if (op.applyPairOf) {
      const partner = byId[op.applyPairOf];
      assert.ok(partner, `${op.actionId}: applyPairOf references unknown actionId ${op.applyPairOf}`);
      assert.strictEqual(
        partner.previewPairOf, op.actionId,
        `${op.actionId}: apply/preview pairing is not symmetric`
      );
    }
  }
});

test('actionIds are unique across all operations', async () => {
  const capabilities = await loadCapabilities();
  const ids = capabilities.operations.map((op) => op.actionId);
  const unique = new Set(ids);
  assert.strictEqual(unique.size, ids.length, 'duplicate actionIds detected');
});

test('no operation has a mode other than known modes', async () => {
  const capabilities = await loadCapabilities();
  const KNOWN_MODES = new Set(['check', 'force', 'preview', 'apply', 'fresh']);

  for (const op of capabilities.operations) {
    assert.ok(
      KNOWN_MODES.has(op.mode),
      `${op.actionId}: unknown mode ${op.mode}`
    );
  }
});

test('boss-loot and npc-loot owned tables use exclusive partitions', async () => {
  const capabilities = await loadCapabilities();
  const byId = Object.fromEntries(capabilities.operations.map((op) => [op.actionId, op]));

  const npcLoot = byId['npc-loot-apply'];
  const bossLoot = byId['boss-loot-apply'];

  assert.ok(npcLoot, 'npc-loot-apply must be present');
  assert.ok(bossLoot, 'boss-loot-apply must be present');

  // Both target npc_loot_entries but with exclusive partition predicates
  assert.strictEqual(npcLoot.ownedTables[0].table, 'npc_loot_entries');
  assert.strictEqual(bossLoot.ownedTables[0].table, 'npc_loot_entries');

  const npcPred = npcLoot.ownedTables[0].logicalPredicate;
  const bossPred = bossLoot.ownedTables[0].logicalPredicate;

  assert.strictEqual(npcPred.kind, 'partition');
  assert.strictEqual(bossPred.kind, 'partition');
  assert.notStrictEqual(npcPred.partition, bossPred.partition, 'partitions must differ');
  assert.strictEqual(npcPred.group, bossPred.group, 'partition groups must match');
});

test('canonical item-group apply owns only source-derived rows and serialized projection state', async () => {
  const capabilities = await loadCapabilities();
  const preview = capabilities.operations.find((op) => op.actionId === 'item-group-canonical-preview');
  const apply = capabilities.operations.find((op) => op.actionId === 'item-group-canonical-apply');

  assert.ok(preview, 'item-group-canonical-preview must be present');
  assert.ok(apply, 'item-group-canonical-apply must be present');
  assert.equal(preview.progressContract.ownerScript, 'scripts/data/item-groups/item-group-canonical-action.mjs');
  assert.equal(apply.progressContract.ownerScript, preview.progressContract.ownerScript);
  assert.deepEqual(apply.progressContract.terminalStatuses, ['completed', 'failed']);
  assert.equal(apply.writesDatabase, true);
  assert.equal(apply.snapshotRequired, true);
  assert.equal(apply.rollbackMode, 'scope_snapshot_latest_writer');
  assert.equal(apply.ownedTables.length, 10);
  for (const owned of apply.ownedTables.filter((row) => row.table !== 'item_group_projection_state')) {
    assert.deepEqual(owned.logicalPredicate, {
      kind: 'partition',
      group: 'item_group_source_layer',
      partition: 'source_derived',
      resolver: 'resolveItemGroupSourceLayer',
      resolverVersion: 1,
    });
  }
  assert.deepEqual(
    apply.ownedTables.find((row) => row.table === 'item_group_projection_state')?.logicalPredicate,
    {
      kind: 'serialized_singleton',
      mutex: 'item_group_projection_state',
      singletonKey: 1,
      resolverVersion: 1,
    },
  );
});

test('readDependencies are non-empty for all operations', async () => {
  const capabilities = await loadCapabilities();

  for (const op of capabilities.operations) {
    assert.ok(
      Array.isArray(op.readDependencies) && op.readDependencies.length > 0,
      `${op.actionId}: readDependencies must not be empty`
    );
  }
});
