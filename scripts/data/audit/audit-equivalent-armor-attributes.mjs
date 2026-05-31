#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { flattenEquivalentArmorAttributePairs } from '../relation/equivalent-armor-attribute-rules.mjs';

const repoRoot = getProjectRoot();
const moduleRequire = createRequire(import.meta.url);
let mysqlModule = null;

export const UNCONFIGURED_EQUIVALENT_ARMOR_ATTRIBUTE_CANDIDATES = [
  {
    groupId: 'iron_ancient_iron',
    sourceInternalName: 'IronHelmet',
    targetInternalName: 'AncientIronHelmet',
    reason: 'no_source_effect_rows'
  },
  {
    groupId: 'gold_ancient_gold',
    sourceInternalName: 'GoldHelmet',
    targetInternalName: 'AncientGoldHelmet',
    reason: 'no_source_effect_rows'
  }
];

export function parseArgs(argv = process.argv.slice(2)) {
  const raw = {};
  for (const arg of argv) {
    const trimmed = String(arg ?? '').trim();
    if (!trimmed.startsWith('--')) continue;
    const [key, ...valueParts] = trimmed.slice(2).split('=');
    raw[key] = valueParts.length ? valueParts.join('=') : true;
  }

  return {
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
    allowNonLocalDb: ['true', '1', 'yes', 'y', 'on'].includes(String(raw['allow-non-local-db'] ?? raw.allowNonLocalDb ?? '').toLowerCase())
  };
}

export function loadMysqlModule({
  rootRequire = moduleRequire,
  fallbackRequireFactory = createRequire
} = {}) {
  if (mysqlModule) {
    return mysqlModule;
  }
  try {
    mysqlModule = rootRequire('mysql2/promise');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
    mysqlModule = fallbackRequireFactory(path.join(repoRoot, 'data-query-app', 'package.json'))('mysql2/promise');
  }
  return mysqlModule;
}

function effectSignature(row) {
  return [
    row.statKey,
    row.classScope ?? '',
    Number(row.valueDecimal ?? 0),
    row.unit ?? ''
  ].join('|');
}

function groupBy(rows, keyFn) {
  const result = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    result.set(key, [...(result.get(key) ?? []), row]);
  }
  return result;
}

export function auditEquivalentArmorAttributeRows({ pairs, items, armorRows, effectRows }) {
  const itemByInternalName = new Map(items.map((item) => [item.internalName, item]));
  const armorByInternalName = new Map(armorRows.map((row) => [row.itemInternalName, row]));
  const effectsByOwnerId = groupBy(effectRows, (row) => Number(row.ownerId));
  const issues = [];
  const observations = [];
  let checkedPairs = 0;
  let skippedPairs = 0;

  for (const pair of pairs) {
    const sourceItem = itemByInternalName.get(pair.sourceInternalName);
    const targetItem = itemByInternalName.get(pair.targetInternalName);
    if (!sourceItem) {
      issues.push({
        groupId: pair.groupId,
        source: pair.sourceInternalName,
        target: pair.targetInternalName,
        reason: 'missing_source_projection_item'
      });
      skippedPairs += 1;
      continue;
    }
    if (!targetItem) {
      issues.push({
        groupId: pair.groupId,
        source: pair.sourceInternalName,
        target: pair.targetInternalName,
        reason: 'missing_target_projection_item'
      });
      skippedPairs += 1;
      continue;
    }
    checkedPairs += 1;

    const sourceArmor = armorByInternalName.get(pair.sourceInternalName);
    const targetArmor = armorByInternalName.get(pair.targetInternalName);
    const sourceEffects = effectsByOwnerId.get(Number(sourceItem.sourceId)) ?? [];
    const targetEffects = effectsByOwnerId.get(Number(targetItem.sourceId)) ?? [];

    if (sourceArmor && !targetArmor) {
      issues.push({
        groupId: pair.groupId,
        source: pair.sourceInternalName,
        target: pair.targetInternalName,
        reason: 'missing_target_armor_attribute_row'
      });
    }
    if (sourceArmor && targetArmor && Number(sourceArmor.defenseValue) !== Number(targetArmor.defenseValue)) {
      issues.push({
        groupId: pair.groupId,
        source: pair.sourceInternalName,
        target: pair.targetInternalName,
        reason: 'defense_value_mismatch',
        sourceDefense: sourceArmor.defenseValue,
        targetDefense: targetArmor.defenseValue
      });
    }
    if (sourceArmor && Number(sourceItem.defense) !== Number(sourceArmor.defenseValue)) {
      issues.push({
        groupId: pair.groupId,
        source: pair.sourceInternalName,
        target: pair.targetInternalName,
        reason: 'source_item_defense_mismatch',
        itemDefense: sourceItem.defense,
        armorDefense: sourceArmor.defenseValue
      });
    }
    if (targetArmor && Number(targetItem.defense) !== Number(targetArmor.defenseValue)) {
      issues.push({
        groupId: pair.groupId,
        source: pair.sourceInternalName,
        target: pair.targetInternalName,
        reason: 'target_item_defense_mismatch',
        itemDefense: targetItem.defense,
        armorDefense: targetArmor.defenseValue
      });
    }
    if (sourceEffects.length && !targetEffects.length) {
      issues.push({
        groupId: pair.groupId,
        source: pair.sourceInternalName,
        target: pair.targetInternalName,
        reason: 'missing_target_effect_rows'
      });
      continue;
    }

    const sourceSignatures = sourceEffects.map(effectSignature).sort();
    const targetSignatures = targetEffects.map(effectSignature).sort();
    if (sourceSignatures.length && JSON.stringify(sourceSignatures) !== JSON.stringify(targetSignatures)) {
      issues.push({
        groupId: pair.groupId,
        source: pair.sourceInternalName,
        target: pair.targetInternalName,
        reason: 'effect_signature_mismatch',
        sourceSignatures,
        targetSignatures
      });
    }
  }

  for (const candidate of UNCONFIGURED_EQUIVALENT_ARMOR_ATTRIBUTE_CANDIDATES) {
    const sourceItem = itemByInternalName.get(candidate.sourceInternalName);
    const targetItem = itemByInternalName.get(candidate.targetInternalName);
    if (!sourceItem || !targetItem) {
      continue;
    }
    const sourceEffects = effectsByOwnerId.get(Number(sourceItem.sourceId)) ?? [];
    observations.push({
      groupId: candidate.groupId,
      source: candidate.sourceInternalName,
      target: candidate.targetInternalName,
      reason: sourceEffects.length ? 'unconfigured_equivalent_candidate_has_source_effect_rows' : candidate.reason,
      sourceEffectRowCount: sourceEffects.length
    });
  }

  return {
    summary: {
      checkedPairs,
      skippedPairs,
      issueCount: issues.length,
      observationCount: observations.length
    },
    issues,
    observations
  };
}

async function main() {
  const args = parseArgs();
  const config = loadLocalStackConfig(repoRoot);
  const host = config.database?.host ?? '127.0.0.1';
  const port = Number(config.database?.port ?? 3306);
  if (!args.allowNonLocalDb && (host !== '127.0.0.1' || port !== 13306)) {
    throw new Error(`Refusing to audit non-local DB target ${host}:${port}; pass --allow-non-local-db=true to override.`);
  }
  const mysql = loadMysqlModule();
  const connection = await mysql.createConnection({
    host,
    port,
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
    database: args.relationDatabase
  });

  try {
    const [items] = await connection.query(
      'SELECT id AS sourceId, internal_name AS internalName, defense FROM projection_items WHERE deleted = 0'
    );
    const [armorRows] = await connection.query(
      'SELECT item_id AS itemId, item_internal_name AS itemInternalName, defense_value AS defenseValue FROM projection_item_armor_attributes WHERE deleted = 0'
    );
    const [effectRows] = await connection.query(
      "SELECT owner_id AS ownerId, item_internal_name AS itemInternalName, stat_key AS statKey, class_scope AS classScope, value_decimal AS valueDecimal, unit FROM projection_equipment_effect_attributes WHERE deleted = 0 AND owner_kind = 'item' AND source_kind = 'armor_attribute_cell'"
    );
    const result = auditEquivalentArmorAttributeRows({
      pairs: flattenEquivalentArmorAttributePairs(),
      items,
      armorRows,
      effectRows
    });
    const outputPath = path.join(repoRoot, 'reports', 'relation', 'equivalent-armor-attributes-2026-06-01.json');
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Target DB: ${host}:${port}/${args.relationDatabase}`);
    console.log(`Equivalent armor attribute audit: checked=${result.summary.checkedPairs} skipped=${result.summary.skippedPairs} issues=${result.summary.issueCount} observations=${result.summary.observationCount}`);
    console.log(`Report: ${outputPath}`);
    if (result.issues.length) {
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
