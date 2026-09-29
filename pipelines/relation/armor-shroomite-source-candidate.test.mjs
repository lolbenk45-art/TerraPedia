import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildArmorShroomiteSourceCandidate as build,
  assertArmorShroomiteSourceCandidate as verify,
} from './armor-shroomite-source-candidate.mjs';
import { validateArmorSemanticRepairProposal } from './run-armor-semantic-repair.mjs';

import { fixture, change, names, scopes, conditions, note, attribution, history } from './armor-shroomite-source-test-fixture.mjs';

test('derives three current item multipliers with full source binding and no equipped totals', () => {
  const source = fixture();
  const before = structuredClone(source);
  const candidate = build(source);
  assert.equal(candidate.schemaVersion, 'armor-shroomite-item-source-candidate/v1');
  assert.equal(candidate.executable, false);
  assert.equal(candidate.databaseWrites, false);
  assert.equal(candidate.targetGameVersion, '1.4.5.8');
  assert.deepEqual(candidate.effects.map(row => [row.ownerId, row.ownerKind, row.ownerKey, row.statKey,
    row.operation, row.valueDecimal, row.unit, row.conditionText]), names.map((name, i) => [
    1546 + i, 'item', `Shroomite${name}`, 'damage_bonus', 'multiply', 1.12, 'multiplier', conditions[i],
  ]));
  assert.equal(candidate.effects.length, 3);
  assert.deepEqual(candidate.acceptance.blockers.map(row => row.code), [
    'item-source-upstream-lineage-unbound', 'complete-item-and-set-coverage-unverified',
  ]);
  for (const row of candidate.effects) {
    assert.equal(row.sourceMaintId, null);
    assert.equal(row.landingSourceId, null);
    assert.equal(row.ownerRecordKey, null);
    assert.equal(row.sourceLocale, 'en');
    assert.equal(row.applyScope, 'item_bonus');
    assert.equal(row.sourceKind, 'armor_item_page');
    const evidence = JSON.parse(row.rawJson);
    assert.equal(evidence.targetGameVersion, '1.4.5.8');
    assert.equal(evidence.changedIn, '1.4.5.0');
    assert.equal(evidence.sources.page.revisionId, 1027106);
    assert.equal(evidence.sources.page.sha256, source.page.expected.sha256);
    assert.equal(evidence.quotes.multiplication, note);
    assert.equal(evidence.quotes.history, history);
    assert.match(row.rawText, /^\* ×1\.12/);
    assert.equal(JSON.parse(source.page.bytes).wikitext.split('\n')[row.sourceLineIndex], row.rawText);
  }
  assert.deepEqual(source, { ...before, page: { ...before.page, bytes: Buffer.from(before.page.bytes) },
    iteminfo: { ...before.iteminfo, bytes: Buffer.from(before.iteminfo.bytes) },
    armorSets: { ...before.armorSets, bytes: Buffer.from(before.armorSets.bytes) } });
  assert.equal(verify({ candidate, source }), true);
});

test('source binding property order cannot change candidate identities', () => {
  const source = fixture(); const expected = build(source);
  for (const key of ['page', 'iteminfo', 'armorSets']) {
    source[key].expected = Object.fromEntries(Object.entries(source[key].expected).reverse());
  }
  assert.deepEqual(build(source), expected);
});

test('rejects a mixed source revision tuple even when each artifact is internally bound', () => {
  const source = fixture();
  change(source.iteminfo, raw => { raw.revisionId = 1023242; });
  source.iteminfo.expected.revisionId = 1023242;
  assert.throws(() => build(source), /revision.*tuple|frozen|compatible/i);
});

test('requires Shroomite stealth evidence to remain set-owned', () => {
  const source = fixture();
  change(source.armorSets, raw => {
    raw.wikitext = raw.wikitext.replace('player.shroomiteStealth = true;', 'player.shroomiteStealth = false;');
  });
  assert.throws(() => build(source), /stealth|set-owned/i);
});

test('rejects duplicate Shroomite set-owned stealth definitions', () => {
  const source = fixture();
  change(source.armorSets, raw => {
    raw.wikitext += '\n' + raw.wikitext.slice(0, raw.wikitext.indexOf('ArmorSetBonuses.Create'));
  });
  assert.throws(() => build(source), /duplicate|stealth|set-owned/i);
});

test('publishes Shroomite stealth as one set-owned flag instead of an item effect', () => {
  const candidate = build(fixture());
  assert.deepEqual(candidate.setEffects.map(row => [row.ownerKind, row.ownerKey, row.statKey,
    row.operation, row.unit, row.conditionText]), [[
    'armor_set', 'ArmorSetBonus.Shroomite', 'stealth_enabled', 'set_flag', 'boolean',
    'when the full Shroomite set is equipped'
  ]]);
  assert.equal(candidate.effects.some(row => row.statKey === 'stealth_enabled'), false);
});

test('the existing projection model retains each item multiplier and weapon condition', () => {
  const candidate = build(fixture());
  assert.deepEqual(candidate.projectionEffects.map(row => [row.ownerId, row.operation, row.valueDecimal, row.unit, row.conditionText]),
    [1546, 1547, 1548].map((id, i) => [id, 'multiply', 1.12, 'multiplier', conditions[i]]));
  assert.ok(candidate.projectionEffects.every(row => !Object.hasOwn(row, 'id')));
});

for (const [label, mutate, pattern] of [
  ['changed bytes', s => { s.page.bytes = Buffer.concat([s.page.bytes, Buffer.from(' ')]); }, /hash/],
  ['revision mismatch', s => { s.page.expected.revisionId++; }, /revisionId/],
  ['timestamp mismatch', s => { s.page.expected.revisionTimestamp = '2023-10-23T04:15:47Z'; }, /revisionTimestamp/],
  ['page mismatch', s => { s.page.expected.pageId++; }, /pageId/],
  ['wrong source title', s => { change(s.page, r => { r.pageTitle = 'Armor'; }); s.page.expected.pageTitle = 'Armor'; }, /pageTitle/],
  ['wrong provider', s => change(s.page, r => { r.apiUrl = 'https://example.test/api.php'; }), /provider/],
  ['old game version', s => { s.targetGameVersion = '1.4.4.9'; }, /version/i],
  ['future game version', s => { s.targetGameVersion = '1.4.5.9'; }, /version/i],
  ['missing condition', s => change(s.page, r => { r.wikitext = r.wikitext.replace(scopes[0], ''); }), /scope|variant/],
  ['changed condition', s => change(s.page, r => { r.wikitext = r.wikitext.replace(scopes[0], 'all ranged weapons'); }), /scope|variant/],
  ['missing multiplication', s => change(s.page, r => { r.wikitext = r.wikitext.replace(note, ''); }), /multiplication/],
  ['commented multiplication', s => change(s.page, r => { r.wikitext = r.wikitext.replace(note, `<!-- ${note} -->`); }), /multiplication/],
  ['missing attribution', s => change(s.page, r => { r.wikitext = r.wikitext.replace(attribution, ''); }), /attribution/],
  ['missing history', s => change(s.page, r => { r.wikitext = r.wikitext.replace(history, ''); }), /history/],
  ['missing version reference', s => change(s.page, r => { r.wikitext = r.wikitext.replace('v=1.4.5.8', 'v=1.4.4.9'); }), /version/],
  ['wrong magnitude', s => change(s.page, r => { r.wikitext = r.wikitext.replace('* ×1.12', '* ×1.15'); }), /scope|variant/],
  ['wrong item owner', s => change(s.iteminfo, r => { r.wikitext = r.wikitext.replace('"ShroomiteHeadgear"', '"WoodHelmet"'); }), /identity/],
  ['wrong item slot', s => change(s.iteminfo, r => { r.wikitext = r.wikitext.replace('"headSlot":103', '"bodySlot":103'); }), /identity/],
  ['missing set variant', s => change(s.armorSets, r => { r.wikitext = r.wikitext.replace(':Set(1546, 1549, 1550)', ''); }), /variant/],
  ['wrong set membership', s => change(s.armorSets, r => { r.wikitext = r.wikitext.replace(':Set(1546, 1549, 1550)', ':Set(1546, 1549, 1)'); }), /variant/],
  ['duplicate set variant', s => change(s.armorSets, r => { r.wikitext = r.wikitext.replace(':Set(1546, 1549, 1550)', ':Set(1548, 1549, 1550)'); }), /variant/],
  ['commented set statement', s => change(s.armorSets, r => { r.wikitext = `--[=[\n${r.wikitext}\n]=]`; }), /variant/],
  ['line-commented set statement', s => change(s.armorSets, r => {
    r.wikitext = r.wikitext.replace('ArmorSetBonuses.Create', '--ArmorSetBonuses.Create');
  }), /variant/],
  ['duplicate source section', s => change(s.page, r => { r.wikitext += '\n== Notes ==\n' + note; }), /section/],
  ['caller override authority', s => { s.effects = [{ operation: 'add', valueDecimal: 12 }]; }, /input/],
]) {
  test(`rejects ${label} before producing a candidate`, () => {
    const source = fixture(); mutate(source);
    assert.throws(() => build(source), pattern);
  });
}

for (const [label, mutate] of [
  ['owner', c => { c.effects[0].ownerId = 1; }],
  ['condition', c => { c.effects[0].conditionText = null; }],
  ['magnitude', c => { c.effects[0].valueDecimal = 15; }],
  ['operation', c => { c.effects[0].operation = 'add'; }],
  ['projection', c => { c.projectionEffects[0].conditionText = 'all'; }],
  ['game version', c => { c.targetGameVersion = '1.4.4.9'; }],
  ['claimed authority', c => { c.executable = true; c.acceptance.blockers = []; }],
]) {
  test(`candidate rederivation rejects modified ${label}`, () => {
    const source = fixture(); const candidate = build(source); mutate(candidate);
    assert.throws(() => verify({ candidate, source }), /candidate.*drift/);
  });
}

test('the legacy attribute-table writer does not accept the new item-source candidate', () => {
  assert.throws(() => validateArmorSemanticRepairProposal(build(fixture())), /identity/);
});
