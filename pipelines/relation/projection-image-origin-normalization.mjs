#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import {
  buildCanonicalAuthorizationRequestForOperation,
} from '../automation/build-canonical-cutover-authorization.mjs';
import {
  buildCanonicalOperationExecutionManifest,
  writeCanonicalOperationExecutionManifest,
} from '../automation/canonical-operation-execution-manifest.mjs';
import { FORMAL_DATABASES, canonicalServerFingerprint } from '../automation/automation-database-contract.mjs';
import { canonicalizePolicySet } from '../automation/policy-set-hash.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';

const RUN_ROOT = 'reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100';
const LEGACY_ORIGINS = Object.freeze(new Set([
  'http://localhost:9000',
  'http://127.0.0.1:9000',
]));
export const PROJECTION_IMAGE_ORIGIN_AUTHORIZATION_DATABASES = Object.freeze(
  Object.values(FORMAL_DATABASES),
);

export const PROJECTION_IMAGE_ORIGIN_OPERATION_CONFIGS = Object.freeze({
  'canonical-item-image-origin-normalization': Object.freeze({
    domain: 'items',
    relationTable: 'terria_v1_relation.relation_item_images',
    relationKeyColumn: 'item_internal_name',
    relationPredicate: "role='icon' AND is_primary=1",
    projectionTable: 'terria_v1_relation.projection_items',
    projectionKeyColumn: 'internal_name',
    projectionValueColumn: 'image',
    bucketPath: '/terrapedia-images/items/',
    updateRelation: true,
    writeTargets: Object.freeze([
      'relation.relation_item_images.cached_url',
      'relation.projection_items.image',
    ]),
    quarantine: Object.freeze([
      'BoringBow',
      'BossBagDarkMage',
      'BossBagOgre',
      'ColorOnlyDye',
      'EtherianJavelin',
      'Fake_newchest1',
      'Fake_newchest2',
      'FirstFractal',
      'FoxparksTagEffect',
      'GoblinBomberCap',
      'GoblinMask',
      'KoboldDynamiteBackpack',
      'ManaCloakStar',
      'OgreMask',
      'SleepingIcon',
    ]),
    expected: Object.freeze({ relation: 6131, projection: 6146, changed: 331, controls: 5800, quarantine: 15 }),
    proposalName: 'item-image-origin-normalization.proposal.json',
  }),
  'canonical-npc-image-origin-normalization': Object.freeze({
    domain: 'npcs',
    relationTable: 'terria_v1_relation.relation_npc_images',
    relationKeyColumn: 'npc_internal_name',
    projectionTable: 'terria_v1_relation.projection_npcs',
    projectionKeyColumn: 'internal_name',
    projectionValueColumn: 'image_url',
    bucketPath: '/terrapedia-images/npcs/',
    writeTargets: Object.freeze(['relation.projection_npcs.image_url']),
    quarantine: Object.freeze(['DD2AttackerTest', 'None', 'None2', 'None3']),
    expected: Object.freeze({ relation: 758, projection: 762, changed: 758, controls: 0, quarantine: 4 }),
    proposalName: 'npc-image-origin-normalization.proposal.json',
  }),
  'canonical-projectile-image-origin-normalization': Object.freeze({
    domain: 'projectiles',
    relationTable: 'terria_v1_relation.relation_projectile_images',
    relationKeyColumn: 'projectile_internal_name',
    projectionTable: 'terria_v1_relation.projection_projectiles',
    projectionKeyColumn: 'internal_name',
    projectionValueColumn: 'image_url',
    bucketPath: '/terrapedia-images/projectiles/',
    writeTargets: Object.freeze(['relation.projection_projectiles.image_url']),
    quarantine: Object.freeze(['None']),
    expected: Object.freeze({ relation: 1110, projection: 1111, changed: 1110, controls: 0, quarantine: 1 }),
    proposalName: 'projectile-image-origin-normalization.proposal.json',
  }),
  'canonical-biome-image-origin-normalization': Object.freeze({
    domain: 'biomes',
    relationTable: 'terria_v1_relation.relation_biome_images',
    relationKeyColumn: 'biome_code',
    projectionTable: 'terria_v1_relation.projection_biomes',
    projectionKeyColumn: 'code',
    projectionValueColumn: 'icon_url',
    bucketPath: '/terrapedia-images/items/',
    writeTargets: Object.freeze(['relation.projection_biomes.icon_url']),
    quarantine: Object.freeze([]),
    expected: Object.freeze({ relation: 47, projection: 47, changed: 40, controls: 7, quarantine: 0 }),
    proposalName: 'biome-image-origin-normalization.proposal.json',
  }),
});

export function normalizeLegacyImageToManagedPath(value, { bucketPath } = {}) {
  const text = String(value ?? '').trim();
  const ownedBucket = requireBucketPath(bucketPath);
  if (!text || /%2e|%2f|%5c/i.test(text) || /(?:^|\/)\.\.(?:\/|$)/.test(text)) {
    throw new Error('legacy image path is invalid or traverses its owned bucket');
  }
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error('legacy image URL is invalid');
  }
  if (!LEGACY_ORIGINS.has(parsed.origin) || parsed.username || parsed.password) {
    throw new Error('legacy image origin is not trusted');
  }
  if (parsed.search || parsed.hash || !isOwnedOriginFreePath(parsed.pathname, ownedBucket)) {
    throw new Error('legacy image path is outside the owned entity bucket');
  }
  return parsed.pathname;
}

export function buildProjectionImageOriginNormalizationProposal({
  operationId,
  domain,
  relationRows = [],
  projectionRows = [],
  quarantinedIdentities,
  expected,
  serverUuid,
  generatedAt = new Date().toISOString(),
} = {}) {
  const config = requireOperationConfig(operationId, domain);
  const counts = expected ?? config.expected;
  const quarantine = [...(quarantinedIdentities ?? config.quarantine)].map(requireIdentity).sort();
  const relation = normalizeRows(relationRows);
  const projection = normalizeRows(projectionRows);
  assertUniqueIdentities(relation, 'relation');
  assertUniqueIdentities(projection, 'projection');
  if (!isUuid(serverUuid) || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('projection image normalization fingerprint or generatedAt is invalid');
  }
  const relationByIdentity = new Map(relation.map((row) => [row.identity, row.image]));
  const quarantineSet = new Set(quarantine);
  const rows = [];
  const controls = [];
  for (const row of projection) {
    const relationImage = relationByIdentity.get(row.identity);
    if (relationImage == null && quarantineSet.has(row.identity)) continue;
    if (relationImage == null) {
      throw new Error(`relation/projection identity mismatch: ${row.identity}`);
    }
    if (row.image !== relationImage) {
      throw new Error(`relation/projection before mismatch: ${row.identity}`);
    }
    if (isOwnedOriginFreePath(relationImage, config.bucketPath)) {
      controls.push({ identity: row.identity, value: relationImage });
    } else {
      rows.push({
        identity: row.identity,
        before: relationImage,
        after: normalizeLegacyImageToManagedPath(relationImage, config),
      });
    }
  }
  for (const row of relation) {
    if (!projection.some((candidate) => candidate.identity === row.identity)) {
      throw new Error(`relation/projection identity mismatch: ${row.identity}`);
    }
  }
  rows.sort(compareIdentity);
  controls.sort(compareIdentity);
  assertExpectedCounts({ relation, projection, rows, controls, quarantine }, counts);
  const afterProjection = projection.map((row) => {
    const change = rows.find((candidate) => candidate.identity === row.identity);
    return change ? { identity: row.identity, image: change.after } : row;
  });
  const afterRelation = config.updateRelation
    ? relation.map((row) => {
        const change = rows.find((candidate) => candidate.identity === row.identity);
        return change ? { identity: row.identity, image: change.after } : row;
      })
    : null;
  const proposal = {
    schemaVersion: 1,
    proposalKind: 'canonical_projection_image_origin_normalization',
    operationId,
    domain: config.domain,
    generatedAt,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    serverFingerprint: {
      serverUuid,
      databases: ['terria_v1_relation'],
    },
    source: {
      relationTable: config.relationTable,
      relationRowCount: relation.length,
      relationRowsSha256: hashJson(relation),
      projectionRowCount: projection.length,
      projectionRowsSha256: hashJson(projection),
      legacyOrigins: [...LEGACY_ORIGINS],
      ownedBucketPath: config.bucketPath,
      relationRowsReadOnly: !config.updateRelation,
    },
    target: {
      database: 'terria_v1_relation',
      table: config.projectionTable,
      keyColumn: config.projectionKeyColumn,
      valueColumn: config.projectionValueColumn,
      writeTargets: [...config.writeTargets],
      mutationMode: config.updateRelation
        ? 'update-existing-relation-and-projection'
        : 'update-existing-projection-only',
    },
    expectedCounts: { ...counts },
    changedRowCount: rows.length,
    ...(config.updateRelation ? { changedPhysicalRowCount: rows.length * 2 } : {}),
    rows,
    controls,
    quarantine,
    keySetSha256: hashJson(rows.map((row) => row.identity)),
    before: {
      projectionRowsSha256: hashJson(projection),
      changedRowsSha256: hashJson(rows.map(({ identity, before: image }) => ({ identity, image }))),
    },
    after: {
      projectionRowsSha256: hashJson(afterProjection),
      changedRowsSha256: hashJson(rows.map(({ identity, after: image }) => ({ identity, image }))),
      ...(config.updateRelation ? { relationRowsSha256: hashJson(afterRelation) } : {}),
    },
  };
  proposal.scopeSha256 = computeScopeHash(proposal);
  validateProjectionImageOriginNormalizationProposal(proposal);
  return proposal;
}

export function validateProjectionImageOriginNormalizationProposal(proposal) {
  const config = requireOperationConfig(proposal?.operationId, proposal?.domain);
  if (proposal?.schemaVersion !== 1
      || proposal.proposalKind !== 'canonical_projection_image_origin_normalization'
      || proposal.applyAllowed !== false
      || proposal.databaseWrites !== false
      || proposal.externalRequests !== false) {
    throw new Error('projection image normalization proposal identity or safety flags are invalid');
  }
  if (proposal.target?.database !== 'terria_v1_relation'
      || proposal.target?.table !== config.projectionTable
      || proposal.target?.keyColumn !== config.projectionKeyColumn
      || proposal.target?.valueColumn !== config.projectionValueColumn
      || proposal.target?.mutationMode !== (config.updateRelation
        ? 'update-existing-relation-and-projection'
        : 'update-existing-projection-only')
      || stableString(proposal.target?.writeTargets) !== stableString(config.writeTargets)) {
    throw new Error('projection image normalization target drifted');
  }
  const rows = Array.isArray(proposal.rows) ? proposal.rows : [];
  const controls = Array.isArray(proposal.controls) ? proposal.controls : [];
  const quarantine = Array.isArray(proposal.quarantine) ? proposal.quarantine : [];
  assertExpectedCounts({
    relation: Array(Number(proposal.source?.relationRowCount)).fill(null),
    projection: Array(Number(proposal.source?.projectionRowCount)).fill(null),
    rows,
    controls,
    quarantine,
  }, proposal.expectedCounts);
  assertUniqueIdentities(rows, 'changed');
  for (const row of rows) {
    if (normalizeLegacyImageToManagedPath(row.before, config) !== row.after) {
      throw new Error(`projection image normalization after path drifted: ${row.identity}`);
    }
  }
  if (proposal.changedRowCount !== rows.length
      || (config.updateRelation && proposal.changedPhysicalRowCount !== rows.length * 2)
      || proposal.keySetSha256 !== hashJson(rows.map((row) => row.identity))
      || proposal.before?.changedRowsSha256 !== hashJson(rows.map(({ identity, before: image }) => ({ identity, image })))
      || proposal.after?.changedRowsSha256 !== hashJson(rows.map(({ identity, after: image }) => ({ identity, image })))
      || proposal.scopeSha256 !== computeScopeHash(proposal)) {
    throw new Error('projection image normalization proposal hash drifted');
  }
  return true;
}

export async function executeProjectionImageOriginNormalizationTransaction({
  connection,
  proposal,
  consumeDispatchPermit,
  readCurrent = readProjectionRows,
  readRelationCurrent = readRelationRows,
  updateRows = updateProjectionRows,
} = {}) {
  validateProjectionImageOriginNormalizationProposal(proposal);
  if (!connection || typeof connection.beginTransaction !== 'function'
      || typeof consumeDispatchPermit !== 'function') {
    throw new Error('projection image normalization transaction dependencies are missing');
  }
  let began = false;
  try {
    await connection.beginTransaction();
    began = true;
    const relation = normalizeRows(await readRelationCurrent(connection, proposal, { forUpdate: true }));
    if (hashJson(relation) !== proposal.source.relationRowsSha256) {
      throw new Error('projection image normalization relation source drifted after lock');
    }
    const before = normalizeRows(await readCurrent(connection, proposal, { forUpdate: true, after: false }));
    if (hashJson(before) !== proposal.before.projectionRowsSha256) {
      throw new Error('projection image normalization before set drifted after lock');
    }
    await consumeDispatchPermit();
    const affectedRows = Number(await updateRows(connection, proposal));
    const expectedAffectedRows = proposal.changedPhysicalRowCount ?? proposal.changedRowCount;
    if (affectedRows !== expectedAffectedRows) {
      throw new Error('projection image normalization affected row count drifted');
    }
    if (proposal.after.relationRowsSha256) {
      const relationAfter = normalizeRows(await readRelationCurrent(connection, proposal, { forUpdate: true, after: true }));
      if (hashJson(relationAfter) !== proposal.after.relationRowsSha256) {
        throw new Error('projection image normalization relation after set drifted');
      }
    }
    const after = normalizeRows(await readCurrent(connection, proposal, { forUpdate: true, after: true }));
    if (hashJson(after) !== proposal.after.projectionRowsSha256) {
      throw new Error('projection image normalization transaction readback drifted');
    }
    await connection.commit();
    return { transactionCommitted: true, affectedRows, afterRowsSha256: proposal.after.projectionRowsSha256 };
  } catch (error) {
    if (began) await connection.rollback();
    throw error;
  }
}

export async function prepareProjectionImageOriginNormalizationProposal({
  repoRoot = process.cwd(),
  operationId,
  generatedAt = new Date().toISOString(),
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  const config = requireOperationConfig(operationId);
  const proposalPath = proposalPathFor(config);
  assertFresh(root, [proposalPath]);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  let proposal;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [server, relationRows, projectionRows] = await Promise.all([
      readRows(connection, 'SELECT @@server_uuid AS serverUuid'),
      readRelationRows(connection, { operationId }, {}),
      readProjectionRows(connection, { operationId }, {}),
    ]);
    proposal = buildProjectionImageOriginNormalizationProposal({
      operationId,
      relationRows,
      projectionRows,
      serverUuid: server[0]?.serverUuid,
      generatedAt,
    });
    await connection.query('ROLLBACK');
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
  writePrivateJson(root, proposalPath, proposal);
  return {
    operationId,
    changedRowCount: proposal.changedRowCount,
    scopeSha256: proposal.scopeSha256,
    proposalSha256: hashFile(path.resolve(root, proposalPath)),
    proposalPath,
  };
}

export async function prepareProjectionImageOriginNormalizationAuthorization({
  repoRoot = process.cwd(),
  operationId,
  generatedAt = new Date().toISOString(),
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  const config = requireOperationConfig(operationId);
  const paths = artifactPaths(config);
  assertFresh(root, [paths.input, paths.manifest, paths.request]);
  const proposal = readJson(root, paths.proposal);
  validateProjectionImageOriginNormalizationProposal(proposal);
  const proposalSha256 = hashFile(path.resolve(root, paths.proposal));
  const input = buildInput(proposal, paths.proposal, proposalSha256);
  writePrivateJson(root, paths.input, input);
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot: root, operationId, artifactDate: generatedAt.slice(0, 10) });
  writeCanonicalOperationExecutionManifest({
    repoRoot: root,
    outputPath: path.resolve(root, paths.manifest),
    operationId,
    artifactDate: generatedAt.slice(0, 10),
  });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  let policyRows;
  try {
    policyRows = await readCurrentAutomationPolicyRows(connection);
  } finally {
    await connection.end();
  }
  const options = connectionOptions(root);
  const request = buildCanonicalAuthorizationRequestForOperation({
    repoRoot: root,
    operationId,
    serverFingerprint: canonicalServerFingerprint({
      host: options.host,
      port: options.port,
      serverUuid: proposal.serverFingerprint.serverUuid,
      databases: PROJECTION_IMAGE_ORIGIN_AUTHORIZATION_DATABASES,
    }),
    policyRows,
    executionManifest: manifest,
    generatedAt,
    expiresAt: new Date(Date.parse(generatedAt) + 24 * 60 * 60 * 1000).toISOString(),
  });
  writePrivateJson(root, paths.request, request);
  return { operationId, paths, proposalSha256, scopeSha256: proposal.scopeSha256 };
}

export async function applyProjectionImageOriginNormalization({
  repoRoot = process.cwd(),
  operationId,
  now = new Date().toISOString(),
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  const config = requireOperationConfig(operationId);
  const paths = artifactPaths(config);
  const proposal = readJson(root, paths.proposal);
  const input = readJson(root, paths.input);
  validateInput(input, proposal, paths.proposal, hashFile(path.resolve(root, paths.proposal)));
  const context = loadAuthorizedOperationContext({ operationId, now });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  try {
    const server = await readRows(connection, 'SELECT @@server_uuid AS serverUuid');
    if (server[0]?.serverUuid !== fingerprint.serverUuid
        || fingerprint.serverUuid !== proposal.serverFingerprint.serverUuid) {
      throw new Error('projection image normalization database fingerprint drifted');
    }
    const transaction = await executeProjectionImageOriginNormalizationTransaction({
      connection,
      proposal,
      consumeDispatchPermit: () => consumeAuthorizedOperationDispatchPermit({
        authorizedContext: context,
        decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json'),
      }),
    });
    const result = {
      schemaVersion: 1,
      resultKind: 'canonical_projection_image_origin_normalization_result',
      operationId,
      status: 'COMPLETED',
      transactionCommitted: true,
      affectedRows: transaction.affectedRows,
      scopeSha256: proposal.scopeSha256,
      afterRowsSha256: transaction.afterRowsSha256,
      authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash },
      completedAt: now,
    };
    writePrivateJson(root, paths.result, result);
    return result;
  } finally {
    await connection.end();
  }
}

export async function readProjectionRows(connection, proposal, { forUpdate = false } = {}) {
  const config = requireOperationConfig(proposal.operationId);
  return readRows(connection,
    `SELECT \`${config.projectionKeyColumn}\` AS identity, \`${config.projectionValueColumn}\` AS image `
      + `FROM ${quoteTable(config.projectionTable)} WHERE status=1 AND deleted=0 `
      + `ORDER BY \`${config.projectionKeyColumn}\`${forUpdate ? ' FOR UPDATE' : ''}`);
}

export async function readRelationRows(connection, proposal, { forUpdate = false } = {}) {
  const config = requireOperationConfig(proposal.operationId);
  const predicate = config.relationPredicate ? ` AND ${config.relationPredicate}` : '';
  return readRows(connection,
    `SELECT \`${config.relationKeyColumn}\` AS identity, cached_url AS image `
      + `FROM ${quoteTable(config.relationTable)} WHERE status=1 AND deleted=0${predicate} `
      + `ORDER BY \`${config.relationKeyColumn}\`${forUpdate ? ' FOR SHARE' : ''}`);
}

export async function updateProjectionRows(connection, proposal) {
  const config = requireOperationConfig(proposal.operationId);
  let affected = 0;
  if (config.updateRelation) {
    const relationSql = `UPDATE ${quoteTable(config.relationTable)} SET cached_url=? `
      + `WHERE \`${config.relationKeyColumn}\`=? AND cached_url=? AND status=1 AND deleted=0 `
      + `AND ${config.relationPredicate}`;
    for (const row of proposal.rows) {
      const [result] = await connection.execute(relationSql, [row.after, row.identity, row.before]);
      affected += Number(result?.affectedRows ?? 0);
    }
  }
  const sql = `UPDATE ${quoteTable(config.projectionTable)} SET \`${config.projectionValueColumn}\`=? `
    + `WHERE \`${config.projectionKeyColumn}\`=? AND \`${config.projectionValueColumn}\`=? AND status=1 AND deleted=0`;
  for (const row of proposal.rows) {
    const [result] = await connection.execute(sql, [row.after, row.identity, row.before]);
    affected += Number(result?.affectedRows ?? 0);
  }
  return affected;
}

function buildInput(proposal, proposalPath, proposalSha256) {
  return {
    schemaVersion: 1,
    operationId: proposal.operationId,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    proposalPath,
    proposalSha256,
    scopeSha256: proposal.scopeSha256,
    keySetSha256: proposal.keySetSha256,
    beforeRowsSha256: proposal.before.projectionRowsSha256,
    afterRowsSha256: proposal.after.projectionRowsSha256,
    expectedChangedRowCount: proposal.changedRowCount,
    expectedAffectedRowCount: proposal.changedPhysicalRowCount ?? proposal.changedRowCount,
    writeTargets: proposal.target.writeTargets,
  };
}

function validateInput(input, proposal, proposalPath, proposalSha256) {
  validateProjectionImageOriginNormalizationProposal(proposal);
  if (input?.schemaVersion !== 1 || input.operationId !== proposal.operationId
      || input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false
      || input.proposalPath !== proposalPath || input.proposalSha256 !== proposalSha256
      || input.scopeSha256 !== proposal.scopeSha256 || input.keySetSha256 !== proposal.keySetSha256
      || input.beforeRowsSha256 !== proposal.before.projectionRowsSha256
      || input.afterRowsSha256 !== proposal.after.projectionRowsSha256
      || input.expectedChangedRowCount !== proposal.changedRowCount
      || input.expectedAffectedRowCount !== (proposal.changedPhysicalRowCount ?? proposal.changedRowCount)
      || stableString(input.writeTargets) !== stableString(proposal.target.writeTargets)) {
    throw new Error('projection image normalization input binding drifted');
  }
}

export function projectionImageOriginArtifactPaths(operationId) {
  return artifactPaths(requireOperationConfig(operationId));
}

function artifactPaths(config) {
  const operationId = Object.entries(PROJECTION_IMAGE_ORIGIN_OPERATION_CONFIGS)
    .find(([, candidate]) => candidate === config)?.[0];
  return {
    proposal: proposalPathFor(config),
    input: `reports/authorization/canonical/${operationId}.retry-01.input.json`,
    manifest: `reports/authorization/canonical/${operationId}.retry-01.execution-manifest.json`,
    request: `reports/authorization/canonical/${operationId}.retry-01.request.json`,
    result: `reports/authorization/canonical/${operationId}.retry-01.result.json`,
  };
}

function proposalPathFor(config) {
  return `${RUN_ROOT}/${config.proposalName}`;
}

function requireOperationConfig(operationId, domain = null) {
  const config = PROJECTION_IMAGE_ORIGIN_OPERATION_CONFIGS[operationId];
  if (!config || (domain != null && config.domain !== domain)) {
    throw new Error(`unsupported projection image origin operation: ${operationId}`);
  }
  return config;
}

function requireBucketPath(value) {
  const text = String(value ?? '');
  if (!/^\/terrapedia-images\/[a-z0-9_-]+\/$/.test(text)) {
    throw new Error('owned image bucket path is invalid');
  }
  return text;
}

function isOwnedOriginFreePath(value, bucketPath) {
  const text = String(value ?? '').trim();
  const bucket = requireBucketPath(bucketPath);
  return text.startsWith(bucket)
    && text.length > bucket.length
    && !text.startsWith('//')
    && !/[?#]/.test(text)
    && !/%2e|%2f|%5c/i.test(text)
    && !/(?:^|\/)\.\.(?:\/|$)/.test(text);
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    identity: requireIdentity(row?.identity),
    image: row?.image == null || row.image === '' ? null : String(row.image),
  })).sort(compareIdentity);
}

function requireIdentity(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 255) throw new Error('projection image identity is invalid');
  return text;
}

function assertUniqueIdentities(rows, label) {
  const seen = new Set();
  for (const row of rows) {
    const identity = requireIdentity(row?.identity);
    if (seen.has(identity)) throw new Error(`${label} projection image identity is duplicated: ${identity}`);
    seen.add(identity);
  }
}

function assertExpectedCounts(actual, expected = {}) {
  for (const key of ['relation', 'projection', 'changed', 'controls', 'quarantine']) {
    const value = key === 'changed' ? actual.rows?.length : actual[key]?.length;
    if (!Number.isInteger(expected[key]) || value !== expected[key]) {
      throw new Error(`projection image normalization ${key} count drifted: expected ${expected[key]}, found ${value}`);
    }
  }
}

function computeScopeHash(proposal) {
  return hashJson({
    operationId: proposal.operationId,
    domain: proposal.domain,
    serverFingerprint: proposal.serverFingerprint,
    source: proposal.source,
    target: proposal.target,
    expectedCounts: proposal.expectedCounts,
    changedRowCount: proposal.changedRowCount,
    keySetSha256: proposal.keySetSha256,
    before: proposal.before,
    after: proposal.after,
    controls: proposal.controls,
    quarantine: proposal.quarantine,
  });
}

function compareIdentity(left, right) {
  return String(left.identity).localeCompare(String(right.identity));
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableString(value) {
  return JSON.stringify(stableValue(value));
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(stableString(value)).digest('hex')}`;
}

function hashFile(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function isUuid(value) {
  return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(value ?? ''));
}

function quoteTable(table) {
  return table.split('.').map((part) => `\`${part}\``).join('.');
}

async function readRows(connection, sql, values = []) {
  const [rows] = await connection.query(sql, values);
  return Array.isArray(rows) ? rows : [];
}

async function readCurrentAutomationPolicyRows(connection) {
  const rows = await readRows(connection,
    'SELECT p.domain_id AS domainId, p.current_version AS policyVersion, '
      + 'pv.policy_hash AS policyHash FROM terria_v1_local.crawler_automation_policy p '
      + 'JOIN terria_v1_local.crawler_automation_policy_version pv ON pv.domain_id=p.domain_id '
      + 'AND pv.policy_version=p.current_version ORDER BY p.domain_id');
  const canonical = canonicalizePolicySet(rows);
  if (canonical.length === 0) throw new Error('projection image normalization automation policy rows are missing');
  return canonical;
}

function connectionOptions(repoRoot) {
  const config = loadLocalStackConfig(repoRoot);
  return {
    host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  };
}

function readJson(repoRoot, relativePath) {
  const target = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label: 'projection image normalization artifact',
  });
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function writePrivateJson(repoRoot, relativePath, value) {
  const target = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label: 'projection image normalization artifact',
    createParent: true,
  });
  if (fs.existsSync(target)) throw new Error(`projection image normalization artifact already exists: ${relativePath}`);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}

function assertFresh(repoRoot, relativePaths) {
  for (const relativePath of relativePaths) {
    if (fs.existsSync(path.resolve(repoRoot, relativePath))) {
      throw new Error(`projection image normalization output already exists: ${relativePath}`);
    }
  }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((token) => {
    const [key, ...rest] = String(token).replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const operationId = args['operation-id'];
  const action = args.apply === 'true'
    ? applyProjectionImageOriginNormalization({ operationId })
    : args['prepare-authorization'] === 'true'
      ? prepareProjectionImageOriginNormalizationAuthorization({ operationId })
      : prepareProjectionImageOriginNormalizationProposal({ operationId });
  action.then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`);
      process.exitCode = 1;
    });
}
