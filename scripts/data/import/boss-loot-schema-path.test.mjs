import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { resolveBossLootSchemaSqlPath } from './boss-loot-schema-path.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');

test('resolveBossLootSchemaSqlPath points at an existing migration file', () => {
  const sqlPath = resolveBossLootSchemaSqlPath(repoRoot);

  assert.equal(path.basename(sqlPath), 'V35__add_drop_source_kind_to_npc_loot_entries.sql');
  assert.equal(fs.existsSync(sqlPath), true);
});
