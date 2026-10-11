import assert from 'node:assert/strict';
import test from 'node:test';

import { extractBuffNpcPageInflictionEvidence } from './buff-npc-page-evidence.mjs';

const WALL_PAGE = {
  requestedPageTitle: 'Wall of Flesh',
  pageTitle: 'Wall of Flesh',
  pageId: 10220,
  revisionId: 1032375,
  revisionTimestamp: '2026-09-28T10:16:13Z',
  wikitext: `{{npc infobox
| auto = 113
| image = Wall of Flesh.gif
| type = Boss
| debuff = Horrified
| debuffduration = While the player is within 120 tiles from the boss.
| debuff2 = The Tongue
| debuffduration2 = While the player is inflicted with Horrified.
}}
`,
  html: '<th>Immune to</th><td class="immunities">On Fire!</td><div class="title">Inflicts debuffs</div>',
};

const BUFF_SCOPE = [
  { id: 37, internalName: 'Horrified', englishName: 'Horrified' },
  { id: 38, internalName: 'TheTongue', englishName: 'The Tongue' },
];

test('extracts revision-bound Wall of Flesh infliction facts without importing Immune to', () => {
  const result = extractBuffNpcPageInflictionEvidence({
    pagePayload: WALL_PAGE,
    expectedPageTitle: 'Wall of Flesh',
    npcSourceId: 113,
    npcInternalName: 'WallofFlesh',
    npcName: 'Wall of Flesh',
    buffScope: BUFF_SCOPE,
  });

  assert.equal(result.completeness, 'positive-infliction-facts-only');
  assert.deepEqual(result.facts, [
    {
      relationType: 'inflicts',
      npcSourceId: 113,
      npcInternalName: 'WallofFlesh',
      npcName: 'Wall of Flesh',
      buffId: 37,
      buffInternalName: 'Horrified',
      buffName: 'Horrified',
      durationText: 'While the player is within 120 tiles from the boss.',
      sourcePage: 'Wall of Flesh',
      sourcePageId: 10220,
      sourceRevisionId: 1032375,
      sourceRevisionTimestamp: '2026-09-28T10:16:13Z',
      sourceField: 'debuff',
    },
    {
      relationType: 'inflicts',
      npcSourceId: 113,
      npcInternalName: 'WallofFlesh',
      npcName: 'Wall of Flesh',
      buffId: 38,
      buffInternalName: 'TheTongue',
      buffName: 'The Tongue',
      durationText: 'While the player is inflicted with Horrified.',
      sourcePage: 'Wall of Flesh',
      sourcePageId: 10220,
      sourceRevisionId: 1032375,
      sourceRevisionTimestamp: '2026-09-28T10:16:13Z',
      sourceField: 'debuff2',
    },
  ]);
  assert.deepEqual(result.source, {
    provider: 'terraria.wiki.gg',
    pageTitle: 'Wall of Flesh',
    pageId: 10220,
    revisionId: 1032375,
    revisionTimestamp: '2026-09-28T10:16:13Z',
    npcSourceId: 113,
    npcInternalName: 'WallofFlesh',
    rawFactGroup: 'npc-page-infobox-debuff',
  });
});

test('rejects missing revision, page, NPC, Buff, and duplicate identities', () => {
  const cases = [
    ['missing revision', { pagePayload: { ...WALL_PAGE, revisionId: null } }, /revision identity/],
    ['wrong page', { expectedPageTitle: 'Moon Lord' }, /page identity/],
    ['wrong NPC', { npcSourceId: 114 }, /NPC identity/],
    ['wrong Buff', { buffScope: [{ id: 99, internalName: 'Other', englishName: 'Other' }] }, /Buff identity/],
    ['duplicate Buff', {
      pagePayload: {
        ...WALL_PAGE,
        wikitext: WALL_PAGE.wikitext.replace('| debuff2 = The Tongue', '| debuff2 = Horrified'),
      },
    }, /duplicate Buff infliction/],
  ];

  for (const [label, overrides, pattern] of cases) {
    assert.throws(() => extractBuffNpcPageInflictionEvidence({
      pagePayload: WALL_PAGE,
      expectedPageTitle: 'Wall of Flesh',
      npcSourceId: 113,
      npcInternalName: 'WallofFlesh',
      npcName: 'Wall of Flesh',
      buffScope: BUFF_SCOPE,
      ...overrides,
    }), pattern, label);
  }
});

test('requires an infliction fact and never derives it from Immune to markup', () => {
  const pagePayload = {
    ...WALL_PAGE,
    wikitext: WALL_PAGE.wikitext.replace(/\| debuff[\s\S]*?\n\}\}/, '\n}}'),
    html: '<th>Immune to</th><td class="immunities"><a title="Horrified">Horrified</a></td>',
  };

  assert.throws(() => extractBuffNpcPageInflictionEvidence({
    pagePayload,
    expectedPageTitle: 'Wall of Flesh',
    npcSourceId: 113,
    npcInternalName: 'WallofFlesh',
    npcName: 'Wall of Flesh',
    buffScope: BUFF_SCOPE,
  }), /no NPC infliction facts/);
});

test('binds infliction facts to the requested NPC infobox when a page has multiple infoboxes', () => {
  const pagePayload = {
    ...WALL_PAGE,
    wikitext: `{{npc infobox
| auto = 999
| image = OtherBoss.gif
| debuff = Other Debuff
}}
{{npc infobox
| auto = 113
| image = Wall of Flesh.gif
| debuff = Horrified
| debuffduration = While the player is within 120 tiles from the boss.
}}
`,
  };

  const result = extractBuffNpcPageInflictionEvidence({
    pagePayload,
    expectedPageTitle: 'Wall of Flesh',
    npcSourceId: 113,
    npcInternalName: 'WallofFlesh',
    npcName: 'Wall of Flesh',
    buffScope: BUFF_SCOPE,
  });

  assert.deepEqual(result.facts.map(fact => [fact.npcSourceId, fact.buffId]), [[113, 37]]);
});

test('retains inflictions from an alias rendering of the same stable auto ID', () => {
  const result = extractBuffNpcPageInflictionEvidence({
    pagePayload: {
      ...WALL_PAGE,
      wikitext: `{{npc infobox|auto=113|image=Wall of Flesh.gif}}
{{npc infobox|auto=113|image=Wall of Flesh Mouth.gif|debuff=Horrified}}`,
    },
    expectedPageTitle: 'Wall of Flesh',
    npcSourceId: 113,
    npcInternalName: 'WallofFlesh',
    npcName: 'Wall of Flesh',
    buffScope: BUFF_SCOPE,
  });

  assert.deepEqual(result.facts.map(fact => [fact.npcSourceId, fact.buffId]), [[113, 37]]);
});

test('accepts revision-bound negative NPC auto IDs without changing page or Buff identity checks', () => {
  const result = extractBuffNpcPageInflictionEvidence({
    pagePayload: {
      ...WALL_PAGE,
      wikitext: WALL_PAGE.wikitext.replace('auto = 113', 'auto = -65'),
    },
    expectedPageTitle: 'Wall of Flesh',
    npcSourceId: -65,
    npcInternalName: 'WallofFlesh',
    npcName: 'Wall of Flesh',
    buffScope: BUFF_SCOPE,
  });
  assert.equal(result.facts[0].npcSourceId, -65);
});

test('accepts a uniquely identified NPC infobox whose stable auto ID has no image or name label', () => {
  const result = extractBuffNpcPageInflictionEvidence({
    pagePayload: {
      ...WALL_PAGE,
      wikitext: `{{npc infobox
| auto = 113
| debuff = Horrified
| debuffduration = permanent
}}`,
    },
    expectedPageTitle: 'Wall of Flesh',
    npcSourceId: 113,
    npcInternalName: 'WallofFlesh',
    npcName: 'Wall of Flesh',
    buffScope: BUFF_SCOPE,
  });
  assert.deepEqual(result.facts.map(fact => fact.buffId), [37]);
});

test('binds a unique unkeyed top-level infobox to the requested named NPC', () => {
  const result = extractBuffNpcPageInflictionEvidence({
    pagePayload: {
      ...WALL_PAGE,
      requestedPageTitle: 'Golem',
      pageTitle: 'Golem',
      pageId: 14022,
      revisionId: 1032187,
      wikitext: `{{npc infobox
| name = Golem
| debuff = On Fire!
| debuffduration = permanent
}}
{{npc infobox
| auto = 245
| image = Golem Core.png
}}
{{npc infobox
| auto = 246
| name = Golem Head
}}`,
    },
    expectedPageTitle: 'Golem',
    npcSourceId: 245,
    npcInternalName: 'Golem',
    npcName: 'Golem',
    buffScope: [{ id: 24, internalName: 'OnFire', englishName: 'On Fire!' }],
  });

  assert.deepEqual(result.facts.map(fact => [fact.npcSourceId, fact.buffId]), [[245, 24]]);
});

test('rejects ambiguous unkeyed infobox ownership instead of widening a fact scope', () => {
  assert.throws(() => extractBuffNpcPageInflictionEvidence({
    pagePayload: {
      ...WALL_PAGE,
      requestedPageTitle: 'Golem',
      pageTitle: 'Golem',
      wikitext: `{{npc infobox
| name = Golem
| debuff = On Fire!
}}
{{npc infobox
| name = Golem
| debuff = Moon Bite
}}`,
    },
    expectedPageTitle: 'Golem',
    npcSourceId: 245,
    npcInternalName: 'Golem',
    npcName: 'Golem',
    buffScope: [
      { id: 24, internalName: 'OnFire', englishName: 'On Fire!' },
      { id: 145, internalName: 'MoonLeech', englishName: 'Moon Bite' },
    ],
  }), /NPC identity is invalid/);
});

test('accepts a stable auto ID when a page variant image has a narrower label', () => {
  const result = extractBuffNpcPageInflictionEvidence({
    pagePayload: {
      ...WALL_PAGE,
      requestedPageTitle: 'Duke Fishron',
      pageTitle: 'Duke Fishron',
      wikitext: `{{npc infobox
| auto = 370
| image = Duke Fishron (First Form).gif
| debuff = Horrified
| debuffduration = permanent
}}`,
    },
    expectedPageTitle: 'Duke Fishron',
    npcSourceId: 370,
    npcInternalName: 'DukeFishron',
    npcName: 'Duke Fishron',
    buffScope: BUFF_SCOPE,
  });
  assert.deepEqual(result.facts.map(fact => fact.buffId), [37]);
});

test('retains distinct form inflictions when one stable NPC auto ID is rendered more than once', () => {
  const result = extractBuffNpcPageInflictionEvidence({
    pagePayload: {
      ...WALL_PAGE,
      requestedPageTitle: 'The Twins',
      pageTitle: 'The Twins',
      wikitext: `{{npc infobox
| auto = 126
| image = Spazmatism (first form).gif
| debuff = Horrified
}}
{{npc infobox
| auto = 126
| image = Spazmatism (second form).gif
| name = Spazmatism
| debuff = The Tongue
}}`,
    },
    expectedPageTitle: 'The Twins',
    npcSourceId: 126,
    npcInternalName: 'Spazmatism',
    npcName: 'Spazmatism',
    buffScope: BUFF_SCOPE,
  });
  assert.deepEqual(result.facts.map(fact => fact.buffId), [37, 38]);
});

test('collapses exact duplicate infliction rows from one rendered NPC identity', () => {
  const result = extractBuffNpcPageInflictionEvidence({
    pagePayload: {
      ...WALL_PAGE,
      requestedPageTitle: 'Black Recluse',
      pageTitle: 'Black Recluse',
      wikitext: `{{npc infobox
| auto = 163
| image = Black Recluse (ground).gif
| debuff = Horrified
| debuffduration = permanent
}}
{{npc infobox
| auto = 163
| image = Black Recluse (ground).gif
| debuff = Horrified
| debuffduration = permanent
}}`,
    },
    expectedPageTitle: 'Black Recluse',
    npcSourceId: 163,
    npcInternalName: 'BlackRecluse',
    npcName: 'Black Recluse',
    buffScope: BUFF_SCOPE,
  });
  assert.deepEqual(result.facts.map(fact => fact.buffId), [37]);
});

test('trusts a unique auto ID when the Wiki label is an alias of the standardized NPC', () => {
  const result = extractBuffNpcPageInflictionEvidence({
    pagePayload: {
      ...WALL_PAGE,
      requestedPageTitle: 'Slimes',
      pageTitle: 'Slimes',
      wikitext: `{{npc infobox
| auto = -2
| image = [[File:Corrupt Slime.gif|link=]]
| name = Corrupt Slime
| debuff = Horrified
}}`,
    },
    expectedPageTitle: 'Slimes',
    npcSourceId: -2,
    npcInternalName: 'Slimer2',
    npcName: 'Slimer',
    buffScope: BUFF_SCOPE,
  });
  assert.deepEqual(result.facts.map(fact => fact.buffId), [37]);
});
