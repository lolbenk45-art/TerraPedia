import { createHash } from 'node:crypto';
import { extractMaintEntitiesFromLandingRow } from '../maint/sync-landing-to-maint.mjs';
import { buildArmorAttributeRelations, buildArmorAttributeEffectRows } from './sync-maint-to-relation.mjs';

export const at = '2026-09-26T06:00:00.000Z';
const revision = '2023-10-23T04:15:47.000Z';
const serverUuid = 'b4ae6728-4f72-11f1-bcc9-00155d37eadf';
export const key = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const snake = row => Object.fromEntries(Object.entries(row)
  .filter(([field]) => !['scope', 'tableName'].includes(field))
  .map(([field, value]) => [field.replace(/[A-Z]/g, char => `_${char.toLowerCase()}`), value]));

export async function fixture() {
  const payload = { sourcePageTitle: '盔甲属性表', sourceRevisionTimestamp: revision, fetchedAt: at,
    records: [{ sectionCode: 'pre-hardmode', slotGroup: 'head', itemPageTitle: '忍者兜帽',
      itemHref: '/zh/wiki/Ninja_Hood', itemNameZh: '忍者兜帽', defenseValue: null,
      rawCells: { meleeCritChance: '3%' }, sourceRevisionTimestamp: revision }] };
  const landing = { id: 12448, dataset_type: 'armor_attributes_raw', provider: 'terraria.wiki.gg',
    source_key: 'wiki.page.armor_attributes', source_page: '盔甲属性表', source_revision_timestamp: revision,
    content_hash: key(payload), payload_json: JSON.stringify(payload), artifact_role: 'legacy_compat',
    fetched_at: at, parsed_at: at, parse_status: 'ok', is_current: 1 };
  const { rows } = await extractMaintEntitiesFromLandingRow(landing);
  const maint = { ...snake(rows[0]), id: 34, status: 1, deleted: 0 };
  const item = { id: 51, source_id: 256, internal_name: 'NinjaHood', name_zh: '忍者兜帽',
    english_name: 'Ninja Hood', defense_value: 2, raw_json: '{"headSlot":22}', status: 1, deleted: 0 };
  const [attribute] = buildArmorAttributeRelations({ maintArmorAttributeRows: [maint], maintItems: [item] });
  const [effect] = buildArmorAttributeEffectRows([attribute]);
  return {
    serverUuid, generatedAt: at,
    sourceRows: {
      relation_armor_sets: [{ id: 8, record_key: key('Ninja'), text_key: 'ArmorSetBonus.Ninja',
        sets_json: '[[256,0,0]]', status: 1, deleted: 0 }],
      relation_armor_set_items: [{ id: 61, record_key: key('Ninja:0:0'), armor_set_record_key: key('Ninja'),
        text_key: 'ArmorSetBonus.Ninja', set_variant_index: 0, part_index: 0,
        item_source_id: 256, item_internal_name: 'NinjaHood', status: 1, deleted: 0 }],
      maint_items: [item], local_items: [{ id: 256, internal_name: 'NinjaHood', status: 1, deleted: 0 }],
      maint_armor_attribute_rows: [maint], maint_landings: [landing],
      relation_armor_attribute_rows: [{ ...snake(attribute), id: 734, status: 1, deleted: 0 }],
      relation_equipment_effect_attributes: [{ ...snake(effect), id: 906, status: 1, deleted: 0 }],
    },
    beforeRows: { projection_item_armor_attributes: [], projection_equipment_effect_attributes: [] },
  };
}
