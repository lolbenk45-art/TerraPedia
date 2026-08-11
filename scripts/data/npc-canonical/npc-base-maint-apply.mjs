#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import {
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from '../automation/authorized-operation-context.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { extractMaintEntitiesFromLandingRow } from '../maint/sync-landing-to-maint.mjs';

const INPUT_PATH = 'reports/authorization/canonical/canonical-npc-apply.input.json';
const LANDING_RESULT_PATH = 'reports/authorization/canonical/canonical-npc-landing-apply.result.json';
const STANDARDIZED_PATH = 'data/standardized/npcs.standardized.json';
const COMPLETION_PATH = 'reports/authorization/canonical/canonical-npc-base-maint.completion.json';
const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const FORMAL_DATABASES = Object.freeze({
  local: 'terria_v1_local',
  maint: 'terria_v1_maint',
  relation: 'terria_v1_relation',
});
const LANDING_OWNERSHIP_KEYS = Object.freeze([
  'local.source_dataset_landings.npcs_base',
  'local.source_dataset_landings.npc_crawler_facts',
]);

export const NPC_BASE_MAINT_OPERATIONS = Object.freeze([
  Object.freeze({
    operationId: 'canonical-npc-base-maint-nontown-apply',
    capability: 'npcs',
    npcKind: 'non_town',
    ownershipKey: 'maint.maint_npcs.npcs',
  }),
  Object.freeze({
    operationId: 'canonical-npc-base-maint-town-apply',
    capability: 'town_npc_maintenance',
    npcKind: 'town',
    ownershipKey: 'maint.maint_npcs.town',
  }),
]);

export async function buildNpcBaseMaintOperationPlan({
  repoRoot = process.cwd(),
  operationId,
  input = null,
  landingResult = null,
  standardized = null,
} = {}) {
  const definition = requireDefinition(operationId);
  const inputEnvelope = normalizeEnvelope(
    input ?? readEnvelope(repoRoot, INPUT_PATH, 'canonical NPC apply input'),
    INPUT_PATH,
    'canonical NPC apply input',
  );
  const inputPayload = parseEnvelopePayload(inputEnvelope, 'canonical NPC apply input');
  if (inputPayload?.schemaVersion !== 1 || inputPayload?.operationId !== 'canonical-npc-apply'
      || inputPayload?.pairCount !== 25 || !Array.isArray(inputPayload.evidencePairs)
      || inputPayload.evidencePairs.length !== 25
      || JSON.stringify(inputPayload.databases) !== JSON.stringify(FORMAL_DATABASES)) {
    throw new Error('canonical NPC apply input must bind 25 pairs and the exact formal databases');
  }
  const inputSummary = summarizeEnvelope(inputEnvelope);

  const landingEnvelope = normalizeEnvelope(
    landingResult ?? readEnvelope(repoRoot, LANDING_RESULT_PATH, 'canonical NPC landing result'),
    LANDING_RESULT_PATH,
    'canonical NPC landing result',
  );
  const landingPayload = parseEnvelopePayload(landingEnvelope, 'canonical NPC landing result');
  validateLandingResult(landingPayload, inputSummary.contentHash);
  const landingSummary = summarizeEnvelope(landingEnvelope);

  const standardizedEnvelope = normalizeEnvelope(
    standardized ?? readEnvelope(repoRoot, STANDARDIZED_PATH, 'standardized NPC source'),
    STANDARDIZED_PATH,
    'standardized NPC source',
  );
  const standardizedPayload = parseEnvelopePayload(standardizedEnvelope, 'standardized NPC source');
  const rows = await extractStandardizedMaintRows(standardizedPayload);
  const selectedRows = rows.filter((row) => npcKindOf(row) === definition.npcKind);
  if (rows.length === 0 || selectedRows.length === 0
      || rows.some((row) => npcKindOf(row) == null)) {
    throw new Error('standardized NPC source must contain explicit non-empty town and non-town partitions');
  }
  const expectedSourceIds = selectedRows.map((row) => row.sourceId).sort((left, right) => left - right);
  if (new Set(rows.map((row) => row.sourceId)).size !== rows.length) {
    throw new Error('standardized NPC source IDs must be unique');
  }

  return {
    schemaVersion: 1,
    operationId: definition.operationId,
    capability: definition.capability,
    npcKind: definition.npcKind,
    ownershipKeys: [definition.ownershipKey],
    input: { ...inputSummary, payload: inputPayload },
    landingResult: { ...landingSummary, payload: landingPayload },
    standardized: {
      ...summarizeEnvelope(standardizedEnvelope),
      payload: standardizedPayload,
      landingContentHash: hashJsonBare(standardizedPayload),
    },
    expectedSourceIds,
    expectedCount: expectedSourceIds.length,
  };
}

export async function executeNpcBaseMaintOperation({
  plan,
  adapter,
  completedAt = new Date().toISOString(),
} = {}) {
  const definition = requireDefinition(plan?.operationId);
  if (plan?.capability !== definition.capability || plan?.npcKind !== definition.npcKind
      || JSON.stringify(plan?.ownershipKeys) !== JSON.stringify([definition.ownershipKey])) {
    throw new Error('NPC base maint operation ownership drifted');
  }
  for (const method of ['begin', 'apply', 'verify', 'commit', 'rollback']) {
    if (typeof adapter?.[method] !== 'function') {
      throw new TypeError(`NPC base maint adapter ${method} is required`);
    }
  }
  let began = false;
  try {
    await adapter.begin();
    began = true;
    const rowCounts = await adapter.apply({ plan });
    validateRowCounts(rowCounts, plan);
    const verification = await adapter.verify({ plan, rowCounts });
    validateRowCounts(verification?.rowCounts, plan);
    if (stableJson(verification.rowCounts) !== stableJson(rowCounts)) {
      throw new Error('NPC base maint readback counts do not match writes');
    }
    validateLandingLineage(verification?.landingLineage, plan.standardized.landingContentHash);
    if (!HASH_PATTERN.test(verification?.outputHash ?? '')) {
      throw new Error('NPC base maint output hash must be SHA-256');
    }
    await adapter.commit();
    return {
      schemaVersion: 1,
      resultKind: 'canonical_npc_base_maint_operation_result',
      operationId: plan.operationId,
      capability: plan.capability,
      npcKind: plan.npcKind,
      status: 'COMPLETED',
      input: withoutPayload(plan.input),
      landingResult: withoutPayload(plan.landingResult),
      standardized: {
        ...withoutPayload(plan.standardized),
        landingContentHash: plan.standardized.landingContentHash,
      },
      ownershipKeys: [...plan.ownershipKeys],
      transactionCommitted: true,
      rowCounts: { ...rowCounts },
      landingLineage: { ...verification.landingLineage },
      outputHash: verification.outputHash,
      completedAt: requireTimestamp(completedAt, 'completedAt'),
    };
  } catch (error) {
    if (began) await adapter.rollback().catch(() => {});
    throw error;
  }
}

export function buildCanonicalNpcBaseMaintCompletion({
  input,
  landingResult,
  standardized,
  results,
  completedAt = new Date().toISOString(),
} = {}) {
  const inputEnvelope = normalizeEnvelope(input, INPUT_PATH, 'canonical NPC apply input');
  const inputPayload = parseEnvelopePayload(inputEnvelope, 'canonical NPC apply input');
  if (inputPayload?.schemaVersion !== 1 || inputPayload?.operationId !== 'canonical-npc-apply') {
    throw new Error('canonical NPC apply input identity is invalid');
  }
  const inputSummary = summarizeEnvelope(inputEnvelope);
  const landingEnvelope = normalizeEnvelope(
    landingResult,
    LANDING_RESULT_PATH,
    'canonical NPC landing result',
  );
  const landingPayload = parseEnvelopePayload(landingEnvelope, 'canonical NPC landing result');
  validateLandingResult(landingPayload, inputSummary.contentHash);
  const landingSummary = summarizeEnvelope(landingEnvelope);
  const standardizedEnvelope = normalizeEnvelope(
    standardized,
    STANDARDIZED_PATH,
    'standardized NPC source',
  );
  const standardizedPayload = parseEnvelopePayload(standardizedEnvelope, 'standardized NPC source');
  const standardizedSummary = summarizeEnvelope(standardizedEnvelope);
  const landingContentHash = hashJsonBare(standardizedPayload);

  if (!Array.isArray(results)) throw new TypeError('NPC base maint results must be an array');
  const expectedIds = NPC_BASE_MAINT_OPERATIONS.map((entry) => entry.operationId);
  const records = results.map((candidate) => {
    const suppliedPayload = candidate?.payload ?? (candidate?.bytes ? null : candidate);
    const defaultPath = suppliedPayload?.operationId
      ? `reports/authorization/canonical/${suppliedPayload.operationId}.result.json`
      : candidate?.path;
    const envelope = normalizeEnvelope(candidate?.bytes ? candidate : {
      path: defaultPath,
      bytes: Buffer.from(`${JSON.stringify(suppliedPayload)}\n`),
      payload: suppliedPayload,
    }, defaultPath, 'NPC base maint result');
    const payload = parseEnvelopePayload(envelope, 'NPC base maint result');
    const definition = requireDefinition(payload?.operationId);
    return { definition, payload, envelope };
  });
  const actualIds = records.map((record) => record.payload.operationId);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    const missing = expectedIds.find((operationId) => !actualIds.includes(operationId));
    throw new Error(`NPC base maint result is missing or out of order: ${missing ?? expectedIds.join(', ')}`);
  }
  for (const record of records) {
    validateBaseMaintResult(record.payload, record.definition, {
      inputHash: inputSummary.contentHash,
      landingResultHash: landingSummary.contentHash,
      standardizedHash: standardizedSummary.contentHash,
      landingContentHash,
    });
  }
  if (stableJson(records[0].payload.landingLineage) !== stableJson(records[1].payload.landingLineage)) {
    throw new Error('NPC base maint result landing lineage drifted between partitions');
  }
  const operationResults = records.map((record) => ({
    operationId: record.payload.operationId,
    ...summarizeEnvelope(record.envelope),
  }));
  const partitionCounts = Object.fromEntries(records.map((record) => [
    record.definition.npcKind,
    record.payload.rowCounts[record.definition.ownershipKey],
  ]));
  const completionBase = {
    schemaVersion: 1,
    resultKind: 'canonical_npc_base_maint_completion',
    operationId: 'canonical-npc-base-maint-completion',
    status: 'COMPLETED',
    inputHash: inputSummary.contentHash,
    landingResultHash: landingSummary.contentHash,
    standardizedHash: standardizedSummary.contentHash,
    landingLineage: { ...records[0].payload.landingLineage },
    partitionCounts,
    totalCount: Object.values(partitionCounts).reduce((total, count) => total + count, 0),
    operationResults,
    completedAt: requireTimestamp(completedAt, 'completedAt'),
  };
  return { ...completionBase, completionHash: hashStableJson(completionBase) };
}

export function createCanonicalNpcBaseMaintMysqlAdapter({
  repoRoot = process.cwd(),
  plan,
  env = process.env,
  connectionFactory = null,
} = {}) {
  requireDefinition(plan?.operationId);
  if (JSON.stringify(plan?.input?.payload?.databases) !== JSON.stringify(FORMAL_DATABASES)) {
    throw new Error('formal NPC base maint apply requires the exact database triplet');
  }
  const root = path.resolve(repoRoot);
  let connection = null;
  let applied = null;
  const openConnection = connectionFactory ?? (async () => {
    const config = loadLocalStackConfig(root);
    return loadMysqlModule({ repoRoot: root }).createConnection({
      host: env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
      port: Number(env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
      user: env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
      password: env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
      database: FORMAL_DATABASES.local,
    });
  });
  const close = async () => {
    if (connection && typeof connection.end === 'function') await connection.end();
    connection = null;
  };
  return {
    begin: async () => {
      if (connection) throw new Error('NPC base maint transaction is already open');
      connection = await openConnection();
      await connection.beginTransaction();
    },
    apply: async () => {
      if (!connection) throw new Error('NPC base maint transaction is not open');
      const [landingRows] = await connection.query(
        `SELECT * FROM \`${FORMAL_DATABASES.local}\`.\`source_dataset_landings\`
         WHERE dataset_type = 'npcs_base_raw' AND is_current = 1
         ORDER BY id`,
      );
      if (!Array.isArray(landingRows) || landingRows.length !== 1) {
        throw new Error('formal NPC base maint apply requires exactly one current base landing');
      }
      const landing = landingRows[0];
      const landingPayload = parseJson(landing.payload_json, 'current NPC base landing payload');
      if (landing.source_key !== 'standardized.npcs'
          || landing.content_hash !== plan.standardized.landingContentHash
          || stableJson(landingPayload) !== stableJson(plan.standardized.payload)) {
        throw new Error('current NPC base landing does not match the frozen standardized source');
      }
      const extracted = await extractMaintEntitiesFromLandingRow(landing);
      const rows = extracted.rows.filter((row) => npcKindOf(row) === plan.npcKind);
      const sourceIds = rows.map((row) => row.sourceId).sort((left, right) => left - right);
      if (JSON.stringify(sourceIds) !== JSON.stringify(plan.expectedSourceIds)) {
        throw new Error('formal NPC base maint partition differs from the frozen plan');
      }
      const predicate = partitionSql(plan.npcKind);
      await connection.execute(
        `UPDATE \`${FORMAL_DATABASES.maint}\`.\`maint_npcs\`
         SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP
         WHERE status = 1 AND deleted = 0 AND ${predicate}
           AND source_id NOT IN (${sourceIds.map(() => '?').join(', ')})`,
        sourceIds,
      );
      for (const row of rows) await upsertMaintNpcRow(connection, row);
      applied = {
        landingLineage: {
          id: Number(landing.id),
          sourceKey: landing.source_key,
          contentHash: landing.content_hash,
        },
      };
      return { [plan.ownershipKeys[0]]: rows.length };
    },
    verify: async () => {
      if (!connection || !applied) throw new Error('NPC base maint partition has not been applied');
      const [rows] = await connection.query(
        `SELECT source_id AS sourceId, internal_name AS internalName,
                landing_source_id AS landingSourceId, landing_source_key AS landingSourceKey,
                landing_content_hash AS landingContentHash, flags_json AS flagsJson
         FROM \`${FORMAL_DATABASES.maint}\`.\`maint_npcs\`
         WHERE status = 1 AND deleted = 0 AND ${partitionSql(plan.npcKind)}
         ORDER BY source_id`,
      );
      const sourceIds = rows.map((row) => Number(row.sourceId));
      if (JSON.stringify(sourceIds) !== JSON.stringify(plan.expectedSourceIds)
          || rows.some((row) => Number(row.landingSourceId) !== applied.landingLineage.id
            || row.landingSourceKey !== applied.landingLineage.sourceKey
            || row.landingContentHash !== applied.landingLineage.contentHash
            || npcKindOf({ flagsJson: row.flagsJson }) !== plan.npcKind)) {
        throw new Error('NPC base maint transaction-local readback drifted');
      }
      const rowCounts = { [plan.ownershipKeys[0]]: rows.length };
      return {
        rowCounts,
        landingLineage: { ...applied.landingLineage },
        outputHash: hashStableJson({
          operationId: plan.operationId,
          inputHash: plan.input.contentHash,
          landingResultHash: plan.landingResult.contentHash,
          standardizedHash: plan.standardized.contentHash,
          landingLineage: applied.landingLineage,
          rows,
        }),
      };
    },
    commit: async () => {
      if (!connection) throw new Error('NPC base maint transaction is not open');
      await connection.commit();
      await close();
    },
    rollback: async () => {
      if (!connection) return;
      try {
        await connection.rollback();
      } finally {
        await close();
      }
    },
  };
}

export async function writeCanonicalNpcBaseMaintResult({
  repoRoot = process.cwd(),
  outputPath,
  result,
} = {}) {
  const validOperation = result?.resultKind === 'canonical_npc_base_maint_operation_result'
    && HASH_PATTERN.test(result?.outputHash ?? '');
  const validCompletion = result?.resultKind === 'canonical_npc_base_maint_completion'
    && HASH_PATTERN.test(result?.completionHash ?? '');
  if (result?.status !== 'COMPLETED' || (!validOperation && !validCompletion)) {
    throw new Error('a completed NPC base maint result is required');
  }
  const root = path.resolve(repoRoot);
  const relative = requireRelativePath(outputPath, 'outputPath');
  const output = path.resolve(root, relative);
  if (!output.startsWith(`${root}${path.sep}`)) throw new Error('outputPath must stay inside repoRoot');
  await fs.promises.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const temporary = `${output}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.promises.writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await fs.promises.rename(temporary, output);
    await fs.promises.chmod(output, 0o600);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

export async function readCanonicalNpcBaseMaintCompletion({ repoRoot = process.cwd() } = {}) {
  const root = path.resolve(repoRoot);
  const input = readPrivateEnvelope(root, INPUT_PATH, 'canonical NPC apply input');
  const landingResult = readPrivateEnvelope(root, LANDING_RESULT_PATH, 'canonical NPC landing result');
  const standardized = readEnvelope(root, STANDARDIZED_PATH, 'standardized NPC source');
  const results = NPC_BASE_MAINT_OPERATIONS.map((definition) => readPrivateEnvelope(
    root,
    `reports/authorization/canonical/${definition.operationId}.result.json`,
    `${definition.operationId} result`,
  ));
  const completionEnvelope = readPrivateEnvelope(root, COMPLETION_PATH, 'canonical NPC base maint completion');
  const saved = parseEnvelopePayload(completionEnvelope, 'canonical NPC base maint completion');
  const reconstructed = buildCanonicalNpcBaseMaintCompletion({
    input,
    landingResult,
    standardized,
    results,
    completedAt: saved?.completedAt,
  });
  if (stableJson(reconstructed) !== stableJson(saved)) {
    throw new Error('canonical NPC base maint completion drifted from reconstructed result bytes');
  }
  return {
    completion: saved,
    completionHash: hashBytes(completionEnvelope.bytes),
    inputHash: hashBytes(input.bytes),
    landingResultHash: hashBytes(landingResult.bytes),
    standardizedHash: hashBytes(standardized.bytes),
  };
}

async function upsertMaintNpcRow(connection, row) {
  const mapped = {
    source_id: row.sourceId,
    internal_name: row.internalName,
    english_name: row.englishName,
    name_zh: row.nameZh,
    sub_name_zh: row.subNameZh,
    source_provider: row.sourceProvider,
    source_page: row.sourcePage,
    source_revision_timestamp: mysqlDateTime(row.sourceRevisionTimestamp),
    landing_source_id: row.landingSourceId,
    landing_source_key: row.landingSourceKey,
    landing_source_page: row.landingSourcePage,
    landing_content_hash: row.landingContentHash,
    landing_fetched_at: mysqlDateTime(row.landingFetchedAt),
    landing_parsed_at: mysqlDateTime(row.landingParsedAt),
    module_generated_at: row.moduleGeneratedAt,
    terraria_version: row.terrariaVersion,
    major_value: row.majorValue,
    combat_value: row.combatValue,
    defense_value: row.defenseValue,
    use_time: row.useTime,
    stack_size: row.stackSize,
    width: row.width,
    height: row.height,
    flags_json: row.flagsJson,
    raw_json: row.rawJson,
    status: 1,
    deleted: 0,
  };
  const columns = Object.keys(mapped);
  const updates = columns.filter((column) => column !== 'source_id')
    .map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
  await connection.execute(
    `INSERT INTO \`${FORMAL_DATABASES.maint}\`.\`maint_npcs\`
       (${columns.map((column) => `\`${column}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${updates}`,
    columns.map((column) => mapped[column]),
  );
}

function partitionSql(npcKind) {
  const value = npcKind === 'town' ? 'true' : npcKind === 'non_town' ? 'false' : null;
  if (value == null) throw new Error(`unsupported NPC base maint partition: ${npcKind ?? ''}`);
  return `LOWER(JSON_UNQUOTE(JSON_EXTRACT(\`flags_json\`, '$.townNpc'))) = '${value}'`;
}

function mysqlDateTime(value) {
  if (value == null || value === '') return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function parseJson(value, label) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((argument) => {
    const [key, ...values] = String(argument).replace(/^--/, '').split('=');
    return [key, values.length === 0 ? 'true' : values.join('=')];
  }));
}

async function maybeWriteCompletion({ repoRoot, currentOperationId, currentOutputPath, completionOutputPath }) {
  const resultPaths = Object.fromEntries(NPC_BASE_MAINT_OPERATIONS.map((definition) => [
    definition.operationId,
    definition.operationId === currentOperationId
      ? currentOutputPath
      : `reports/authorization/canonical/${definition.operationId}.result.json`,
  ]));
  if (Object.values(resultPaths).some((relativePath) => (
    !fs.existsSync(path.join(repoRoot, relativePath))
  ))) return false;
  const completion = buildCanonicalNpcBaseMaintCompletion({
    input: readEnvelope(repoRoot, INPUT_PATH, 'canonical NPC apply input'),
    landingResult: readEnvelope(repoRoot, LANDING_RESULT_PATH, 'canonical NPC landing result'),
    standardized: readEnvelope(repoRoot, STANDARDIZED_PATH, 'standardized NPC source'),
    results: NPC_BASE_MAINT_OPERATIONS.map((definition) => readEnvelope(
      repoRoot,
      resultPaths[definition.operationId],
      `${definition.operationId} result`,
    )),
  });
  await writeCanonicalNpcBaseMaintResult({
    repoRoot,
    outputPath: completionOutputPath,
    result: completion,
  });
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const operationId = String(args['operation-id'] ?? '');
  requireDefinition(operationId);
  if (args.apply !== 'true') throw new Error('canonical NPC base maint operation requires --apply=true');
  const repoRoot = path.resolve(args['repo-root'] ?? process.cwd());
  if (repoRoot !== REPO_ROOT) {
    throw new Error('canonical NPC base maint CLI requires the repository-root execution context');
  }
  const authorizedContext = loadAuthorizedOperationContext({ operationId });
  consumeAuthorizedOperationDispatchPermit({
    authorizedContext,
    decisionLedgerPath: path.join(REPO_ROOT, 'reports/authorization/canonical/used-decisions.json'),
  });
  const plan = await buildNpcBaseMaintOperationPlan({
    repoRoot,
    operationId,
    input: readEnvelope(repoRoot, args.input ?? INPUT_PATH, 'canonical NPC apply input'),
  });
  const result = await executeNpcBaseMaintOperation({
    plan,
    adapter: createCanonicalNpcBaseMaintMysqlAdapter({ repoRoot, plan }),
  });
  const outputPath = args.output
    ?? `reports/authorization/canonical/${operationId}.result.json`;
  await writeCanonicalNpcBaseMaintResult({ repoRoot, outputPath, result });
  const completionGenerated = await maybeWriteCompletion({
    repoRoot,
    currentOperationId: operationId,
    currentOutputPath: outputPath,
    completionOutputPath: args['completion-output'] ?? COMPLETION_PATH,
  });
  process.stdout.write(`${JSON.stringify({
    operationId,
    status: result.status,
    outputPath,
    completionGenerated,
  })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`canonical NPC base maint operation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

async function extractStandardizedMaintRows(payload) {
  if (!Array.isArray(payload?.records)) {
    throw new Error('standardized NPC source records are required');
  }
  const landingContentHash = hashJsonBare(payload);
  const extracted = await extractMaintEntitiesFromLandingRow({
    id: 0,
    dataset_type: 'npcs_base_raw',
    provider: 'terrapedia.standardized',
    source_page: 'npcs.standardized',
    source_key: 'standardized.npcs',
    source_revision_timestamp: null,
    content_hash: landingContentHash,
    fetched_at: payload.generatedAt ?? null,
    parsed_at: payload.generatedAt ?? null,
    payload_json: JSON.stringify(payload),
  });
  return extracted.rows;
}

function validateLandingResult(result, inputHash) {
  if (result?.schemaVersion !== 1
      || result?.resultKind !== 'canonical_npc_owner_operation_result'
      || result?.operationId !== 'canonical-npc-landing-apply'
      || result?.phaseIndex !== 0 || result?.capability !== 'landing'
      || result?.status !== 'COMPLETED' || result?.transactionCommitted !== true
      || JSON.stringify(result?.requiredResults) !== '[]'
      || JSON.stringify(result?.ownershipKeys) !== JSON.stringify(LANDING_OWNERSHIP_KEYS)
      || result?.rowCounts?.[LANDING_OWNERSHIP_KEYS[0]] !== 1
      || result?.rowCounts?.[LANDING_OWNERSHIP_KEYS[1]] !== 25
      || !HASH_PATTERN.test(result?.outputHash ?? '')) {
    throw new Error('canonical NPC landing result is not a committed exact result');
  }
  if (result?.input?.contentHash !== inputHash) {
    throw new Error('canonical NPC landing input hash does not match the frozen input');
  }
}

function validateBaseMaintResult(result, definition, expected) {
  if (result?.schemaVersion !== 1
      || result?.resultKind !== 'canonical_npc_base_maint_operation_result'
      || result?.operationId !== definition.operationId
      || result?.capability !== definition.capability
      || result?.npcKind !== definition.npcKind
      || result?.status !== 'COMPLETED' || result?.transactionCommitted !== true
      || JSON.stringify(result?.ownershipKeys) !== JSON.stringify([definition.ownershipKey])
      || !HASH_PATTERN.test(result?.outputHash ?? '')) {
    throw new Error(`committed NPC base maint result is invalid: ${definition.operationId}`);
  }
  if (result?.input?.contentHash !== expected.inputHash) {
    throw new Error(`NPC base maint input hash mismatch: ${definition.operationId}`);
  }
  if (result?.landingResult?.contentHash !== expected.landingResultHash) {
    throw new Error(`NPC base maint landing result hash mismatch: ${definition.operationId}`);
  }
  if (result?.standardized?.contentHash !== expected.standardizedHash
      || result?.standardized?.landingContentHash !== expected.landingContentHash) {
    throw new Error(`NPC base maint standardized hash mismatch: ${definition.operationId}`);
  }
  validateLandingLineage(result?.landingLineage, expected.landingContentHash);
  const count = result?.rowCounts?.[definition.ownershipKey];
  if (Object.keys(result?.rowCounts ?? {}).length !== 1
      || !Number.isSafeInteger(count) || count <= 0) {
    throw new Error(`NPC base maint row count is invalid: ${definition.operationId}`);
  }
}

function validateRowCounts(rowCounts, plan) {
  const count = rowCounts?.[plan.ownershipKeys[0]];
  if (!rowCounts || typeof rowCounts !== 'object' || Array.isArray(rowCounts)
      || Object.keys(rowCounts).length !== 1
      || count !== plan.expectedCount) {
    throw new Error('NPC base maint row counts must match the exact planned partition');
  }
}

function validateLandingLineage(lineage, expectedContentHash) {
  if (!Number.isSafeInteger(Number(lineage?.id)) || Number(lineage.id) <= 0
      || lineage?.sourceKey !== 'standardized.npcs'
      || lineage?.contentHash !== expectedContentHash) {
    throw new Error('NPC base maint landing lineage is invalid');
  }
}

function npcKindOf(row) {
  let flags;
  try {
    flags = JSON.parse(row?.flagsJson ?? 'null');
  } catch {
    return null;
  }
  if (flags?.townNpc === true) return 'town';
  if (flags?.townNpc === false) return 'non_town';
  return null;
}

function requireDefinition(operationId) {
  const definition = NPC_BASE_MAINT_OPERATIONS.find((entry) => entry.operationId === operationId);
  if (!definition) throw new Error(`unsupported canonical NPC base maint operation: ${operationId ?? ''}`);
  return definition;
}

function readEnvelope(repoRoot, relativePath, label) {
  const root = path.resolve(repoRoot);
  const relative = requireRelativePath(relativePath, `${label} path`);
  const fullPath = path.join(root, relative);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error(`${label} is missing: ${relative}`);
  }
  return { path: relative, bytes: fs.readFileSync(fullPath) };
}

function readPrivateEnvelope(repoRoot, relativePath, label) {
  const envelope = readEnvelope(repoRoot, relativePath, label);
  const stat = fs.lstatSync(path.join(path.resolve(repoRoot), envelope.path));
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error(`${label} must be a private ordinary file`);
  }
  return envelope;
}

function normalizeEnvelope(value, defaultPath, label) {
  if (!value || typeof value !== 'object') throw new Error(`${label} envelope is required`);
  const bytes = Buffer.isBuffer(value.bytes) ? value.bytes : Buffer.from(value.bytes ?? '');
  if (bytes.length === 0) throw new Error(`${label} bytes are required`);
  return {
    path: requireRelativePath(value.path ?? defaultPath, `${label} path`),
    bytes,
    payload: value.payload,
  };
}

function parseEnvelopePayload(envelope, label) {
  let payload;
  try {
    payload = JSON.parse(envelope.bytes.toString('utf8'));
  } catch {
    throw new Error(`${label} must contain valid JSON bytes`);
  }
  if (envelope.payload != null && stableJson(envelope.payload) !== stableJson(payload)) {
    throw new Error(`${label} payload does not match its bytes`);
  }
  return payload;
}

function summarizeEnvelope(envelope) {
  return {
    path: envelope.path,
    contentHash: hashBytes(envelope.bytes),
    sizeBytes: envelope.bytes.length,
  };
}

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function hashJsonBare(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hashStableJson(value) {
  return hashBytes(Buffer.from(stableJson(value)));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function requireRelativePath(value, label) {
  const text = String(value ?? '').trim();
  if (!text || text.includes('\\') || path.posix.isAbsolute(text) || path.posix.normalize(text) !== text
      || text.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} must be a normalized relative path`);
  }
  return text;
}

function withoutPayload(value) {
  const { payload, ...summary } = value;
  return summary;
}

function requireTimestamp(value, label) {
  const text = String(value ?? '').trim();
  if (!text || !Number.isFinite(Date.parse(text))) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return text;
}
