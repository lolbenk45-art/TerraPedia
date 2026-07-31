#!/usr/bin/env node

// Apply a published item image promotion bundle to the standardized items file.
//
// The bundle is content-addressed and the contract binds it by hash, so this
// never follows a mutable latest pointer. Only the five standardized image
// fields may differ, only for items that carry no image source yet, and the
// written bytes are re-hashed before the rename. A retained secondary format is
// deliberately ignored here: the standardized record holds one image, and the
// extra rows belong to the image lineage lane.

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext
} from '../automation/authorized-operation-context.mjs';

const OPERATION_ID = 'canonical-item-image-source-promotion';
const DEFAULT_CONTRACT_PATH = 'reports/authorization/canonical/canonical-item-image-source-promotion.input.json';
const DEFAULT_RESULT_PATH = 'reports/authorization/canonical/canonical-item-image-source-promotion.result.json';
const DECISION_LEDGER_PATH = 'reports/authorization/canonical/used-decisions.json';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

const IMAGE_FIELDS = Object.freeze([
  'imageFileTitle',
  'imageUrl',
  'imageWidth',
  'imageHeight',
  'imageContentType'
]);

export function buildPromotedItemsPayload({
  standardizedBytes,
  bundleBytes,
  contract
} = {}) {
  const bundleSha256 = sha256Bytes(requireBytes(bundleBytes, 'bundleBytes'));
  const standardizedSha256 = sha256Bytes(requireBytes(standardizedBytes, 'standardizedBytes'));
  assertHashEqual(requireSha256(contract?.bundle?.sha256, 'contract bundle sha256'), bundleSha256, 'bundle');
  assertHashEqual(
    requireSha256(contract?.standardizedBefore?.sha256, 'contract standardized before sha256'),
    standardizedSha256,
    'standardized before'
  );

  const bundle = parseJsonBytes(bundleBytes, 'bundleBytes');
  const standardized = parseJsonBytes(standardizedBytes, 'standardizedBytes');
  if (bundle?.entity !== 'item_image_source_promotion_bundle') {
    throw new Error('an item image source promotion bundle is required');
  }
  const records = requireRecords(standardized?.records, 'standardized records');
  const identitySetSha256 = buildIdentitySetSha256(records);
  assertHashEqual(
    requireSha256(contract?.standardizedBefore?.identitySetSha256, 'contract identity-set sha256'),
    identitySetSha256,
    'identity-set'
  );
  if (bundle?.descriptor?.standardized?.identitySetSha256 !== identitySetSha256
      || bundle?.descriptor?.standardized?.sha256 !== standardizedSha256) {
    throw new Error('bundle descriptor does not bind these standardized bytes');
  }

  const counters = bundle?.counters ?? {};
  for (const key of ['unresolved', 'ambiguous', 'duplicate', 'conflict']) {
    if (Number(counters?.[key]) !== 0) {
      throw new Error(`bundle counters must be closed before promotion: ${key} is ${counters?.[key]}`);
    }
  }
  const rows = requireRecords(bundle?.rows, 'bundle rows');
  if (rows.length !== records.length || Number(counters?.total) !== records.length) {
    throw new Error('bundle must cover every standardized identity exactly once');
  }

  const rowsByInternalName = new Map();
  for (const row of rows) {
    const internalName = requireText(row?.itemInternalName, 'bundle row itemInternalName');
    if (rowsByInternalName.has(internalName)) {
      throw new Error(`duplicate bundle row ${internalName}`);
    }
    rowsByInternalName.set(internalName, row);
  }

  const changes = [];
  let existing = 0;
  let unchanged = 0;
  const promotedRecords = records.map((record) => {
    const internalName = requireText(record?.internalName, 'standardized internalName');
    const row = rowsByInternalName.get(internalName);
    if (!row || String(row.itemId) !== String(record.id) || row.itemName !== text(record.name)) {
      throw new Error(`bundle row identity mismatch for ${internalName}`);
    }
    const carriesSource = Boolean(text(record.imageFileTitle)) || Boolean(text(record.imageUrl));
    if (row.status === 'existing') {
      if (!carriesSource) throw new Error(`existing row ${internalName} has no standardized image source`);
      existing += 1;
      unchanged += 1;
      return record;
    }
    if (row.status !== 'promoted') {
      throw new Error(`bundle row ${internalName} is not promotable: ${row.status}`);
    }
    if (carriesSource) {
      throw new Error(`promoted row ${internalName} already carries an image source`);
    }
    const source = requireSource(row.source, internalName);
    const fields = {
      imageFileTitle: source.fileTitle,
      imageUrl: source.originalUrl,
      imageWidth: nullableNumber(source.width),
      imageHeight: nullableNumber(source.height),
      imageContentType: source.contentType
    };
    changes.push({
      itemId: record.id,
      itemInternalName: internalName,
      itemName: text(record.name),
      fields: Object.fromEntries(IMAGE_FIELDS.map((field) => [
        field,
        { before: record[field] ?? null, after: fields[field] }
      ]))
    });
    return { ...record, ...fields };
  });

  const serializedAfter = `${JSON.stringify({ ...standardized, records: promotedRecords }, null, 2)}\n`;
  assertOnlyImageFieldsChanged(records, promotedRecords);
  return {
    counters: {
      total: records.length,
      existing,
      promoted: changes.length,
      unchanged
    },
    before: { sha256: standardizedSha256, identitySetSha256 },
    after: {
      sha256: sha256Bytes(serializedAfter),
      identitySetSha256: buildIdentitySetSha256(promotedRecords)
    },
    changes,
    serializedAfter
  };
}

export async function runItemImageSourcePromotion(rawOptions = {}, dependencies = {}) {
  const repoRoot = path.resolve(rawOptions.repoRoot ?? process.cwd());
  const contractPath = path.resolve(repoRoot, rawOptions.contractPath ?? DEFAULT_CONTRACT_PATH);
  const readFile = dependencies.readFile ?? ((filePath) => fs.readFileSync(filePath));
  const rename = dependencies.rename ?? ((from, to) => fs.renameSync(from, to));
  const loadAuthorizedContext = dependencies.loadAuthorizedContext
    ?? (() => loadAuthorizedOperationContext({ operationId: OPERATION_ID }));
  const consumePermit = dependencies.consumePermit ?? ((authorizedContext) => (
    consumeAuthorizedOperationDispatchPermit({
      authorizedContext,
      decisionLedgerPath: path.join(repoRoot, DECISION_LEDGER_PATH)
    })
  ));

  const contract = parseJsonBytes(readFile(contractPath), 'contract');
  if (contract?.operationId !== OPERATION_ID) {
    throw new Error(`contract operationId must be ${OPERATION_ID}`);
  }
  const itemsPath = resolveInsideRepo(repoRoot, contract?.standardizedBefore?.path, 'standardized path');
  const bundlePath = resolveInsideRepo(repoRoot, contract?.bundle?.path, 'bundle path');
  const payload = buildPromotedItemsPayload({
    standardizedBytes: readFile(itemsPath),
    bundleBytes: readFile(bundlePath),
    contract
  });
  if (contract?.standardizedAfter?.sha256
      && contract.standardizedAfter.sha256 !== payload.after.sha256) {
    throw new Error('contract standardized after SHA-256 mismatch');
  }

  if (!rawOptions.apply) {
    return { applied: false, ...payload, serializedAfter: undefined };
  }

  // The packet must be bound to these exact bundle bytes before the one-time
  // permit is spent, so a mismatch costs nothing.
  const authorizedContext = loadAuthorizedContext();
  if (authorizedContext?.dataBundleSha256 !== contract.bundle.sha256) {
    throw new Error('authorized data bundle SHA-256 mismatch');
  }
  consumePermit(authorizedContext);

  const originalMode = fs.statSync(itemsPath).mode & 0o777;
  const serialized = dependencies.tamperSerialized
    ? dependencies.tamperSerialized(payload.serializedAfter)
    : payload.serializedAfter;
  const temporaryPath = `${itemsPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, serialized, { mode: originalMode, flag: 'wx' });
    verifyWrittenPayload(temporaryPath, payload.after);
    rename(temporaryPath, itemsPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }

  const result = {
    schemaVersion: 1,
    resultKind: 'canonical_item_image_source_promotion_result',
    operationId: OPERATION_ID,
    status: 'COMPLETED',
    generatedAt: rawOptions.generatedAt ?? new Date().toISOString(),
    decisionIdentity: authorizedContext?.decisionIdentity ?? null,
    packetHash: authorizedContext?.packetHash ?? null,
    bundle: { path: contract.bundle.path, sha256: contract.bundle.sha256 },
    standardized: { path: contract.standardizedBefore.path },
    counters: payload.counters,
    before: payload.before,
    after: payload.after,
    changes: payload.changes
  };
  const resultPath = resolveInsideRepo(
    repoRoot,
    contract.resultPath ?? DEFAULT_RESULT_PATH,
    'result path'
  );
  writePrivateJson(resultPath, result);
  return { applied: true, ...payload, serializedAfter: undefined, resultPath };
}

function verifyWrittenPayload(filePath, expected) {
  const written = fs.readFileSync(filePath);
  if (sha256Bytes(written) !== expected.sha256) {
    throw new Error('written payload SHA-256 mismatch');
  }
  const parsed = parseJsonBytes(written, 'written payload');
  if (buildIdentitySetSha256(requireRecords(parsed?.records, 'written records')) !== expected.identitySetSha256) {
    throw new Error('written payload identity-set SHA-256 mismatch');
  }
}

function assertOnlyImageFieldsChanged(before, after) {
  if (before.length !== after.length) throw new Error('promotion must not change the record count');
  const imageFields = new Set(IMAGE_FIELDS);
  for (const [index, original] of before.entries()) {
    const promoted = after[index];
    const keys = new Set([...Object.keys(original), ...Object.keys(promoted)]);
    for (const key of keys) {
      if (imageFields.has(key)) continue;
      if (canonicalJson(original[key] ?? null) !== canonicalJson(promoted[key] ?? null)) {
        throw new Error(`promotion changed non-image field ${key} on ${original?.internalName}`);
      }
    }
  }
}

function requireSource(source, internalName) {
  if (!source || typeof source !== 'object') {
    throw new Error(`promoted row ${internalName} has no source`);
  }
  if (source.authority !== 'raw_wiki_evidence') {
    throw new Error(`promoted row ${internalName} has an unsupported authority ${source.authority}`);
  }
  for (const field of ['fileTitle', 'originalUrl', 'contentType']) {
    if (!text(source[field])) {
      throw new Error(`promoted row ${internalName} source ${field} is required`);
    }
  }
  return source;
}

function writePrivateJson(outputPath, payload) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const temporary = `${outputPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, outputPath);
    fs.chmodSync(outputPath, 0o600);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function resolveInsideRepo(repoRoot, relativePath, label) {
  const value = requireText(relativePath, label);
  if (path.isAbsolute(value)) throw new Error(`${label} must be repository-relative`);
  const resolved = path.resolve(repoRoot, value);
  if (!resolved.startsWith(`${path.resolve(repoRoot)}${path.sep}`)) {
    throw new Error(`${label} must stay inside the repository`);
  }
  return resolved;
}

function buildIdentitySetSha256(records) {
  return sha256Canonical(records
    .map((record) => ({
      itemId: record?.id ?? null,
      itemInternalName: text(record?.internalName),
      itemName: text(record?.name)
    }))
    .sort((left, right) => {
      const byId = Number(left.itemId) - Number(right.itemId);
      if (Number.isFinite(byId) && byId !== 0) return byId;
      return String(left.itemInternalName).localeCompare(String(right.itemInternalName));
    }));
}

function assertHashEqual(expected, actual, label) {
  if (expected !== actual) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expected}, found ${actual}`);
  }
}

function requireSha256(value, label) {
  const normalized = requireText(value, label);
  if (!HASH_PATTERN.test(normalized)) throw new Error(`${label} must be a sha256 hash`);
  return normalized;
}

function requireBytes(value, label) {
  if (value == null) throw new Error(`${label} is required`);
  return value;
}

function parseJsonBytes(value, label) {
  if (value == null) throw new Error(`${label} is required`);
  return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
}

function requireRecords(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  return value;
}

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function requireText(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sha256Canonical(value) {
  return sha256Bytes(canonicalJson(value));
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
}

function parseArgs(argv) {
  const options = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    if (separator > 2) options[token.slice(2, separator)] = token.slice(separator + 1);
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = parseArgs(process.argv.slice(2));
  runItemImageSourcePromotion({
    repoRoot: args['repo-root'] ?? process.cwd(),
    contractPath: args['input-contract'] ?? DEFAULT_CONTRACT_PATH,
    apply: args.apply === 'true'
  }).then((result) => {
    process.stdout.write(`${JSON.stringify({
      applied: result.applied,
      counters: result.counters,
      before: result.before,
      after: result.after,
      resultPath: result.resultPath ?? null
    }, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error?.stack || error?.message || error}\n`);
    process.exitCode = 1;
  });
}
