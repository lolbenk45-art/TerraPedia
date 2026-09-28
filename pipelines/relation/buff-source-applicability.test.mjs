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

test('parsed immunity section is publishable fact evidence', () => {
  assert.deepEqual(classifyBuffPageApplicability(record({
    factGroups: { immuneNpcs: { status: 'parsed', sections: [{ title: 'Immune NPCs' }] } },
  })), { status: 'parsed', reason: 'section-parsed', evidence: null });
});

test('revision-bound item classification yields explicit not-applicable evidence', () => {
  const value = record({ revisionId: 954224 });
  assert.deepEqual(classifyBuffPageApplicability(value, { pageClassification: { pageTitle: 'Obsidian Skin Potion', pageId: 7885, revisionId: 954224, categories: ['Category:Potion items'] } }), { status: 'not_applicable', reason: 'revision-bound-category:item', evidence: { status: 'not_applicable', reason: 'revision-bound-category:item' } });
});

test('classification drift fails closed', () => {
  assert.throws(() => classifyBuffPageApplicability(record({ revisionId: 954224 }), { pageClassification: { pageTitle: 'Other', pageId: 7885, revisionId: 954224, categories: ['Category:Potion items'] } }), /drift/);
});

test('explicit not-applicable evidence is distinct from unknown', () => {
  assert.deepEqual(classifyBuffPageApplicability(record({
    applicability: { status: 'not_applicable', reason: 'source-page-kind:item' },
  })), { status: 'not_applicable', reason: 'source-page-kind:item', evidence: { status: 'not_applicable', reason: 'source-page-kind:item' } });
});

test('malformed applicability evidence fails closed', () => {
  assert.throws(() => classifyBuffPageApplicability(record({ applicability: { status: 'not_applicable' } })), /reason/i);
});

test('summary counts unknown and not-applicable separately', () => {
  const result = summarizeBuffSourceApplicability([
    record(),
    record({ pageTitle: 'On Fire!', factGroups: { immuneNpcs: { status: 'parsed', sections: [{}] } } }),
    record({ applicability: { status: 'not_applicable', reason: 'source-page-kind:item' } }),
  ]);
  assert.deepEqual(result, { total: 3, parsed: 1, notApplicable: 1, unknown: 1 });
});
