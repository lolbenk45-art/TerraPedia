import test from 'node:test';
import assert from 'node:assert/strict';

import { __test__ } from './sync-standardized-entities-to-db.mjs';

test('resolveNpcLocalizedFields falls back to generated zh map when standardized npc lacks nameZh', () => {
  const record = {
    id: 2,
    internalName: 'DemonEye',
    name: 'Demon Eye',
    localized: {
      en: { namesub: null },
      zh: { namesub: null }
    }
  };
  const existing = {
    category_id: 21,
    name: 'Demon Eye',
    sub_name: ''
  };
  const npcZhMap = new Map([
    ['DemonEye', { nameZh: '恶魔眼', subNameZh: null }]
  ]);

  assert.deepEqual(
    __test__.resolveNpcLocalizedFields(record, existing, npcZhMap),
    {
      nextName: 'Demon Eye',
      nextNameZh: '恶魔眼',
      nextSubName: '',
      nextSubNameZh: null
    }
  );
});

test('buildGeneratedNpcRecord keeps zh supplement fields for public npc fallback', () => {
  const record = {
    id: 3,
    internalName: 'Zombie',
    name: 'Zombie',
    combat: { damage: 14 },
    dimensions: { width: 18 },
    economy: { value: 45 },
    buffImmune: null
  };

  assert.deepEqual(
    __test__.buildGeneratedNpcRecord(record, 'http://localhost:9000/zombie.png', {
      nextNameZh: '僵尸',
      nextSubNameZh: null
    }),
    {
      gameId: 3,
      internalName: 'Zombie',
      imageUrl: 'http://localhost:9000/zombie.png',
      nameZh: '僵尸',
      subNameZh: null,
      rawJson: JSON.stringify({ ...record, imageUrl: 'http://localhost:9000/zombie.png' }),
      combat: { damage: 14 },
      dimensions: { width: 18 },
      economy: { value: 45 },
      buffImmune: null
    }
  );
});

test('buildMysqlModuleRequire tries app package resolver before root resolver fallback', () => {
  const calls = [];
  const repoRoot = '/repo';
  const createRequireImpl = (fromPath) => {
    calls.push(['createRequire', fromPath]);
    if (fromPath.endsWith('/data-query-app/package.json')) {
      return (moduleName) => {
        calls.push(['appRequire', moduleName]);
        return { from: 'data-query-app' };
      };
    }
    throw new Error(`unexpected resolver: ${fromPath}`);
  };
  const rootRequireImpl = (moduleName) => {
    calls.push(['rootRequire', moduleName]);
    return { from: 'root' };
  };

  const mysql = __test__.loadMysqlModule({
    repoRoot,
    createRequireImpl,
    rootRequireImpl,
  });

  assert.deepEqual(mysql, { from: 'data-query-app' });
  assert.deepEqual(calls, [
    ['createRequire', '/repo/data-query-app/package.json'],
    ['appRequire', 'mysql2/promise'],
  ]);
});
