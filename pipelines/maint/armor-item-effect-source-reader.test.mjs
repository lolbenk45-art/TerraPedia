import test from 'node:test';
import assert from 'node:assert/strict';
import { persistedItemSourceFixture as fixture } from './armor-item-effect-test-fixture.mjs';
import { readArmorItemEffectMaintSources as read } from './armor-item-effect-source-reader.mjs';
import { fixture as sourceFixture, change } from '../relation/armor-shroomite-source-test-fixture.mjs';

test('rederives three persisted typed facts from exact maint landing bytes and joins their item identities', () => {
  const input = fixture(); const before = structuredClone(input);
  const groups = read(input);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].landing.id, 900);
  assert.deepEqual(groups[0].maintRows.map(row => row.id), [1000, 1001, 1002]);
  assert.deepEqual(groups[0].sourceCandidate.effects.map(row => [row.ownerId, row.operation, row.valueDecimal]),
    [[1546, 'multiply', 1.12], [1547, 'multiply', 1.12], [1548, 'multiply', 1.12]]);
  assert.deepEqual(input, before);
  input.maintLandings[0].parsed_at = new Date(input.maintLandings[0].parsed_at);
  assert.equal(read(input).length, 1);
});

for (const [label, mutate] of [
  ['missing maint row', input => input.maintArmorAttributeRows.pop()],
  ['extra maint row', input => input.maintArmorAttributeRows.push({ ...input.maintArmorAttributeRows[0], id: 77, record_key: 'f'.repeat(64) })],
  ['duplicate maint ID', input => { input.maintArmorAttributeRows[1].id = 1000; }],
  ['missing landing', input => { input.maintLandings = []; }],
  ['duplicate landing ID', input => input.maintLandings.push(structuredClone(input.maintLandings[0]))],
  ['unconsumed landing', input => { input.maintArmorAttributeRows = []; }],
  ['inactive maint', input => { input.maintArmorAttributeRows[0].status = 0; }],
  ['retired landing', input => { input.maintLandings[0].is_current = 0; }],
  ['wrong source hash', input => { input.maintLandings[0].content_hash = 'f'.repeat(64); }],
  ['wrong maint landing reference', input => { input.maintArmorAttributeRows[0].landing_source_id = 800; }],
  ['wrong cached effect', input => { const raw = JSON.parse(input.maintArmorAttributeRows[0].raw_json); raw.effect.valueDecimal = 1.15; input.maintArmorAttributeRows[0].raw_json = JSON.stringify(raw); }],
  ['wrong bytes', input => { const raw = JSON.parse(input.maintLandings[0].payload_json); raw.artifacts.page.bytesBase64 = Buffer.from('{}').toString('base64'); input.maintLandings[0].payload_json = JSON.stringify(raw); }],
  ['unknown typed version', input => { const raw = JSON.parse(input.maintArmorAttributeRows[0].raw_json); raw.schemaVersion = 'armor-item-effect-maint/v2'; input.maintArmorAttributeRows[0].raw_json = JSON.stringify(raw); }],
  ['missing item', input => input.maintItems.pop()],
  ['wrong item name', input => { input.maintItems[0].internal_name = 'Foreign'; }],
  ['wrong item slot', input => { input.maintItems[0].raw_json = '{"bodySlot":1}'; }],
  ['ambiguous item identity', input => input.maintItems.push({ ...input.maintItems[0], id: 55 })],
  ['inactive item', input => { input.maintItems[0].deleted = 1; }],
  ['undeclared authority', input => { input.authorized = true; }],
]) {
  test(`typed source reader rejects ${label}`, () => {
    const input = fixture(); mutate(input); assert.throws(() => read(input));
  });
}

test('typed source reader rejects duplicate physical item IDs across distinct owners', () => {
  const input = fixture(); input.maintItems[1].id = input.maintItems[0].id;
  assert.throws(() => read(input), /item.*identity|duplicate/i);
});

test('typed source reader rejects two active source groups for the same item owners', () => {
  const input = fixture(); const source = sourceFixture();
  change(source.page, raw => { raw.fetchedAt = '2026-09-29T15:35:36Z'; });
  const extra = fixture(source);
  extra.maintLandings[0].id = 901;
  extra.maintArmorAttributeRows.forEach((row, i) => { row.id = 1100 + i; row.landing_source_id = 901; });
  input.maintLandings.push(...extra.maintLandings); input.maintArmorAttributeRows.push(...extra.maintArmorAttributeRows);
  assert.throws(() => read(input), /duplicate|multiple current/);
});
