import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

async function loadCapabilities() {
  const raw = await readFile(capabilitiesUrl, 'utf8');
  return JSON.parse(raw);
}

// Canonical 19-operation action IDs derived from CrawlerMonitorActionRegistry.defaultActions()
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
]);

// Operations that write the database must declare owned tables
const WRITE_OPS_REQUIRE_OWNED_TABLES = true;

test('capabilities fixture has correct schema version', async () => {
  const capabilities = await loadCapabilities();
  assert.strictEqual(capabilities.schemaVersion, 1);
  assert.ok(Array.isArray(capabilities.operations));
});

test('capabilities fixture covers exactly the 19 registered operations', async () => {
  const capabilities = await loadCapabilities();
  const registry = await readFile(registryUrl, 'utf8');
  const fixtureIds = new Set(capabilities.operations.map((op) => op.actionId));

  assert.strictEqual(fixtureIds.size, 19, `expected 19 unique actionIds, found ${fixtureIds.size}`);

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

test('readDependencies are non-empty for all operations', async () => {
  const capabilities = await loadCapabilities();

  for (const op of capabilities.operations) {
    assert.ok(
      Array.isArray(op.readDependencies) && op.readDependencies.length > 0,
      `${op.actionId}: readDependencies must not be empty`
    );
  }
});
