#!/usr/bin/env node
import { createRequire } from 'node:module';
import { buildProjectionPayload } from './projection-sync.mjs';

const require = createRequire(import.meta.url);
const mysql = require('../../apps/admin-console/package.json') && require('../../apps/admin-console/node_modules/mysql2/promise');

const TABLE_INPUTS = {
  relationItems: 'relation_items', relationItemImages: 'relation_item_images', relationItemRarities: 'relation_item_rarities',
  relationNpcs: 'relation_npcs', relationNpcImages: 'relation_npc_images', relationProjectiles: 'relation_projectiles',
  relationProjectileImages: 'relation_projectile_images', relationBosses: 'relation_bosses', relationBuffs: 'relation_buffs',
  relationBuffImages: 'relation_buff_images', relationArmorSets: 'relation_armor_sets', relationArmorSetItems: 'relation_armor_set_items',
  relationArmorSetImages: 'relation_armor_set_images', relationArmorAttributeRows: 'relation_armor_attribute_rows',
  relationEquipmentEffectAttributes: 'relation_equipment_effect_attributes', itemNpcShopRelations: 'item_npc_shop_relations',
  itemNpcLootRelations: 'item_npc_loot_relations', itemProjectileRelations: 'item_projectile_relations', npcProjectileRelations: 'npc_projectile_relations',
  itemBuffRelations: 'item_buff_relations', npcBuffRelations: 'npc_buff_relations', bossItemRewardRelations: 'boss_item_reward_relations',
  bossEffectRelations: 'boss_effect_relations',
};

function camel(key) { return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
function mapRow(row) { return Object.fromEntries(Object.entries(row).map(([k, v]) => [camel(k), v])); }

export async function recoverProjections({ apply = false, db = { host: '127.0.0.1', port: 13306, user: 'root', password: 'root', database: 'terria_v1_relation' } } = {}) {
  const connection = await mysql.createConnection({ ...db, database: 'terria_v1_relation' });
  try {
    const inputs = {};
    for (const [name, table] of Object.entries(TABLE_INPUTS)) {
      const [rows] = await connection.query(`SELECT * FROM \`${table}\` WHERE deleted = 0`);
      inputs[name] = rows.map(mapRow);
    }
    const payload = buildProjectionPayload({ ...inputs, managedImageUrlPrefixes: [] });
    const tables = ['projection_items', 'projection_npcs', 'projection_bosses', 'projection_projectiles', 'projection_buffs'];
    const payloadKey = (table) => `projection${table.slice('projection_'.length).replace(/^./, (c) => c.toUpperCase())}`;
    const counts = Object.fromEntries(tables.map((table) => [table, payload[payloadKey(table)].length]));
    if (!apply) return { apply: false, counts };
    await connection.beginTransaction();
    try {
      for (const table of tables) {
        const rows = payload[payloadKey(table)];
        for (const row of rows) {
          const mapped = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), v]));
          const columns = Object.keys(mapped);
          const updates = columns.filter((c) => c !== 'id').map((c) => `\`${c}\`=VALUES(\`${c}\`)`).join(',');
          await connection.execute(`INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE ${updates}`, columns.map((c) => mapped[c]));
        }
      }
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    return { apply: true, counts };
  } finally { await connection.end(); }
}

if (process.argv[1]?.endsWith('recover-projections-from-relation.mjs')) recoverProjections({ apply: process.argv.includes('--apply=true') }).then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e.stack || e); process.exitCode = 1; });
