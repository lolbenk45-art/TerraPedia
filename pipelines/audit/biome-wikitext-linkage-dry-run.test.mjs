import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBiomePageLookup,
  buildMaintBiomeWikitextPayloads,
  buildNameLookup,
  buildResolvedOnlyCandidates,
  matchBiomeWikitextEntries,
  parseBiomeInfocardEntries
} from './biome-wikitext-linkage-dry-run.mjs';

const sampleWikitext = `
{{infocard/start}}
{{infocard/mainheading|Characters}}
<div>
{{infocard/box|title=[[Pre-Hardmode]]:}}
{{dotlist|{{item|Green Slime}}|{{item|Zombie|note2=(night)}}}}
{{infocard/box|title=[[Critters]]:}}
{{dotlist|{{item|Bunny}}}}
</div>
{{infocard/mainheading|Unique Drops}}
<div>
{{infocard/box|title=From [[Green Slime]]s:}}
{{dotlist|{{item|Gel}}|{{item|Slime Staff|note2=({{chance|1/10000}} chance)}}}}
{{infocard/box|title=From [[fishing]]:}}
{{dotlist|{{item|Bass}}}}
</div>
{{infocard/mainheading|For Sale}}
<div>
{{infocard/box|title=Any [[Happiness|Happy]] [[NPC]] Shop:}}
{{dotlist|{{item|Forest Pylon}}}}
</div>
{{infocard/end}}
`;

test('parseBiomeInfocardEntries extracts headings, source boxes, item names, and notes', () => {
  const entries = parseBiomeInfocardEntries({ biomeCode: 'forest', pageTitle: 'Forest', wikitext: sampleWikitext });

  assert.deepEqual(
    entries.map((entry) => ({
      section: entry.section,
      source: entry.source,
      name: entry.name,
      note: entry.note
    })),
    [
      { section: 'Characters', source: 'Pre-Hardmode', name: 'Green Slime', note: null },
      { section: 'Characters', source: 'Pre-Hardmode', name: 'Zombie', note: '(night)' },
      { section: 'Characters', source: 'Critters', name: 'Bunny', note: null },
      { section: 'Unique Drops', source: 'From Green Slimes', name: 'Gel', note: null },
      { section: 'Unique Drops', source: 'From Green Slimes', name: 'Slime Staff', note: '(1/10000 chance)' },
      { section: 'Unique Drops', source: 'From fishing', name: 'Bass', note: null },
      { section: 'For Sale', source: 'Any Happy NPC Shop', name: 'Forest Pylon', note: null }
    ]
  );
});

test('matchBiomeWikitextEntries classifies item and npc matches without hiding ambiguity', () => {
  const entries = parseBiomeInfocardEntries({ biomeCode: 'forest', pageTitle: 'Forest', wikitext: sampleWikitext });
  const itemLookup = buildNameLookup([
    { id: 23, internalName: 'Gel', name: 'Gel' },
    { id: 1309, internalName: 'SlimeStaff', name: 'Slime Staff' },
    { id: 2290, internalName: 'Bass', name: 'Bass' },
    { id: 4876, internalName: 'TeleportationPylonPurity', name: 'Forest Pylon' }
  ], { entityType: 'item' });
  const npcLookup = buildNameLookup([
    { id: -3, internalName: 'GreenSlime', name: 'Green Slime' },
    { id: 1, internalName: 'BlueSlime', name: 'Blue Slime' },
    { id: 3, internalName: 'Zombie', name: 'Zombie' },
    { id: -55, internalName: 'BigRainZombie', name: 'Zombie' }
  ], { entityType: 'npc' });

  const result = matchBiomeWikitextEntries({
    biome: { code: 'forest', pageTitle: 'Forest' },
    entries,
    itemLookup,
    npcLookup
  });

  assert.equal(result.summary.totalEntries, 7);
  assert.equal(result.summary.item.resolved, 4);
  assert.equal(result.summary.npc.resolved, 1);
  assert.equal(result.summary.npc.ambiguous, 1);
  assert.equal(result.summary.npc.missing, 1);

  const zombie = result.entries.find((entry) => entry.name === 'Zombie');
  assert.equal(zombie.matchStatus, 'ambiguous');
  assert.equal(zombie.matchType, 'npc');
  assert.equal(zombie.matches.length, 2);

  const bunny = result.entries.find((entry) => entry.name === 'Bunny');
  assert.equal(bunny.matchStatus, 'missing');
  assert.equal(bunny.matchType, 'npc');
});

test('buildBiomePageLookup maps standardized biome page titles and codes', () => {
  const lookup = buildBiomePageLookup([
    { biomeCode: 'forest', pageTitle: 'Forest' },
    { code: 'snow', pageTitle: 'Snow biome' }
  ]);

  assert.deepEqual(lookup.get('forest'), { code: 'forest', pageTitle: 'Forest' });
  assert.deepEqual(lookup.get('snow biome'), { code: 'snow', pageTitle: 'Snow biome' });
});

test('buildBiomePageLookup maps maint biome suffix aliases back to standardized codes', () => {
  const lookup = buildBiomePageLookup([
    { code: 'ice', pageTitle: 'Ice biome' },
    { code: 'glowing_mushroom', pageTitle: 'Glowing Mushroom biome' }
  ]);

  assert.deepEqual(lookup.get('ice_biome'), { code: 'ice', pageTitle: 'Ice biome' });
  assert.deepEqual(lookup.get('glowing_mushroom_biome'), { code: 'glowing_mushroom', pageTitle: 'Glowing Mushroom biome' });
});

test('buildMaintBiomeWikitextPayloads maps active maint rows into parser payloads', () => {
  const payloads = buildMaintBiomeWikitextPayloads([
    {
      id: 37,
      biome_code: 'snow_biome',
      requested_page_title: 'Snow biome',
      page_title: 'Snow biome',
      page_id: 4079,
      source_revision_timestamp: '2026-04-07T02:49:49Z',
      landing_fetched_at: '2026-06-04T07:55:00.000Z',
      landing_source_key: 'wiki.page.biome_detail:snow_biome',
      wikitext: 'wiki text',
      raw_json: JSON.stringify({
        fetchedAt: '2026-06-04T07:55:00.000Z',
        sections: [{ level: '2', line: 'Characters' }]
      })
    },
    {
      id: 5,
      biome_code: 'snow',
      page_title: 'Snow biome',
      wikitext: '',
      raw_json: '{bad json'
    }
  ]);

  assert.deepEqual(payloads, [
    {
      biomeCode: 'snow_biome',
      requestedPageTitle: 'Snow biome',
      pageTitle: 'Snow biome',
      pageId: 4079,
      revisionTimestamp: '2026-04-07T02:49:49Z',
      fetchedAt: '2026-06-04T07:55:00.000Z',
      source: 'maint_biomes',
      sourceKey: 'wiki.page.biome_detail:snow_biome',
      wikitext: 'wiki text',
      sections: [{ level: '2', line: 'Characters' }]
    }
  ]);
});

test('buildResolvedOnlyCandidates emits only uniquely matched rows', () => {
  const entries = parseBiomeInfocardEntries({ biomeCode: 'forest', pageTitle: 'Forest', wikitext: sampleWikitext });
  const itemLookup = buildNameLookup([
    { id: 23, internalName: 'Gel', name: 'Gel' },
    { id: 1309, internalName: 'SlimeStaff', name: 'Slime Staff' },
    { id: 2290, internalName: 'Bass', name: 'Bass' },
    { id: 4876, internalName: 'TeleportationPylonPurity', name: 'Forest Pylon' }
  ], { entityType: 'item' });
  const npcLookup = buildNameLookup([
    { id: -3, internalName: 'GreenSlime', name: 'Green Slime' },
    { id: 3, internalName: 'Zombie', name: 'Zombie' },
    { id: -55, internalName: 'BigRainZombie', name: 'Zombie' }
  ], { entityType: 'npc' });
  const result = matchBiomeWikitextEntries({
    biome: { code: 'forest', pageTitle: 'Forest' },
    entries,
    itemLookup,
    npcLookup
  });

  const candidates = buildResolvedOnlyCandidates([result]);

  assert.deepEqual(candidates.summary, {
    total: 5,
    itemBiomeCandidates: 4,
    npcBiomeCandidates: 1
  });
  assert.deepEqual(
    candidates.itemBiomeCandidates.map((candidate) => ({
      biomeCode: candidate.biomeCode,
      itemInternalName: candidate.itemInternalName,
      relationType: candidate.relationType
    })),
    [
      { biomeCode: 'forest', itemInternalName: 'Gel', relationType: 'drop' },
      { biomeCode: 'forest', itemInternalName: 'SlimeStaff', relationType: 'drop' },
      { biomeCode: 'forest', itemInternalName: 'Bass', relationType: 'fishing' },
      { biomeCode: 'forest', itemInternalName: 'TeleportationPylonPurity', relationType: 'for_sale' }
    ]
  );
  assert.deepEqual(candidates.npcBiomeCandidates, [
    {
      biomeCode: 'forest',
      npcInternalName: 'GreenSlime',
      npcName: 'Green Slime',
      source: 'Pre-Hardmode',
      note: null,
      sourcePage: 'Forest'
    }
  ]);
});

test('buildResolvedOnlyCandidates prefers matched standardized biome code over raw maint code', () => {
  const entries = parseBiomeInfocardEntries({
    biomeCode: 'ice_biome',
    pageTitle: 'Ice biome',
    wikitext: `
{{infocard/start}}
{{infocard/mainheading|Unique Drops}}
{{infocard/box|title=From [[Ice Slime]]s:}}
{{dotlist|{{item|Gel}}}}
{{infocard/end}}
`
  });
  const itemLookup = buildNameLookup([{ id: 23, internalName: 'Gel', name: 'Gel' }], { entityType: 'item' });
  const result = matchBiomeWikitextEntries({
    biome: { code: 'ice', pageTitle: 'Ice biome' },
    entries,
    itemLookup,
    npcLookup: buildNameLookup([], { entityType: 'npc' })
  });

  const candidates = buildResolvedOnlyCandidates([result]);

  assert.deepEqual(candidates.itemBiomeCandidates.map((candidate) => candidate.biomeCode), ['ice']);
});
