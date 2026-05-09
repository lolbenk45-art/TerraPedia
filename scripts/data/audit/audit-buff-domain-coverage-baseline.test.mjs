import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBuffDomainCoverageBaseline,
  classifyImmuneCoverageIssue,
  classifyInflictingCoverageIssue,
} from './audit-buff-domain-coverage-baseline.mjs';

test('classifyImmuneCoverageIssue flags suspicious sample-to-count gaps', () => {
  assert.equal(
    classifyImmuneCoverageIssue({ immuneNpcCount: 25, immuneNpcSample: [{}, {}, {}] }),
    'sampleTooSmallForCount'
  );
  assert.equal(
    classifyImmuneCoverageIssue({ immuneNpcCount: 0, immuneNpcSample: [] }),
    null
  );
  assert.equal(
    classifyImmuneCoverageIssue({ immuneNpcCount: 215, immuneNpcSample: new Array(10).fill({}) }),
    null
  );
});

test('classifyInflictingCoverageIssue flags only under-covered high risk debuffs', () => {
  assert.equal(
    classifyInflictingCoverageIssue({
      internalName: 'CursedInferno',
      englishName: 'Cursed Inferno',
      inflictingNpcCount: 1,
    }),
    'highRiskDebuffLowInflicts'
  );
  assert.equal(
    classifyInflictingCoverageIssue({
      internalName: 'Stoned',
      englishName: 'Stoned',
      inflictingNpcCount: 1,
    }),
    null
  );
  assert.equal(
    classifyInflictingCoverageIssue({
      internalName: 'WellFed',
      englishName: 'Well Fed',
      inflictingNpcCount: 0,
    }),
    null
  );
});

test('buildBuffDomainCoverageBaseline aggregates immune and inflicting risk buckets', () => {
  const actual = buildBuffDomainCoverageBaseline({
    buffs: [
      {
        id: 39,
        internalName: 'CursedInferno',
        englishName: 'Cursed Inferno',
        nameZh: '璇呭拻鐙辩伀',
        immuneNpcCount: 25,
        immuneNpcSample: [{}, {}, {}],
      },
      {
        id: 20,
        internalName: 'Poisoned',
        englishName: 'Poisoned',
        nameZh: '涓瘨',
        immuneNpcCount: 215,
        immuneNpcSample: new Array(10).fill({}),
      },
    ],
    inflictingCountsByBuffInternalName: new Map([
      ['CursedInferno', 1],
      ['Poisoned', 8],
    ]),
    npcBridgeRecords: [
      {
        internalName: 'Clinger',
        wikiCrawler: { buffInflictions: [{ buffName: 'Cursed Inferno' }] },
      },
      {
        internalName: 'Spazmatism',
        wikiCrawler: { buffInflictions: [] },
      },
    ],
  });

  assert.equal(actual.summary.totalBuffs, 2);
  assert.equal(actual.summary.immuneCoverageWarnings, 1);
  assert.equal(actual.summary.inflictingCoverageWarnings, 1);
  assert.equal(actual.summary.bridgeCoverageWarnings, 1);
  assert.equal(actual.immuneCoverageWarnings[0].internalName, 'CursedInferno');
  assert.equal(actual.inflictingCoverageWarnings[0].internalName, 'CursedInferno');
  assert.equal(actual.bridgeCoverageWarnings[0].internalName, 'Spazmatism');
});
