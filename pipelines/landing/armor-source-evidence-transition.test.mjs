import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  ARMOR_SOURCE_EVIDENCE_DATASET_TYPES,
  buildArmorSourceEvidenceTransition,
  validateArmorSourceEvidenceTransition,
} from './armor-source-evidence-transition.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function rehashTransition(value) {
  const canonical = (entry) => Array.isArray(entry) ? entry.map(canonical)
    : entry && typeof entry === 'object' ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, canonical(entry[key])])) : entry;
  const { transitionSha256: _ignored, ...body } = value;
  return { ...body, transitionSha256: `sha256:${createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex')}` };
}

function landing(overrides = {}) {
  return {
    dataset_type: 'armor_sets_raw', provider: 'terraria.wiki.gg', source_kind: 'module',
    source_key: 'wiki.module.armorsetbonuses', source_page: 'Module:ArmorSetBonuses',
    source_revision_timestamp: '2026-09-25T03:00:00Z', content_hash: HASH_B,
    payload_json: JSON.stringify({ source: 'armor' }), fetched_at: '2026-09-25T03:01:00Z',
    parsed_at: '2026-09-25T03:01:00Z', parse_status: 'ok', artifact_role: 'source_evidence',
    producer_id: 'armor.module.fetcher', producer_version: 'v2', producer_run_key: 'run-armor-01',
    bootstrap_manifest_hash: null, is_current: 1, current_slot: 1,
    ...overrides,
  };
}

test('plans immutable Armor source evidence with exact current-marker demotion and no deletes', () => {
  const legacy = landing({ id: 41, content_hash: HASH_A, artifact_role: 'legacy_compat', is_current: 1, current_slot: 1 });
  const incoming = landing({ id: null });
  const result = buildArmorSourceEvidenceTransition({ currentRows: [legacy], incomingRows: [incoming] });
  assert.deepEqual(ARMOR_SOURCE_EVIDENCE_DATASET_TYPES, ['armor_attributes_raw', 'armor_sets_raw', 'armor_set_images_raw']);
  assert.equal(result.demotions.length, 1);
  assert.deepEqual(result.demotions[0].after, { ...legacy, is_current: 0, current_slot: null });
  assert.equal(result.inserts.length, 1);
  assert.equal(result.inserts[0].id, undefined);
  assert.deepEqual(result.deletes, []);
  assert.equal(result.requiresCurrentMarkerLock, true);
  assert.equal(result.executable, false);
  assert.match(result.transitionSha256, /^sha256:[0-9a-f]{64}$/);
});

test('accepts a fresh armor_attributes_raw evidence partition without reusing legacy armor landing history', () => {
  const incoming = landing({
    dataset_type: 'armor_attributes_raw',
    source_key: 'wiki.page.armor_attributes.a63-20260927-01',
    source_page: '盔甲属性表',
    source_kind: 'page',
  });
  const result = buildArmorSourceEvidenceTransition({ currentRows: [], incomingRows: [incoming] });
  assert.ok(ARMOR_SOURCE_EVIDENCE_DATASET_TYPES.includes('armor_attributes_raw'));
  assert.equal(result.inserts.length, 1);
  assert.equal(result.inserts[0].source_key, 'wiki.page.armor_attributes.a63-20260927-01');
});

test('preserves an identical current source-evidence row as a no-op', () => {
  const current = landing({ id: 99, artifact_role: 'source_evidence', content_hash: HASH_B });
  const incoming = landing({ id: 99 });
  const result = buildArmorSourceEvidenceTransition({ currentRows: [current], incomingRows: [incoming] });
  assert.equal(result.inserts.length, 0);
  assert.equal(result.demotions.length, 0);
  assert.equal(result.unchanged.length, 1);
});

test('rejects source evidence that uses the catch-all dataset, bootstrap metadata, or an allocated new ID', () => {
  for (const overrides of [
    { dataset_type: 'items_raw' },
    { artifact_role: 'legacy_compat' },
    { bootstrap_manifest_hash: HASH_A },
    { id: 123 },
    { content_hash: 'bad' },
  ]) assert.throws(() => buildArmorSourceEvidenceTransition({ currentRows: [], incomingRows: [landing(overrides)] }), /Armor|source|hash|ID|bootstrap/i);
});

test('rejects duplicate current identities and conservative collation-equivalent collisions', () => {
  const first = landing({ source_page: 'Armor Set' });
  const second = landing({ source_page: 'armor  set' });
  assert.throws(() => buildArmorSourceEvidenceTransition({ currentRows: [], incomingRows: [first, second] }), /collision|duplicate|current/i);
  assert.throws(() => buildArmorSourceEvidenceTransition({
    currentRows: [landing({ id: 1, artifact_role: 'legacy_compat', content_hash: HASH_A })],
    incomingRows: [landing({ source_page: 'MODULE:ARMORSETBONUSES' })],
  }), /collision|duplicate|current/i);
});

test('retains unmatched history and validates the frozen transition hash', () => {
  const old = landing({ id: 7, artifact_role: 'legacy_compat', content_hash: HASH_A });
  const unrelated = landing({ id: 8, source_key: 'other', source_page: 'Other', content_hash: HASH_A, is_current: 0, current_slot: null });
  const result = buildArmorSourceEvidenceTransition({ currentRows: [old, unrelated], incomingRows: [landing()] });
  assert.equal(result.preserved.length, 1);
  assert.equal(result.preserved[0].id, 8);
  assert.doesNotThrow(() => validateArmorSourceEvidenceTransition(result));
  const drifted = { ...result, inserts: [...result.inserts, { ...result.inserts[0] }] };
  assert.throws(() => validateArmorSourceEvidenceTransition(drifted), /hash|duplicate|summary/i);
});

for (const [label, overrides] of [
  ['allocated ID', { id: 123 }],
  ['retired marker', { is_current: 0 }],
  ['generated current slot', { current_slot: 1 }],
]) test(`rejects a rehashed transition insert carrying ${label}`, () => {
  const result = structuredClone(buildArmorSourceEvidenceTransition({ currentRows: [], incomingRows: [landing()] }));
  Object.assign(result.inserts[0], overrides);
  assert.throws(() => validateArmorSourceEvidenceTransition(rehashTransition(result)), /insert|ID|marker|generated/i);
});

test('requires real unique baseline IDs before planning demotions or preserving history', () => {
  for (const id of [undefined, null, 0, -1, '41']) {
    assert.throws(() => buildArmorSourceEvidenceTransition({
      currentRows: [landing({ id, content_hash: HASH_A })], incomingRows: [landing()],
    }), /ID|identity/i);
  }
  assert.throws(() => buildArmorSourceEvidenceTransition({
    currentRows: [landing({ id: 41, content_hash: HASH_A }), landing({ id: 41, source_key: 'retired', is_current: 0, current_slot: null })],
    incomingRows: [landing()],
  }), /ID|duplicate/i);
});

test('rejects demotion without its matching replacement even if the transition hash matches', () => {
  const result = structuredClone(buildArmorSourceEvidenceTransition({ currentRows: [landing({ id: 41, content_hash: HASH_A })], incomingRows: [landing()] }));
  result.inserts = [];
  result.summary.inserts = 0;
  assert.throws(() => validateArmorSourceEvidenceTransition(rehashTransition(result)), /replacement|demotion|transition/i);
});

test('rejects current identity overlap across inserted and unchanged lists', () => {
  const result = structuredClone(buildArmorSourceEvidenceTransition({ currentRows: [], incomingRows: [landing()] }));
  result.unchanged.push(landing({ id: 41 }));
  result.summary.unchanged = 1;
  assert.throws(() => validateArmorSourceEvidenceTransition(rehashTransition(result)), /duplicate|collision|overlap/i);
});

test('rejects duplicated baseline rows across demoted and preserved lists', () => {
  const result = structuredClone(buildArmorSourceEvidenceTransition({ currentRows: [landing({ id: 41, content_hash: HASH_A })], incomingRows: [landing()] }));
  result.preserved.push(result.demotions[0].before);
  result.summary.preserved = 1;
  assert.throws(() => validateArmorSourceEvidenceTransition(rehashTransition(result)), /duplicate|collision|overlap/i);
});

test('rejects inconsistent marker pairs instead of hiding them as preserved history', () => {
  for (const markers of [{ is_current: 0, current_slot: 1 }, { is_current: 2, current_slot: null }]) {
    assert.throws(() => buildArmorSourceEvidenceTransition({
      currentRows: [landing({ id: 41, ...markers })], incomingRows: [landing()],
    }), /marker|current/i);
  }
});

test('rejects accent-equivalent Armor source identity before native collation range locking', () => {
  assert.throws(() => buildArmorSourceEvidenceTransition({
    currentRows: [landing({ id: 41, source_page: 'Armor', content_hash: HASH_A })],
    incomingRows: [landing({ source_page: 'Ármor' })],
  }), /collision/i);
});

test('incoming markers use SQL numeric values without boolean or string coercion', () => {
  for (const overrides of [{ is_current: true }, { is_current: '1' }, { current_slot: true }, { current_slot: '1' }]) {
    assert.throws(() => buildArmorSourceEvidenceTransition({ currentRows: [], incomingRows: [landing(overrides)] }), /current|marker/i);
  }
});

test('validates mixed unchanged, replacement, new insert and retained cross-owner history', () => {
  const current = landing({ id: 11 });
  const image = landing({ id: 12, dataset_type: 'armor_set_images_raw', source_key: 'wiki.armor_set_images', content_hash: HASH_A });
  const retired = landing({ id: 13, is_current: 0, current_slot: null });
  const foreign = { id: 14, dataset_type: 'items_raw', is_current: 1, current_slot: 1, payload_json: '{"untouched":true}' };
  const result = buildArmorSourceEvidenceTransition({
    currentRows: [current, image, retired, foreign],
    incomingRows: [landing({ dataset_type: 'armor_set_images_raw', source_key: image.source_key }),
      landing(), landing({ source_page: 'New source page' })],
  });
  assert.equal(validateArmorSourceEvidenceTransition(result), true);
  assert.deepEqual(result.summary, { demotions: 1, inserts: 2, unchanged: 1, preserved: 2 });
  assert.deepEqual(result.preserved, [retired, foreign]);
});
