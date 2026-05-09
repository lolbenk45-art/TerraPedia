import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBuffRecords,
  collectBuffPageImmunityFacts
} from './fetch-wiki-buffs.mjs';

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
