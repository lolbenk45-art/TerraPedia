// Database-facing half of the item image lineage lane.
//
// `apply-item-image-lineage.mjs` stays free of SQL so its guarantees can be
// tested without a driver; everything that reads or writes a table lives here.
// The preview side is what the Owner approves: for each of the four layers it
// states which identities the apply will target and which existing rows it will
// replace, computed before a single mutation.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  canonicalServerFingerprint,
  hashCanonicalServerFingerprint
} from '../automation/automation-database-contract.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

export const OPERATION_ID = 'canonical-item-image-lineage-apply';
export const DATASET_TYPE = 'item_image_sources_raw';
export const OWNED_LOCAL_IMAGE_ROLE = 'icon';
export const LAYER_NAMES = Object.freeze(['landing', 'maint', 'relation', 'local']);

export function buildItemImageLineagePreviews({ bundle, existing = {} } = {}) {
  const targetKeys = readBundleIdentities(bundle);
  const owned = new Set(targetKeys);

  const layerIdentities = {
    landing: identities(existing?.landing?.identities),
    maint: identities(existing?.maint?.identities),
    relation: identities(existing?.relation?.identities),
    local: identities(existing?.local?.ownedIdentities)
  };

  const previews = {};
  const outOfScopeRetained = {};
  for (const layer of LAYER_NAMES) {
    const present = layerIdentities[layer];
    // Only rows this lane owns may be replaced. Anything else stays, and is
    // reported so the approval shows what the apply is leaving alone.
    previews[layer] = {
      targetKeys: [...targetKeys],
      deleteCandidateKeys: present.filter((key) => owned.has(key)).sort()
    };
    outOfScopeRetained[layer] = present.filter((key) => !owned.has(key)).sort();
  }

  return {
    identityCount: targetKeys.length,
    targetKeys,
    previews,
    outOfScopeRetained,
    preservedLocalRoles: identities(existing?.local?.otherRoles)
      .filter((role) => role !== OWNED_LOCAL_IMAGE_ROLE)
      .sort()
  };
}

export function buildItemImageLineageContract({
  bundleBytes,
  bundlePath,
  existing = {},
  serverFingerprint,
  generatedAt
} = {}) {
  const bytes = requireValue(bundleBytes, 'bundleBytes');
  const bundle = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes));
  const fingerprint = canonicalServerFingerprint(serverFingerprint);
  const preview = buildItemImageLineagePreviews({ bundle, existing });

  return {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    generatedAt: requireText(generatedAt, 'generatedAt'),
    lineageBundle: {
      path: requireText(bundlePath, 'bundlePath'),
      sha256: sha256Bytes(bytes)
    },
    expectedIdentityCount: preview.identityCount,
    serverFingerprint: fingerprint,
    serverFingerprintSha256: hashCanonicalServerFingerprint(fingerprint),
    previews: preview.previews,
    outOfScopeRetained: preview.outOfScopeRetained,
    preservedLocalRoles: preview.preservedLocalRoles
  };
}

export async function readItemImageLineageLayerState(connection, {
  maintDatabase,
  relationDatabase,
  localDatabase
} = {}) {
  const maint = requireIdentifier(maintDatabase, 'maintDatabase');
  const relation = requireIdentifier(relationDatabase, 'relationDatabase');
  const local = requireIdentifier(localDatabase, 'localDatabase');

  const [landingRows] = await connection.query(
    `SELECT \`payload_json\`
     FROM \`${maint}\`.\`source_dataset_landings\`
     WHERE dataset_type = '${DATASET_TYPE}' AND is_current = 1`
  );
  const landingIdentities = new Set();
  for (const row of landingRows ?? []) {
    for (const record of parsePayloadItemImages(row?.payload_json)) {
      const key = text(record?.itemInternalName);
      if (key) landingIdentities.add(key);
    }
  }

  const [maintRows] = await connection.query(
    `SELECT DISTINCT \`item_internal_name\`
     FROM \`${maint}\`.\`maint_item_images\`
     WHERE \`deleted\` = 0 AND \`item_internal_name\` IS NOT NULL AND TRIM(\`item_internal_name\`) <> ''`
  );
  const [relationRows] = await connection.query(
    `SELECT DISTINCT \`item_internal_name\`
     FROM \`${relation}\`.\`relation_item_images\`
     WHERE \`deleted\` = 0 AND \`item_internal_name\` IS NOT NULL AND TRIM(\`item_internal_name\`) <> ''`
  );
  const [localRows] = await connection.query(
    `SELECT i.\`internal_name\` AS \`internal_name\`, ii.\`role\` AS \`role\`
     FROM \`${local}\`.\`item_images\` ii
     INNER JOIN \`${local}\`.\`items\` i ON i.\`id\` = ii.\`item_id\`
     WHERE ii.\`deleted\` = 0 AND i.\`deleted\` = 0
       AND i.\`internal_name\` IS NOT NULL AND TRIM(i.\`internal_name\`) <> ''`
  );

  const localOwned = new Set();
  const localOtherRoles = new Set();
  for (const row of localRows ?? []) {
    const role = text(row?.role) ?? OWNED_LOCAL_IMAGE_ROLE;
    if (role === OWNED_LOCAL_IMAGE_ROLE) {
      const key = text(row?.internal_name);
      if (key) localOwned.add(key);
    } else {
      localOtherRoles.add(role);
    }
  }

  return {
    landing: { identities: sorted(landingIdentities) },
    maint: { identities: sorted(columnValues(maintRows, 'item_internal_name')) },
    relation: { identities: sorted(columnValues(relationRows, 'item_internal_name')) },
    local: { ownedIdentities: sorted(localOwned), otherRoles: sorted(localOtherRoles) }
  };
}

// `loadLocalStackConfig` walks up and prefers the primary worktree's file, which
// is the right answer for a dev server and the wrong one for a governed write:
// the fingerprint this operation validates must come from the tree it runs in.
export function resolveItemImageLineageRuntimeConfig({ repoRoot } = {}) {
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  const configPath = path.join(root, 'scripts', 'dev', 'config', 'local-stack.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`local stack config is required at ${configPath}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config?.npcT1ServerFingerprint) {
    throw new Error(`${configPath} has no npcT1ServerFingerprint; copy it from the tree that does`);
  }
  return {
    configPath,
    database: config.database ?? {},
    serverFingerprint: canonicalServerFingerprint(config.npcT1ServerFingerprint)
  };
}

// Read-only. Produces the artifact the Owner approves, and never touches a row.
export async function runItemImageLineagePreview({
  bundleBytes,
  bundlePath,
  outputPath,
  generatedAt,
  databases,
  expectedFingerprint,
  connect,
  writeFile
} = {}) {
  const expected = canonicalServerFingerprint(expectedFingerprint);
  const connection = await requireValue(connect, 'connect')();
  try {
    const [uuidRows] = await connection.query('SELECT @@server_uuid AS `server_uuid`');
    const serverUuid = text(uuidRows?.[0]?.server_uuid);
    if (serverUuid !== expected.serverUuid) {
      // The previews describe one specific server's rows. Approving them against
      // a different server would authorize a write nobody previewed.
      throw new Error(
        `server uuid drifted from the authorized fingerprint: expected ${expected.serverUuid}, found ${serverUuid ?? 'none'}`
      );
    }
    const existing = await readItemImageLineageLayerState(connection, databases);
    const contract = buildItemImageLineageContract({
      bundleBytes,
      bundlePath,
      existing,
      serverFingerprint: expected,
      generatedAt
    });
    requireValue(writeFile, 'writeFile')(requireText(outputPath, 'outputPath'), contract);
    return contract;
  } finally {
    await connection?.end?.();
  }
}

function readBundleIdentities(bundle) {
  if (bundle?.entity !== 'item_image_lineage_bundle' || bundle?.datasetType !== DATASET_TYPE) {
    throw new Error(`an item image lineage bundle for ${DATASET_TYPE} is required`);
  }
  const rows = bundle?.itemImages;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('lineage bundle itemImages must be a non-empty array');
  }
  const seen = new Set();
  for (const row of rows) {
    const key = requireText(row?.itemInternalName, 'lineage row itemInternalName');
    if (seen.has(key)) throw new Error(`duplicate lineage identity ${key}`);
    seen.add(key);
  }
  if (Number(bundle?.counters?.total) !== seen.size) {
    throw new Error('lineage bundle counters do not match its rows');
  }
  return sorted(seen);
}

function parsePayloadItemImages(value) {
  if (value == null) return [];
  try {
    const payload = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(payload?.itemImages) ? payload.itemImages : [];
  } catch {
    return [];
  }
}

function columnValues(rows, column) {
  const values = new Set();
  for (const row of rows ?? []) {
    const value = text(row?.[column]);
    if (value) values.add(value);
  }
  return values;
}

function identities(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => text(entry)).filter(Boolean))];
}

function sorted(value) {
  return [...value].sort();
}

function requireIdentifier(value, label) {
  const normalized = requireText(value, label);
  if (!/^[A-Za-z0-9_]+$/.test(normalized)) {
    throw new Error(`${label} must be a plain identifier`);
  }
  return normalized;
}

function requireValue(value, label) {
  if (value == null) throw new Error(`${label} is required`);
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

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
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
  try {
    const args = parseArgs(process.argv.slice(2));
    const repoRoot = getProjectRoot();
    const runtime = resolveItemImageLineageRuntimeConfig({ repoRoot });
    const bundlePath = requireText(args.bundle, 'bundle');
    const outputPath = requireText(args.output, 'output');
    const absoluteOutput = path.resolve(repoRoot, outputPath);
    if (fs.existsSync(absoluteOutput)) {
      // A previous round's contract is evidence. Overwriting it silently is how
      // the retry-03 verification report was lost.
      throw new Error(`lineage input contract already exists: ${absoluteOutput}`);
    }
    const bundleBytes = fs.readFileSync(path.resolve(repoRoot, bundlePath));
    const database = runtime.database;

    const contract = await runItemImageLineagePreview({
      bundleBytes,
      bundlePath,
      outputPath,
      generatedAt: args['generated-at'] ?? new Date().toISOString(),
      databases: {
        maintDatabase: args['maint-database'] ?? 'terria_v1_maint',
        relationDatabase: args['relation-database'] ?? 'terria_v1_relation',
        localDatabase: args['local-database'] ?? database.name ?? 'terria_v1_local'
      },
      expectedFingerprint: runtime.serverFingerprint,
      connect: async () => {
        // The driver lives with the query app, not at the repository root.
        const mysql = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'))('mysql2/promise');
        return mysql.createConnection({
          host: process.env.TERRAPEDIA_DB_HOST ?? database.host ?? '127.0.0.1',
          port: Number(process.env.TERRAPEDIA_DB_PORT ?? database.port ?? 13306),
          user: process.env.TERRAPEDIA_DB_USERNAME ?? database.username ?? 'root',
          password: process.env.TERRAPEDIA_DB_PASSWORD ?? database.password ?? 'root'
        });
      },
      writeFile: (target, payload) => {
        const resolved = path.resolve(repoRoot, target);
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
      }
    });

    process.stdout.write(`${JSON.stringify({
      output: outputPath,
      expectedIdentityCount: contract.expectedIdentityCount,
      deleteCandidateCounts: Object.fromEntries(
        LAYER_NAMES.map((layer) => [layer, contract.previews[layer].deleteCandidateKeys.length])
      ),
      outOfScopeRetainedCounts: Object.fromEntries(
        LAYER_NAMES.map((layer) => [layer, contract.outOfScopeRetained[layer].length])
      ),
      preservedLocalRoles: contract.preservedLocalRoles
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.stack || error?.message || error}\n`);
    process.exitCode = 1;
  }
}
