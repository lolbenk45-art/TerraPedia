#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import { isManagedImagePath, resolveManagedImageUrlPrefixes } from '../relation/managed-image-url-policy.mjs';

const OPERATION_ID = 'canonical-item-image-origin-normalization';
const EVIDENCE_KIND = 'canonical_item_image_origin_normalization_evidence';

export function buildItemImageOriginNormalizationEvidence({
  generatedAt = new Date().toISOString(),
  serverUuid,
  resultPath,
  resultBytes,
  result = parseJson(resultBytes, 'origin normalization result'),
  inputPath,
  inputBytes,
  input = parseJson(inputBytes, 'origin normalization input'),
  proposalPath,
  proposalBytes,
  proposal = parseJson(proposalBytes, 'origin normalization proposal'),
  relationRows = [],
  projectionRows = [],
  managedUrlPrefixes = [],
} = {}) {
  const normalizedResultBytes = toBuffer(resultBytes, 'origin normalization result bytes');
  const normalizedInputBytes = toBuffer(inputBytes, 'origin normalization input bytes');
  const normalizedProposalBytes = toBuffer(proposalBytes, 'origin normalization proposal bytes');
  const prefixes = normalizeItemPrefixes(managedUrlPrefixes);
  const relation = normalizeRelationRows(relationRows, prefixes);
  const projection = normalizeProjectionRows(projectionRows);
  const relationComparable = relation.map((row) => ({ identity: row.internalName, image: row.cachedUrl }));
  const projectionComparable = projection.map((row) => ({ identity: row.internalName, image: row.image }));
  const quarantineIdentities = sortedUnique(proposal.quarantine, 'proposal quarantine identities');

  assertOperationBindings({ result, input, proposal, proposalBytes: normalizedProposalBytes });
  if (hashJson(relationComparable) !== proposal.after.relationRowsSha256) {
    throw new Error('current relation after hash does not match the completed origin normalization');
  }
  if (hashJson(projectionComparable) !== proposal.after.projectionRowsSha256
      || result.afterRowsSha256 !== hashJson(projectionComparable)) {
    throw new Error('current projection after hash does not match the completed origin normalization result');
  }
  if (relation.length !== Number(proposal.source.relationRowCount)
      || projection.length !== Number(proposal.source.projectionRowCount)
      || projection.length !== Number(proposal.expectedCounts.projection)) {
    throw new Error('current Item image relation or projection count drifted');
  }

  const relationByIdentity = new Map(relation.map((row) => [row.internalName, row]));
  const projectionByIdentity = new Map(projection.map((row) => [row.internalName, row]));
  const quarantine = new Set(quarantineIdentities);
  const acceptedRows = [];
  for (const relationRow of relation) {
    const projectionRow = projectionByIdentity.get(relationRow.internalName);
    if (!projectionRow || quarantine.has(relationRow.internalName)
        || projectionRow.image !== relationRow.cachedUrl) {
      throw new Error(`current Item image relation/projection mismatch: ${relationRow.internalName}`);
    }
    acceptedRows.push({
      internalName: relationRow.internalName,
      relationRecordKey: relationRow.recordKey,
      projectionId: projectionRow.id,
      projectionRelationRecordKey: projectionRow.relationRecordKey,
      image: relationRow.cachedUrl,
    });
  }
  for (const identity of quarantineIdentities) {
    if (relationByIdentity.has(identity) || !projectionByIdentity.has(identity)) {
      throw new Error(`Item image quarantine identity drifted: ${identity}`);
    }
  }
  if (acceptedRows.length + quarantineIdentities.length !== projection.length) {
    throw new Error('Item image accepted and quarantine identities do not conserve the projection set');
  }

  const payload = {
    schemaVersion: 1,
    evidenceKind: EVIDENCE_KIND,
    generatedAt: requireTimestamp(generatedAt, 'generatedAt'),
    readOnly: true,
    databaseWrites: false,
    externalRequests: false,
    operationId: OPERATION_ID,
    serverUuid: requireUuid(serverUuid),
    result: artifactBinding(resultPath, normalizedResultBytes),
    input: artifactBinding(inputPath, normalizedInputBytes),
    proposal: artifactBinding(proposalPath, normalizedProposalBytes),
    scopeSha256: requireSha256(result.scopeSha256, 'result scopeSha256'),
    target: {
      relationTable: 'terria_v1_relation.relation_item_images',
      projectionTable: 'terria_v1_relation.projection_items',
      projectionColumn: 'image',
    },
    targetRowCount: acceptedRows.length,
    projectionRowCount: projection.length,
    relationRowsSha256: hashJson(relationComparable),
    projectionRowsSha256: hashJson(projectionComparable),
    acceptedRowsSha256: hashJson(acceptedRows),
    quarantineIdentities,
  };
  return { ...payload, evidenceSha256: hashJson(payload) };
}

export function assertItemImageOriginNormalizationEvidence(evidence) {
  if (evidence?.schemaVersion !== 1 || evidence.evidenceKind !== EVIDENCE_KIND
      || evidence.readOnly !== true || evidence.databaseWrites !== false
      || evidence.externalRequests !== false || evidence.operationId !== OPERATION_ID) {
    throw new Error('Item image origin normalization evidence identity or safety flags are invalid');
  }
  requireTimestamp(evidence.generatedAt, 'evidence generatedAt');
  requireUuid(evidence.serverUuid);
  for (const name of ['result', 'input', 'proposal']) {
    requireRelativePath(evidence[name]?.path, `${name} path`);
    requireSha256(evidence[name]?.sha256, `${name} sha256`);
  }
  for (const name of ['scopeSha256', 'relationRowsSha256', 'projectionRowsSha256', 'acceptedRowsSha256']) {
    requireSha256(evidence[name], name);
  }
  for (const name of ['targetRowCount', 'projectionRowCount']) {
    if (!Number.isInteger(evidence[name]) || evidence[name] <= 0) throw new Error(`${name} must be positive`);
  }
  sortedUnique(evidence.quarantineIdentities, 'quarantine identities');
  const { evidenceSha256: _hash, ...payload } = evidence;
  if (evidence.evidenceSha256 !== hashJson(payload)) throw new Error('Item image origin evidence hash drifted');
  return evidence;
}

export async function runItemImageOriginNormalizationEvidence(options = {}, dependencies = {}) {
  const root = path.resolve(options.repoRoot ?? getProjectRoot());
  const resultEntry = readArtifact(root, options.resultPath, 'origin normalization result');
  const inputEntry = readArtifact(root, options.inputPath, 'origin normalization input');
  const proposalEntry = readArtifact(root, options.proposalPath, 'origin normalization proposal');
  const mysql = dependencies.mysql ?? createRequire(path.join(root, 'apps/admin-console/package.json'))('mysql2/promise');
  const connection = dependencies.connection ?? await mysql.createConnection({
    host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(options.port ?? process.env.TERRAPEDIA_DB_PORT ?? 13306),
    user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
  });
  const closeConnection = !dependencies.connection;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [[server], [relationRows], [projectionRows]] = await Promise.all([
      connection.query('SELECT @@server_uuid AS serverUuid'),
      connection.query(`SELECT record_key AS recordKey, item_internal_name AS internalName, cached_url AS cachedUrl
FROM terria_v1_relation.relation_item_images
WHERE status=1 AND deleted=0 AND role='icon' AND is_primary=1
ORDER BY item_internal_name`),
      connection.query(`SELECT id, relation_record_key AS relationRecordKey, internal_name AS internalName, image
FROM terria_v1_relation.projection_items
WHERE status=1 AND deleted=0
ORDER BY internal_name`),
    ]);
    const evidence = buildItemImageOriginNormalizationEvidence({
      generatedAt: options.generatedAt,
      serverUuid: server[0]?.serverUuid,
      resultPath: resultEntry.path,
      resultBytes: resultEntry.bytes,
      inputPath: inputEntry.path,
      inputBytes: inputEntry.bytes,
      proposalPath: proposalEntry.path,
      proposalBytes: proposalEntry.bytes,
      relationRows,
      projectionRows,
      managedUrlPrefixes: resolveManagedImageUrlPrefixes({ repoRoot: root }),
    });
    assertItemImageOriginNormalizationEvidence(evidence);
    const outputPath = path.resolve(root, requireRelativePath(options.outputPath, 'output path'));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
    return evidence;
  } finally {
    await connection.query('ROLLBACK').catch(() => {});
    if (closeConnection) await connection.end();
  }
}

function assertOperationBindings({ result, input, proposal, proposalBytes }) {
  if (proposal.operationId !== OPERATION_ID || input.operationId !== OPERATION_ID
      || result.operationId !== OPERATION_ID || result.status !== 'COMPLETED'
      || result.transactionCommitted !== true) {
    throw new Error('origin normalization result is not the exact completed Item operation');
  }
  if (proposal.target?.table !== 'terria_v1_relation.projection_items'
      || proposal.target?.valueColumn !== 'image'
      || JSON.stringify(proposal.target?.writeTargets) !== JSON.stringify([
        'relation.relation_item_images.cached_url',
        'relation.projection_items.image',
      ])) {
    throw new Error('origin normalization proposal target drifted');
  }
  if (input.proposalSha256 !== sha256Bytes(proposalBytes)
      || input.scopeSha256 !== proposal.scopeSha256
      || result.scopeSha256 !== proposal.scopeSha256
      || input.afterRowsSha256 !== proposal.after.projectionRowsSha256
      || result.afterRowsSha256 !== proposal.after.projectionRowsSha256
      || Number(input.expectedAffectedRowCount) !== Number(result.affectedRows)) {
    throw new Error('origin normalization result/input/proposal binding drifted');
  }
}

function normalizeRelationRows(rows, prefixes) {
  const normalized = (Array.isArray(rows) ? rows : []).map((row) => {
    const value = {
      recordKey: requireText(row?.recordKey, 'relation recordKey'),
      internalName: requireText(row?.internalName, 'relation internalName'),
      cachedUrl: requireText(row?.cachedUrl, 'relation cachedUrl'),
    };
    if (!isManagedImagePath(value.cachedUrl, prefixes)) throw new Error(`relation image is unmanaged: ${value.internalName}`);
    return value;
  }).sort(compareInternalName);
  assertUnique(normalized, (row) => row.internalName, 'relation internalName');
  assertUnique(normalized, (row) => row.recordKey, 'relation recordKey');
  return normalized;
}

function normalizeProjectionRows(rows) {
  const normalized = (Array.isArray(rows) ? rows : []).map((row) => ({
    id: requirePositiveInteger(row?.id, 'projection id'),
    relationRecordKey: requireText(row?.relationRecordKey, 'projection relationRecordKey'),
    internalName: requireText(row?.internalName, 'projection internalName'),
    image: row?.image == null || row.image === '' ? null : String(row.image),
  })).sort(compareInternalName);
  assertUnique(normalized, (row) => row.internalName, 'projection internalName');
  assertUnique(normalized, (row) => row.id, 'projection id');
  return normalized;
}

function artifactBinding(filePath, bytes) {
  return { path: requireRelativePath(filePath, 'artifact path'), sha256: sha256Bytes(bytes) };
}

function readArtifact(root, relativePath, label) {
  const normalized = requireRelativePath(relativePath, `${label} path`);
  const absolute = path.resolve(root, normalized);
  if (!fs.statSync(absolute).isFile()) throw new Error(`${label} must be an ordinary file`);
  return { path: normalized, bytes: fs.readFileSync(absolute) };
}

function normalizeItemPrefixes(prefixes) {
  const result = [...new Set((Array.isArray(prefixes) ? prefixes : [])
    .map((value) => String(value ?? '').trim())
    .filter((value) => /\/items\/$/i.test(value)))].sort();
  if (!result.length) throw new Error('managed Item image URL prefixes are required');
  return result;
}

function sortedUnique(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const normalized = values.map((value) => requireText(value, label)).sort();
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicates`);
  return normalized;
}

function assertUnique(rows, accessor, label) {
  const values = rows.map(accessor);
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
}

function parseJson(value, label) {
  try { return JSON.parse(toBuffer(value, label).toString('utf8')); }
  catch { throw new Error(`${label} must be valid JSON`); }
}

function toBuffer(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value);
  throw new Error(`${label} are required`);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hashJson(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(stableValue(value))));
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function requireRelativePath(value, label) {
  const text = requireText(value, label).replaceAll('\\', '/');
  if (path.isAbsolute(text) || path.posix.normalize(text) !== text || text.startsWith('../')) {
    throw new Error(`${label} must be repository-relative`);
  }
  return text;
}

function requireSha256(value, label) {
  const text = requireText(value, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) throw new Error(`${label} must be SHA-256`);
  return text;
}

function requireUuid(value) {
  const text = requireText(value, 'serverUuid');
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(text)) throw new Error('serverUuid is invalid');
  return text;
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} is invalid`);
  return text;
}

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} is invalid`);
  return number;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function compareInternalName(left, right) {
  return left.internalName.localeCompare(right.internalName, 'en');
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [name, ...rest] = arg.slice(2).split('=');
    return [name, rest.join('=')];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const evidence = await runItemImageOriginNormalizationEvidence({
    resultPath: args.result,
    inputPath: args.input,
    proposalPath: args.proposal,
    outputPath: args.output,
    generatedAt: args['generated-at'] ?? new Date().toISOString(),
    host: args.host,
    port: args.port,
    user: args.user,
    password: args.password,
  });
  process.stdout.write(`${JSON.stringify({ output: args.output, targetRowCount: evidence.targetRowCount, projectionRowCount: evidence.projectionRowCount, evidenceSha256: evidence.evidenceSha256 })}\n`);
}
