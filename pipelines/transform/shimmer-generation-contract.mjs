import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_FILE_NAME = 'wiki-shimmer-manifest.json';
const MANIFEST_ENTITY = 'wiki_shimmer_generation_manifest';
const MANIFEST_SCHEMA_VERSION = 1;

const PAYLOAD_SPECS = Object.freeze([
  { key: 'raw', name: 'wiki-shimmer.raw.json', entity: 'wiki_shimmer_page' },
  { key: 'context', name: 'wiki-shimmer-context.importable.json', entity: 'wiki_shimmer_context_importable' },
  { key: 'itemTransforms', name: 'wiki-shimmer-item-transforms.importable.json', entity: 'wiki_shimmer_item_transforms_importable' },
  { key: 'decraftRules', name: 'wiki-shimmer-decraft-rules.importable.json', entity: 'wiki_shimmer_decraft_rules_importable' },
  { key: 'entityTransforms', name: 'wiki-shimmer-entity-transforms.importable.json', entity: 'wiki_shimmer_entity_transforms_importable' },
  { key: 'npcTransforms', name: 'wiki-shimmer-npc-transforms.importable.json', entity: 'wiki_shimmer_npc_transforms_importable' },
  { key: 'titleResolution', name: 'wiki-shimmer-title-resolution.evidence.json', entity: 'wiki_shimmer_title_resolution' }
]);

export const SHIMMER_GENERATION_PAYLOAD_FILES = Object.freeze(PAYLOAD_SPECS.map((spec) => spec.name));
export const SHIMMER_GENERATION_FILES = Object.freeze([
  ...SHIMMER_GENERATION_PAYLOAD_FILES,
  MANIFEST_FILE_NAME
]);

export function buildShimmerGenerationManifest(options = {}) {
  return buildGenerationArtifacts(options).manifest;
}

export function publishShimmerGeneration(options = {}) {
  const artifacts = buildGenerationArtifacts(options);
  const generationRoot = requiredDirectory(options.generationRoot, 'generationRoot');
  const pointerPath = requiredPath(options.pointerPath, 'pointerPath');
  const generationPath = path.join(generationRoot, artifacts.manifest.generationId);
  const manifestPath = path.join(generationPath, MANIFEST_FILE_NAME);

  fs.mkdirSync(generationRoot, { recursive: true });
  if (fs.existsSync(generationPath)) {
    const existing = verifyShimmerGeneration({ manifestPath });
    if (existing.manifest.manifestSha256 !== artifacts.manifest.manifestSha256) {
      throw new Error(`generation directory already exists with different manifest: ${generationPath}`);
    }
    writeCurrentPointer({ pointerPath, manifest: existing.manifest, manifestPath });
    return {
      generationPath,
      manifestPath,
      manifest: existing.manifest,
      pointerPath
    };
  }

  const stagingPath = path.join(
    generationRoot,
    `.${artifacts.manifest.generationId}.${safeRunId(options.runId)}.${process.pid}.staging`
  );
  fs.mkdirSync(stagingPath, { mode: 0o700 });

  try {
    for (const payload of artifacts.payloads) {
      writeFileAndSync(path.join(stagingPath, payload.name), payload.bytes);
    }
    const stagingManifestPath = path.join(stagingPath, MANIFEST_FILE_NAME);
    writeFileAndSync(stagingManifestPath, canonicalJsonBytes(artifacts.manifest));
    fsyncDirectory(stagingPath);

    options.beforeVerify?.({
      generationPath: stagingPath,
      manifestPath: stagingManifestPath
    });
    verifyShimmerGeneration({ manifestPath: stagingManifestPath });

    fs.renameSync(stagingPath, generationPath);
    fsyncDirectory(generationRoot);
    verifyShimmerGeneration({ manifestPath });
    writeCurrentPointer({ pointerPath, manifest: artifacts.manifest, manifestPath });

    return {
      generationPath,
      manifestPath,
      manifest: artifacts.manifest,
      pointerPath
    };
  } catch (error) {
    fs.rmSync(stagingPath, { recursive: true, force: true });
    throw error;
  }
}

export function verifyShimmerGeneration({ manifestPath } = {}) {
  const resolvedManifestPath = requiredPath(manifestPath, 'manifestPath');
  if (path.basename(resolvedManifestPath) !== MANIFEST_FILE_NAME) {
    throw new Error(`generation manifest must be named ${MANIFEST_FILE_NAME}`);
  }
  const generationPath = path.dirname(resolvedManifestPath);
  const manifest = readJsonFile(resolvedManifestPath, 'generation manifest');

  assertEqual(MANIFEST_SCHEMA_VERSION, manifest?.schemaVersion, 'manifest schema version');
  assertEqual(MANIFEST_ENTITY, manifest?.entity, 'manifest entity');
  assertSha256(manifest?.manifestSha256, 'manifest hash');
  assertHashEqual(
    manifest.manifestSha256,
    sha256Canonical(withoutField(manifest, 'manifestSha256')),
    'manifest hash'
  );
  assertIsoTimestamp(manifest?.generatedAt, 'manifest generatedAt');
  assertGenerationId(manifest?.generationId);
  assertSha256(manifest?.dataBundleSha256, 'data bundle hash');
  assertSha256(manifest?.producerCodeSha256, 'producer code hash');
  assertNonEmptyText(manifest?.tableRoleVersion, 'table role version');
  const standardizedInputs = normalizeStandardizedInputs(manifest?.standardizedInputs);
  const langlinks = normalizeLanglinkDescriptor(manifest?.langlinks);

  const descriptorByName = verifyFileDescriptors({ manifest, generationPath });
  const rawDescriptor = buildRawDescriptor({
    descriptor: descriptorByName.get(PAYLOAD_SPECS[0].name),
    rawBytes: readGenerationFile(generationPath, PAYLOAD_SPECS[0].name)
  });
  assertCanonicalEqual(rawDescriptor, manifest.raw, 'raw descriptor');

  const inputDescriptor = buildGenerationInputDescriptor({
    raw: rawDescriptor,
    standardizedInputs,
    langlinks,
    tableRoleVersion: manifest.tableRoleVersion,
    producerCodeSha256: manifest.producerCodeSha256,
    files: manifest.files
  });
  const expectedGenerationId = sha256Canonical(inputDescriptor).slice('sha256:'.length);
  assertEqual(expectedGenerationId, manifest.generationId, 'generation id');

  const bundleDescriptor = buildBundleDescriptor({
    generationId: manifest.generationId,
    inputDescriptor
  });
  assertHashEqual(
    manifest.dataBundleSha256,
    sha256Canonical(bundleDescriptor),
    'data bundle hash'
  );

  return {
    valid: true,
    generationPath,
    manifestPath: resolvedManifestPath,
    manifest
  };
}

function buildGenerationArtifacts(options) {
  const rawBytes = requiredBytes(options.rawBytes, 'rawBytes');
  const rawPayload = parseJsonBytes(rawBytes, 'rawBytes');
  const standardizedInputs = normalizeStandardizedInputs(options.standardizedInputs);
  const langlinks = buildLanglinkDescriptor(requiredBytes(options.langlinkEvidenceBytes, 'langlinkEvidenceBytes'));
  const producerCodeSha256 = String(options.producerCodeSha256 ?? '');
  assertSha256(producerCodeSha256, 'producerCodeSha256');
  const tableRoleVersion = assertNonEmptyText(options.tableRoleVersion, 'tableRoleVersion');
  const generatedAt = assertIsoTimestamp(options.generatedAt, 'generatedAt');

  const payloads = [];
  for (const spec of PAYLOAD_SPECS) {
    const bytes = spec.key === 'raw'
      ? rawBytes
      : canonicalJsonBytes(normalizeShardPayload(spec, options.shards?.[spec.key]));
    const payload = spec.key === 'raw'
      ? rawPayload
      : parseJsonBytes(bytes, `${spec.key} payload`);
    payloads.push({
      name: spec.name,
      bytes,
      descriptor: buildFileDescriptor({ spec, payload, bytes })
    });
  }

  const raw = buildRawDescriptor({
    descriptor: payloads[0].descriptor,
    rawBytes
  });
  const files = payloads.map((payload) => payload.descriptor);
  const inputDescriptor = buildGenerationInputDescriptor({
    raw,
    standardizedInputs,
    langlinks,
    tableRoleVersion,
    producerCodeSha256,
    files
  });
  const generationId = sha256Canonical(inputDescriptor).slice('sha256:'.length);
  const dataBundleSha256 = sha256Canonical(buildBundleDescriptor({ generationId, inputDescriptor }));
  const manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    entity: MANIFEST_ENTITY,
    generationId,
    generatedAt,
    raw,
    standardizedInputs,
    langlinks,
    tableRoleVersion,
    producerCodeSha256,
    files,
    dataBundleSha256
  };
  manifest.manifestSha256 = sha256Canonical(manifest);

  return { manifest, payloads };
}

function buildFileDescriptor({ spec, payload, bytes }) {
  if (spec.key === 'raw') {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('raw payload must be an object');
    }
    return {
      name: spec.name,
      path: spec.name,
      entity: spec.entity,
      recordCount: 1,
      byteLength: bytes.length,
      sha256: sha256Bytes(bytes)
    };
  }
  const entity = assertNonEmptyText(payload?.entity, `${spec.key} payload entity`);
  assertEqual(spec.entity, entity, `${spec.key} payload entity`);
  const records = payload?.records;
  if (!Array.isArray(records)) {
    throw new Error(`${spec.key} payload records must be an array`);
  }
  return {
    name: spec.name,
    path: spec.name,
    entity,
    recordCount: records.length,
    byteLength: bytes.length,
    sha256: sha256Bytes(bytes)
  };
}

function buildRawDescriptor({ descriptor, rawBytes }) {
  const raw = parseJsonBytes(rawBytes, 'raw generation payload');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('raw generation payload must be an object');
  }
  const html = raw.html;
  if (typeof html !== 'string') {
    throw new Error('raw generation payload must include html text');
  }
  return {
    ...descriptor,
    pageTitle: optionalText(raw.pageTitle),
    pageId: nullableInteger(raw.pageId),
    revisionId: nullableInteger(raw.revisionId),
    revisionTimestamp: optionalText(raw.revisionTimestamp),
    htmlSha256: sha256Bytes(Buffer.from(html, 'utf8')),
    htmlLength: Buffer.byteLength(html, 'utf8')
  };
}

function buildLanglinkDescriptor(bytes) {
  const payload = parseJsonBytes(bytes, 'langlinkEvidenceBytes');
  const records = Array.isArray(payload) ? payload : payload?.records;
  if (!Array.isArray(records)) {
    throw new Error('langlinkEvidenceBytes must contain a records array');
  }
  return {
    sha256: sha256Bytes(bytes),
    byteLength: bytes.length,
    recordCount: records.length,
    responseSha256: optionalSha256(payload?.responseSha256, 'langlink response hash')
  };
}

function buildGenerationInputDescriptor({ raw, standardizedInputs, langlinks, tableRoleVersion, producerCodeSha256, files }) {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    raw,
    standardizedInputs,
    langlinks,
    tableRoleVersion,
    producerCodeSha256,
    files
  };
}

function buildBundleDescriptor({ generationId, inputDescriptor }) {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generationId,
    raw: inputDescriptor.raw,
    standardizedInputs: inputDescriptor.standardizedInputs,
    langlinks: inputDescriptor.langlinks,
    tableRoleVersion: inputDescriptor.tableRoleVersion,
    producerCodeSha256: inputDescriptor.producerCodeSha256,
    files: inputDescriptor.files
  };
}

function normalizeShardPayload(spec, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${spec.key} shard payload must be an object`);
  }
  const entity = assertNonEmptyText(value.entity, `${spec.key} shard payload entity`);
  assertEqual(spec.entity, entity, `${spec.key} shard payload entity`);
  if (!Array.isArray(value.records)) {
    throw new Error(`${spec.key} shard payload records must be an array`);
  }
  return value;
}

function normalizeStandardizedInputs(value) {
  const normalized = {};
  for (const key of ['items', 'npcs']) {
    const descriptor = value?.[key];
    const filePath = assertNonEmptyText(descriptor?.path, `standardized ${key} path`);
    const sha256 = String(descriptor?.sha256 ?? '');
    assertSha256(sha256, `standardized ${key} hash`);
    normalized[key] = { path: filePath, sha256 };
  }
  return normalized;
}

function normalizeLanglinkDescriptor(value) {
  const sha256 = String(value?.sha256 ?? '');
  assertSha256(sha256, 'langlink hash');
  const byteLength = nonNegativeInteger(value?.byteLength, 'langlink byte length');
  const recordCount = nonNegativeInteger(value?.recordCount, 'langlink record count');
  return {
    sha256,
    byteLength,
    recordCount,
    responseSha256: optionalSha256(value?.responseSha256, 'langlink response hash')
  };
}

function verifyFileDescriptors({ manifest, generationPath }) {
  if (!Array.isArray(manifest?.files) || manifest.files.length !== PAYLOAD_SPECS.length) {
    throw new Error(`generation manifest must describe ${PAYLOAD_SPECS.length} payload files`);
  }
  const descriptorByName = new Map();
  for (const [index, spec] of PAYLOAD_SPECS.entries()) {
    const descriptor = manifest.files[index];
    assertEqual(spec.name, descriptor?.name, 'generation file name');
    assertEqual(spec.name, descriptor?.path, 'generation file path');
    assertEqual(spec.entity, descriptor?.entity, 'generation file entity');
    assertSha256(descriptor?.sha256, `generation file hash for ${spec.name}`);
    nonNegativeInteger(descriptor?.byteLength, `generation file byte length for ${spec.name}`);
    nonNegativeInteger(descriptor?.recordCount, `generation file record count for ${spec.name}`);
    const childPath = resolveGenerationChildPath(generationPath, descriptor.path);
    const bytes = readGenerationFile(generationPath, descriptor.path);
    assertHashEqual(descriptor.sha256, sha256Bytes(bytes), `generation file hash for ${spec.name}`);
    assertEqual(descriptor.byteLength, bytes.length, `generation file byte length for ${spec.name}`);
    const payload = parseJsonBytes(bytes, `generation file ${spec.name}`);
    if (spec.key === 'raw') {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('raw generation payload must be an object');
      }
      assertEqual(1, descriptor.recordCount, `generation file record count for ${spec.name}`);
    } else {
      assertEqual(spec.entity, payload?.entity, `generation file entity for ${spec.name}`);
      if (!Array.isArray(payload?.records)) {
        throw new Error(`generation file records must be an array: ${spec.name}`);
      }
      assertEqual(descriptor.recordCount, payload.records.length, `generation file record count for ${spec.name}`);
    }
    if (descriptorByName.has(spec.name)) {
      throw new Error(`duplicate generation file descriptor: ${spec.name}`);
    }
    descriptorByName.set(spec.name, { ...descriptor, path: path.relative(generationPath, childPath) });
  }
  return descriptorByName;
}

function writeCurrentPointer({ pointerPath, manifest, manifestPath }) {
  const resolvedPointerPath = path.resolve(pointerPath);
  const relativeManifestPath = path.relative(path.dirname(resolvedPointerPath), manifestPath).replaceAll('\\', '/');
  writeFileAtomically(resolvedPointerPath, canonicalJsonBytes({
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    entity: 'wiki_shimmer_current_generation',
    generationId: manifest.generationId,
    manifestPath: relativeManifestPath,
    manifestSha256: manifest.manifestSha256,
    dataBundleSha256: manifest.dataBundleSha256,
    generatedAt: manifest.generatedAt
  }));
}

function writeFileAtomically(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  try {
    writeFileAndSync(temporaryPath, bytes);
    fs.renameSync(temporaryPath, filePath);
    fsyncDirectory(path.dirname(filePath));
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function writeFileAndSync(filePath, bytes) {
  const descriptor = fs.openSync(filePath, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function fsyncDirectory(directoryPath) {
  let descriptor;
  try {
    descriptor = fs.openSync(directoryPath, 'r');
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!['EINVAL', 'EPERM', 'EISDIR'].includes(String(error?.code ?? ''))) {
      throw error;
    }
  } finally {
    if (descriptor != null) fs.closeSync(descriptor);
  }
}

function readGenerationFile(generationPath, fileName) {
  const childPath = resolveGenerationChildPath(generationPath, fileName);
  if (!fs.existsSync(childPath)) {
    throw new Error(`missing generation file: ${fileName}`);
  }
  const stat = fs.lstatSync(childPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`generation file must be a regular file: ${fileName}`);
  }
  return fs.readFileSync(childPath);
}

function resolveGenerationChildPath(generationPath, relativePath) {
  const name = String(relativePath ?? '');
  if (!SHIMMER_GENERATION_PAYLOAD_FILES.includes(name)) {
    throw new Error(`generation file path is not allowed: ${name}`);
  }
  const root = path.resolve(generationPath);
  const childPath = path.resolve(root, name);
  const relative = path.relative(root, childPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`generation file path escapes the generation directory: ${name}`);
  }
  return childPath;
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (error) {
    throw new Error(`${label} must contain valid JSON: ${error?.message ?? error}`);
  }
}

function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing ${label}: ${filePath}`);
  }
  return parseJsonBytes(fs.readFileSync(filePath), label);
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

function canonicalJson(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON does not support non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  throw new Error(`canonical JSON does not support ${typeof value}`);
}

function sha256Canonical(value) {
  return sha256Bytes(Buffer.from(canonicalJson(value), 'utf8'));
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function withoutField(value, field) {
  const result = { ...value };
  delete result[field];
  return result;
}

function assertCanonicalEqual(expected, actual, label) {
  if (canonicalJson(expected) !== canonicalJson(actual)) {
    throw new Error(`${label} mismatch`);
  }
}

function assertHashEqual(expected, actual, label) {
  if (expected !== actual) {
    throw new Error(`${label.replace(/ hash$/, '')} hash mismatch: expected ${expected}, actual ${actual}`);
  }
}

function assertSha256(value, label) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(value ?? ''))) {
    throw new Error(`${label} must be a sha256 hash`);
  }
}

function optionalSha256(value, label) {
  if (value == null) return null;
  const text = String(value);
  assertSha256(text, label);
  return text;
}

function assertGenerationId(value) {
  if (!/^[a-f0-9]{64}$/.test(String(value ?? ''))) {
    throw new Error('generation id must be a SHA-256 hex value');
  }
}

function assertIsoTimestamp(value, label) {
  const text = assertNonEmptyText(value, label);
  if (Number.isNaN(Date.parse(text))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return text;
}

function assertNonEmptyText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return number;
}

function nullableInteger(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function assertEqual(expected, actual, label) {
  if (expected !== actual) {
    throw new Error(`${label} mismatch: expected ${expected}, actual ${actual}`);
  }
}

function requiredBytes(value, label) {
  if (value == null) throw new Error(`${label} is required`);
  return Buffer.from(value);
}

function requiredDirectory(value, label) {
  return path.resolve(assertNonEmptyText(value, label));
}

function requiredPath(value, label) {
  return path.resolve(assertNonEmptyText(value, label));
}

function safeRunId(value) {
  const text = String(value ?? 'run').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
  return text || 'run';
}
