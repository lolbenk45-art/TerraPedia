import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBuffPartialFactPlan,
  classifyBuffPageApplicability,
  summarizeBuffSourceApplicability,
} from './buff-source-applicability.mjs';

function record(overrides = {}) {
  return {
    internalName: 'ObsidianSkin',
    sourceEvidence: {
      pageTitle: 'Obsidian Skin Potion',
      sourceSections: [],
      factGroups: { immuneNpcs: { status: 'section_missing', sections: [] } },
      ...overrides,
    },
  };
}

test('unverified target remains unknown even if a producer marks the group parsed', () => {
  for (const status of ['parsed', 'target_unverified']) {
    assert.deepEqual(classifyBuffPageApplicability(record({
      factGroups: { immuneNpcs: { status, sections: ['Immune NPCs'] } },
      immunityTargetBinding: { status: 'unverified', targets: [] },
    })), { status: 'unknown', reason: 'immunity-target-unverified', evidence: null });
  }
});

test('missing immunity section remains unknown without explicit applicability evidence', () => {
  assert.deepEqual(classifyBuffPageApplicability(record()), {
    status: 'unknown', reason: 'missing-applicability-evidence', evidence: null,
  });
});

test('a parsed section for another buff is unknown even with a not-applicable claim', () => {
  const value = record({
    factGroups: { immuneNpcs: { status: 'target_mismatch', sections: ['Immune NPCs'] } },
    applicability: { status: 'not_applicable', evidenceType: 'source-page-contract/v1', reason: 'wrong target' },
  });
  assert.deepEqual(classifyBuffPageApplicability(value), {
    status: 'unknown', reason: 'immunity-target-mismatch', evidence: null,
  });
});

test('parsed immunity section is classified without asserting publication readiness', () => {
  assert.deepEqual(classifyBuffPageApplicability(record({
    factGroups: { immuneNpcs: { status: 'parsed', sections: [{ title: 'Immune NPCs' }] } },
  })), { status: 'parsed', reason: 'section-parsed', evidence: null });
});

test('complete alternate immunity evidence classifies a missing page section as parsed', () => {
  assert.deepEqual(classifyBuffPageApplicability(record({
    immuneNpcPositiveEvidence: {
      immuneNpcPositiveEvidence: {
        status: 'complete-expanded-npc-scope',
        assertions: [{ npcId: 1, npcInternalName: 'BlueSlime' }],
        source: {
          semanticExpansion: {
            schemaVersion: 'buff-npcinfo-semantic-expansion/v1',
            whipDebuffBuffIds: [310, 362], sourcePages: [
              'Module:Npcinfo/doc', 'Module:Npcinfo/datagen', 'Template:GetBuffInfo', 'Whips',
            ].map((pageTitle, index) => ({ pageTitle, pageId: index + 1, revisionId: index + 10,
              revisionTimestamp: '2026-09-30T00:00:00Z', rawSha256: `sha256:${String(index + 1).repeat(64)}` })),
          },
        },
      },
    },
  })), {
    status: 'parsed', reason: 'complete-alternate-immunity-source', evidence: null,
  });
});

test('complete alternate immunity may replace a target-mismatched page section', () => {
  const plan = buildBuffPartialFactPlan({
    record: {
      id: 165,
      internalName: 'DryadsWard',
      sourceItems: [],
      inflictingNpcs: [],
      immuneNpcs: [{ npcId: 1, internalName: 'BlueSlime', pageTitle: 'Blue Slime' }],
      immuneNpcCount: 1,
      immuneNpcSample: [{ npcId: 1, internalName: 'BlueSlime', pageTitle: 'Blue Slime' }],
      sourceEvidence: {
        provider: 'terraria.wiki.gg', pageTitle: "Dryad's Blessing", canonicalPageTitle: "Dryad's Blessing",
        revisionId: 1029403, revisionTimestamp: '2026-09-13T06:09:00Z', parseStatus: 'parse_incomplete',
        factGroups: {
          sourceItems: { status: 'section_missing', sections: [] },
          inflictingNpcs: { status: 'section_missing', sections: [] },
          immuneNpcs: { status: 'target_mismatch', sections: ['Immune NPCs'] },
        },
        unresolvedFacts: [
          { group: 'sourceItems', status: 'section_missing', sections: [] },
          { group: 'inflictingNpcs', status: 'section_missing', sections: [] },
          { group: 'immuneNpcs', status: 'target_mismatch', sections: ['Immune NPCs'] },
        ],
        immunityTargetBinding: { status: 'mismatch', targets: ["Dryad's Bane"] },
        completeImmuneNpcEvidence: {
          status: 'complete-npc-scope',
          assertions: [{ npcId: 1, npcInternalName: 'BlueSlime', npcName: 'Blue Slime' }],
        },
      },
    },
    baseline: {
      sourceItems: [{ itemId: 3 }], inflictingNpcs: [{ npcId: 5 }],
      immuneNpcs: [{ npcId: 7 }], immuneNpcCount: 1, immuneNpcSample: [{ npcId: 7 }],
    },
  });
  assert.deepEqual(plan.replaceGroups, ['immuneNpcs']);
  assert.deepEqual(plan.preserveGroups, ['sourceItems', 'inflictingNpcs']);
});

test('revision-bound item category cannot establish immunity applicability', () => {
  const value = record({ revisionId: 954224 });
  assert.deepEqual(classifyBuffPageApplicability(value, { pageClassification: { pageTitle: 'Obsidian Skin Potion', pageId: 7885, revisionId: 954224, categories: ['Category:Potion items'] } }), { status: 'unknown', reason: 'missing-applicability-evidence', evidence: null });
});

test('classification drift fails closed', () => {
  assert.throws(() => classifyBuffPageApplicability(record({ revisionId: 954224 }), { pageClassification: { pageTitle: 'Other', pageId: 7885, revisionId: 954224, categories: ['Category:Potion items'] } }), /drift/);
});

test('caller not-applicable reason is an unverified claim', () => {
  assert.deepEqual(classifyBuffPageApplicability(record({ revisionId: 1,
    applicability: { status: 'not_applicable', evidenceType: 'source-page-contract/v1', reason: 'source-page-kind:item', sourcePageTitle: 'Obsidian Skin Potion', revisionId: 1 },
  })), { status: 'not_applicable', reason: 'source-page-kind:item', evidence: { status: 'not_applicable', evidenceType: 'source-page-contract/v1', reason: 'source-page-kind:item', sourcePageTitle: 'Obsidian Skin Potion', revisionId: 1 } });
});

test('malformed applicability evidence fails closed', () => {
  assert.deepEqual(classifyBuffPageApplicability(record({ applicability: { status: 'not_applicable' } })), { status: 'unknown', reason: 'unverified-applicability-claim', evidence: null });
});

test('summary never counts category or reason claims as established not-applicable', () => {
  const result = summarizeBuffSourceApplicability([
    record(),
    record({ pageTitle: 'On Fire!', factGroups: { immuneNpcs: { status: 'parsed', sections: [{}] } } }),
    record({ applicability: { status: 'not_applicable', reason: 'source-page-kind:item' } }),
  ]);
  assert.deepEqual(result, { total: 3, parsed: 1, notApplicable: 0, unknown: 2 });
});

test('partial fact plan replaces complete groups and preserves unknown immunity baseline', () => {
  const plan = buildBuffPartialFactPlan({
    record: {
      id: 24,
      internalName: 'OnFire',
      sourceItems: [{ itemId: 1, internalName: 'FlamingArrow' }],
      inflictingNpcs: [],
      immuneNpcs: [],
      immuneNpcCount: 0,
      immuneNpcSample: [],
      sourceEvidence: {
        provider: 'terraria.wiki.gg',
        pageTitle: 'On Fire!',
        canonicalPageTitle: 'On Fire!',
        revisionId: 100,
        revisionTimestamp: '2026-09-30T00:00:00Z',
        factGroups: {
          sourceItems: { status: 'parsed', count: 1, sections: [{ title: 'From item' }] },
          inflictingNpcs: { status: 'section_missing', sections: [] },
          immuneNpcs: { status: 'section_missing', sections: [] },
        },
        unresolvedFacts: [],
      },
    },
    baseline: {
      inflictingNpcs: [{ npcId: 5, internalName: 'Zombie' }],
      immuneNpcs: [{ npcId: 7, pageTitle: 'FireImmunityNpc' }],
      immuneNpcCount: 1,
      immuneNpcSample: [{ npcId: 7, pageTitle: 'FireImmunityNpc' }],
    },
  });

  assert.equal(plan.schemaVersion, 'buff-partial-fact-plan/v1');
  assert.equal(plan.executable, false);
  assert.deepEqual(plan.replaceGroups, ['sourceItems']);
  assert.deepEqual(plan.preserveGroups, ['inflictingNpcs', 'immuneNpcs']);
  assert.deepEqual(plan.baseline.immuneNpcs, [{ npcId: 7, pageTitle: 'FireImmunityNpc' }]);
  assert.equal(plan.baseline.immuneNpcCount, 1);
});

test('partial fact plan rejects parsed groups without bound sections or baseline for unknown facts', () => {
  const base = {
    id: 24,
    internalName: 'OnFire',
    sourceEvidence: {
      provider: 'terraria.wiki.gg', pageTitle: 'On Fire!', canonicalPageTitle: 'On Fire!',
      revisionId: 100, revisionTimestamp: '2026-09-30T00:00:00Z', unresolvedFacts: [],
      factGroups: { immuneNpcs: { status: 'section_missing', sections: [] } },
    },
  };
  assert.throws(() => buildBuffPartialFactPlan({ record: base }), /baseline/);
  assert.throws(() => buildBuffPartialFactPlan({
    record: { ...base, sourceEvidence: {
      ...base.sourceEvidence,
      factGroups: { immuneNpcs: { status: 'parsed', sections: [] } },
    } },
    baseline: { immuneNpcs: [] },
  }), /parsed.*section/i);
});

test('partial fact plan rejects parsed group count drift', () => {
  const record = {
    id: 24,
    internalName: 'OnFire',
    sourceItems: [{ itemId: 1, internalName: 'FlamingArrow' }],
    sourceEvidence: {
      provider: 'terraria.wiki.gg', pageTitle: 'On Fire!', canonicalPageTitle: 'On Fire!',
      revisionId: 100, revisionTimestamp: '2026-09-30T00:00:00Z', unresolvedFacts: [],
      factGroups: {
        sourceItems: { status: 'parsed', count: 2, sections: ['From item'] },
        immuneNpcs: { status: 'section_missing', count: 0, sections: [] },
      },
    },
  };
  assert.throws(() => buildBuffPartialFactPlan({
    record,
    baseline: { immuneNpcs: [], immuneNpcCount: 0, immuneNpcSample: [] },
  }), /count/i);
});

test('partial fact plan rejects parsed immunity with unresolved target binding', () => {
  const record = {
    id: 24,
    internalName: 'OnFire',
    immuneNpcs: [{ npcId: 7, pageTitle: 'FireImmunityNpc' }],
    sourceEvidence: {
      provider: 'terraria.wiki.gg', pageTitle: 'On Fire!', canonicalPageTitle: 'On Fire!',
      revisionId: 100, revisionTimestamp: '2026-09-30T00:00:00Z', unresolvedFacts: [],
      immunityTargetBinding: { status: 'unverified', targets: [] },
      factGroups: { immuneNpcs: { status: 'parsed', sections: [{ title: 'Immune NPCs' }] } },
    },
  };
  assert.throws(() => buildBuffPartialFactPlan({ record, baseline: { immuneNpcs: [] } }), /target|applicability/i);
});

test('partial fact plan treats matching section-missing and no-rows parser facts as expected preservation', () => {
  const record = {
    id: 24,
    internalName: 'OnFire',
    sourceEvidence: {
      provider: 'terraria.wiki.gg', pageTitle: 'On Fire!', canonicalPageTitle: 'On Fire!',
      revisionId: 100, revisionTimestamp: '2026-09-30T00:00:00Z', parseStatus: 'parse_incomplete',
      unresolvedFacts: [
        { group: 'sourceItems', status: 'section_missing', sections: [] },
        { group: 'inflictingNpcs', status: 'no_rows', sections: [] },
        { group: 'immuneNpcs', status: 'no_rows', sections: [] },
      ],
      factGroups: {
        sourceItems: { status: 'section_missing', sections: [] },
        inflictingNpcs: { status: 'no_rows', sections: [] },
        immuneNpcs: { status: 'no_rows', sections: [] },
      },
    },
  };
  const plan = buildBuffPartialFactPlan({
    record,
    baseline: {
      sourceItems: [{ itemId: 3 }],
      inflictingNpcs: [{ npcId: 5 }],
      immuneNpcs: [{ npcId: 7 }],
      immuneNpcCount: 1,
      immuneNpcSample: [{ npcId: 7 }],
    },
  });

  assert.deepEqual(plan.replaceGroups, []);
  assert.deepEqual(plan.preserveGroups, ['sourceItems', 'inflictingNpcs', 'immuneNpcs']);
  assert.deepEqual(plan.baseline.sourceItems, [{ itemId: 3 }]);
  assert.deepEqual(plan.baseline.inflictingNpcs, [{ npcId: 5 }]);
  assert.equal(plan.executable, false);
});

test('partial fact plan rejects target-binding parser facts and other parser errors', () => {
  const base = {
    id: 24,
    internalName: 'OnFire',
    sourceEvidence: {
      provider: 'terraria.wiki.gg', pageTitle: 'On Fire!', canonicalPageTitle: 'On Fire!',
      revisionId: 100, revisionTimestamp: '2026-09-30T00:00:00Z', parseStatus: 'parse_incomplete',
      factGroups: { immuneNpcs: { status: 'section_missing', sections: [] } },
    },
  };
  const baseline = { immuneNpcs: [], immuneNpcCount: 0, immuneNpcSample: [] };
  for (const status of ['target_mismatch', 'target_ambiguous', 'target_unverified']) {
    const record = {
      ...base,
      sourceEvidence: {
        ...base.sourceEvidence,
        factGroups: { immuneNpcs: { status, sections: ['Immune NPCs'] } },
        unresolvedFacts: [{ group: 'immuneNpcs', status, sections: ['Immune NPCs'] }],
      },
    };
    assert.throws(() => buildBuffPartialFactPlan({ record, baseline }), /unresolved|status|target/i);
  }

  for (const unresolvedFacts of [
    [{ group: 'sourceItems', status: 'parser_error' }],
    [{ group: 'unknownGroup', status: 'section_missing' }],
    [{ group: 'immuneNpcs', status: 'no_rows' }],
  ]) {
    const record = {
      ...base,
      sourceEvidence: {
        ...base.sourceEvidence,
        unresolvedFacts,
      },
    };
    assert.throws(() => buildBuffPartialFactPlan({ record, baseline }), /unresolved|status|fact/i);
  }
});

test('partial fact plan ignores explicitly unavailable empty directional alternates', () => {
  const sourcePages = ['Module:Npcinfo/doc', 'Module:Npcinfo/datagen', 'Template:GetBuffInfo', 'Whips']
    .map((pageTitle, index) => ({ pageTitle, pageId: index + 1, revisionId: index + 10,
      revisionTimestamp: '2026-09-30T00:00:00Z', rawSha256: `sha256:${String(index + 1).repeat(64)}` }));
  const plan = buildBuffPartialFactPlan({
    record: {
      id: 24,
      internalName: 'OnFire',
      immuneNpcs: [{ npcId: 1, internalName: 'BlueSlime' }],
      sourceEvidence: {
        provider: 'terraria.wiki.gg', pageTitle: 'On Fire!', canonicalPageTitle: 'On Fire!',
        revisionId: 100, revisionTimestamp: '2026-09-30T00:00:00Z',
        factGroups: {
          sourceItems: { status: 'section_missing', sections: [] },
          inflictingNpcs: { status: 'section_missing', sections: [] },
          immuneNpcs: { status: 'section_missing', sections: [] },
        },
        unresolvedFacts: [{ group: 'sourceItems', status: 'section_missing', sections: [] }],
        immuneNpcPositiveEvidence: {
          status: 'positive_sources_only',
          inflictingNpcPositiveEvidence: { status: 'unavailable', facts: [], source: null },
          immuneNpcPositiveEvidence: {
            status: 'complete-expanded-npc-scope', assertions: [{ npcId: 1, npcInternalName: 'BlueSlime' }],
            source: { semanticExpansion: { schemaVersion: 'buff-npcinfo-semantic-expansion/v1',
              whipDebuffBuffIds: [310, 362], sourcePages } },
          },
        },
      },
    },
    baseline: { sourceItems: [], inflictingNpcs: [], immuneNpcs: [], immuneNpcCount: 0, immuneNpcSample: [] },
  });

  assert.deepEqual(plan.replaceGroups, ['immuneNpcs']);
  assert.deepEqual(plan.preserveGroups, ['sourceItems', 'inflictingNpcs']);
});

test('exhaustive NPC-page infliction evidence replaces the inflicting baseline group', () => {
  const record = {
    id: 24,
    internalName: 'OnFire',
    sourceItems: [],
    inflictingNpcs: [{ npcId: 1, internalName: 'BlueSlime' }],
    immuneNpcs: [],
    sourceEvidence: {
      provider: 'terraria.wiki.gg', pageTitle: 'On Fire!', canonicalPageTitle: 'On Fire!',
      revisionId: 100, revisionTimestamp: '2026-09-30T00:00:00Z', unresolvedFacts: [
        { group: 'immuneNpcs', status: 'section_missing', sections: [] },
      ],
      factGroups: {
        inflictingNpcs: { status: 'section_missing', sections: [] },
        immuneNpcs: { status: 'section_missing', sections: [] },
      },
      inflictingNpcPositiveEvidence: {
        status: 'complete-exhaustive-npc-page-scope',
        facts: [{ relationType: 'inflicts', npcSourceId: 1, npcInternalName: 'BlueSlime', buffId: 24, buffInternalName: 'OnFire' }],
        source: {
          provider: 'terraria.wiki.gg', inputSha256: 'sha256:' + '1'.repeat(64),
          targetsSha256: 'sha256:' + '2'.repeat(64), pageCount: 1, npcCount: 1,
          scopeCompleteness: 'all-npc-page-targets',
        },
      },
    },
  };
  const plan = buildBuffPartialFactPlan({
    record,
    baseline: { sourceItems: [], inflictingNpcs: [{ npcId: 9 }], immuneNpcs: [], immuneNpcCount: 0, immuneNpcSample: [] },
  });
  assert.deepEqual(plan.replaceGroups, ['inflictingNpcs']);
  assert.deepEqual(plan.preserveGroups, ['immuneNpcs']);
});

test('partial fact plan preserves the inflicting baseline and declares positive facts as additive', () => {
  const fact = {
    relationType: 'inflicts',
    npcSourceId: 113,
    npcInternalName: 'WallofFlesh',
    npcName: 'Wall of Flesh',
    buffId: 37,
    buffInternalName: 'Horrified',
    buffName: 'Horrified',
    durationText: 'permanent',
    sourcePage: 'Wall of Flesh',
    sourcePageId: 10220,
    sourceRevisionId: 1032375,
    sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
  };
  const plan = buildBuffPartialFactPlan({
    record: {
      id: 37,
      internalName: 'Horrified',
      sourceItems: [],
      inflictingNpcs: [{ npcId: 113, internalName: 'WallofFlesh', relationType: 'inflicts' }],
      immuneNpcs: [],
      sourceEvidence: {
        provider: 'terraria.wiki.gg', pageTitle: 'Horrified', canonicalPageTitle: 'Horrified',
        revisionId: 1032375, revisionTimestamp: '2026-09-30T00:00:00Z',
        factGroups: {
          sourceItems: { status: 'section_missing', sections: [] },
          inflictingNpcs: { status: 'section_missing', sections: [] },
          immuneNpcs: { status: 'section_missing', sections: [] },
        },
        unresolvedFacts: [],
        inflictingNpcPositiveEvidence: {
          status: 'positive-infliction-facts-only',
          facts: [fact],
          source: {
            provider: 'terraria.wiki.gg', pageTitle: 'Wall of Flesh', pageId: 10220,
            revisionId: 1032375, revisionTimestamp: '2026-09-30T00:00:00Z',
          },
        },
      },
    },
    baseline: {
      sourceItems: [],
      inflictingNpcs: [{ npcId: 900, internalName: 'BaselineNpc' }],
      immuneNpcs: [],
      immuneNpcCount: 0,
      immuneNpcSample: [],
    },
  });

  assert.equal(plan.executable, false);
  assert.deepEqual(plan.replaceGroups, []);
  assert.deepEqual(plan.preserveGroups, ['sourceItems', 'inflictingNpcs', 'immuneNpcs']);
  assert.deepEqual(plan.additiveGroups, ['inflictingNpcs']);
  assert.deepEqual(plan.additiveFacts.inflictingNpcs, [{
    npcId: 113,
    internalName: 'WallofFlesh',
    name: 'Wall of Flesh',
    relationType: 'inflicts',
    buffId: 37,
    buffInternalName: 'Horrified',
    durationText: 'permanent',
    sourcePage: 'Wall of Flesh',
    sourcePageId: 10220,
    sourceRevisionId: 1032375,
    sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
  }]);
});

test('partial fact plan rejects additive facts outside declared page provenance', () => {
  assert.throws(() => buildBuffPartialFactPlan({
    record: {
      id: 37,
      internalName: 'Horrified',
      sourceItems: [],
      inflictingNpcs: [{ npcId: 113, internalName: 'WallofFlesh' }],
      immuneNpcs: [],
      sourceEvidence: {
        provider: 'terraria.wiki.gg', pageTitle: 'Horrified', canonicalPageTitle: 'Horrified',
        revisionId: 1032375, revisionTimestamp: '2026-09-30T00:00:00Z',
        factGroups: {
          sourceItems: { status: 'section_missing', sections: [] },
          inflictingNpcs: { status: 'section_missing', sections: [] },
          immuneNpcs: { status: 'section_missing', sections: [] },
        },
        unresolvedFacts: [],
        inflictingNpcPositiveEvidence: {
          status: 'positive-infliction-facts-only',
          facts: [{ relationType: 'inflicts', npcSourceId: 113, npcInternalName: 'WallofFlesh',
            buffId: 37, buffInternalName: 'Horrified', sourcePage: 'Wall of Flesh', sourcePageId: 10220,
            sourceRevisionId: 1032375, sourceRevisionTimestamp: '2026-09-30T00:00:00Z' }],
          source: {
            provider: 'terraria.wiki.gg', pageTitle: 'Wall of Flesh', pageId: 10220,
            revisionId: 1032375, revisionTimestamp: '2026-09-30T00:00:00Z',
            factSources: [{ pageTitle: 'Other NPC', pageId: 999, revisionId: 1032375,
              revisionTimestamp: '2026-09-30T00:00:00Z' }],
          },
        },
      },
    },
    baseline: { sourceItems: [], inflictingNpcs: [], immuneNpcs: [], immuneNpcCount: 0, immuneNpcSample: [] },
  }), /provenance/i);
});

test('partial fact plan rejects additive provenance when wrapper page identity is absent', () => {
  assert.throws(() => buildBuffPartialFactPlan({
    record: {
      id: 37,
      internalName: 'Horrified',
      sourceItems: [],
      inflictingNpcs: [{ npcId: 113, internalName: 'WallofFlesh' }],
      immuneNpcs: [],
      sourceEvidence: {
        provider: 'terraria.wiki.gg', pageTitle: 'Horrified', canonicalPageTitle: 'Horrified',
        revisionId: 1032375, revisionTimestamp: '2026-09-30T00:00:00Z',
        factGroups: {
          sourceItems: { status: 'section_missing', sections: [] },
          inflictingNpcs: { status: 'section_missing', sections: [] },
          immuneNpcs: { status: 'section_missing', sections: [] },
        },
        unresolvedFacts: [],
        inflictingNpcPositiveEvidence: {
          status: 'positive-infliction-facts-only',
          facts: [{ relationType: 'inflicts', npcSourceId: 113, npcInternalName: 'WallofFlesh',
            buffId: 37, buffInternalName: 'Horrified', sourcePage: 'Wall of Flesh', sourcePageId: 10220,
            sourceRevisionId: 1032375, sourceRevisionTimestamp: '2026-09-30T00:00:00Z' }],
          source: { provider: 'terraria.wiki.gg' },
        },
      },
    },
    baseline: { sourceItems: [], inflictingNpcs: [], immuneNpcs: [], immuneNpcCount: 0, immuneNpcSample: [] },
  }), /source identity|provenance/i);
});
