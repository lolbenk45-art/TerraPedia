import assert from 'node:assert/strict';
import test from 'node:test';

import {
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

test('missing immunity section remains unknown without explicit applicability evidence', () => {
  assert.deepEqual(classifyBuffPageApplicability(record()), {
    status: 'unknown', reason: 'missing-applicability-evidence', evidence: null,
  });
});

test('parsed immunity section is classified without asserting publication readiness', () => {
  assert.deepEqual(classifyBuffPageApplicability(record({
    factGroups: { immuneNpcs: { status: 'parsed', sections: [{ title: 'Immune NPCs' }] } },
  })), { status: 'parsed', reason: 'section-parsed', evidence: null });
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
