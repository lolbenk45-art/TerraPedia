#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { buildLocalDbConnectionOptions } from './local-db-connection-options.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'apps/admin-console', 'package.json'));
const mysql = require('mysql2/promise');

const DEFAULTS = Object.freeze({
  localDatabase: 'terria_v1_local',
  relationDatabase: 'terria_v1_relation',
  acceptedProvider: 'terraria.wiki.gg',
  acceptedLandingContentHash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
  legacyLineage: Object.freeze({
    sourceProvider: 'terrapedia.generated',
    landingContentHash: '07cd3493b61def7dfb576846cab011e1e2c82fd398d5de711697a47444eae8b3',
    landingSourceKey: 'generated.npc_item_relations_bundle',
    sourceMaintTable: 'maint_item_sources',
  }),
  retirableProviders: Object.freeze(['terrapedia.generated', 'wiki_gg']),
  writeReport: true,
  output: 'reports/runtime/local-data-chain-closure/20260819/npc-stale-lineage-repair-preview.json',
});

const RELATION_FIELDS = Object.freeze({
  loot: Object.freeze([
    'npcInternalName', 'itemInternalName', 'quantityMin', 'quantityMax', 'quantityText',
    'chanceValue', 'chanceText', 'conditions', 'conditionSourceText', 'conditionParseStatus',
    'conditionBiomeCode', 'conditionGamePeriodCode', 'conditionTimeCode', 'conditionWeatherCode',
    'conditionEventsJson', 'specialFlagsJson',
  ]),
  shop: Object.freeze([
    'npcInternalName', 'itemInternalName', 'priceText', 'conditions', 'conditionSourceText',
    'conditionParseStatus', 'conditionBiomeCode', 'conditionGamePeriodCode', 'conditionTimeCode',
    'conditionWeatherCode', 'conditionEventsJson', 'specialFlagsJson',
  ]),
});

function text(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function value(row, name) {
  const snake = name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return row?.[name] ?? row?.[snake] ?? null;
}

function normalizedCondition(value) {
  const result = text(value);
  return result === 'Normal mode row' ? null : result;
}

function isActive(row) {
  return Number(value(row, 'status') ?? 1) === 1 && Number(value(row, 'deleted') ?? 0) === 0;
}

function recordKey(row) {
  return text(value(row, 'recordKey'));
}

function sourceFactKey(row) {
  return text(value(row, 'sourceFactKey'));
}

function relationIdentity(row, relationType) {
  const base = [
    text(value(row, 'npcInternalName')),
    text(value(row, 'itemInternalName')),
  ];
  if (relationType === 'loot') {
    base.push(text(value(row, 'quantityText')), text(value(row, 'chanceText')));
  } else {
    base.push(text(value(row, 'priceText')));
  }
  base.push(normalizedCondition(value(row, 'conditions')));
  return JSON.stringify(base);
}

function relationTuple(row, relationType) {
  return JSON.stringify(RELATION_FIELDS[relationType].map((field) => (
    field === 'conditions' ? normalizedCondition(value(row, field)) : value(row, field)
  )));
}

function potentialLegacyMaintItemSource(row, retirableProviders) {
  return retirableProviders.has(text(value(row, 'sourceProvider')))
    && text(value(row, 'sourceMaintTable')) === 'maint_item_sources';
}

function exactLegacyMaintItemSource(row, legacyLineage) {
  return text(value(row, 'sourceProvider')) === text(legacyLineage.sourceProvider)
    && text(value(row, 'landingContentHash')) === text(legacyLineage.landingContentHash)
    && text(value(row, 'landingSourceKey')) === text(legacyLineage.landingSourceKey)
    && text(value(row, 'sourceMaintTable')) === text(legacyLineage.sourceMaintTable);
}

function compactLineage(row) {
  return {
    sourceProvider: text(value(row, 'sourceProvider')),
    landingContentHash: text(value(row, 'landingContentHash')),
    landingSourceId: value(row, 'landingSourceId'),
    sourceMaintTable: text(value(row, 'sourceMaintTable')),
    sourceMaintRecordKey: text(value(row, 'sourceMaintRecordKey')),
    sourceMaintId: value(row, 'sourceMaintId'),
    landingSourceKey: text(value(row, 'landingSourceKey')),
    sourcePage: text(value(row, 'sourcePage')),
  };
}

function compactRelation(row, relationType) {
  return {
    relationType,
    recordKey: recordKey(row),
    sourceFactKey: sourceFactKey(row),
    stableIdentity: relationIdentity(row, relationType),
    semanticTuple: relationTuple(row, relationType),
    ...compactLineage(row),
  };
}

function compactFact(row) {
  return {
    recordKey: recordKey(row),
    ...compactLineage(row),
  };
}

function compactDetail(row) {
  return {
    recordKey: recordKey(row),
    sourceFactKey: sourceFactKey(row),
    ...compactLineage(row),
  };
}

function sortByRecordKey(rows) {
  return [...rows].sort((left, right) => String(left.recordKey).localeCompare(String(right.recordKey)));
}

function indexRows(rows, keyBuilder) {
  const index = new Map();
  for (const row of rows) {
    const key = keyBuilder(row);
    if (!key) continue;
    const current = index.get(key) ?? [];
    current.push(row);
    index.set(key, current);
  }
  return index;
}

function localTupleMatches(local, relation, relationType) {
  if (!isActive(local)) return false;
  if (text(value(local, 'npcInternalName')) !== text(value(relation, 'npcInternalName'))
      || text(value(local, 'itemInternalName')) !== text(value(relation, 'itemInternalName'))
      || value(local, 'sourceItemMatchesItem') === false) return false;
  if (relationType === 'loot') {
    return value(local, 'quantityMin') === value(relation, 'quantityMin')
      && value(local, 'quantityMax') === value(relation, 'quantityMax')
      && text(value(local, 'quantityText')) === text(value(relation, 'quantityText'))
      && String(value(local, 'chanceValue') ?? '') === String(value(relation, 'chanceValue') ?? '')
      && text(value(local, 'chanceText')) === text(value(relation, 'chanceText'))
      && normalizedCondition(value(local, 'conditions')) === normalizedCondition(value(relation, 'conditions'))
      && text(value(local, 'notes')) === text(value(relation, 'conditionSourceText'))
      && Number(value(local, 'sortOrder') ?? 0) === Number(value(relation, 'sortOrder') ?? 0)
      && text(value(local, 'dropSourceKind')) === 'npc_drop';
  }
  return text(value(local, 'priceText')) === text(value(relation, 'priceText'))
    && text(value(local, 'notes')) === text(value(relation, 'conditionSourceText'))
    && Number(value(local, 'sortOrder') ?? 0) === Number(value(relation, 'sortOrder') ?? 0);
}

function localTupleIdentity(row, relationType) {
  const base = [text(value(row, 'npcInternalName')), text(value(row, 'itemInternalName'))];
  if (relationType === 'loot') {
    base.push(
      value(row, 'quantityMin'), value(row, 'quantityMax'), text(value(row, 'quantityText')),
      value(row, 'chanceValue'), text(value(row, 'chanceText')),
      normalizedCondition(value(row, 'conditions')), text(value(row, 'notes')),
      Number(value(row, 'sortOrder') ?? 0), text(value(row, 'dropSourceKind')),
    );
  } else {
    base.push(text(value(row, 'priceText')), text(value(row, 'notes')), Number(value(row, 'sortOrder') ?? 0));
  }
  return JSON.stringify(base);
}

function compactLocal(row, relationType, relationRecordKey) {
  return {
    localId: value(row, 'id') ?? value(row, 'localId'),
    relationType,
    acceptedRelationRecordKey: relationRecordKey,
    npcInternalName: text(value(row, 'npcInternalName')),
    itemInternalName: text(value(row, 'itemInternalName')),
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hashScope(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

function assertRows(rows, label) {
  if (!Array.isArray(rows)) throw new TypeError(`${label} must be an array`);
  return rows.filter(isActive);
}

function ownerRowsForFact(relationsByFact, factKey) {
  return relationsByFact.get(factKey) ?? [];
}

function addUniqueByRecordKey(rows, row) {
  if (!rows.some((candidate) => candidate.recordKey === row.recordKey)) rows.push(row);
}

export function buildNpcStaleLineageRepairPreview({
  acceptedLoot = [],
  acceptedShop = [],
  incumbentLoot = [],
  incumbentShop = [],
  facts = [],
  details = [],
  localLoot = [],
  localShop = [],
  projectionLoot = [],
  projectionShop = [],
  legacyLineage = DEFAULTS.legacyLineage,
  retirableProviders = DEFAULTS.retirableProviders,
  generatedAt = new Date().toISOString(),
} = {}) {
  const retirableProviderSet = new Set(retirableProviders.map(text).filter(Boolean));
  const accepted = {
    loot: assertRows(acceptedLoot, 'acceptedLoot'),
    shop: assertRows(acceptedShop, 'acceptedShop'),
  };
  const incumbent = {
    loot: assertRows(incumbentLoot, 'incumbentLoot'),
    shop: assertRows(incumbentShop, 'incumbentShop'),
  };
  const activeFacts = assertRows(facts, 'facts');
  const activeDetails = assertRows(details, 'details');
  const allIncumbentRelations = [...incumbent.loot, ...incumbent.shop];
  const factsByKey = new Map(activeFacts.map((row) => [recordKey(row), row]));
  const detailsByFact = indexRows(activeDetails, sourceFactKey);
  const relationsByFact = indexRows(allIncumbentRelations, sourceFactKey);
  const proposed = { relationLoot: [], relationShop: [], sourceFacts: [], sourceDetails: [] };
  const quarantine = {
    metadataDrift: [],
    parentHasOtherActiveRelation: [],
    sourceDetailIncomplete: [],
    independentLineage: [],
    unmatchedIncumbent: [],
    projectionRequired: [],
    unmappedLocalTuple: [],
    localDuplicateTuple: [],
  };
  const local = {
    loot: { preserve: [], noWriteTargets: [] },
    shop: { preserve: [], noWriteTargets: [] },
  };
  const seenIncumbents = new Set();

  for (const relationType of ['loot', 'shop']) {
    const acceptedByIdentity = indexRows(accepted[relationType], (row) => relationIdentity(row, relationType));
    const projectionByIdentity = indexRows(
      relationType === 'loot' ? assertRows(projectionLoot, 'projectionLoot') : assertRows(projectionShop, 'projectionShop'),
      (row) => relationIdentity(row, relationType),
    );
    const localRows = relationType === 'loot' ? assertRows(localLoot, 'localLoot') : assertRows(localShop, 'localShop');

    for (const acceptedRow of accepted[relationType]) {
      const acceptedKey = recordKey(acceptedRow);
      const identity = relationIdentity(acceptedRow, relationType);
      const localMatches = localRows.filter((row) => localTupleMatches(row, acceptedRow, relationType));
      if (localMatches.length > 0) {
        for (const row of localMatches) local[relationType].preserve.push(compactLocal(row, relationType, acceptedKey));
        const localTupleGroups = indexRows(localMatches, (row) => localTupleIdentity(row, relationType));
        for (const [localTuple, rows] of localTupleGroups.entries()) {
          if (rows.length > 1) {
            quarantine.localDuplicateTuple.push({
              relationType,
              recordKey: acceptedKey,
              localIds: rows.map((row) => value(row, 'id') ?? value(row, 'localId')).sort((left, right) => Number(left) - Number(right)),
              localTuple,
              reason: 'local_compatibility_tuple_has_multiple_active_rows',
            });
          }
        }
      } else {
        quarantine.unmappedLocalTuple.push({
          relationType,
          recordKey: acceptedKey,
          stableIdentity: identity,
          reason: 'local_compatibility_tuple_not_found',
        });
      }
      if (!projectionByIdentity.has(identity)) {
        quarantine.projectionRequired.push({
          relationType,
          recordKey: acceptedKey,
          stableIdentity: identity,
          reason: 'accepted_relation_not_materialized_in_projection',
        });
      }
    }

    for (const incumbentRow of incumbent[relationType]) {
      const incumbentKey = recordKey(incumbentRow);
      if (!incumbentKey || seenIncumbents.has(incumbentKey)) continue;
      const matches = acceptedByIdentity.get(relationIdentity(incumbentRow, relationType)) ?? [];
      if (matches.length === 0) {
        if (potentialLegacyMaintItemSource(incumbentRow, retirableProviderSet)) {
          quarantine.unmatchedIncumbent.push({
            ...compactRelation(incumbentRow, relationType),
            reason: 'no_accepted_survivor_with_same_runtime_identity',
          });
        }
        continue;
      }
      seenIncumbents.add(incumbentKey);
      if (matches.length !== 1) {
        quarantine.independentLineage.push({
          ...compactRelation(incumbentRow, relationType),
          reason: 'accepted_survivor_is_not_unique',
          acceptedRecordKeys: matches.map(recordKey).sort(),
        });
        continue;
      }
      const survivor = matches[0];
      if (!exactLegacyMaintItemSource(incumbentRow, legacyLineage)) {
        quarantine.independentLineage.push({
          ...compactRelation(incumbentRow, relationType),
          reason: 'incumbent_lineage_is_not_a_retirable_legacy_maint_source',
          expectedSurvivor: compactRelation(survivor, relationType),
        });
        continue;
      }
      if (relationTuple(incumbentRow, relationType) !== relationTuple(survivor, relationType)) {
        quarantine.metadataDrift.push({
          ...compactRelation(incumbentRow, relationType),
          reason: 'same_runtime_identity_but_relation_metadata_differs',
          expectedSurvivor: compactRelation(survivor, relationType),
        });
        continue;
      }
      const factKey = sourceFactKey(incumbentRow);
      const parent = factsByKey.get(factKey);
      const activeChildren = ownerRowsForFact(relationsByFact, factKey);
      if (!parent || activeChildren.length !== 1 || activeChildren[0] !== incumbentRow) {
        quarantine.parentHasOtherActiveRelation.push({
          ...compactRelation(incumbentRow, relationType),
          reason: parent ? 'parent_fact_has_other_active_relation' : 'parent_fact_is_missing_or_inactive',
          activeChildRecordKeys: activeChildren.map(recordKey).filter(Boolean).sort(),
          expectedSurvivor: compactRelation(survivor, relationType),
        });
        continue;
      }
      const parentDetails = detailsByFact.get(factKey) ?? [];
      if (parentDetails.length !== 1) {
        quarantine.sourceDetailIncomplete.push({
          ...compactRelation(incumbentRow, relationType),
          reason: 'parent_fact_requires_exactly_one_active_detail',
          activeDetailRecordKeys: parentDetails.map(recordKey).filter(Boolean).sort(),
          expectedSurvivor: compactRelation(survivor, relationType),
        });
        continue;
      }
      const candidate = {
        ...compactRelation(incumbentRow, relationType),
        expectedSurvivor: compactRelation(survivor, relationType),
        disposition: { status: 0, deleted: 1, action: 'soft_disable_after_separate_authorization' },
      };
      proposed[relationType === 'loot' ? 'relationLoot' : 'relationShop'].push(candidate);
      addUniqueByRecordKey(proposed.sourceFacts, {
        ...compactFact(parent),
        disposition: candidate.disposition,
      });
      addUniqueByRecordKey(proposed.sourceDetails, {
        ...compactDetail(parentDetails[0]),
        disposition: candidate.disposition,
      });
    }
  }

  for (const category of Object.values(proposed)) category.sort((left, right) => String(left.recordKey).localeCompare(String(right.recordKey)));
  for (const category of Object.values(quarantine)) category.sort((left, right) => String(left.recordKey).localeCompare(String(right.recordKey)));
  for (const category of Object.values(local)) category.preserve.sort((left, right) => Number(left.localId) - Number(right.localId));

  const acceptedRepresentative = accepted.loot[0] ?? accepted.shop[0] ?? {};
  const inventory = {
    activeLegacyFacts: sortByRecordKey(activeFacts.filter((row) => exactLegacyMaintItemSource(row, legacyLineage))),
    activeLegacyDetails: sortByRecordKey(activeDetails.filter((row) => exactLegacyMaintItemSource(row, legacyLineage))),
    activeLegacyRelationLoot: sortByRecordKey(incumbent.loot.filter((row) => exactLegacyMaintItemSource(row, legacyLineage)).map((row) => compactRelation(row, 'loot'))),
    activeLegacyRelationShop: sortByRecordKey(incumbent.shop.filter((row) => exactLegacyMaintItemSource(row, legacyLineage)).map((row) => compactRelation(row, 'shop'))),
  };
  const scope = {
    operationId: 'canonical-npc-stale-lineage-repair',
    proposed: Object.fromEntries(Object.entries(proposed).map(([key, rows]) => [key, rows.map((row) => row.recordKey)])),
    quarantine: Object.fromEntries(Object.entries(quarantine).map(([key, rows]) => [key, rows.map((row) => row.recordKey ?? `${row.relationType}:${row.stableIdentity}`)])),
    localPreserve: Object.fromEntries(Object.entries(local).map(([key, value]) => [key, value.preserve.map((row) => row.localId)])),
  };
  return {
    schemaVersion: 1,
    reportKind: 'npc_stale_lineage_repair_preview',
    generatedAt,
    operationId: scope.operationId,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    scopeSha256: hashScope(scope),
    acceptedLineage: {
      provider: text(value(acceptedRepresentative, 'sourceProvider')),
      landingContentHash: text(value(acceptedRepresentative, 'landingContentHash')),
      landingSourceKey: text(value(acceptedRepresentative, 'landingSourceKey')),
      sourceMaintTable: text(value(acceptedRepresentative, 'sourceMaintTable')),
    },
    retirableProviders: [...retirableProviderSet].sort(),
    retirableLineage: { ...legacyLineage },
    summary: {
      proposedRelationLoot: proposed.relationLoot.length,
      proposedRelationShop: proposed.relationShop.length,
      proposedSourceFacts: proposed.sourceFacts.length,
      proposedSourceDetails: proposed.sourceDetails.length,
      quarantined: Object.fromEntries(Object.entries(quarantine).map(([key, rows]) => [key, rows.length])),
      localPreserveLoot: local.loot.preserve.length,
      localPreserveShop: local.shop.preserve.length,
    },
    inventory,
    proposed,
    quarantine,
    local,
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) throw new Error(`unsupported argument: ${token}`);
    const [key, ...parts] = token.slice(2).split('=');
    if (key === 'apply') throw new Error('stale-lineage preview is read-only and rejects --apply');
    if (!['write-report', 'output', 'local-database', 'relation-database'].includes(key)) {
      throw new Error(`unsupported argument: --${key}`);
    }
    raw[key] = parts.length > 0 ? parts.join('=') : 'true';
  }
  return {
    writeReport: raw['write-report'] == null ? DEFAULTS.writeReport : raw['write-report'] === 'true',
    output: raw.output ?? DEFAULTS.output,
    localDatabase: raw['local-database'] ?? DEFAULTS.localDatabase,
    relationDatabase: raw['relation-database'] ?? DEFAULTS.relationDatabase,
  };
}

function table(database, name) {
  return `\`${String(database).replaceAll('`', '``')}\`.\`${String(name).replaceAll('`', '``')}\``;
}

export function relationSelect(database, name) {
  const isShop = name === 'item_npc_shop_relations';
  const relationColumns = isShop
    ? 'price_text AS priceText'
    : `quantity_min AS quantityMin, quantity_max AS quantityMax,
    quantity_text AS quantityText, chance_value AS chanceValue, chance_text AS chanceText`;
  return `SELECT
    record_key AS recordKey, source_fact_key AS sourceFactKey, item_internal_name AS itemInternalName,
    npc_internal_name AS npcInternalName, ${relationColumns}, conditions,
    condition_source_text AS conditionSourceText, condition_parse_status AS conditionParseStatus,
    condition_biome_code AS conditionBiomeCode, condition_game_period_code AS conditionGamePeriodCode,
    condition_time_code AS conditionTimeCode, condition_weather_code AS conditionWeatherCode,
    condition_events_json AS conditionEventsJson, special_flags_json AS specialFlagsJson,
    source_maint_table AS sourceMaintTable, source_maint_record_key AS sourceMaintRecordKey,
    source_maint_id AS sourceMaintId, landing_source_key AS landingSourceKey,
    landing_source_id AS landingSourceId, landing_content_hash AS landingContentHash,
    source_provider AS sourceProvider,
    source_page AS sourcePage, status, deleted
  FROM ${table(database, name)} WHERE status = 1 AND deleted = 0`;
}

function parseProjectionRows(rows, field) {
  const result = [];
  for (const row of rows) {
    let entries = [];
    try { entries = JSON.parse(row[field] ?? '[]'); } catch { entries = []; }
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) result.push({ ...entry, npcInternalName: row.npcInternalName });
  }
  return result;
}

async function loadPreviewInputs(connection, options) {
  const relationDatabase = options.relationDatabase;
  const localDatabase = options.localDatabase;
  const [lootRows, shopRows, facts, details, localLoot, localShop, projections] = await Promise.all([
    connection.query(relationSelect(relationDatabase, 'item_npc_loot_relations')),
    connection.query(relationSelect(relationDatabase, 'item_npc_shop_relations')),
    connection.query(`SELECT record_key AS recordKey, source_provider AS sourceProvider,
      landing_content_hash AS landingContentHash, source_maint_table AS sourceMaintTable,
      source_maint_record_key AS sourceMaintRecordKey, source_maint_id AS sourceMaintId,
      landing_source_key AS landingSourceKey, landing_source_id AS landingSourceId,
      source_page AS sourcePage, status, deleted
      FROM ${table(relationDatabase, 'item_source_facts')} WHERE status = 1 AND deleted = 0`),
    connection.query(`SELECT record_key AS recordKey, source_fact_key AS sourceFactKey,
      source_provider AS sourceProvider, landing_content_hash AS landingContentHash,
      source_maint_table AS sourceMaintTable, source_maint_record_key AS sourceMaintRecordKey,
      source_maint_id AS sourceMaintId, landing_source_key AS landingSourceKey,
      landing_source_id AS landingSourceId,
      source_page AS sourcePage,
      status, deleted FROM ${table(relationDatabase, 'item_source_details')} WHERE status = 1 AND deleted = 0`),
    connection.query(`SELECT l.id, n.internal_name AS npcInternalName, i.internal_name AS itemInternalName,
      l.quantity_min AS quantityMin, l.quantity_max AS quantityMax, l.quantity_text AS quantityText,
      l.chance_value AS chanceValue, l.chance_text AS chanceText, l.conditions, l.notes,
      l.sort_order AS sortOrder, l.drop_source_kind AS dropSourceKind,
      l.source_item_id = l.item_id AS sourceItemMatchesItem, l.status, l.deleted
      FROM ${table(localDatabase, 'npc_loot_entries')} l
      JOIN ${table(localDatabase, 'npcs')} n ON n.id = l.npc_id AND n.status = 1 AND n.deleted = 0
      LEFT JOIN ${table(localDatabase, 'items')} i ON i.id = l.item_id AND i.status = 1 AND i.deleted = 0
      WHERE l.status = 1 AND l.deleted = 0`),
    connection.query(`SELECT s.id, n.internal_name AS npcInternalName, i.internal_name AS itemInternalName,
      s.price_text AS priceText, s.notes, s.sort_order AS sortOrder,
      s.source_item_id = s.item_id AS sourceItemMatchesItem, s.status, s.deleted
      FROM ${table(localDatabase, 'npc_shop_entries')} s
      JOIN ${table(localDatabase, 'npcs')} n ON n.id = s.npc_id AND n.status = 1 AND n.deleted = 0
      LEFT JOIN ${table(localDatabase, 'items')} i ON i.id = s.item_id AND i.status = 1 AND i.deleted = 0
      WHERE s.status = 1 AND s.deleted = 0`),
    connection.query(`SELECT internal_name AS npcInternalName, loot_items_json AS lootItemsJson,
      shop_items_json AS shopItemsJson FROM ${table(relationDatabase, 'projection_npcs')}
      WHERE status = 1 AND deleted = 0`),
  ]);
  const take = ([rows]) => rows;
  const loot = take(lootRows);
  const shop = take(shopRows);
  const accepted = (rows) => rows.filter((row) => (
    text(row.sourceProvider) === DEFAULTS.acceptedProvider
      && text(row.landingContentHash) === DEFAULTS.acceptedLandingContentHash
  ));
  return {
    acceptedLoot: accepted(loot),
    acceptedShop: accepted(shop),
    incumbentLoot: loot,
    incumbentShop: shop,
    facts: take(facts),
    details: take(details),
    localLoot: take(localLoot),
    localShop: take(localShop),
    projectionLoot: parseProjectionRows(take(projections), 'lootItemsJson'),
    projectionShop: parseProjectionRows(take(projections), 'shopItemsJson'),
  };
}

export async function runNpcStaleLineageRepairPreview(options = {}, dependencies = {}) {
  const normalized = { ...DEFAULTS, ...options };
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const createConnection = dependencies.createConnection ?? mysql.createConnection;
  const connection = await createConnection(buildLocalDbConnectionOptions({ config }));
  try {
    const inputs = await (dependencies.loadPreviewInputs ?? loadPreviewInputs)(connection, normalized);
    return buildNpcStaleLineageRepairPreview(inputs);
  } finally {
    await connection.end();
  }
}

async function writeReport(outputPath, report) {
  const absolute = path.resolve(repoRoot, outputPath);
  if (!absolute.startsWith(`${repoRoot}${path.sep}`)) throw new Error('preview output must stay inside the repository');
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return path.relative(repoRoot, absolute).replaceAll('\\', '/');
}

async function main() {
  const options = parseArgs();
  const report = await runNpcStaleLineageRepairPreview(options);
  const reportPath = options.writeReport ? await writeReport(options.output, report) : null;
  process.stdout.write(`${JSON.stringify({
    reportKind: report.reportKind,
    scopeSha256: report.scopeSha256,
    summary: report.summary,
    reportPath,
  }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
