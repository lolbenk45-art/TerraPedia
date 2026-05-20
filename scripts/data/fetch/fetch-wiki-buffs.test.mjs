import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildBuffRecords,
  collectBuffPageImmunityFacts
} from './fetch-wiki-buffs.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'fetch-wiki-buffs.mjs');

test('buildBuffRecords applies buff page immunity facts over npcinfo fallback and labels sample semantics', () => {
  const baseBuffs = [
    {
      id: 39,
      image: 'Cursed Inferno.png',
      internalName: 'CursedInferno',
      englishName: 'Cursed Inferno',
      type: 'debuff'
    }
  ];
  const localizedByLang = {
    en: {
      39: {
        name: 'Cursed Inferno',
        page: 'Cursed Inferno',
        tooltip: 'Losing life',
        namesub: null
      }
    },
    zh: {
      39: {
        name: '诅咒狱火',
        page: '诅咒狱火',
        tooltip: '正在损失生命',
        namesub: null
      }
    }
  };
  const relations = {
    sourceItemsByBuffId: new Map(),
    immuneNpcCountByBuffId: new Map([[39, 5]]),
    immuneNpcSampleByBuffId: new Map([
      [39, [{ npcId: 70, name: 'Spike Ball', internalName: 'SpikeBall' }]]
    ]),
    immuneNpcSourceByBuffId: new Map([[39, 'npcinfo-module']]),
    immuneNpcSampleSemanticsByBuffId: new Map([[39, 'first 10 npcinfo module rows with this buffImmune id']])
  };
  const pageFacts = new Map([
    [39, {
      immuneNpcCount: 29,
      immuneNpcSample: [
        {
          npcId: null,
          name: 'Ancient Vision',
          internalName: 'AncientVision',
          pageTitle: 'Ancient Vision',
          source: 'buff-page-immunities',
          sourceOrder: 1
        },
        {
          npcId: null,
          name: 'Dungeon Guardian',
          internalName: 'DungeonGuardian',
          pageTitle: 'Dungeon Guardian',
          source: 'buff-page-immunities',
          sourceOrder: 2
        }
      ],
      immuneNpcSource: 'buff-page-immunities',
      immuneNpcSampleSemantics: 'first 2 entries from the rendered buff page immunities list; immuneNpcCount is the full rendered list size'
    }]
  ]);

  const [record] = buildBuffRecords({
    baseBuffs,
    localizedByLang,
    langs: ['en', 'zh'],
    relations,
    pageFacts
  });

  assert.equal(record.immuneNpcCount, 29);
  assert.equal(record.immuneNpcSource, 'buff-page-immunities');
  assert.equal(
    record.immuneNpcSampleSemantics,
    'first 2 entries from the rendered buff page immunities list; immuneNpcCount is the full rendered list size'
  );
  assert.deepEqual(
    record.immuneNpcSample.map((entry) => entry.name),
    ['Ancient Vision', 'Dungeon Guardian']
  );
});

test('buildBuffRecords preserves page source, inflicting, immune, and provenance evidence', () => {
  const [record] = buildBuffRecords({
    baseBuffs: [
      {
        id: 39,
        image: 'Cursed Inferno.png',
        internalName: 'CursedInferno',
        englishName: 'Cursed Inferno',
        type: 'debuff'
      }
    ],
    localizedByLang: {
      zh: {
        39: {
          name: '诅咒狱火',
          page: '诅咒狱火',
          tooltip: '正在损失生命',
          namesub: null
        }
      }
    },
    langs: ['zh'],
    relations: {
      sourceItemsByBuffId: new Map([
        [39, [{ itemId: 47, name: 'Module fallback item', internalName: 'ModuleFallbackItem' }]]
      ]),
      immuneNpcCountByBuffId: new Map(),
      immuneNpcSampleByBuffId: new Map(),
      immuneNpcSourceByBuffId: new Map(),
      immuneNpcSampleSemanticsByBuffId: new Map()
    },
    pageFacts: new Map([
      [39, {
        sourceItems: [
          { name: '诅咒箭', pageTitle: 'Cursed Arrow', sourceKind: 'player', sourceOrder: 1 },
          { name: '诅咒弹', pageTitle: 'Cursed Bullet', sourceKind: 'player', sourceOrder: 2 }
        ],
        inflictingNpcs: [
          { name: '爬藤怪', pageTitle: 'Clinger', sourceKind: 'enemy', sourceOrder: 1 }
        ],
        immuneNpcs: [
          { name: 'Dungeon Guardian', pageTitle: 'Dungeon Guardian', sourceOrder: 1 }
        ],
        immuneNpcCount: 1,
        immuneNpcSample: [
          { name: 'Dungeon Guardian', pageTitle: 'Dungeon Guardian', sourceOrder: 1 }
        ],
        immuneNpcSource: 'buff-page-immunities',
        immuneNpcSampleSemantics: 'first 1 entries from the rendered buff page immunities list; immuneNpcCount is the full rendered list size',
        sourceEvidence: {
          provider: 'terraria.wiki.gg',
          pageTitle: '诅咒狱火',
          sectionAnchors: ['原因', '来自玩家', '来自敌怪', '免疫的_NPC']
        }
      }]
    ])
  });

  assert.deepEqual(record.sourceItems.map((entry) => entry.name), ['诅咒箭', '诅咒弹']);
  assert.deepEqual(record.inflictingNpcs.map((entry) => entry.name), ['爬藤怪']);
  assert.deepEqual(record.immuneNpcs.map((entry) => entry.name), ['Dungeon Guardian']);
  assert.equal(record.sourceItemCount, 2);
  assert.equal(record.sourceEvidence.pageTitle, '诅咒狱火');
  assert.deepEqual(record.sourceEvidence.sectionAnchors, ['原因', '来自玩家', '来自敌怪', '免疫的_NPC']);
});

test('collectBuffPageImmunityFacts fetches rendered buff pages and parses Cursed Inferno and Poisoned samples', async () => {
  const htmlByPage = new Map([
    ['Cursed Inferno', `
      <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
      <div class="terraria mw-collapsible"><div class="mw-collapsible-content"><div class="itemlist"><ul>
        <li><span class="i"><a href="/wiki/Ancient_Vision" title="Ancient Vision"><img alt="Ancient Vision" /></a><span><span><a href="/wiki/Ancient_Vision" title="Ancient Vision">Ancient Vision</a></span></span></span></li>
        <li><span class="i"><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian"><img alt="Dungeon Guardian" /></a><span><span><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian">Dungeon Guardian</a></span></span></span></li>
      </ul></div></div></div>
      <h2><span class="mw-headline" id="Notes">Notes</span></h2>
    `],
    ['Poisoned', `
      <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
      <div class="terraria mw-collapsible"><div class="mw-collapsible-content"><div class="itemlist"><ul>
        <li><span class="i"><a href="/wiki/Blue_Slime" title="Blue Slime"><img alt="Blue Slime" /></a><span><span><a href="/wiki/Blue_Slime" title="Blue Slime">Blue Slime</a></span></span></span></li>
        <li><span class="i"><a href="/wiki/Hornet" title="Hornet"><img alt="Hornet" /></a><span><span><a href="/wiki/Hornet" title="Hornet">Hornet</a></span></span></span></li>
        <li><span class="i"><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian"><img alt="Dungeon Guardian" /></a><span><span><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian">Dungeon Guardian</a></span></span></span></li>
      </ul></div></div></div>
      <h2><span class="mw-headline" id="History">History</span></h2>
    `]
  ]);

  const facts = await collectBuffPageImmunityFacts({
    buffs: [
      { id: 39, englishName: 'Cursed Inferno' },
      { id: 20, englishName: 'Poisoned' }
    ],
    localizedByLang: {
      en: {
        20: { page: 'Poisoned' },
        39: { page: 'Cursed Inferno' }
      }
    },
    fetchRenderedHtml: async ({ pageTitle }) => htmlByPage.get(pageTitle),
    sampleLimit: 2
  });

  assert.equal(facts.get(39).immuneNpcCount, 2);
  assert.deepEqual(
    facts.get(39).immuneNpcSample.map((entry) => entry.name),
    ['Ancient Vision', 'Dungeon Guardian']
  );
  assert.equal(facts.get(20).immuneNpcCount, 3);
  assert.deepEqual(
    facts.get(20).immuneNpcSample.map((entry) => entry.name),
    ['Blue Slime', 'Hornet']
  );
});

test('collectBuffPageImmunityFacts falls back to zh page title when en page title is unavailable', async () => {
  const htmlByPage = new Map([
    ['诅咒狱火', `
      <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
      <div class="terraria mw-collapsible"><div class="mw-collapsible-content"><div class="itemlist"><ul>
        <li><span class="i"><a href="/wiki/Ancient_Vision" title="Ancient Vision"><img alt="Ancient Vision" /></a><span><span><a href="/wiki/Ancient_Vision" title="Ancient Vision">Ancient Vision</a></span></span></span></li>
      </ul></div></div></div>
    `]
  ]);

  const facts = await collectBuffPageImmunityFacts({
    buffs: [
      { id: 39, englishName: 'Cursed Inferno' }
    ],
    localizedByLang: {
      zh: {
        39: { page: '诅咒狱火' }
      }
    },
    fetchRenderedHtml: async ({ pageTitle }) => htmlByPage.get(pageTitle)
  });

  assert.equal(facts.get(39).pageTitle, '诅咒狱火');
  assert.equal(facts.get(39).immuneNpcCount, 1);
});

test('collectBuffPageImmunityFacts uses full page payload and keeps canonical revision provenance', async () => {
  const facts = await collectBuffPageImmunityFacts({
    buffs: [
      { id: 20, englishName: 'Poisoned' }
    ],
    localizedByLang: {
      en: {
        20: { page: 'Poisoned' }
      }
    },
    fetchPagePayload: async ({ pageTitle }) => {
      assert.equal(pageTitle, 'Poisoned');
      return {
        requestedPageTitle: 'Poisoned',
        pageTitle: 'Poisoned',
        canonicalPageTitle: 'Poisoned',
        revisionId: 12345,
        revisionTimestamp: '2026-05-15T00:00:00Z',
        sections: [
          { line: 'From player', anchor: 'From_player' },
          { line: 'Immune NPCs', anchor: 'Immune_NPCs' }
        ],
        wikitext: 'wiki text',
        html: `
          <h2><span class="mw-headline" id="From_player">From player</span></h2>
          <table><tr><td><a href="/wiki/Poisoned_Knife" title="Poisoned Knife">Poisoned Knife</a></td></tr></table>
          <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
          <ul><li><a href="/wiki/Blue_Slime" title="Blue Slime">Blue Slime</a></li></ul>
        `
      };
    },
    sampleLimit: 1
  });

  const evidence = facts.get(20);
  assert.deepEqual(evidence.sourceItems.map((entry) => entry.name), ['Poisoned Knife']);
  assert.equal(evidence.sourceEvidence.canonicalPageTitle, 'Poisoned');
  assert.equal(evidence.sourceEvidence.revisionId, 12345);
  assert.equal(evidence.sourceEvidence.revisionTimestamp, '2026-05-15T00:00:00Z');
});

test('buff fetch writes failed redis heartbeat before exiting on startup error', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-buffs-heartbeat-failed-'));
  const binDir = path.join(tempDir, 'bin');
  const redisLog = path.join(tempDir, 'redis-cli-args.jsonl');
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const rawDir = path.join(tempDir, 'missing', 'raw');
  const progressPath = path.join(tempDir, 'progress.json');

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'redis-cli'), `#!/usr/bin/env node
const fs = require('node:fs');
  fs.appendFileSync(${JSON.stringify(redisLog)}, JSON.stringify(process.argv.slice(2)) + '\\n');
`, { mode: 0o755 });
  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.mkdirSync(path.dirname(rawDir), { recursive: true });
  fs.writeFileSync(rawDir, 'not a directory', 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--raw-dir=${rawDir}`,
    `--progress-path=${progressPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_REDIS_HOST: '127.0.0.1',
      TERRAPEDIA_REDIS_PORT: '6380',
      TERRAPEDIA_REDIS_DATABASE: '0'
    }
  });

  assert.notEqual(result.status, 0);
  const calls = fs.readFileSync(redisLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(calls.some((args) => {
    return args.includes('SETEX')
      && args.includes('terrapedia:crawler:buffs:heartbeat')
      && args.some((arg) => String(arg).includes('"status":"failed"'));
  }));
});
