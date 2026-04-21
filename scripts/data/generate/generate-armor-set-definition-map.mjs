#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { toArmorSetDefinitionSeedRow } from './armor-set-definition-source.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const outputPath = path.join(process.cwd(), 'data', 'generated', 'armor-set-definition-map.json');

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
};

const defsRaw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'standardized', 'armor_sets.standardized.json'), 'utf8'));
const defs = Array.isArray(defsRaw.records) ? defsRaw.records : [];
const definitionByTextKey = new Map(defs.map((record) => [String(record.textKey), record]));
const manualDefinitionOverrides = new Map([
  ['挖矿盔甲', 'ArmorSetBonus.Mining'],
  ['灰烬木盔甲', 'ArmorSetBonus.Wood'],
  ['丛林盔甲', 'ArmorSetBonus.Jungle'],
  ['防雪盔甲', 'ArmorSetBonus.Snow'],
  ['粉色防雪盔甲', 'ArmorSetBonus.Snow'],
  ['渔夫盔甲', 'ArmorSetBonus.Angler'],
  ['铂金盔甲', 'ArmorSetBonus.MetalTier2'],
  ['叶绿盔甲', 'ArmorSetBonus.Chlorophyte'],
  ['神圣盔甲', 'ArmorSetBonus.Hallowed'],
  ['远古神圣盔甲', 'ArmorSetBonus.Hallowed'],
  ['巫师帽', 'ArmorSetBonus.Wizard'],
]);

const conn = await mysql.createConnection(db);
try {
  const [rows] = await conn.query(`
    SELECT id, source_key, text_key, unique_item_ids_json, sets_json
    FROM armor_sets
    WHERE deleted = 0
    ORDER BY id ASC
  `);

  const records = {};
  let mapped = 0;
  let placeholder = 0;

  for (const row of rows) {
    const seed = toArmorSetDefinitionSeedRow(row);
    const ids = [...seed.itemIds].sort((a, b) => a - b);
    const matches = defs.filter(def => {
      const uniq = (Array.isArray(def.uniqueItemIds) ? def.uniqueItemIds : []).filter(v => Number(v) > 0).map(Number);
      const uniqSet = new Set(uniq);
      return ids.length > 0 && ids.every(id => uniqSet.has(id));
    });

    const entry = {
      armorSetId: seed.armorSetId,
      name: seed.name,
      internalCode: seed.internalCode,
      itemIds: ids,
      status: matches.length === 1 ? 'mapped' : 'placeholder',
      candidates: matches.map(def => ({
        textKey: def.textKey ?? null,
        benefitExpression: def.benefitExpression ?? null,
        primaryPart: def.primaryPart ?? null,
        setCount: Number(def.setCount ?? 0),
        uniqueItemIds: Array.isArray(def.uniqueItemIds) ? def.uniqueItemIds : [],
      })),
      definition: null,
    };

    const manualDefinition = definitionByTextKey.get(manualDefinitionOverrides.get(String(seed.internalCode)));

    if (matches.length === 1 || manualDefinition) {
      const def = manualDefinition || matches[0];
      entry.definition = {
        textKey: def.textKey ?? null,
        textZh: null,
        textEn: def.textKey ?? null,
        benefitExpression: def.benefitExpression ?? null,
        benefitZh: null,
        benefitEn: def.benefitExpression ?? null,
        primaryPart: def.primaryPart ?? null,
        setCount: Number(def.setCount ?? 0),
        uniqueItemIds: Array.isArray(def.uniqueItemIds) ? def.uniqueItemIds : [],
      };
      entry.status = manualDefinition ? 'mapped_manual' : 'mapped';
      mapped += 1;
    } else {
      entry.definition = {
        textKey: null,
        textZh: seed.name ?? null,
        textEn: seed.internalCode ?? null,
        benefitExpression: null,
        benefitZh: null,
        benefitEn: null,
        primaryPart: null,
        setCount: ids.length > 0 ? 1 : 0,
        uniqueItemIds: ids,
      };
      placeholder += 1;
    }

    records[String(row.id)] = entry;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: rows.length,
    mapped,
    placeholder,
    records,
  }, null, 2), 'utf8');

  console.log(JSON.stringify({ outputPath, total: rows.length, mapped, placeholder }, null, 2));
} finally {
  await conn.end();
}
