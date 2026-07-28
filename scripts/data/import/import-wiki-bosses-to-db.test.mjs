import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { reconcileBossMembers } from './import-wiki-bosses-to-db.mjs';

test('boss importer resolves mysql2 through the repository module loader', () => {
  const source = fs.readFileSync(new URL('./import-wiki-bosses-to-db.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ loadMysqlModule \} from '\.\.\/lib\/mysql-module\.mjs'/);
  assert.match(source, /const mysql = loadMysqlModule\(\)/);
  assert.doesNotMatch(source, /createRequire|require\('mysql2\/promise'\)/);
});

test('boss image helpers receive managed URL prefixes explicitly', () => {
  const source = fs.readFileSync(new URL('./import-wiki-bosses-to-db.mjs', import.meta.url), 'utf8');
  assert.match(source, /async function localizeBossImage\(\s*record,\s*uploader,\s*summary,\s*managedUrlPrefixes,?\s*\)/);
  assert.match(source, /async function reconcileBossMemberImages\(\s*members,\s*generatedNpcMap,\s*uploader,\s*summary,\s*managedUrlPrefixes,?\s*\)/);
  assert.match(source, /function resolveBossImageUrl\(\s*record,\s*members,\s*managedUrlPrefixes,?\s*\)/);
  assert.match(source, /await localizeBossImage\(\s*record,\s*uploader,\s*summary,\s*managedUrlPrefixes,?\s*\)/);
  assert.match(source, /await reconcileBossMemberImages\(\s*memberMapping\.members,\s*generatedNpcMap,\s*uploader,\s*summary,\s*managedUrlPrefixes,?\s*\)/);
  assert.match(source, /const imageUrl = resolveBossImageUrl\(\s*\{[^}]*\},\s*memberMapping\.members,\s*managedUrlPrefixes,?\s*\)/);
});

test('reconcileBossMembers skips unchanged existing boss member assignments', async () => {
  const conn = createFakeConnection({
    existingMembers: [
      { id: 10, boss_group_id: 7, boss_role: 'primary' },
      { id: 11, boss_group_id: 7, boss_role: 'part' },
    ],
  });
  const stats = { totalMemberAssignments: 0, skippedMemberAssignments: 0, updatedMemberAssignments: 0, clearedMemberAssignments: 0 };

  await reconcileBossMembers(conn, 7, [
    { id: 10, role: 'primary' },
    { id: 11, role: 'part' },
  ], stats);

  assert.equal(stats.totalMemberAssignments, 2);
  assert.equal(stats.skippedMemberAssignments, 2);
  assert.equal(stats.updatedMemberAssignments, 0);
  assert.equal(stats.clearedMemberAssignments, 0);
  assert.equal(conn.calls.some((call) => /\bSET boss_group_id = NULL\b/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bSET is_boss = 1\b/i.test(call.sql)), false);
});

test('reconcileBossMembers clears removed members and updates changed roles', async () => {
  const conn = createFakeConnection({
    existingMembers: [
      { id: 10, boss_group_id: 7, boss_role: 'part' },
      { id: 12, boss_group_id: 7, boss_role: 'part' },
    ],
  });
  const stats = { totalMemberAssignments: 0, skippedMemberAssignments: 0, updatedMemberAssignments: 0, clearedMemberAssignments: 0 };

  await reconcileBossMembers(conn, 7, [
    { id: 10, role: 'primary' },
    { id: 11, role: 'part' },
  ], stats);

  assert.equal(stats.totalMemberAssignments, 2);
  assert.equal(stats.skippedMemberAssignments, 0);
  assert.equal(stats.updatedMemberAssignments, 2);
  assert.equal(stats.clearedMemberAssignments, 1);
  assert.equal(conn.calls.filter((call) => /\bSET boss_group_id = NULL\b/i.test(call.sql)).length, 1);
  assert.equal(conn.calls.filter((call) => /\bSET is_boss = 1\b/i.test(call.sql)).length, 2);
});

function createFakeConnection({ existingMembers = [] } = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM\s+npcs\b/i.test(sql)) {
        return [existingMembers];
      }
      return [{ affectedRows: 1 }];
    },
  };
}
