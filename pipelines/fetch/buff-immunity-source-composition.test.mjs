import assert from 'node:assert/strict';
import test from 'node:test';

import { composeBuffImmunitySourceEvidence } from './buff-immunity-source-composition.mjs';
import { normalizeBuffPageEvidence } from '../relation/sync-buffs-to-relation.mjs';

function pageEvidence({ status = 'parsed', rows = [], pageTitle = 'Poisoned' } = {}) {
  return {
    buffId: 20,
    immuneNpcs: rows,
    immuneNpcCount: rows.length,
    sourceEvidence: {
      provider: 'terraria.wiki.gg',
      pageTitle,
      canonicalPageTitle: pageTitle,
      revisionId: 123,
      revisionTimestamp: '2026-09-30T00:00:00Z',
      parseStatus: status === 'parsed' ? 'parsed' : 'parse_incomplete',
      factGroups: { immuneNpcs: { status, count: rows.length, sections: status === 'section_missing' ? [] : ['Immune NPCs'] } },
      unresolvedFacts: status === 'parsed' ? [] : [{ group: 'immuneNpcs', status, sections: [] }]
    }
  };
}

function npcinfoEvidence(assertions = []) {
  return {
    completeness: 'positive-assertions-only',
    scope: [{ id: 20, internalName: 'Poisoned' }],
    assertions,
    source: {
      provider: 'terraria.wiki.gg',
      pageTitle: 'Module:Npcinfo/data',
      pageId: 18065,
      revisionId: 1022313,
      revisionTimestamp: '2026-08-20T18:13:10Z',
      rawSha256: 'sha256:raw',
      manifestSha256: 'sha256:manifest',
      inputSha256: 'sha256:input'
    }
  };
}

function completeNpcinfoEvidence(assertions = []) {
  return {
    ...npcinfoEvidence(assertions),
    completeness: 'complete-exhaustive-npc-scope',
    assertionsByBuffId: { 20: assertions },
  };
}

function expandedNpcinfoEvidence(assertions = []) {
  const sourcePages = ['Module:Npcinfo/doc', 'Module:Npcinfo/datagen', 'Template:GetBuffInfo', 'Whips']
    .map((pageTitle, index) => ({ pageTitle, pageId: index + 1, revisionId: index + 10,
      revisionTimestamp: '2026-09-30T00:00:00Z', rawSha256: `sha256:${String(index + 1).repeat(64)}` }));
  return {
    ...completeNpcinfoEvidence(assertions),
    completeness: 'complete-expanded-npc-scope',
    assertionsByBuffId: { 20: assertions },
    semanticExpansion: { schemaVersion: 'buff-npcinfo-semantic-expansion/v1', whipDebuffBuffIds: [310, 362], sourcePages },
  };
}

test('composes page rows and NPCinfo positives without promoting NPCinfo to canonical rows', () => {
  const result = composeBuffImmunitySourceEvidence({
    buffId: 20,
    buffInternalName: 'Poisoned',
    pageEvidence: pageEvidence({
      rows: [
        { pageTitle: 'Blue Slime', name: 'Blue Slime', source: 'buff-page-immunities' },
        { pageTitle: 'Hornet', name: 'Hornet', source: 'buff-page-immunities' }
      ]
    }),
    npcinfoEvidence: npcinfoEvidence([
      { npcId: 1, npcInternalName: 'BlueSlime', npcName: 'Blue Slime', buffId: 20 },
      { npcId: 2, npcInternalName: 'DungeonGuardian', npcName: 'Dungeon Guardian', buffId: 20 }
    ])
  });

  assert.equal(result.status, 'positive_sources_only');
  assert.deepEqual(result.page.rows.map(row => row.pageTitle), ['Blue Slime', 'Hornet']);
  assert.deepEqual(result.npcinfo.positiveAssertions.map(row => row.npcId), [1, 2]);
  assert.equal(result.canonicalImmuneNpcs, undefined);
  assert.deepEqual(result.reconciliation, {
    pageCount: 2,
    npcinfoCount: 2,
    countDelta: 0,
    countDrift: false,
    exactDisplayLabelOverlapCount: 1,
    identityBinding: 'unbound_across_sources',
    inflictingNpcCount: 0,
    directionalCountDrift: null
  });
  assert.equal(result.sources.page.revisionId, 123);
  assert.equal(result.sources.npcinfo.revisionId, 1022313);
});

test('retains positive NPCinfo assertions when the Buff page section is missing', () => {
  const result = composeBuffImmunitySourceEvidence({
    buffId: 20,
    buffInternalName: 'Poisoned',
    pageEvidence: pageEvidence({ status: 'section_missing' }),
    npcinfoEvidence: npcinfoEvidence([
      { npcId: 1, npcInternalName: 'BlueSlime', npcName: 'Blue Slime', buffId: 20 }
    ])
  });

  assert.equal(result.page.status, 'section_missing');
  assert.deepEqual(result.page.rows, []);
  assert.equal(result.npcinfo.positiveAssertions.length, 1);
  assert.equal(result.reconciliation.countDrift, null);
  assert.equal(result.reconciliation.identityBinding, 'unbound_across_sources');
});

test('rejects duplicate identities and out-of-scope NPCinfo assertions', () => {
  assert.throws(() => composeBuffImmunitySourceEvidence({
    buffId: 20,
    buffInternalName: 'Poisoned',
    pageEvidence: pageEvidence({ rows: [
      { pageTitle: 'Blue Slime' },
      { pageTitle: 'Blue Slime' }
    ] }),
    npcinfoEvidence: npcinfoEvidence([])
  }), /duplicate page immunity identity/);

  assert.throws(() => composeBuffImmunitySourceEvidence({
    buffId: 20,
    buffInternalName: 'Poisoned',
    pageEvidence: pageEvidence(),
    npcinfoEvidence: npcinfoEvidence([
      { npcId: 1, npcInternalName: 'BlueSlime', npcName: 'Blue Slime', buffId: 21 }
    ])
  }), /outside (?:Buff|selected) scope/);
});

test('records count drift without treating absence as a negative fact', () => {
  const result = composeBuffImmunitySourceEvidence({
    buffId: 20,
    buffInternalName: 'Poisoned',
    pageEvidence: pageEvidence({ rows: [{ pageTitle: 'Blue Slime' }] }),
    npcinfoEvidence: npcinfoEvidence([
      { npcId: 1, npcInternalName: 'BlueSlime', npcName: 'Blue Slime', buffId: 20 },
      { npcId: 2, npcInternalName: 'Hornet', npcName: 'Hornet', buffId: 20 },
      { npcId: 3, npcInternalName: 'DungeonGuardian', npcName: 'Dungeon Guardian', buffId: 20 }
    ])
  });

  assert.equal(result.reconciliation.countDelta, -2);
  assert.equal(result.reconciliation.countDrift, true);
  assert.equal(result.negativeAssertions, undefined);
});

test('normalizer keeps the page list canonical when positive NPCinfo evidence is attached', () => {
  const page = pageEvidence({ rows: [
    { pageTitle: 'Blue Slime', name: 'Blue Slime' }
  ] });
  page.immuneNpcSample = [...page.immuneNpcs];
  const composition = composeBuffImmunitySourceEvidence({
    buffId: 20,
    buffInternalName: 'Poisoned',
    pageEvidence: page,
    npcinfoEvidence: npcinfoEvidence([
      { npcId: 1, npcInternalName: 'BlueSlime', npcName: 'Blue Slime', buffId: 20 },
      { npcId: 2, npcInternalName: 'Hornet', npcName: 'Hornet', buffId: 20 }
    ])
  });
  const normalized = normalizeBuffPageEvidence({
    evidence: {
      ...page,
      sourceEvidence: { ...page.sourceEvidence, immuneNpcPositiveEvidence: composition }
    }
  });

  assert.deepEqual(normalized.immuneNpcs, page.immuneNpcs);
  assert.equal(normalized.immuneNpcs.length, 1);
  assert.equal(normalized.sourceEvidence.immuneNpcPositiveEvidence.status, 'positive_sources_only');
});

test('NPCinfo positives do not bypass a missing Buff-page immunity section', () => {
  const page = pageEvidence({ status: 'section_missing' });
  page.immuneNpcSample = [];
  const composition = composeBuffImmunitySourceEvidence({
    buffId: 20,
    buffInternalName: 'Poisoned',
    pageEvidence: page,
    npcinfoEvidence: npcinfoEvidence([
      { npcId: 1, npcInternalName: 'BlueSlime', npcName: 'Blue Slime', buffId: 20 }
    ])
  });
  assert.throws(() => normalizeBuffPageEvidence({
    evidence: {
      ...page,
      sourceEvidence: { ...page.sourceEvidence, immuneNpcPositiveEvidence: composition }
    }
  }), /incomplete|parsed immunity section/);
});

test('complete expanded NPCinfo immunity can normalize when the Buff page section is missing', () => {
  const page = pageEvidence({ status: 'section_missing' });
  page.sourceEvidence.parseStatus = 'parsed';
  page.immuneNpcSample = [];
  const composition = composeBuffImmunitySourceEvidence({
    buffId: 20,
    buffInternalName: 'Poisoned',
    pageEvidence: page,
    npcinfoEvidence: expandedNpcinfoEvidence([
      { npcId: 1, npcInternalName: 'BlueSlime', npcName: 'Blue Slime', buffId: 20 },
      { npcId: 2, npcInternalName: 'Hornet', npcName: 'Hornet', buffId: 20 },
    ]),
  });
  const normalized = normalizeBuffPageEvidence({
    evidence: {
      ...page,
      immuneNpcs: composition.immuneNpcPositiveEvidence.assertions.map((row) => ({
        npcId: row.npcId,
        internalName: row.npcInternalName,
        name: row.npcName,
        pageTitle: row.npcName ?? row.npcInternalName,
        source: 'npcinfo-module-expanded',
      })),
      immuneNpcCount: 2,
      immuneNpcSample: [{
        npcId: 1, internalName: 'BlueSlime', name: 'Blue Slime', pageTitle: 'Blue Slime',
        source: 'npcinfo-module-expanded',
      }],
      sourceEvidence: { ...page.sourceEvidence, immuneNpcPositiveEvidence: composition },
    },
  });

  assert.deepEqual(normalized.immuneNpcs.map((row) => row.npcId), [1, 2]);
  assert.equal(normalized.immuneNpcCount, 2);
  assert.equal(normalized.hasImmuneSection, false);
});

test('complete alternate immunity still rejects malformed or positive-only evidence', () => {
  const page = pageEvidence({ status: 'section_missing' });
  page.immuneNpcSample = [];
  const base = {
    ...page,
    immuneNpcs: [{ npcId: 1, internalName: 'BlueSlime', pageTitle: 'Blue Slime' }],
    immuneNpcCount: 1,
    immuneNpcSample: [{ npcId: 1, internalName: 'BlueSlime', pageTitle: 'Blue Slime' }],
  };
  assert.throws(() => normalizeBuffPageEvidence({ evidence: {
    ...base,
    sourceEvidence: {
      ...page.sourceEvidence,
      immuneNpcPositiveEvidence: {
        immuneNpcPositiveEvidence: { status: 'positive-assertions-only', assertions: [{ npcId: 1 }] },
      },
    },
  } }), /incomplete|parsed immunity section/);
});

test('keeps NPC-page infliction and exhaustive NPCinfo immunity evidence directional', () => {
  const result = composeBuffImmunitySourceEvidence({
    buffId: 20,
    buffInternalName: 'Poisoned',
    pageEvidence: pageEvidence({ rows: [{ pageTitle: 'Blue Slime' }] }),
    npcinfoEvidence: completeNpcinfoEvidence([
      { npcId: 1, npcInternalName: 'BlueSlime', npcName: 'Blue Slime', buffId: 20 },
    ]),
    inflictionEvidence: {
      completeness: 'positive-infliction-facts-only',
      source: {
        provider: 'terraria.wiki.gg', pageTitle: 'Blue Slime', pageId: 100,
        revisionId: 200, revisionTimestamp: '2026-09-30T00:00:00Z',
      },
      facts: [{
        relationType: 'inflicts', npcSourceId: 1, npcInternalName: 'BlueSlime',
        buffId: 20, buffInternalName: 'Poisoned', buffName: 'Poisoned',
        durationText: '5 seconds', sourceField: 'debuff', sourcePage: 'Blue Slime',
        sourcePageId: 100, sourceRevisionId: 200,
        sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
      }],
    },
  });

  assert.deepEqual(result.inflictingNpcPositiveEvidence.facts.map(fact => fact.relationType), ['inflicts']);
  assert.equal(result.inflictingNpcPositiveEvidence.status, 'positive-infliction-facts-only');
  assert.equal(result.immuneNpcPositiveEvidence.status, 'complete-npc-scope');
  assert.deepEqual(result.immuneNpcPositiveEvidence.assertions.map(row => row.npcId), [1]);
  assert.equal(result.inflictingNpcPositiveEvidence.immuneNpcs, undefined);
  assert.equal(result.immuneNpcPositiveEvidence.inflictingNpcs, undefined);
  assert.equal(result.reconciliation.directionalCountDrift, null);
});

test('rejects NPC infliction facts whose bound page provenance drifts', () => {
  assert.throws(() => composeBuffImmunitySourceEvidence({
    buffId: 20,
    buffInternalName: 'Poisoned',
    pageEvidence: pageEvidence({ rows: [{ pageTitle: 'Blue Slime' }] }),
    inflictionEvidence: {
      completeness: 'positive-infliction-facts-only',
      source: {
        provider: 'terraria.wiki.gg', pageTitle: 'Blue Slime', pageId: 100,
        revisionId: 200, revisionTimestamp: '2026-09-30T00:00:00Z',
      },
      facts: [{
        relationType: 'inflicts', npcSourceId: 1, npcInternalName: 'BlueSlime',
        buffId: 20, buffInternalName: 'Poisoned', buffName: 'Poisoned',
        sourcePage: 'Other Slime', sourcePageId: 101, sourceRevisionId: 201,
        sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
      }],
    },
  }), /provenance/);
});

test('accepts expanded all-buff NPCinfo evidence while preserving its direction', () => {
  const result = composeBuffImmunitySourceEvidence({
    buffId: 20,
    buffInternalName: 'Poisoned',
    pageEvidence: pageEvidence({ rows: [{ pageTitle: 'Blue Slime' }] }),
    npcinfoEvidence: expandedNpcinfoEvidence([
      { npcId: 1, npcInternalName: 'BlueSlime', npcName: 'Blue Slime', buffId: 20 },
    ]),
  });
  assert.equal(result.immuneNpcPositiveEvidence.status, 'complete-expanded-npc-scope');
  assert.deepEqual(result.immuneNpcPositiveEvidence.assertions.map(row => row.npcId), [1]);
  assert.equal(result.inflictingNpcPositiveEvidence.facts.length, 0);
});

test('accepts an exhaustive NPC-page infliction source without converting direction into immunity', () => {
  const result = composeBuffImmunitySourceEvidence({
    buffId: 20,
    buffInternalName: 'Poisoned',
    pageEvidence: pageEvidence({ rows: [{ pageTitle: 'Blue Slime' }] }),
    npcinfoEvidence: completeNpcinfoEvidence([
      { npcId: 1, npcInternalName: 'BlueSlime', npcName: 'Blue Slime', buffId: 20 },
    ]),
    inflictionEvidence: {
      completeness: 'complete-exhaustive-npc-page-scope',
      source: {
        provider: 'terraria.wiki.gg',
        inputSha256: 'sha256:' + '1'.repeat(64),
        targetsSha256: 'sha256:' + '2'.repeat(64),
        pageCount: 1,
        npcCount: 1,
        factSources: [{ pageTitle: 'Blue Slime', pageId: 100, revisionId: 200,
          revisionTimestamp: '2026-09-30T00:00:00Z', rawSha256: 'sha256:' + '3'.repeat(64) }],
        scopeCompleteness: 'all-npc-page-targets',
      },
      facts: [{
        relationType: 'inflicts', npcSourceId: 1, npcInternalName: 'BlueSlime',
        npcName: 'Blue Slime', buffId: 20, buffInternalName: 'Poisoned',
        buffName: 'Poisoned', durationText: '5 seconds', sourceField: 'debuff',
        sourcePage: 'Blue Slime', sourcePageId: 100, sourceRevisionId: 200,
        sourceRevisionTimestamp: '2026-09-30T00:00:00Z', sourceRawSha256: 'sha256:' + '3'.repeat(64),
      }],
    },
  });
  assert.equal(result.inflictingNpcPositiveEvidence.status, 'complete-exhaustive-npc-page-scope');
  assert.deepEqual(result.inflictingNpcPositiveEvidence.facts.map(fact => fact.npcSourceId), [1]);
  assert.equal(result.immuneNpcPositiveEvidence.inflictingNpcs, undefined);
});

test('incomplete alternate evidence remains diagnostic and cannot make a partial plan executable', async () => {
  const { buildBuffPartialFactPlan } = await import('../relation/buff-source-applicability.mjs');
  const plan = buildBuffPartialFactPlan({
    record: {
      id: 20,
      internalName: 'Poisoned',
      immuneNpcs: [],
      sourceEvidence: {
        provider: 'terraria.wiki.gg', pageTitle: 'Poisoned', canonicalPageTitle: 'Poisoned',
        revisionId: 100, revisionTimestamp: '2026-09-30T00:00:00Z', unresolvedFacts: [],
        factGroups: { immuneNpcs: { status: 'section_missing', sections: [] } },
        immuneNpcPositiveEvidence: {
          status: 'positive_sources_only',
          npcinfo: { status: 'positive-assertions-only', positiveAssertions: [{ npcId: 1 }] },
        },
      },
    },
    baseline: { immuneNpcs: [{ npcId: 9 }], immuneNpcCount: 1, immuneNpcSample: [{ npcId: 9 }] },
  });
  assert.equal(plan.executable, false);
  assert.equal(plan.executionBlocker, 'partial-fact-contract-review-required');
});
