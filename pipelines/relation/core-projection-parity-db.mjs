import { CORE_PROJECTION_PARITY_DOMAINS } from './core-projection-parity-contract.mjs';

const q = (value) => `\`${String(value).replaceAll('`', '``')}\``;
const qualified = (db, table) => `${q(db)}.${q(table)}`;

export async function readParityPlan(connection, { relationDatabase = 'terria_v1_relation', localDatabase = 'terria_v1_local' } = {}) {
  const domains = {};
  const [items] = await connection.query(`SELECT p.internal_name AS parity_key, p.knockback AS projectionKnockback, p.sell AS projectionSell, JSON_UNQUOTE(JSON_EXTRACT(r.raw_json,'$.stats.knockback')) AS relationKnockback, COALESCE(r.sell_raw, JSON_UNQUOTE(JSON_EXTRACT(r.raw_json,'$.economy.sell'))) AS relationSell FROM ${qualified(relationDatabase, 'projection_items')} p JOIN ${qualified(relationDatabase, 'relation_items')} r ON BINARY r.internal_name=BINARY p.internal_name WHERE (p.knockback IS NULL AND JSON_EXTRACT(r.raw_json,'$.stats.knockback') IS NOT NULL) OR (p.sell IS NULL AND (r.sell_raw IS NOT NULL OR JSON_EXTRACT(r.raw_json,'$.economy.sell') IS NOT NULL))`);
  domains.items = items.map((row) => ({ key: row.parity_key, before: { knockback: row.projectionKnockback, sell: row.projectionSell }, relation: { knockback: row.relationKnockback == null ? null : Number(row.relationKnockback), sell: row.relationSell == null ? null : Number(row.relationSell) } }));
  const [npcs] = await connection.query(`SELECT p.internal_name AS parity_key, p.life_max AS projectionLifeMax, p.knock_back_resist AS projectionResist, p.scale AS projectionScale, JSON_UNQUOTE(JSON_EXTRACT(r.raw_json,'$.combat.lifeMax')) AS relationLifeMax, JSON_UNQUOTE(JSON_EXTRACT(r.raw_json,'$.combat.knockBackResist')) AS relationResist, JSON_UNQUOTE(JSON_EXTRACT(r.raw_json,'$.dimensions.scale')) AS relationScale FROM ${qualified(relationDatabase, 'projection_npcs')} p JOIN ${qualified(relationDatabase, 'relation_npcs')} r ON BINARY r.internal_name=BINARY p.internal_name WHERE (p.life_max IS NULL AND JSON_EXTRACT(r.raw_json,'$.combat.lifeMax') IS NOT NULL) OR (p.knock_back_resist IS NULL AND JSON_EXTRACT(r.raw_json,'$.combat.knockBackResist') IS NOT NULL) OR (p.scale IS NULL AND JSON_EXTRACT(r.raw_json,'$.dimensions.scale') IS NOT NULL)`);
  domains.npcs = npcs.map((row) => ({ key: row.parity_key, before: { life_max: row.projectionLifeMax, knock_back_resist: row.projectionResist, scale: row.projectionScale }, relation: { life_max: row.relationLifeMax == null ? row.projectionLifeMax : Number(row.relationLifeMax), knock_back_resist: row.relationResist == null ? row.projectionResist : Number(row.relationResist), scale: row.relationScale == null ? row.projectionScale : Number(row.relationScale) } }));
  const [bosses] = await connection.query(`SELECT p.code AS parity_key, p.name_zh AS projectionNameZh, r.boss_title_zh AS relationNameZh FROM ${qualified(relationDatabase, 'projection_bosses')} p JOIN ${qualified(relationDatabase, 'relation_bosses')} r ON LOWER(r.boss_title_en)=LOWER(p.code) OR LOWER(r.boss_title_en)=LOWER(REPLACE(p.code,'_',' ')) WHERE p.name_zh IS NULL AND r.boss_title_zh IS NOT NULL`);
  domains.bosses = bosses.map((row) => ({ key: row.parity_key, before: { name_zh: row.projectionNameZh }, relation: { name_zh: row.relationNameZh } }));
  return domains;
}

export async function applyParityPlan(connection, plan, { relationDatabase = 'terria_v1_relation' } = {}) {
  const changed = [];
  for (const [domain, config] of Object.entries(CORE_PROJECTION_PARITY_DOMAINS)) {
    for (const row of plan.domains[domain] ?? []) {
      const sets = config.fields.map((field) => `${q(field)} = ?`).join(', ');
      const values = config.fields.map((field) => row.relation[field]);
      values.push(row.key);
      await connection.execute(`UPDATE ${qualified(relationDatabase, config.table)} SET ${sets} WHERE ${q(config.key)} = ?`, values);
      changed.push({ domain, key: row.key, fields: config.fields });
    }
  }
  return changed;
}
