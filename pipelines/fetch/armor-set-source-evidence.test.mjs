import test from 'node:test';
import assert from 'node:assert/strict';

import { buildArmorSetSourceEvidence } from './armor-set-source-evidence.mjs';

const rawPayload = {
  moduleTitle: 'Module:ArmorSetBonuses',
  pageTitle: 'Module:ArmorSetBonuses',
  revisionId: 987654,
  sourceRevisionTimestamp: '2026-05-21T00:00:00Z',
  moduleContent: 'ArmorSetBonuses.Initialize = function()\nArmorSetBonuses.Wood = true;\nend'
};
const records = [{
  benefitExpression: 'ArmorSetBonuses.Benefits.Wood',
  primaryPart: null,
  setCount: 1,
  sets: [[727, 728, 729]],
  textKey: 'ArmorSetBonus.Wood',
  uniqueItemIds: [727, 728, 729]
}];

function inputs(overrides = {}) {
  const parsedPayload = {
    armorSets: records,
    source: 'terraria.wiki.gg:Module:ArmorSetBonuses',
    sourcePageTitle: 'Module:ArmorSetBonuses',
    sourceRevisionId: 987654,
    sourceRevisionTimestamp: rawPayload.sourceRevisionTimestamp
  };
  const standardizedPayload = {
    records,
    upstreamMeta: {
      sourcePageTitle: 'Module:ArmorSetBonuses',
      sourceRevisionId: 987654,
      sourceRevisionTimestamp: rawPayload.sourceRevisionTimestamp
    }
  };
  const report = {
    moduleUrl: 'https://terraria.wiki.gg/api.php',
    revisionId: 987654,
    revisionTimestamp: rawPayload.sourceRevisionTimestamp
  };
  return { rawPayload, parsedPayload, standardizedPayload, report, ...overrides };
}

test('buildArmorSetSourceEvidence binds one revision and exact textKey mappings across emitted artifacts', () => {
  const evidence = buildArmorSetSourceEvidence(inputs());
  assert.equal(evidence.schemaVersion, 'armor-set-source-evidence/v1');
  assert.equal(evidence.source.pageTitle, 'Module:ArmorSetBonuses');
  assert.equal(evidence.source.revisionId, 987654);
  assert.match(evidence.source.contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(evidence.mappings, [{
    benefitExpression: 'ArmorSetBonuses.Benefits.Wood',
    textKey: 'ArmorSetBonus.Wood'
  }]);
});

test('buildArmorSetSourceEvidence rejects revision drift before publication', () => {
  assert.throws(
    () => buildArmorSetSourceEvidence(inputs({ report: { ...inputs().report, revisionId: 987655 } })),
    /revision.*drift|revision.*match/i
  );
});

test('buildArmorSetSourceEvidence rejects missing or malformed textKey mappings', () => {
  assert.throws(
    () => buildArmorSetSourceEvidence(inputs({ parsedPayload: { ...inputs().parsedPayload, armorSets: [{ ...records[0], textKey: '' }] } })),
    /textKey/i
  );
});
