import { buildArmorSourceEvidenceTransition } from '../landing/armor-source-evidence-transition.mjs';
import { buildArmorCanonicalMaintCandidate } from '../maint/armor-canonical-maint-candidate.mjs';
import { buildArmorCanonicalLandingMaintIntent } from './armor-canonical-landing-maint-intent.mjs';
import { buildArmorCanonicalProjectionIdIndependentCandidate } from './armor-canonical-projection-candidate.mjs';
import { buildArmorCanonicalFullChainIntent } from './armor-canonical-full-chain-intent.mjs';
import { resolveManagedImageUrlPrefixes } from './managed-image-url-policy.mjs';
import { isArmorItemEffectMaintRow } from '../maint/armor-item-effect-source-reader.mjs';

const ARMOR_LANDING_QUERY_KEY = 'local.source_dataset_landings|partition:armor';
const DEFAULT_DATABASES = Object.freeze({
  local: 'terria_v1_local',
  maint: 'terria_v1_maint',
  relation: 'terria_v1_relation',
});
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

function resolveDatabases(databaseNames = DEFAULT_DATABASES) {
  if (!databaseNames || typeof databaseNames !== 'object' || Array.isArray(databaseNames)) {
    throw new Error('Armor locked snapshot database names are required');
  }
  const resolved = {};
  for (const role of ['local', 'maint', 'relation']) {
    const name = databaseNames[role];
    if (typeof name !== 'string' || !IDENTIFIER.test(name)) {
      throw new Error(`Armor locked snapshot ${role} database name is invalid`);
    }
    resolved[role] = name;
  }
  return Object.freeze(resolved);
}

// These are complete snapshots, not write ownership.  The transaction uses a
// share lock for dependencies and a write lock for Armor-owned baselines so a
// candidate cannot be rederived from a row set that changes before DML.
export const ARMOR_CANONICAL_LOCKED_SNAPSHOT_TABLES = Object.freeze([
  { key: 'maintItems', qualified: 'terria_v1_maint.maint_items', role: 'maint', table: 'maint_items', section: 'maintItems' },
  { key: 'maint_item_effect_landings', qualified: 'terria_v1_maint.source_dataset_landings', role: 'maint', table: 'source_dataset_landings', section: 'itemEffectLandings', where: "dataset_type = 'armor_item_effects_raw' AND is_current = 1" },
  { key: 'maint_item_effect_attributes', qualified: 'terria_v1_maint.maint_armor_attribute_rows', role: 'maint', table: 'maint_armor_attribute_rows', section: 'itemEffectAttributes', where: 'status = 1 AND deleted = 0' },
  { key: 'maint_armor_sets', qualified: 'terria_v1_maint.maint_armor_sets', role: 'maint', table: 'maint_armor_sets', section: 'currentRows' },
  { key: 'maint_armor_set_images', qualified: 'terria_v1_maint.maint_armor_set_images', role: 'maint', table: 'maint_armor_set_images', section: 'currentRows' },
  { key: 'relation_items', qualified: 'terria_v1_relation.relation_items', role: 'relation', table: 'relation_items', section: 'dependencyRows' },
  { key: 'relation_item_images', qualified: 'terria_v1_relation.relation_item_images', role: 'relation', table: 'relation_item_images', section: 'dependencyRows' },
  { key: 'relation_armor_attribute_rows', qualified: 'terria_v1_relation.relation_armor_attribute_rows', role: 'relation', table: 'relation_armor_attribute_rows', section: 'dependencyRows' },
  { key: 'relation_equipment_effect_attributes', qualified: 'terria_v1_relation.relation_equipment_effect_attributes', role: 'relation', table: 'relation_equipment_effect_attributes', section: 'dependencyRows' },
  { key: 'relation_armor_sets', qualified: 'terria_v1_relation.relation_armor_sets', role: 'relation', table: 'relation_armor_sets', section: 'currentRows' },
  { key: 'relation_armor_set_items', qualified: 'terria_v1_relation.relation_armor_set_items', role: 'relation', table: 'relation_armor_set_items', section: 'currentRows' },
  { key: 'relation_armor_set_images', qualified: 'terria_v1_relation.relation_armor_set_images', role: 'relation', table: 'relation_armor_set_images', section: 'currentRows' },
  { key: 'projection_armor_sets', qualified: 'terria_v1_relation.projection_armor_sets', role: 'relation', table: 'projection_armor_sets', section: 'projectionRows' },
  { key: 'projection_item_armor_attributes', qualified: 'terria_v1_relation.projection_item_armor_attributes', role: 'relation', table: 'projection_item_armor_attributes', section: 'consumerRows' },
  { key: 'projection_equipment_effect_attributes', qualified: 'terria_v1_relation.projection_equipment_effect_attributes', role: 'relation', table: 'projection_equipment_effect_attributes', section: 'consumerRows' },
  { key: 'items', qualified: 'terria_v1_local.items', role: 'local', table: 'items', section: 'consumerRows' },
  { key: 'item_images', qualified: 'terria_v1_local.item_images', role: 'local', table: 'item_images', section: 'consumerRows' },
]);

const READ_LOCK = 'FOR SHARE';

function clone(value) {
  return structuredClone(value);
}

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is required`);
  return value;
}

function hash(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function rowsFromResult(result, entry) {
  if (!Array.isArray(result) || !Array.isArray(result[0])) {
    throw new Error(`Armor locked snapshot query did not return rows: ${entry.qualified}`);
  }
  return clone(result[0]);
}

async function readRows(connection, entry, databases) {
  if (typeof connection?.query !== 'function') throw new Error('Armor locked snapshot connection query capability is required');
  const qualified = `\`${databases[entry.role]}\`.\`${entry.table}\``;
  const where = entry.where ? ` WHERE ${entry.where}` : '';
  const result = await connection.query(`SELECT * FROM ${qualified}${where} ORDER BY id ${READ_LOCK}`);
  return rowsFromResult(result, { ...entry, qualified });
}

function rowsFor(lockedRows, key) {
  if (!(lockedRows instanceof Map)) return null;
  const value = lockedRows.get(key);
  return Array.isArray(value) ? clone(value) : null;
}

function assign(snapshot, entry, rows) {
  if (entry.section === 'maintItems') snapshot.maintItems = rows;
  else if (entry.section === 'projectionRows') snapshot.projectionRows = rows;
  else snapshot[entry.section][entry.table] = rows;
}

/**
 * Read all baselines/dependencies needed by the Armor candidate builders from
 * the transaction connection. The caller may provide the already locked
 * landing partition captured by the transaction executor; otherwise this
 * helper acquires the same partition lock itself.
 */
export async function readArmorCanonicalLockedSnapshot({ connection, lockedRows, landingRows, databaseNames = DEFAULT_DATABASES } = {}) {
  const databases = resolveDatabases(databaseNames);
  const snapshot = {
    landingRows: landingRows ? clone(landingRows) : rowsFor(lockedRows, ARMOR_LANDING_QUERY_KEY),
    maintItems: [],
    maintRows: {},
    itemEffectSources: { maintLandings: [], maintArmorAttributeRows: [] },
    relationRows: {},
    projectionRows: [],
    dependencyRows: {},
    consumerRows: {},
  };
  if (!snapshot.landingRows) {
    if (typeof connection?.query !== 'function') throw new Error('Armor locked snapshot connection query capability is required');
    const result = await connection.query(
      `SELECT * FROM \`${databases.local}\`.source_dataset_landings WHERE dataset_type IN (?, ?) ORDER BY id FOR UPDATE`,
      ['armor_sets_raw', 'armor_set_images_raw'],
    );
    snapshot.landingRows = rowsFromResult(result, { qualified: 'terria_v1_local.source_dataset_landings' });
  }
  if (!Array.isArray(snapshot.landingRows)) throw new Error('Armor locked landing partition is required');

  for (const entry of ARMOR_CANONICAL_LOCKED_SNAPSHOT_TABLES) {
    const prelocked = rowsFor(lockedRows, `${entry.role}.${entry.table}`);
    const rows = prelocked ?? await readRows(connection, entry, databases);
    if (entry.section === 'maintItems') snapshot.maintItems = rows;
    else if (entry.section === 'itemEffectLandings') snapshot.itemEffectSources.maintLandings = rows;
    else if (entry.section === 'itemEffectAttributes') {
      snapshot.itemEffectSources.maintArmorAttributeRows = rows.filter(isArmorItemEffectMaintRow);
    }
    else if (entry.section === 'projectionRows') snapshot.projectionRows = rows;
    else if (entry.section === 'currentRows') {
      const target = entry.role === 'maint' ? snapshot.maintRows : snapshot.relationRows;
      target[entry.table] = rows;
    } else snapshot[entry.section][entry.table] = rows;
  }
  return snapshot;
}

function defaultBuilders() {
  return {
    buildArmorSourceEvidenceTransition,
    buildArmorCanonicalMaintCandidate,
    buildArmorCanonicalLandingMaintIntent,
    buildArmorCanonicalProjectionIdIndependentCandidate,
    buildArmorCanonicalFullChainIntent,
  };
}

function expectedInput(expected) {
  const candidate = expected?.relationIntent?.candidateSnapshot;
  const input = candidate?.inputSnapshots?.relationInput;
  if (!input?.maintInput || !Array.isArray(input.maintInput.landingRows)) {
    throw new Error('Armor packet is missing the frozen source landing graph');
  }
  if (input.maintInput.landingRows.length !== 2) throw new Error('Armor packet source landing graph must contain both datasets');
  return { candidate, input };
}

function runtimePrefixes(expected, configured) {
  const packetPrefixes = expected?.relationIntent?.candidateSnapshot?.managedImageUrlPrefixes;
  const prefixes = configured ?? resolveManagedImageUrlPrefixes();
  if (!Array.isArray(prefixes) || prefixes.length === 0) throw new Error('Armor runtime managed image prefixes are required');
  if (!Array.isArray(packetPrefixes) || !equal([...prefixes].sort(), [...packetPrefixes].sort())) {
    throw new Error('Armor locked rederivation managed image policy drifted from packet');
  }
  return [...prefixes].sort();
}

export function createArmorCanonicalLockedRederivation({
  expected,
  repoRoot,
  managedImageUrlPrefixes,
  databaseNames = DEFAULT_DATABASES,
  builders = defaultBuilders(),
} = {}) {
  const databases = resolveDatabases(databaseNames);
  plain(expected, 'Armor locked rederivation expected intent');
  hash(expected.fullChainSha256, 'Armor locked rederivation full-chain hash');
  const { candidate, input } = expectedInput(expected);
  for (const name of [
    'buildArmorSourceEvidenceTransition',
    'buildArmorCanonicalMaintCandidate',
    'buildArmorCanonicalLandingMaintIntent',
    'buildArmorCanonicalProjectionIdIndependentCandidate',
    'buildArmorCanonicalFullChainIntent',
  ]) {
    if (typeof builders[name] !== 'function') throw new Error(`Armor locked rederivation builder is missing: ${name}`);
  }
  const prefixes = runtimePrefixes(expected, managedImageUrlPrefixes ?? resolveManagedImageUrlPrefixes({ repoRoot }));

  return async function deriveLocked({ connection, lockedRows, packet } = {}) {
    const snapshot = await readArmorCanonicalLockedSnapshot({ connection, lockedRows, databaseNames: databases });
    const transition = await builders.buildArmorSourceEvidenceTransition({
      currentRows: snapshot.landingRows,
      incomingRows: input.maintInput.landingRows,
    });
    const maintCandidate = await builders.buildArmorCanonicalMaintCandidate({
      landingRows: input.maintInput.landingRows,
      currentRows: snapshot.maintRows,
      managedImageUrlPrefixes: prefixes,
      allowUnmaterializedLandingIds: true,
      materializedLandingIdentities: input.maintInput.landingRows.map((row) => [
        row.dataset_type, row.provider, row.source_key, row.source_page,
      ].join('|')),
    });
    const landingMaintIntent = await builders.buildArmorCanonicalLandingMaintIntent({
      landingCurrentRows: snapshot.landingRows,
      landingTransition: transition,
      maintBaselineRows: snapshot.maintRows,
      maintCandidate,
      writeTimestamp: expected.writeTimestamp,
    });
    const relationInput = {
      landingCurrentRows: snapshot.landingRows,
      maintInput: {
        landingRows: input.maintInput.landingRows,
        currentRows: landingMaintIntent.snapshots.maintBaselineRows,
        managedImageUrlPrefixes: prefixes,
        allowUnmaterializedLandingIds: true,
      },
      maintItems: snapshot.maintItems,
      currentRows: snapshot.relationRows,
    };
    const projectionCandidate = await builders.buildArmorCanonicalProjectionIdIndependentCandidate({
      relationInput,
      currentRows: { projection_armor_sets: snapshot.projectionRows },
      dependencyRows: snapshot.dependencyRows,
      consumerRows: snapshot.consumerRows,
      itemEffectSources: snapshot.itemEffectSources,
      ...(Object.hasOwn(candidate.inputSnapshots, 'defenseAuthority')
        ? { defenseAuthority: candidate.inputSnapshots.defenseAuthority } : {}),
      ...(Object.hasOwn(candidate.inputSnapshots, 'unresolvedSourceEffects')
        ? { unresolvedSourceEffects: candidate.inputSnapshots.unresolvedSourceEffects } : {}),
      ...(Object.hasOwn(candidate.inputSnapshots, 'allowPartialApply')
        ? { allowPartialApply: candidate.inputSnapshots.allowPartialApply } : {}),
      ...(Object.hasOwn(candidate.inputSnapshots, 'unresolvedRowsMustRemainUntouched')
        ? { unresolvedRowsMustRemainUntouched: candidate.inputSnapshots.unresolvedRowsMustRemainUntouched } : {}),
      managedImageUrlPrefixes: prefixes,
    });
    const rebuilt = await builders.buildArmorCanonicalFullChainIntent({
      landingMaintIntent,
      projectionCandidate,
      writeTimestamp: expected.writeTimestamp,
    });
    if (rebuilt.fullChainSha256 !== expected.fullChainSha256) {
      const error = new Error('Armor locked rederivation full-chain hash drifted from packet intent');
      error.expectedFullChainSha256 = expected.fullChainSha256;
      error.rederivedFullChainSha256 = rebuilt.fullChainSha256;
      error.rebuiltComponentHashes = {
        landingMaintIntent: rebuilt.landingMaintIntent?.intentSha256,
        relationIntent: rebuilt.relationIntent?.intentSha256,
        projectionCandidate: rebuilt.relationIntent?.candidateSnapshot?.candidateSha256,
        recoveryIntent: rebuilt.recoveryIntent?.intentSha256,
        sourceSnapshot: rebuilt.landingMaintIntent?.sourceSnapshotSha256,
        maintBaseline: rebuilt.landingMaintIntent?.baselineSha256,
        relationBaseline: rebuilt.relationIntent?.relationBaselineSha256,
        relationInput: rebuilt.relationIntent?.relationInputSha256,
        dependencySnapshot: rebuilt.relationIntent?.dependencySnapshotSha256,
        consumerSnapshot: rebuilt.relationIntent?.consumerSnapshotSha256,
      };
      error.expectedComponentHashes = {
        landingMaintIntent: expected.landingMaintIntent?.intentSha256,
        relationIntent: expected.relationIntent?.intentSha256,
        projectionCandidate: expected.relationIntent?.candidateSnapshot?.candidateSha256,
        recoveryIntent: expected.recoveryIntent?.intentSha256,
        sourceSnapshot: expected.landingMaintIntent?.sourceSnapshotSha256,
        maintBaseline: expected.landingMaintIntent?.baselineSha256,
        relationBaseline: expected.relationIntent?.relationBaselineSha256,
        relationInput: expected.relationIntent?.relationInputSha256,
        dependencySnapshot: expected.relationIntent?.dependencySnapshotSha256,
        consumerSnapshot: expected.relationIntent?.consumerSnapshotSha256,
      };
      throw error;
    }
    return rebuilt;
  };
}
