import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { extractMaintEntitiesFromLandingRow } from '../maint/sync-landing-to-maint.mjs';
import { buildArmorAttributeRelations, buildArmorAttributeEffectRows } from './sync-maint-to-relation.mjs';
import { buildArmorEffectKeyRetirementPlan } from './armor-semantic-repair.mjs';
import { applyArmorSourceIdentityCorrections } from './armor-source-identity.mjs';

export const ARMOR_SEMANTIC_REPAIR_OPERATION_ID = 'canonical-armor-semantic-repair';

function snake(key) { return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`); }
function mapRow(row) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [snake(key), value])); }
function hashBytes(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function hashValue(value) { return hashBytes(Buffer.from(JSON.stringify(value))); }
function privateWrite(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600); try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }

export async function buildArmorSemanticRepairProposal({ repoRoot = process.cwd(), sourceEvidencePath, outputPath, runId, mysqlModule, generatedAt = new Date().toISOString() } = {}) {
  if (!sourceEvidencePath || !outputPath || !runId) throw new Error('Armor semantic repair source, output and run identity are required');
  const root = path.resolve(repoRoot);
  const evidenceFile = path.resolve(root, sourceEvidencePath);
  const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
  const sourceFile = path.resolve(root, evidence.sourceArtifact.path);
  const sourceBytes = fs.readFileSync(sourceFile);
  if (hashValue(JSON.parse(sourceBytes)) !== evidence.sourceArtifact.contentHash) throw new Error('Armor semantic repair source bytes drifted');
  const sourcePayloadRaw = JSON.parse(sourceBytes);
  if (evidence.schemaVersion !== 'canonical-armor-semantic-repair-source/v2') throw new Error('Armor semantic repair source evidence schema is unsupported');
  const sourcePayload = {
    ...sourcePayloadRaw,
    records: applyArmorSourceIdentityCorrections({
      records: sourcePayloadRaw.records,
      corrections: evidence.identityCorrections ?? [],
    }),
  };
  const sourcePayloadBytes = Buffer.from(`${JSON.stringify(sourcePayload, null, 2)}\n`);
  const config = loadLocalStackConfig(root);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection({ host: config.database.host, port: Number(config.database.port), user: config.database.username, password: config.database.password, database: 'terria_v1_local', timezone: '+08:00' });
  try {
    const [landings] = await connection.query('SELECT * FROM `source_dataset_landings` WHERE dataset_type = ? AND provider = ? AND source_key = ? AND source_page = ? AND is_current = 1 FOR SHARE', ['armor_attributes_raw', 'terraria.wiki.gg', 'wiki.page.armor_attributes', '盔甲属性表']);
    if (landings.length !== 1) throw new Error('Armor semantic repair requires exactly one current attribute landing');
    const [maint] = await connection.query('SELECT * FROM `terria_v1_maint`.`maint_armor_attribute_rows` WHERE deleted = 0 ORDER BY id FOR SHARE');
    const [items] = await connection.query('SELECT * FROM `terria_v1_maint`.`maint_items` WHERE deleted = 0 ORDER BY id FOR SHARE');
    const [parts] = await connection.query('SELECT * FROM `terria_v1_relation`.`relation_armor_set_items` WHERE deleted = 0 ORDER BY id FOR SHARE');
    const [relation] = await connection.query('SELECT * FROM `terria_v1_relation`.`relation_armor_attribute_rows` WHERE deleted = 0 ORDER BY id FOR SHARE');
    const [effects] = await connection.query('SELECT * FROM `terria_v1_relation`.`relation_equipment_effect_attributes` WHERE deleted = 0 ORDER BY id FOR SHARE');
    const payloadHash = hashValue(sourcePayload);
    const landing = { ...evidence.incomingLanding, payload_json: sourcePayloadBytes.toString('utf8'), content_hash: payloadHash.slice(7), full_file_content_hash: hashBytes(sourcePayloadBytes).slice(7), full_file_byte_size: sourcePayloadBytes.length, fetched_at: sourcePayload.fetchedAt, parsed_at: sourcePayload.generatedAt, id: null };
    const extracted = await extractMaintEntitiesFromLandingRow(landing);
    const maintRows = extracted.rows.map(mapRow).map((row) => ({ ...row, landing_source_id: null, status: 1, deleted: 0 }));
    const relationRows = buildArmorAttributeRelations({ maintArmorAttributeRows: maintRows, maintItems: items, relationArmorSetItems: parts }).map(mapRow).map((row) => ({ ...row, source_maint_id: null, landing_source_id: null, status: 1, deleted: 0 }));
    const currentRelationByKey = new Map(relation.map((row) => [row.record_key, row]));
    const relationRowsBound = relationRows.map((row) => ({ ...currentRelationByKey.get(row.record_key), ...row }));
    const proposedMaintKeys = new Set(maintRows.map((row) => row.record_key));
    const proposedRelationKeys = new Set(relationRowsBound.map((row) => row.record_key));
    const proposedEffects = buildArmorAttributeEffectRows(relationRowsBound.map((row) => ({
      recordKey: row.record_key, itemId: row.item_id, itemInternalName: row.item_internal_name, itemNameZh: row.item_name_zh,
      itemPageTitle: row.item_page_title, slotGroup: row.slot_group, rawCellsJson: row.raw_cells_json,
      sourceMaintTable: row.source_maint_table, sourceMaintRecordKey: row.source_maint_record_key, sourceMaintId: null,
      landingSourceId: null, landingSourceKey: row.landing_source_key, landingContentHash: row.landing_content_hash,
      sourceProvider: row.source_provider, sourcePage: row.source_page, sourceRevisionTimestamp: row.source_revision_timestamp,
    }))).map(mapRow).map((row) => ({ ...row, status: 1, deleted: 0 }));
    const currentEffectByKey = new Map(effects.map((row) => [row.record_key, row]));
    const proposedEffectsBound = proposedEffects.map((row) => ({ ...row }));
    const selectedMemberIds = [...new Set(relationRowsBound.map((row) => Number(row.item_id)).filter((id) => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
    const effectPlan = buildArmorEffectKeyRetirementPlan({ selectedMemberIds, currentRows: effects, proposedRows: proposedEffectsBound });
    const proposal = {
      schemaVersion: 'canonical-armor-semantic-repair-proposal/v1', operationId: ARMOR_SEMANTIC_REPAIR_OPERATION_ID,
      runId, generatedAt, proposalOnly: false, databaseWrites: true, localItemWrites: false, ddl: false, schedulerActivation: false,
      sourceEvidencePath, sourceEvidenceHash: hashBytes(fs.readFileSync(evidenceFile)),
      selectedMemberIds, landingRows: [landing], maintRows, relationRows: relationRowsBound,
      currentEffects: effects, proposedEffects: proposedEffectsBound, effectPlan,
      landingDisposition: landings[0].content_hash === landing.content_hash
        && new Date(landings[0].source_revision_timestamp).toISOString().slice(0, 19) === String(landing.source_revision_timestamp).slice(0, 19)
        ? 'reuse-current' : 'insert-new-current',
      maintRetireRecordKeys: maint.filter((row) => !proposedMaintKeys.has(row.record_key)).map((row) => row.record_key).sort(),
      relationRetireRecordKeys: relation.filter((row) => !proposedRelationKeys.has(row.record_key)).map((row) => row.record_key).sort(),
      source: { currentLandingId: landings[0].id, sourceRevisionTimestamp: landing.source_revision_timestamp, sourceContentHash: landing.content_hash },
      counts: { incomingRecords: sourcePayload.records?.length ?? 0, maintRows: maintRows.length, relationRows: relationRowsBound.length, effectRetirements: effectPlan.retire.length, effectInserts: effectPlan.insert.length },
      writeTargets: ['local.source_dataset_landings.armor_attributes_raw', 'maint.source_dataset_landings.armor_attributes_raw', 'maint.maint_armor_attribute_rows', 'relation.relation_armor_attribute_rows', 'relation.relation_equipment_effect_attributes.status_deleted', 'relation.relation_equipment_effect_attributes.insert'],
    };
    privateWrite(path.resolve(root, outputPath), proposal);
    return proposal;
  } finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=')]; }));
  buildArmorSemanticRepairProposal({ repoRoot: process.cwd(), sourceEvidencePath: args.source, outputPath: args.output, runId: args['run-id'] }).then((proposal) => process.stdout.write(`${JSON.stringify({ output: args.output, counts: proposal.counts, effectPlanSha256: proposal.effectPlan.planSha256 })}\n`)).catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
