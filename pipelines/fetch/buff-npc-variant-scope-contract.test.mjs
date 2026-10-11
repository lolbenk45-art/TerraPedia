import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBuffNpcVariantScopeContract } from './buff-npc-variant-scope-contract.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const source = { pageTitle: 'Shared page', pageId: 1, revisionId: 2, revisionTimestamp: '2026-10-03T00:00:00Z', rawSha256: HASH, captureSha256: HASH };
const completeEmpty = overrides => ({
  id: 11,
  internalName: 'VariantA',
  completeness: 'complete-exhaustive-npc-page-scope',
  facts: [],
  source,
  identity: { npcSourceId: 11, npcInternalName: 'VariantA' },
  targetInfobox: {
    autoId: '11',
    fields: { auto: '11', name: 'Shared', type: 'Fighter' },
    fieldNames: ['auto', 'name', 'type'],
    debuffFieldNames: [],
  },
  pageWideDiagnostics: { positiveOwners: [{ autoId: '10', debuffFieldNames: ['debuff'], rawDebuffValues: ['On Fire!'] }] },
  ...overrides,
});

function fixture({ facts = [], completeEmptyEvidence = [], rows = Array.from({ length: 12 }, (_, index) => ({ id: 389 + index, status: 'missing-baseline' })) } = {}) {
  const gaps = [{ npcSourceId: 11, npcInternalName: 'VariantA', npcName: 'Shared' }, { npcSourceId: 12, npcInternalName: 'VariantB', npcName: 'Shared' }];
  return {
    verifiedEvidence: {
      schemaVersion: 'buff-npc-page-infliction-evidence/v1',
      completeness: 'complete-exhaustive-npc-page-scope-with-exclusions-and-unresolved-variants',
      scopeGaps: gaps,
      facts,
    },
    classification: {
      schemaVersion: 'buff-npc-infliction-scope-gap-classification/v1', databaseWrites: false, networkRequests: 0,
      input: { verifiedSha256: HASH },
      groups: [{ ...source, sourcePage: source.pageTitle, classification: 'shared-page-variant', gapRecords: gaps,
        inflictionOwners: [{ autoId: '10', hasInfliction: true, inflictions: [{ buffName: 'On Fire!' }] }, { autoId: '11', hasInfliction: false, inflictions: [] }, { autoId: '12', hasInfliction: false, inflictions: [] }] }],
    },
    partialReplay: { databaseWrites: false, partial: { total: 400, normalizerAccepted: 400, normalizerRejected: 0, errors: {}, baselineMissing: 12, preserveGroups: { inflictingNpcs: 360 }, additiveFacts: 6 }, rows, inflictionRetention: { missingFacts: [] } },
    verifiedArtifactSha256: HASH, classificationArtifactSha256: HASH, partialReplayArtifactSha256: HASH, completeEmptyEvidence,
  };
}

test('marks shared-page variants unknown and preserves baseline without copying another owner', () => {
  const contract = buildBuffNpcVariantScopeContract(fixture());
  assert.equal(contract.summary.total, 2);
  assert.equal(contract.summary.unknown, 2);
  assert.deepEqual(contract.statuses.map(row => [row.npcId, row.status, row.preserveBaseline]), [[11, 'unknown', true], [12, 'unknown', true]]);
  assert.deepEqual(contract.statuses[0].positiveOwnerIds, [10]);
  assert.equal(contract.executable, false);
  assert.equal(contract.databaseWrites, false);
});

test('does not turn an unkeyed shared infobox into stable NPC zero', () => {
  const input = fixture();
  input.classification.groups[0].inflictionOwners.unshift({ autoId: '', hasInfliction: true, inflictions: [{ buffName: 'On Fire!' }] });
  const contract = buildBuffNpcVariantScopeContract(input);
  assert.deepEqual(contract.statuses[0].positiveOwnerIds, [10]);
  assert.ok(!contract.statuses[0].positiveOwnerIds.includes(0));
});

test('admits a positive fact only when stable ID, internal name, page, revision and raw hash bind', () => {
  const contract = buildBuffNpcVariantScopeContract(fixture({ facts: [{ npcSourceId: 11, npcInternalName: 'VariantA', buffId: 37, sourcePage: 'Shared page', sourcePageId: 1, sourceRevisionId: 2, sourceRevisionTimestamp: source.revisionTimestamp, sourceRawSha256: HASH }] }));
  assert.equal(contract.statuses[0].status, 'variant-owned-positive');
  assert.equal(contract.statuses[0].publication, 'additive-positive-only');
  assert.equal(contract.statuses[0].facts[0].sourceRawSha256, HASH);
});

test('allows complete-empty only with independent exhaustive evidence', () => {
  const second = completeEmpty({
    id: 12,
    internalName: 'VariantB',
    identity: { npcSourceId: 12, npcInternalName: 'VariantB' },
    targetInfobox: {
      autoId: '12',
      fields: { auto: '12', name: 'Shared', type: 'Fighter' },
      fieldNames: ['auto', 'name', 'type'],
      debuffFieldNames: [],
    },
  });
  const contract = buildBuffNpcVariantScopeContract(fixture({ completeEmptyEvidence: [completeEmpty(), second] }));
  assert.equal(contract.statuses[0].status, 'variant-owned-complete-empty');
  assert.equal(contract.statuses[0].preserveBaseline, false);
  assert.equal(contract.summary.unknown, 0);
  assert.equal(contract.blockedBy.some(reason => /unknown/i.test(reason)), false);
});

test('allows repeated stable-ID blocks only when every block is complete and empty', () => {
  const base = completeEmpty();
  const contract = buildBuffNpcVariantScopeContract(fixture({ completeEmptyEvidence: [completeEmpty({
    targetInfobox: undefined,
    targetInfoboxes: [
      base.targetInfobox,
      { ...base.targetInfobox, fields: { auto: '11', image: 'Variant.gif' }, fieldNames: ['auto', 'image'] },
    ],
    selection: 'all-matching-stable-id-blocks',
  })] }));
  assert.equal(contract.statuses[0].status, 'variant-owned-complete-empty');
});

test('rejects complete-empty evidence without complete fields or with target debuff fields', () => {
  assert.throws(() => buildBuffNpcVariantScopeContract(fixture({ completeEmptyEvidence: [completeEmpty({ targetInfobox: undefined })] })), /field completeness/);
  assert.throws(() => buildBuffNpcVariantScopeContract(fixture({ completeEmptyEvidence: [completeEmpty({ targetInfobox: { ...completeEmpty().targetInfobox, debuffFieldNames: ['debuff'] } })] })), /debuff/);
  assert.throws(() => buildBuffNpcVariantScopeContract(fixture({ completeEmptyEvidence: [completeEmpty({ pageWideDiagnostics: undefined })] })), /diagnostics/);
  assert.throws(() => buildBuffNpcVariantScopeContract(fixture({ completeEmptyEvidence: [completeEmpty({ source: { ...source, rawSha256: `sha256:${'b'.repeat(64)}` } })] })), /source drift/);
  assert.throws(() => buildBuffNpcVariantScopeContract(fixture({ completeEmptyEvidence: [completeEmpty({ source: { ...source, captureSha256: undefined } })] })), /capture hash/);
});

test('rejects identity drift, incomplete empty evidence, and unexpected new-ID baselines', () => {
  assert.throws(() => buildBuffNpcVariantScopeContract(fixture({ facts: [{ npcSourceId: 11, npcInternalName: 'Wrong', buffId: 37, sourcePage: 'Shared page', sourcePageId: 1, sourceRevisionId: 2, sourceRevisionTimestamp: source.revisionTimestamp, sourceRawSha256: HASH }] })), /stable identity drifted/);
  assert.throws(() => buildBuffNpcVariantScopeContract(fixture({ completeEmptyEvidence: [{ id: 11, internalName: 'VariantA', completeness: 'positive-only', facts: [], source }] })), /not exhaustive/);
  assert.throws(() => buildBuffNpcVariantScopeContract(fixture({ rows: [{ id: 389, status: 'plan-built' }, ...Array.from({ length: 11 }, (_, index) => ({ id: 390 + index, status: 'missing-baseline' }))] })), /unexpectedly has a historical baseline/);
});
