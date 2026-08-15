import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSourceConditionFields } from './source-condition-normalizer.mjs';

test('normalizeSourceConditionFields extracts explicit hardmode, blood moon, snow biome, and progression hints', () => {
  const actual = normalizeSourceConditionFields({
    conditions: null,
    notes: 'Bloodbath Dye is purchased from the Dye Trader during a Blood Moon for 7 GC 50 SC while living in the Snow biome in Hardmode after Plantera has been defeated.',
    biomeCode: null
  });

  assert.equal(actual.conditionBiomeCode, 'snow');
  assert.equal(actual.conditionGamePeriodCode, 'hardmode');
  assert.equal(actual.conditionTimeCode, null);
  assert.deepEqual(JSON.parse(actual.conditionEventsJson), ['blood_moon']);
  assert.deepEqual(JSON.parse(actual.specialFlagsJson), ['post_plantera']);
  assert.equal(actual.conditionParseStatus, 'parsed');
});

test('normalizeSourceConditionFields extracts night and moon phases from explicit text', () => {
  const actual = normalizeSourceConditionFields({
    conditions: '1.0944% ( Night )',
    notes: 'The Artisan Loaf can be purchased from the Skeleton Merchant during a Waning Crescent , New Moon , or Waxing Crescent .',
    biomeCode: null
  });

  assert.equal(actual.conditionTimeCode, 'night');
  assert.deepEqual(
    JSON.parse(actual.conditionEventsJson),
    ['new_moon', 'waning_crescent', 'waxing_crescent']
  );
  assert.equal(actual.conditionParseStatus, 'parsed');
});

test('normalizeSourceConditionFields keeps no_condition_text when nothing explicit is available', () => {
  const actual = normalizeSourceConditionFields({
    conditions: null,
    notes: null,
    biomeCode: null
  });

  assert.equal(actual.conditionSourceText, null);
  assert.equal(actual.conditionParseStatus, 'no_condition_text');
});

test('normalizeSourceConditionFields marks source_fields_only when only upstream structured fields are available', () => {
  const actual = normalizeSourceConditionFields({
    conditions: null,
    notes: null,
    biomeCode: 'snow'
  });

  assert.equal(actual.conditionSourceText, null);
  assert.equal(actual.conditionBiomeCode, 'snow');
  assert.equal(actual.conditionParseStatus, 'source_fields_only');
});
