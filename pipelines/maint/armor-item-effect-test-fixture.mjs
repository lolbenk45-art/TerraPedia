import { fixture } from '../relation/armor-shroomite-source-test-fixture.mjs';
import { buildArmorItemEffectMaintCandidate } from './armor-item-effect-maint-candidate.mjs';

export function persistedItemSourceFixture(source = fixture()) {
  const candidate = buildArmorItemEffectMaintCandidate({ source, parsedAt: '2026-09-30T00:00:00Z',
    currentLocalLandings: [], currentMaintLandings: [], currentMaintRows: [] });
  return {
    maintLandings: [{ ...candidate.maintLandingRow, id: 900 }],
    maintArmorAttributeRows: candidate.maintRows.map((row, i) => ({ ...row, id: 1000 + i, landing_source_id: 900 })),
    maintItems: candidate.sourceCandidate.effects.map((effect, i) => ({
      id: 2000 + i, source_id: effect.ownerId, internal_name: effect.itemInternalName,
      english_name: effect.variantLabel, raw_json: JSON.stringify({ internalName: effect.itemInternalName, headSlot: 103 + i }),
      status: 1, deleted: 0,
    })),
  };
}
