import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { buildBuffNpcVariantEmptyScopeEvidence } from './buff-npc-variant-empty-scope-evidence.mjs';

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fixture({ targetWikitext = null, targetId = 10, targetInternalName = 'TargetNpc', gaps = null } = {}) {
  const wikitext = targetWikitext ?? `{{npc infobox
| auto = 10
| name = Target NPC
| type = Fighter
| life = 100
}}
{{npc infobox
| auto = 11
| name = Other NPC
| debuff = On Fire!
}}`;
  const raw = {
    requestedPageTitle: 'Shared page',
    pageTitle: 'Shared page',
    pageId: 100,
    revisionId: 200,
    revisionTimestamp: '2026-10-05T00:00:00Z',
    wikitext,
  };
  const bytes = Buffer.from(JSON.stringify(raw));
  const descriptor = {
    requestedPageTitle: 'Shared page',
    targetPageTitle: 'Shared page',
    pageTitle: 'Shared page',
    resolvedPageTitle: 'Shared page',
    rawRequestedPageTitle: 'Shared page',
    pageId: raw.pageId,
    revisionId: raw.revisionId,
    revisionTimestamp: raw.revisionTimestamp,
    path: 'page-001.json',
    sha256: hash(bytes),
  };
  const target = {
    pageTitle: 'Shared page',
    standardizedRecords: [
      { id: targetId, internalName: targetInternalName, name: 'Target NPC' },
      { id: 11, internalName: 'OtherNpc', name: 'Other NPC' },
    ],
  };
  const gapRecords = gaps ?? [{
    npcSourceId: targetId,
    npcInternalName: targetInternalName,
    npcName: 'Target NPC',
    sourcePage: 'Shared page',
    sourceRevisionId: raw.revisionId,
    sourceRawSha256: descriptor.sha256,
  }];
  return {
    pages: [descriptor],
    rawPages: [{ path: descriptor.path, bytes }],
    targets: { targets: [target] },
    gapRecords,
    expectedSourceHashes: Object.fromEntries(gapRecords.map(gap => [String(gap.npcSourceId), descriptor.sha256])),
    captureSha256: hash(Buffer.from('npc capture manifest')),
  };
}

test('builds a complete empty row bound to identity, revision, raw hash, and parsed fields', () => {
  const result = buildBuffNpcVariantEmptyScopeEvidence(fixture());
  assert.equal(result.rows.length, 1);
  const [row] = result.rows;
  assert.deepEqual(row.identity, { npcSourceId: 10, npcInternalName: 'TargetNpc' });
  assert.equal(row.source.pageId, 100);
  assert.equal(row.source.revisionId, 200);
  assert.equal(row.source.revisionTimestamp, '2026-10-05T00:00:00Z');
  assert.match(row.source.rawSha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(row.source.captureSha256, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(row.targetInfobox.debuffFieldNames, []);
  assert.deepEqual(row.targetInfobox.fieldNames, ['auto', 'life', 'name', 'type']);
  assert.equal(row.completeness, 'complete-exhaustive-npc-page-scope');
});

test('retains positive debuff facts from other stable NPCs as diagnostics only', () => {
  const [row] = buildBuffNpcVariantEmptyScopeEvidence(fixture()).rows;
  assert.deepEqual(row.pageWideDiagnostics.positiveOwners, [{
    autoId: '11',
    debuffFieldNames: ['debuff'],
    rawDebuffValues: ['On Fire!'],
  }]);
});

test('does not emit an empty row when the target owns a debuff field', () => {
  const result = buildBuffNpcVariantEmptyScopeEvidence(fixture({
    targetWikitext: `{{npc infobox|auto=10|name=Target NPC|type=Fighter|debuff=Horrified}}
{{npc infobox|auto=11|name=Other NPC|debuff=On Fire!}}`,
  }));
  assert.deepEqual(result.rows, []);
  assert.equal(result.rejections[0].reason, 'target-debuff-fields-present');
});

test('rejects duplicate target infobox identity instead of choosing one block', () => {
  const result = buildBuffNpcVariantEmptyScopeEvidence(fixture({
    targetWikitext: `{{npc infobox|auto=10|name=Target NPC|type=Fighter}}
{{npc infobox|auto=10|name=Target NPC|type=Fighter}}`,
  }));
  assert.deepEqual(result.rows, []);
  assert.equal(result.rejections[0].reason, 'duplicate-target-infobox');
});

test('rejects semantically duplicate target blocks even when field order differs', () => {
  const result = buildBuffNpcVariantEmptyScopeEvidence(fixture({
    targetWikitext: `{{npc infobox|auto=10|name=Target NPC|type=Fighter}}
{{npc infobox|type=Fighter|name=Target NPC|auto=10}}`,
  }));
  assert.deepEqual(result.rows, []);
  assert.equal(result.rejections[0].reason, 'duplicate-target-infobox');
});

test('certifies empty scope when every complete block for a repeated stable ID is empty', () => {
  const result = buildBuffNpcVariantEmptyScopeEvidence(fixture({
    targetWikitext: `{{npc infobox|auto=10|name=The Twins|type=Boss}}
{{npc infobox|auto=10|image=Retinazer (first form).gif|type=Boss}}
{{npc infobox|auto=10|name=Retinazer|namesub=Second Form|type=Boss}}`,
  }));
  assert.equal(result.rejections.length, 0);
  assert.equal(result.rows.length, 1);
  const [row] = result.rows;
  assert.equal(row.targetInfobox, undefined);
  assert.equal(row.targetInfoboxes.length, 3);
  assert.ok(row.targetInfoboxes.every(infobox => infobox.autoId === '10'));
  assert.ok(row.targetInfoboxes.every(infobox => infobox.debuffFieldNames.length === 0));
});

test('rejects repeated stable ID when any matching block owns a debuff field', () => {
  const result = buildBuffNpcVariantEmptyScopeEvidence(fixture({
    targetWikitext: `{{npc infobox|auto=10|name=The Twins|type=Boss}}
{{npc infobox|auto=10|image=Retinazer (first form).gif|type=Boss|debuff=Horrified}}
{{npc infobox|auto=10|name=Retinazer|namesub=Second Form|type=Boss}}`,
  }));
  assert.deepEqual(result.rows, []);
  assert.equal(result.rejections[0].reason, 'target-debuff-fields-present');
});

test('rejects an incomplete target infobox without certifying empty scope', () => {
  const result = buildBuffNpcVariantEmptyScopeEvidence(fixture({
    targetWikitext: '{{npc infobox|auto=10|name=Target NPC|type=Fighter',
  }));
  assert.deepEqual(result.rows, []);
  assert.equal(result.rejections[0].reason, 'target-infobox-incomplete');
});

test('fails closed on raw hash drift and duplicate stable target rows', () => {
  const capture = fixture();
  capture.pages[0].sha256 = hash(Buffer.from('different raw bytes'));
  assert.throws(() => buildBuffNpcVariantEmptyScopeEvidence(capture), /raw page hash drifted/);

  const duplicate = fixture();
  duplicate.targets.targets[0].standardizedRecords.push({ id: 10, internalName: 'TargetNpcAgain', name: 'Target NPC' });
  assert.throws(() => buildBuffNpcVariantEmptyScopeEvidence(duplicate), /duplicate stable NPC ID/);
});
