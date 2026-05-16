import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES,
  buildBuffDomainCoverageBaseline,
  classifyBuffEvidenceCoverage,
  classifySourceCoverageIssue,
  classifyImmuneCoverageIssue,
  classifyInflictingCoverageIssue,
} from './audit-buff-domain-coverage-baseline.mjs';

test('classifySourceCoverageIssue flags missing source items for CursedInferno only', () => {
  assert.equal(
    classifySourceCoverageIssue({
      internalName: 'CursedInferno',
      sourceItemCount: 0,
    }),
    'missingSourceItems'
  );
  assert.equal(
    classifySourceCoverageIssue({
      internalName: 'CursedInferno',
      sourceItemCount: 7,
    }),
    null
  );
  assert.equal(
    classifySourceCoverageIssue({
      internalName: 'WellFed',
      sourceItemCount: 0,
    }),
    null
  );
});

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
        sourceItemCount: 0,
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
  assert.equal(actual.summary.sourceCoverageWarnings, 1);
  assert.equal(actual.summary.immuneCoverageWarnings, 1);
  assert.equal(actual.summary.inflictingCoverageWarnings, 2);
  assert.equal(actual.summary.relationConsistencyWarnings, 2);
  assert.equal(actual.summary.bridgeCoverageWarnings, 1);
  assert.equal(actual.sourceCoverageWarnings[0].internalName, 'CursedInferno');
  assert.equal(actual.immuneCoverageWarnings[0].internalName, 'CursedInferno');
  assert.equal(actual.inflictingCoverageWarnings[0].internalName, 'CursedInferno');
  assert.equal(actual.bridgeCoverageWarnings[0].internalName, 'Spazmatism');
});

test('audit flags CursedInferno when source, immune, and inflicting coverage are incomplete', () => {
  const report = buildBuffDomainCoverageBaseline({
    buffs: [{
      id: 39,
      internalName: 'CursedInferno',
      englishName: 'Cursed Inferno',
      nameZh: '诅咒狱火',
      sourceItemCount: 0,
      immuneNpcCount: 25,
      immuneNpcSample: [],
    }],
    inflictingCountsByBuffInternalName: new Map([['CursedInferno', 0]]),
  });

  assert.deepEqual(
    {
      source: report.sourceCoverageWarnings.map((row) => [row.internalName, row.issue]),
      immune: report.immuneCoverageWarnings.map((row) => [row.internalName, row.issue]),
      inflicting: report.inflictingCoverageWarnings.map((row) => [row.internalName, row.issue]),
    },
    {
      source: [['CursedInferno', 'missingSourceItems']],
      immune: [['CursedInferno', 'missingSampleForPositiveCount']],
      inflicting: [['CursedInferno', 'highRiskDebuffLowInflicts']],
    }
  );
});

test('required high-priority sample list includes fixed buff evidence targets', () => {
  assert.deepEqual(REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES, [
    'CursedInferno',
    'OnFire',
    'OnFire3',
    'Poisoned',
    'Bleeding',
    'Confused',
    'Frostburn',
    'Frostburn2',
    'Ichor',
    'Venom',
    'ShadowFlame',
    'Shimmer',
    'Hemorrhage',
  ]);
});

test('classifyBuffEvidenceCoverage assigns full evidence acceptance categories', () => {
  assert.equal(
    classifyBuffEvidenceCoverage({
      internalName: 'CursedInferno',
      sourceItems: [{ internalName: 'CursedArrow' }],
      inflictingNpcs: [{ internalName: 'Clinger' }],
      immuneNpcCount: 1,
      immuneNpcs: [{ internalName: 'DungeonGuardian' }],
      sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
    }),
    'complete'
  );
  assert.equal(
    classifyBuffEvidenceCoverage({
      internalName: 'OnFire3',
      sourceItems: [],
      inflictingNpcs: [{ internalName: 'LavaSlime' }],
      immuneNpcCount: 1,
      immuneNpcs: [{ internalName: 'MeteorHead' }],
      sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
    }),
    'missing_source_items'
  );
  assert.equal(
    classifyBuffEvidenceCoverage({
      internalName: 'Poisoned',
      sourceItems: [{ internalName: 'PoisonedKnife' }],
      inflictingNpcs: [],
      immuneNpcCount: 1,
      immuneNpcs: [{ internalName: 'Hornet' }],
      sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
    }),
    'missing_inflicting_npcs'
  );
  assert.equal(
    classifyBuffEvidenceCoverage({
      internalName: 'Bleeding',
      sourceItems: [{ internalName: 'SharkToothNecklace' }],
      inflictingNpcs: [{ internalName: 'Werewolf' }],
      immuneNpcCount: 2,
      immuneNpcSample: [{ internalName: 'Zombie' }],
      sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
    }),
    'missing_full_immune_npcs'
  );
  assert.equal(
    classifyBuffEvidenceCoverage({
      internalName: 'Confused',
      immuneNpcCount: 2,
      immuneNpcSample: [{ internalName: 'Bat' }],
    }),
    'missing_source_evidence'
  );
  assert.equal(
    classifyBuffEvidenceCoverage({
      internalName: 'Frostburn',
      sourceEvidence: { parseStatus: 'parse_incomplete', unresolvedFacts: [] },
    }),
    'parse_required'
  );
  assert.equal(
    classifyBuffEvidenceCoverage({
      internalName: 'Ichor',
      sourceEvidence: {
        parseStatus: 'parsed',
        unresolvedFacts: [{ group: 'sourceItems', status: 'ambiguous' }],
      },
    }),
    'manual_review_required'
  );
});

test('buildBuffDomainCoverageBaseline emits full evidence statistics and fails one-complete-sample gate', () => {
  const report = buildBuffDomainCoverageBaseline({
    buffs: [
      {
        id: 39,
        internalName: 'CursedInferno',
        englishName: 'Cursed Inferno',
        sourceItems: [{ internalName: 'CursedArrow' }],
        inflictingNpcs: [{ internalName: 'Clinger' }],
        immuneNpcCount: 1,
        immuneNpcs: [{ internalName: 'DungeonGuardian' }],
        sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
      },
      {
        id: 24,
        internalName: 'OnFire',
        englishName: 'On Fire!',
        sourceItems: [],
        inflictingNpcs: [],
        immuneNpcCount: 47,
        immuneNpcSample: new Array(10).fill({ internalName: 'MeteorHead' }),
      },
      {
        id: 323,
        internalName: 'OnFire3',
        englishName: 'Hellfire',
        sourceItems: [],
        inflictingNpcs: [],
        immuneNpcCount: 47,
        immuneNpcSample: new Array(10).fill({ internalName: 'Demon' }),
      },
    ],
  });

  assert.deepEqual(report.summary.evidence, {
    total: 3,
    withSourceEvidence: 1,
    withSourceItems: 1,
    withInflictingNpcs: 1,
    withFullImmuneNpcs: 1,
    immunePositiveMissingFull: 2,
    sourceMissingButImmunePositive: 2,
    oneSampleOnlyRisks: 2,
  });
  assert.equal(report.gates.fullBuffEvidence.passed, false);
  assert.match(report.gates.fullBuffEvidence.reason, /Only 1 of 3/);
  assert.deepEqual(
    Object.fromEntries(Object.entries(report.categories).map(([key, rows]) => [key, rows.map((row) => row.internalName)])),
    {
      complete: ['CursedInferno'],
      missing_source_items: [],
      missing_inflicting_npcs: [],
      missing_full_immune_npcs: [],
      missing_source_evidence: ['OnFire', 'OnFire3'],
      parse_required: [],
      manual_review_required: [],
    }
  );
  assert.deepEqual(report.requiredSamples.missing, [
    'Poisoned',
    'Bleeding',
    'Confused',
    'Frostburn',
    'Frostburn2',
    'Ichor',
    'Venom',
    'ShadowFlame',
    'Shimmer',
    'Hemorrhage',
  ]);
});

test('full evidence gate fails when non-sample buffs still miss parsed fact groups', () => {
  const completeRequiredSamples = REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES.map((internalName, index) => ({
    id: index + 1,
    internalName,
    sourceItems: [{ internalName: `${internalName}SourceItem` }],
    inflictingNpcs: [{ internalName: `${internalName}InflictingNpc` }],
    immuneNpcCount: 1,
    immuneNpcs: [{ internalName: `${internalName}ImmuneNpc` }],
    sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
  }));
  const report = buildBuffDomainCoverageBaseline({
    buffs: [
      ...completeRequiredSamples,
      {
        id: 999,
        internalName: 'DecorativeBuffWithoutCombatFacts',
        sourceItems: [],
        inflictingNpcs: [],
        immuneNpcCount: 0,
        immuneNpcs: [],
        sourceEvidence: {
          parseStatus: 'parsed',
          unresolvedFacts: [],
          factGroups: {
            sourceItems: { status: 'section_missing', count: 0 },
            inflictingNpcs: { status: 'section_missing', count: 0 },
            immuneNpcs: { status: 'section_missing', count: 0 },
          },
        },
      },
    ],
  });

  assert.equal(report.summary.evidence.total, REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES.length + 1);
  assert.equal(report.summary.evidence.withSourceEvidence, report.summary.evidence.total);
  assert.equal(report.summary.evidence.withSourceItems, REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES.length);
  assert.equal(report.summary.evidence.withInflictingNpcs, REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES.length);
  assert.equal(report.gates.fullBuffEvidence.passed, true);
  assert.deepEqual(
    Object.fromEntries(Object.entries(report.categories).map(([key, rows]) => [key, rows.length])),
    {
      complete: REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES.length + 1,
      missing_source_items: 0,
      missing_inflicting_npcs: 0,
      missing_full_immune_npcs: 0,
      missing_source_evidence: 0,
      parse_required: 0,
      manual_review_required: 0,
    }
  );
});

test('full evidence gate fails missing fact groups without trusted terminal section status', () => {
  const completeRequiredSamples = REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES.map((internalName, index) => ({
    id: index + 1,
    internalName,
    sourceItems: [{ internalName: `${internalName}SourceItem` }],
    inflictingNpcs: [{ internalName: `${internalName}InflictingNpc` }],
    immuneNpcCount: 1,
    immuneNpcs: [{ internalName: `${internalName}ImmuneNpc` }],
    sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
  }));
  const report = buildBuffDomainCoverageBaseline({
    buffs: [
      ...completeRequiredSamples,
      {
        id: 999,
        internalName: 'SuspiciousEmptyBuff',
        sourceItems: [],
        inflictingNpcs: [],
        immuneNpcCount: 0,
        immuneNpcs: [],
        sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
      },
    ],
  });

  assert.equal(report.gates.fullBuffEvidence.passed, false);
  assert.match(report.gates.fullBuffEvidence.reason, /missing_source_items=1/);
});

test('section_missing is not trusted when page sections show unparsed cause evidence', () => {
  assert.equal(
    classifyBuffEvidenceCoverage({
      internalName: 'PotionSickness',
      sourceItems: [],
      inflictingNpcs: [],
      immuneNpcCount: 0,
      immuneNpcs: [],
      sourceEvidence: {
        parseStatus: 'parsed',
        sectionAnchors: ['Causes', 'From_item'],
        sourceSections: [],
        unresolvedFacts: [],
        factGroups: {
          sourceItems: { status: 'section_missing', count: 0, sections: [] },
          inflictingNpcs: { status: 'section_missing', count: 0, sections: [] },
          immuneNpcs: { status: 'section_missing', count: 0, sections: [] },
        },
      },
    }),
    'missing_source_items'
  );

  assert.equal(
    classifyBuffEvidenceCoverage({
      internalName: 'ShadowFlame',
      sourceItems: [{ internalName: 'ShadowflameKnife' }],
      inflictingNpcs: [],
      immuneNpcCount: 1,
      immuneNpcs: [{ internalName: 'AncientVision' }],
      sourceEvidence: {
        parseStatus: 'parsed',
        sectionAnchors: ['Causes', 'From_player', 'From_NPCs', 'Immune_NPCs'],
        sourceSections: ['From player', 'Immune NPCs'],
        unresolvedFacts: [],
        factGroups: {
          sourceItems: { status: 'parsed', count: 1, sections: ['From player'] },
          inflictingNpcs: { status: 'section_missing', count: 0, sections: [] },
          immuneNpcs: { status: 'parsed', count: 1, sections: ['Immune NPCs'] },
        },
      },
    }),
    'missing_inflicting_npcs'
  );
});

test('buildBuffDomainCoverageBaseline exposes unresolved facts in category rows', () => {
  const report = buildBuffDomainCoverageBaseline({
    buffs: [
      {
        internalName: 'UnresolvedBuff',
        sourceEvidence: {
          parseStatus: 'parsed',
          unresolvedFacts: [
            { group: 'sourceItems', status: 'ambiguous', pageTitle: 'Mystery Source' }
          ],
        },
      },
    ],
  });

  assert.deepEqual(report.categories.manual_review_required[0].unresolvedFacts, [
    { group: 'sourceItems', status: 'ambiguous', pageTitle: 'Mystery Source' }
  ]);
});

test('withFullImmuneNpcs counts only positive immune NPC evidence with complete full rows', () => {
  const report = buildBuffDomainCoverageBaseline({
    buffs: [
      {
        internalName: 'WellFed',
        sourceItems: [{ internalName: 'ApplePie' }],
        inflictingNpcs: [{ internalName: 'Pigronata' }],
        immuneNpcCount: 0,
        sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
      },
      {
        internalName: 'CursedInferno',
        sourceItems: [{ internalName: 'CursedArrow' }],
        inflictingNpcs: [{ internalName: 'Clinger' }],
        immuneNpcCount: 2,
        immuneNpcs: [{ internalName: 'DungeonGuardian' }, { internalName: 'MartianSaucer' }],
        sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
      },
      {
        internalName: 'OnFire',
        sourceItems: [{ internalName: 'Flamarang' }],
        inflictingNpcs: [{ internalName: 'FireImp' }],
        immuneNpcCount: 2,
        immuneNpcSample: [{ internalName: 'MeteorHead' }],
        sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
      },
    ],
  });

  assert.equal(report.summary.evidence.withFullImmuneNpcs, 1);
  assert.equal(report.summary.evidence.immunePositiveMissingFull, 1);
});

test('standardized inflicting evidence gaps are not hidden by relation DB counts', () => {
  const report = buildBuffDomainCoverageBaseline({
    buffs: [
      {
        internalName: 'CursedInferno',
        sourceItems: [{ internalName: 'CursedArrow' }],
        inflictingNpcs: [],
        immuneNpcCount: 1,
        immuneNpcs: [{ internalName: 'DungeonGuardian' }],
        sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
      },
    ],
    inflictingCountsByBuffInternalName: new Map([['CursedInferno', 3]]),
  });

  assert.equal(report.summary.evidence.withInflictingNpcs, 0);
  assert.deepEqual(report.categories.missing_inflicting_npcs.map((row) => row.internalName), ['CursedInferno']);
  assert.deepEqual(report.relationConsistencyWarnings.map((row) => row.issue), ['standardized_missing_relation_present']);
  assert.equal(report.gates.fullBuffEvidence.passed, false);
});

test('relation materialization gaps do not redefine standardized evidence completeness', () => {
  const completeRequiredSamples = REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES.map((internalName, index) => ({
    id: index + 1,
    internalName,
    sourceItems: [{ internalName: `${internalName}SourceItem` }],
    inflictingNpcs: [{ internalName: `${internalName}InflictingNpc` }],
    immuneNpcCount: 1,
    immuneNpcs: [{ internalName: `${internalName}ImmuneNpc` }],
    sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
  }));
  const report = buildBuffDomainCoverageBaseline({
    buffs: completeRequiredSamples,
    inflictingCountsByBuffInternalName: new Map([
      ['CursedInferno', 0],
      ...completeRequiredSamples
        .filter((row) => row.internalName !== 'CursedInferno')
        .map((row) => [row.internalName, 1]),
    ]),
  });

  assert.equal(report.gates.fullBuffEvidence.passed, true);
  assert.equal(report.gates.relationMaterialization.passed, false);
  assert.deepEqual(report.relationConsistencyWarnings.map((row) => row.internalName), ['CursedInferno']);
  assert.match(report.gates.relationMaterialization.reason, /relationConsistencyWarnings=1/);
});

test('relation materialization accounts for unresolved buff inflicting facts before warning', () => {
  const completeRequiredSamples = REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES.map((internalName, index) => ({
    id: index + 1,
    internalName,
    sourceItems: [{ internalName: `${internalName}SourceItem` }],
    inflictingNpcs: [{ internalName: `${internalName}InflictingNpc` }],
    immuneNpcCount: 1,
    immuneNpcs: [{ internalName: `${internalName}ImmuneNpc` }],
    sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
  }));
  const report = buildBuffDomainCoverageBaseline({
    buffs: completeRequiredSamples,
    inflictingCountsByBuffInternalName: new Map([
      ['CursedInferno', 0],
      ...completeRequiredSamples
        .filter((row) => row.internalName !== 'CursedInferno')
        .map((row) => [row.internalName, 1]),
    ]),
    relationIssueCountsByBuffInternalName: new Map([
      ['CursedInferno', 1],
    ]),
  });

  assert.equal(report.gates.fullBuffEvidence.passed, true);
  assert.equal(report.gates.relationMaterialization.passed, true);
  assert.deepEqual(report.relationConsistencyWarnings, []);
  assert.equal(report.summary.relationUnresolvedInflictingIssues, 1);
});

test('relation materialization warns when partial inflicting facts are neither materialized nor unresolved', () => {
  const report = buildBuffDomainCoverageBaseline({
    buffs: [
      {
        id: 24,
        internalName: 'OnFire',
        sourceItems: [{ internalName: 'Flamarang' }],
        inflictingNpcs: [
          { internalName: 'MeteorHead' },
          { internalName: 'TorchSlime' },
          { internalName: 'FireImp' },
        ],
        immuneNpcCount: 1,
        immuneNpcs: [{ internalName: 'MeteorHead' }],
        sourceEvidence: { parseStatus: 'parsed', unresolvedFacts: [] },
      },
    ],
    inflictingCountsByBuffInternalName: new Map([['OnFire', 1]]),
    relationIssueCountsByBuffInternalName: new Map([['OnFire', 1]]),
  });

  assert.deepEqual(report.relationConsistencyWarnings.map((row) => ({
    internalName: row.internalName,
    issue: row.issue,
    unaccountedInflictingNpcCount: row.unaccountedInflictingNpcCount,
  })), [
    {
      internalName: 'OnFire',
      issue: 'relation_unaccounted_standardized_present',
      unaccountedInflictingNpcCount: 1,
    },
  ]);
  assert.equal(report.gates.relationMaterialization.passed, false);
});
