import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNpcBuffRelationPlan,
  extractNpcBuffRelationCandidates,
  normalizeLookupKey
} from './backfill-npc-buff-relations-from-wiki-crawler.mjs';

test('extractNpcBuffRelationCandidates reads wikiCrawler buff inflictions from standardized NPC records', () => {
  const candidates = extractNpcBuffRelationCandidates({
    records: [
      {
        id: 480,
        internalName: 'Medusa',
        name: 'Medusa',
        wikiCrawler: {
          pageTitle: 'Medusa',
          sourceMetadata: { revisionTimestamp: '2026-04-30T00:00:00Z' },
          buffInflictions: [
            {
              buffName: 'Stoned',
              durationText: '{{duration|rawseconds=1-4}}',
              sourceField: 'debuff',
              sourceSection: 'infobox'
            }
          ]
        }
      }
    ]
  });

  assert.deepEqual(candidates, [
    {
      npcSourceId: 480,
      npcInternalName: 'Medusa',
      npcName: 'Medusa',
      pageTitle: 'Medusa',
      sourceRevisionTimestamp: '2026-04-30T00:00:00Z',
      buffName: 'Stoned',
      durationText: '{{duration|rawseconds=1-4}}',
      sourceField: 'debuff',
      sourceSection: 'infobox'
    }
  ]);
});

test('buildNpcBuffRelationPlan resolves NPC and debuff rows for local projection', () => {
  const plan = buildNpcBuffRelationPlan({
    standardizedPayload: {
      records: [
        {
          id: 480,
          internalName: 'Medusa',
          name: 'Medusa',
          wikiCrawler: {
            pageTitle: 'Medusa',
            buffInflictions: [
              {
                buffName: '[[Stoned]]',
                durationText: '{{duration|rawseconds=1-4}}',
                sourceSection: 'infobox'
              }
            ]
          }
        }
      ]
    },
    npcRows: [
      { id: 9001, source_id: 480, internal_name: 'Medusa', name: 'Medusa' }
    ],
    buffRows: [
      { id: 156, source_id: 156, internal_name: 'Stoned', english_name: 'Stoned', buff_type: 'debuff' }
    ]
  });

  assert.equal(plan.candidates, 1);
  assert.deepEqual(plan.affectedNpcIds, [9001]);
  assert.equal(plan.resolvedRows.length, 1);
  assert.deepEqual(plan.resolvedRows[0], {
    npcId: 9001,
    npcSourceId: 480,
    npcInternalName: 'Medusa',
    buffId: 156,
    buffSourceId: 156,
    buffInternalName: 'Stoned',
    buffName: 'Stoned',
    relationType: 'inflicts',
    durationTicks: null,
    chanceValue: null,
    chanceText: null,
    conditions: null,
    notes: '[auto:wiki-crawler-npc-infobox] page=Medusa; duration={{duration|rawseconds=1-4}}',
    sortOrder: 0
  });
  assert.deepEqual(plan.unmatchedRows, []);
});

test('buildNpcBuffRelationPlan marks crawled NPCs as affected even when they no longer have inflictions', () => {
  const plan = buildNpcBuffRelationPlan({
    standardizedPayload: {
      records: [
        {
          id: 480,
          internalName: 'Medusa',
          name: 'Medusa',
          wikiCrawler: {
            pageTitle: 'Medusa',
            buffInflictions: []
          }
        }
      ]
    },
    npcRows: [
      { id: 9001, source_id: 480, internal_name: 'Medusa', name: 'Medusa' }
    ],
    buffRows: []
  });

  assert.equal(plan.candidates, 0);
  assert.deepEqual(plan.affectedNpcIds, [9001]);
  assert.deepEqual(plan.resolvedRows, []);
});

test('normalizeLookupKey strips common wiki markup around buff names', () => {
  assert.equal(normalizeLookupKey('[[Ichor (debuff)|Ichor]]'), 'ichor');
  assert.equal(normalizeLookupKey('{{item link|Stoned}}'), 'stoned');
});
