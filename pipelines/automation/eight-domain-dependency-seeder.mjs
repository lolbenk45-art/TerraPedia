import { createHash } from 'node:crypto';

const DOMAINS = Object.freeze({
  items: new Set([
    'local.source_dataset_landings', 'local.items',
    'local.npcs', 'maint.maint_items', 'maint.maint_item_categories',
  ]),
  npcs: new Set(['local.items', 'local.item_categories', 'local.category']),
  projectiles: new Set(['local.items', 'local.npcs', 'maint.maint_items', 'maint.maint_npcs']),
  audio: new Set(['local.items', 'local.npcs']),
  bosses: new Set(['local.items', 'local.npcs', 'maint.maint_items', 'maint.maint_npcs']),
  armor_sets: new Set(['local.items', 'maint.maint_items']),
  buffs: new Set(['local.items', 'local.npcs', 'maint.maint_items', 'maint.maint_npcs']),
  shimmer: new Set(['local.items', 'local.npcs', 'maint.maint_items', 'maint.maint_npcs']),
});
const DATABASE_ROLES = Object.freeze(['local', 'maint', 'relation']);
const FORMAL_DATABASES = new Set(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']);
const IDENTIFIER = /^[a-z][a-z0-9_]{0,63}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new Error(`${label} is not a safe identifier`);
  return value;
}

function requireDependencyId(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value)) {
    throw new Error('dependency ID is not a safe identifier');
  }
  return value;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function hashRow(row) {
  return `sha256:${createHash('sha256').update(canonicalJson(row), 'utf8').digest('hex')}`;
}

export function dependencyManifestSha256(manifest) {
  return `sha256:${createHash('sha256').update(canonicalJson(manifest), 'utf8').digest('hex')}`;
}

function keyFor(row, keyColumns) {
  const key = Object.fromEntries(keyColumns.map((column) => [column, row[column]]));
  return canonicalJson(key);
}

function sqlLiteral(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value !== 'string') throw new Error('dependency key values must be scalar SQL values');
  const hex = Buffer.from(value, 'utf8').toString('hex');
  return `CONVERT(0x${hex} USING utf8mb4)`;
}

function dependencyPath(role, table) {
  return `${role}.${table}`;
}

function validateTargetDatabase(database, role, runKey) {
  const name = requireIdentifier(database, `${role} target database`);
  if (FORMAL_DATABASES.has(name) || !name.startsWith(`terria_v1_automation_acceptance_${runKey}_`)
      || !name.endsWith(`_${role}`)) {
    throw new Error(`dependency target database is formal or outside the exact run-derived ${role} schema`);
  }
  return name;
}

export function validateDependencyManifest(value, { databases } = {}) {
  const manifest = requireObject(value, 'dependency manifest');
  if (manifest.schemaVersion !== 1 || !DOMAINS[manifest.domain]
      || !/^[a-z0-9][a-z0-9_-]{2,100}$/.test(manifest.runId ?? '')
      || !/^e8p_[0-9a-f]{16}$/.test(manifest.runKey ?? '')
      || !Array.isArray(manifest.dependencies)) {
    throw new Error('dependency manifest identity or schema is invalid');
  }
  if (databases) {
    requireObject(databases, 'target databases');
    if (Object.keys(databases).sort().join(',') !== [...DATABASE_ROLES].sort().join(',')) {
      throw new Error('dependency target must be the exact local, maint, and relation schema set');
    }
    for (const role of DATABASE_ROLES) validateTargetDatabase(databases[role], role, manifest.runKey);
  }
  if (manifest.dependencies.length === 0) throw new Error('dependency manifest cannot be empty');
  const ids = new Set();
  const paths = new Map();
  for (const [index, raw] of manifest.dependencies.entries()) {
    const entry = requireObject(raw, `dependency ${index}`);
    const id = requireDependencyId(entry.id);
    if (ids.has(id)) throw new Error(`duplicate dependency ID: ${id}`);
    ids.add(id);
    const source = requireObject(entry.source, `dependency ${id} source`);
    const target = requireObject(entry.target, `dependency ${id} target`);
    const sourceDatabase = requireIdentifier(source.database, `dependency ${id} source database`);
    const sourceTable = requireIdentifier(source.table, `dependency ${id} source table`);
    const targetTable = requireIdentifier(target.table, `dependency ${id} target table`);
    const role = DATABASE_ROLES.find((candidate) => target.database === databases?.[candidate]);
    const roleFromSuffix = ['local', 'maint', 'relation'].find((candidate) => target.database?.endsWith(`_${candidate}`));
    const targetRole = role ?? roleFromSuffix;
    if (!targetRole || !DOMAINS[manifest.domain].has(dependencyPath(targetRole, targetTable))) {
      throw new Error(`dependency target ${targetRole ?? 'unknown'}.${targetTable} is not declared for ${manifest.domain}`);
    }
    if (manifest.domain === 'items' && targetRole === 'local' && targetTable === 'items'
        && entry.purpose !== 'recipe-item-dependencies') {
      throw new Error('Item local.items dependencies require purpose=recipe-item-dependencies');
    }
    if (manifest.domain === 'items' && targetRole === 'maint' && targetTable === 'maint_items'
        && entry.purpose !== 'recipe-item-maint-dependencies') {
      throw new Error('Item maint.maint_items dependencies require purpose=recipe-item-maint-dependencies');
    }
    if (manifest.domain === 'items' && targetRole === 'maint' && targetTable === 'maint_item_categories'
        && entry.purpose !== 'selected-item-category-rows') {
      throw new Error('Item maint.maint_item_categories dependencies require purpose=selected-item-category-rows');
    }
    if (manifest.domain === 'items' && targetRole === 'local' && targetTable === 'npcs'
        && entry.purpose !== 'stable-item-source-npc-dependencies-local') {
      throw new Error('Item local.npcs dependencies require purpose=stable-item-source-npc-dependencies-local');
    }
    if (manifest.domain === 'npcs' && targetRole === 'local' && targetTable === 'category'
        && entry.purpose !== 'npc-category-lookup-dependencies') {
      throw new Error('NPC local.category dependencies require purpose=npc-category-lookup-dependencies');
    }
    if (manifest.domain === 'projectiles' && targetRole === 'maint' && targetTable === 'maint_items'
        && entry.purpose !== 'projectile-explicit-item-projectile-dependencies') {
      throw new Error('Projectile maint.maint_items dependencies require explicit projectile relation evidence');
    }
    if (manifest.domain === 'projectiles' && targetRole === 'maint' && targetTable === 'maint_npcs'
        && entry.purpose !== 'projectile-explicit-npc-projectile-dependencies') {
      throw new Error('Projectile maint.maint_npcs dependencies require explicit projectile relation evidence');
    }
    if (manifest.domain === 'items' && targetRole === 'local' && targetTable === 'source_dataset_landings'
        && !new Set(['iteminfo-landing', 'selected-item-category-landings']).has(entry.purpose)) {
      throw new Error('Item local.source_dataset_landings dependencies require an exact landing purpose');
    }
    if (FORMAL_DATABASES.has(target.database)) throw new Error('dependency seeding cannot write a formal target');
    if (sourceDatabase !== `terria_v1_${targetRole}`) {
      throw new Error('dependency source must be the corresponding formal read-only schema');
    }
    if (!/^terria_v1_automation_acceptance_e8p_[0-9a-f]{16}_(?:local|maint|relation)$/.test(target.database)
        || !target.database.startsWith(`terria_v1_automation_acceptance_${manifest.runKey}_`)) {
      throw new Error('dependency target is not a run-derived T1 schema');
    }
    if (databases && (target.database !== databases[targetRole] || target.database !== validateTargetDatabase(target.database, targetRole, manifest.runKey))) {
      throw new Error('dependency target database differs from the exact run allocation');
    }
    const path = `${target.database}.${targetTable}`;

    if (!Array.isArray(entry.keyColumns) || entry.keyColumns.length === 0
        || !Array.isArray(entry.columns) || entry.columns.length === 0
        || !Array.isArray(entry.keyValues) || !Array.isArray(entry.rowHashes)) {
      throw new Error(`dependency ${id} requires exact keys, columns, and row hashes; whole-table reads are forbidden`);
    }
    const keyColumns = entry.keyColumns.map((column) => requireIdentifier(column, `dependency ${id} key column`));
    const columns = entry.columns.map((column) => requireIdentifier(column, `dependency ${id} column`));
    if (new Set(keyColumns).size !== keyColumns.length || new Set(columns).size !== columns.length
        || keyColumns.some((column) => !columns.includes(column))) {
      throw new Error(`dependency ${id} has duplicate columns or key columns outside its projection`);
    }
    if (keyColumns.some((column) => /name|display|title|label/i.test(column))) {
      throw new Error(`dependency ${id} cannot use display-name-only keys; use stable IDs`);
    }
    const targetPolicy = entry.targetPolicy ?? 'empty-only';
    const conflictColumns = entry.conflictColumns == null
      ? []
      : entry.conflictColumns.map((column) => requireIdentifier(column, `dependency ${id} conflict column`));
    if (!['empty-only', 'append-exact'].includes(targetPolicy)) {
      throw new Error(`dependency ${id} target policy is unsupported`);
    }
    if (targetPolicy === 'append-exact') {
      if (manifest.domain !== 'npcs' || targetRole !== 'local' || targetTable !== 'category'
          || entry.purpose !== 'npc-category-lookup-dependencies'
          || conflictColumns.length === 0 || new Set(conflictColumns).size !== conflictColumns.length
          || keyColumns.some((column) => !conflictColumns.includes(column))
          || conflictColumns.some((column) => !columns.includes(column))) {
        throw new Error('append-exact is allowed only for exact NPC category rows with declared unique-conflict columns');
      }
    } else if (conflictColumns.length > 0) {
      throw new Error(`dependency ${id} conflict columns require targetPolicy=append-exact`);
    }
    if (!Number.isInteger(entry.expectedRowCount) || entry.expectedRowCount < 1
        || entry.expectedRowCount !== entry.keyValues.length
        || entry.expectedRowCount !== entry.rowHashes.length) {
      throw new Error(`dependency ${id} key/hash count mismatch or truncated manifest`);
    }
    const declaredKeys = new Set();
    for (const keyValue of entry.keyValues) {
      const key = requireObject(keyValue, `dependency ${id} key value`);
      if (Object.keys(key).sort().join(',') !== [...keyColumns].sort().join(',')) {
        throw new Error(`dependency ${id} key values must contain exactly the stable key columns`);
      }
      if (keyColumns.some((column) => key[column] === null || key[column] === undefined || key[column] === '')) {
        throw new Error(`dependency ${id} has a missing stable key`);
      }
      const canonicalKey = canonicalJson(canonicalValue(key));
      if (declaredKeys.has(canonicalKey)) throw new Error(`dependency ${id} contains duplicate stable keys`);
      declaredKeys.add(canonicalKey);
    }
    const existingGroup = paths.get(path) ?? {
      sourceDatabase,
      sourceTable,
      targetDatabase: target.database,
      targetTable,
      keyColumns,
      columns,
      targetPolicy,
      conflictColumns,
      declaredKeys: new Set(),
    };
    if (existingGroup.sourceDatabase !== sourceDatabase || existingGroup.sourceTable !== sourceTable
        || existingGroup.targetDatabase !== target.database || existingGroup.targetTable !== targetTable
        || canonicalJson(existingGroup.keyColumns) !== canonicalJson(keyColumns)
        || canonicalJson(existingGroup.columns) !== canonicalJson(columns)
        || existingGroup.targetPolicy !== targetPolicy
        || canonicalJson(existingGroup.conflictColumns) !== canonicalJson(conflictColumns)) {
      throw new Error(`dependencies sharing target ${path} must use one source and exact key/column projection`);
    }
    for (const key of declaredKeys) {
      if (existingGroup.declaredKeys.has(key)) throw new Error(`dependencies sharing target ${path} contain duplicate stable keys`);
      existingGroup.declaredKeys.add(key);
    }
    paths.set(path, existingGroup);
    const hashedKeys = new Set();
    for (const rowHash of entry.rowHashes) {
      requireObject(rowHash, `dependency ${id} row hash`);
      if (!HASH.test(rowHash.sha256 ?? '') || !declaredKeys.has(canonicalJson(canonicalValue(rowHash.key)))
          || hashedKeys.has(canonicalJson(canonicalValue(rowHash.key)))) {
        throw new Error(`dependency ${id} row hash has a missing, duplicate, or undeclared key`);
      }
      hashedKeys.add(canonicalJson(canonicalValue(rowHash.key)));
    }
  }
  const dependencies = manifest.dependencies.map((entry) => Object.freeze({
    ...entry,
    source: Object.freeze({ ...entry.source }),
    target: Object.freeze({ ...entry.target }),
    keyColumns: Object.freeze([...entry.keyColumns]),
    columns: Object.freeze([...entry.columns]),
    keyValues: Object.freeze(entry.keyValues.map((value) => Object.freeze({ ...value }))),
    rowHashes: Object.freeze(entry.rowHashes.map((value) => Object.freeze({ key: Object.freeze({ ...value.key }), sha256: value.sha256 }))),
    ...(entry.conflictColumns == null ? {} : { conflictColumns: Object.freeze([...entry.conflictColumns]) }),
  }));
  return Object.freeze({ ...manifest, dependencies: Object.freeze(dependencies) });
}

export function buildDependencyManifest({ manifest, sourceRows } = {}) {
  const input = requireObject(manifest, 'dependency manifest');
  const rowGroups = Array.isArray(sourceRows) && input.dependencies?.length === 1
    ? { [input.dependencies[0].id]: sourceRows }
    : requireObject(sourceRows, 'dependency source rows');
  const allowedIds = new Set(input.dependencies.map((entry) => entry.id));
  if (Object.keys(rowGroups).some((id) => !allowedIds.has(id))) {
    throw new Error('dependency source rows contain undeclared dependency IDs');
  }
  const dependencies = input.dependencies.map((entry) => {
    const rows = rowGroups[entry.id];
    if (!Array.isArray(rows) || rows.length !== entry.expectedRowCount) {
      throw new Error(`dependency ${entry.id} source row count is missing or truncated`);
    }
    const keyColumns = entry.keyColumns;
    const byKey = new Map();
    for (const row of rows) {
      requireObject(row, `dependency ${entry.id} source row`);
      if (entry.columns.some((column) => !Object.hasOwn(row, column))) {
        throw new Error(`dependency ${entry.id} source row is missing a required column`);
      }
      const key = Object.fromEntries(keyColumns.map((column) => [column, row[column]]));
      byKey.set(canonicalJson(key), { key, sha256: hashRow(Object.fromEntries(entry.columns.map((column) => [column, row[column]]))) });
    }
    if (byKey.size !== entry.expectedRowCount) throw new Error(`dependency ${entry.id} source rows contain duplicate keys`);
    return { ...entry, rowHashes: [...byKey.values()] };
  });
  return validateDependencyManifest({ ...input, dependencies });
}

export function buildDependencySelectSql(entry) {
  const keys = entry.keyValues.map((key) => `(${entry.keyColumns.map((column) => `\`${column}\` = ${sqlLiteral(key[column])}`).join(' AND ')})`);
  const fields = entry.columns.flatMap((column) => [`'${column}'`, `\`${column}\``]);
  return `SELECT JSON_OBJECT(${fields.join(', ')}) FROM \`${entry.source.table}\` WHERE ${keys.join(' OR ')} ORDER BY ${entry.keyColumns.map((column) => `\`${column}\``).join(', ')}`;
}

function buildDependencyTargetSnapshotSql(entry) {
  const fields = entry.columns.flatMap((column) => [`'${column}'`, `\`${column}\``]);
  return `SELECT JSON_OBJECT(${fields.join(', ')}) FROM \`${entry.target.table}\` ORDER BY ${entry.keyColumns.map((column) => `\`${column}\``).join(', ')}`;
}

function parseJsonRows(output, entry) {
  const rows = String(output ?? '').trim().split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { throw new Error(`dependency ${entry.id} query returned malformed JSON`); }
  });
  return rows;
}

function hashRowsByKey(rows, entry) {
  const hashes = new Map();
  for (const row of rows) {
    const key = Object.fromEntries(entry.keyColumns.map((column) => [column, row[column]]));
    const serializedKey = canonicalJson(key);
    if (hashes.has(serializedKey)) throw new Error(`dependency ${entry.id} query returned duplicate stable keys`);
    hashes.set(serializedKey, hashRow(Object.fromEntries(entry.columns.map((column) => [column, row[column]]))));
  }
  return hashes;
}

function expectedHashMap(entry) {
  return new Map(entry.rowHashes.map(({ key, sha256 }) => [canonicalJson(canonicalValue(key)), sha256]));
}

function assertRowsMatchManifest(rows, entry, layer) {
  if (rows.length !== entry.expectedRowCount) throw new Error(`dependency ${entry.id} ${layer} row count differs from exact key count`);
  const observed = hashRowsByKey(rows, entry);
  const expected = expectedHashMap(entry);
  if (observed.size !== expected.size) throw new Error(`dependency ${entry.id} ${layer} key set is incomplete`);
  for (const [key, sha256] of expected) {
    if (observed.get(key) !== sha256) throw new Error(`dependency ${entry.id} ${layer} row hash drift`);
  }
  return Object.freeze({ rowCount: rows.length, rowsSha256: `sha256:${createHash('sha256').update(canonicalJson([...observed].sort(([a], [b]) => a.localeCompare(b)))).digest('hex')}` });
}

export async function verifyExactDependencyTargets({ manifest, databases, client, preservedTargetEvidence = new Map() } = {}) {
  if (!client || typeof client.query !== 'function') throw new Error('exact dependency readback requires the isolated provisioner client');
  const validated = validateDependencyManifest(manifest, { databases });
  const expectedTargetCounts = new Map();
  for (const entry of validated.dependencies) {
    const targetKey = `${entry.target.database}.${entry.target.table}`;
    expectedTargetCounts.set(targetKey, (expectedTargetCounts.get(targetKey) ?? 0) + entry.expectedRowCount);
  }
  const evidence = [];
  for (const entry of validated.dependencies) {
    const targetEntry = { ...entry, source: { ...entry.target } };
    const rows = parseJsonRows(await client.query(buildDependencySelectSql(targetEntry), entry.target.database), entry);
    const readback = assertRowsMatchManifest(rows, entry, 'target readback');
    const tableCount = Number(String(await client.query(`SELECT COUNT(*) FROM \`${entry.target.table}\``, entry.target.database)).trim());
    const expectedCount = expectedTargetCounts.get(`${entry.target.database}.${entry.target.table}`);
    const targetPolicy = entry.targetPolicy ?? 'empty-only';
    if (!Number.isSafeInteger(tableCount)
        || (targetPolicy === 'append-exact' ? tableCount < expectedCount : tableCount !== expectedCount)) {
      throw new Error(`dependency target ${entry.target.table} contains undeclared or missing rows`);
    }
    const preservation = preservedTargetEvidence.get(`${entry.target.database}.${entry.target.table}`);
    evidence.push(Object.freeze({
      id: entry.id,
      source: Object.freeze({ ...entry.source }),
      target: Object.freeze({ ...entry.target }),
      sourceRowCount: entry.expectedRowCount,
      targetRowCount: readback.rowCount,
      targetTableCount: tableCount,
      ...(preservation ? {
        preservedTargetRowCount: preservation.rowCount,
        preservedTargetRowsSha256: preservation.rowsSha256,
      } : {}),
      targetRowsSha256: readback.rowsSha256,
      readbackVerified: true,
    }));
  }
  return Object.freeze({
    schemaVersion: 1,
    status: 'verified',
    domain: validated.domain,
    runId: validated.runId,
    runKey: validated.runKey,
    manifestSha256: dependencyManifestSha256(validated),
    dependencySeedRows: evidence.reduce((sum, item) => sum + item.targetRowCount, 0),
    readbackVerified: evidence.every((item) => item.readbackVerified),
    dependencies: Object.freeze(evidence),
  });
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return String(value);
  if (typeof value !== 'string') throw new Error('dependency row contains an unsupported SQL value');
  return `CONVERT(X'${Buffer.from(value, 'utf8').toString('hex')}' USING utf8mb4)`;
}

export function buildDependencyInsertSql(entry, rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('dependency insert requires verified source rows');
  const columns = entry.columns.map((column) => `\`${column}\``).join(', ');
  const values = rows.map((row) => `(${entry.columns.map((column) => sqlValue(row[column])).join(', ')})`);
  return `INSERT INTO \`${entry.target.table}\` (${columns}) VALUES ${values.join(', ')}`;
}

export async function seedExactDependencies({ manifest, databases, readonlyClient, provisionerClient } = {}) {
  if (!readonlyClient || typeof readonlyClient.query !== 'function'
      || !provisionerClient || typeof provisionerClient.query !== 'function') {
    throw new Error('exact dependency seeder requires read-only source and isolated provisioner clients');
  }
  const validated = validateDependencyManifest(manifest, { databases });
  const prepared = [];
  for (const entry of validated.dependencies) {
    const sourceRows = parseJsonRows(await readonlyClient.query(buildDependencySelectSql(entry), entry.source.database), entry);
    assertRowsMatchManifest(sourceRows, entry, 'source');
    prepared.push({ entry, sourceRows });
  }
  const tableGroups = new Map();
  for (const item of prepared) {
    const targetKey = `${item.entry.target.database}.${item.entry.target.table}`;
    const group = tableGroups.get(targetKey) ?? { database: item.entry.target.database, table: item.entry.target.table, items: [] };
    group.items.push(item);
    tableGroups.set(targetKey, group);
  }
  const preservedTargetEvidence = new Map();
  for (const group of tableGroups.values()) {
    const count = Number(String(await provisionerClient.query(`SELECT COUNT(*) FROM \`${group.table}\``, group.database)).trim());
    const first = group.items[0].entry;
    const targetPolicy = first.targetPolicy ?? 'empty-only';
    if (!Number.isSafeInteger(count) || (targetPolicy === 'empty-only' && count !== 0)) {
      throw new Error(`dependency target ${group.table} is not empty before exact seeding`);
    }
    let baselineRows = [];
    if (targetPolicy === 'append-exact') {
      baselineRows = parseJsonRows(
        await provisionerClient.query(buildDependencyTargetSnapshotSql(first), group.database),
        first,
      );
      if (baselineRows.length !== count) throw new Error(`dependency target ${group.table} changed during its append preflight`);
    }
    const seen = new Set();
    const insertItems = [];
    for (const item of group.items) {
      for (const row of item.sourceRows) {
        const key = canonicalJson(Object.fromEntries(item.entry.keyColumns.map((column) => [column, row[column]])));
        if (seen.has(key)) throw new Error(`dependency target ${group.table} has duplicate keys across declarations`);
        seen.add(key);
        insertItems.push({ entry: item.entry, row });
      }
    }
    const columns = [...new Set(group.items.flatMap(({ entry }) => entry.columns))];
    if (group.items.some(({ entry }) => canonicalJson(entry.columns) !== canonicalJson(first.columns))) {
      throw new Error(`dependencies sharing target ${group.table} must use one exact column projection`);
    }
    const combinedRows = insertItems.map(({ row }) => row);
    if (targetPolicy === 'append-exact') {
      for (const { row } of insertItems) {
        if (baselineRows.some((existing) => first.conflictColumns.some((column) => (
          canonicalJson(existing[column]) === canonicalJson(row[column])
        )))) {
          throw new Error(`existing category row conflicts with declared NPC dependency ${group.table}`);
        }
      }
    }
    if (combinedRows.length > 0) await provisionerClient.query(buildDependencyInsertSql(first, combinedRows), group.database);
    const afterCount = Number(String(await provisionerClient.query(`SELECT COUNT(*) FROM \`${group.table}\``, group.database)).trim());
    const expectedAfterCount = targetPolicy === 'append-exact' ? count + combinedRows.length : combinedRows.length;
    if (!Number.isSafeInteger(afterCount) || afterCount !== expectedAfterCount) {
      throw new Error(`dependency target ${group.table} contains undeclared or missing rows after seeding`);
    }
    if (targetPolicy === 'append-exact') {
      const afterRows = parseJsonRows(
        await provisionerClient.query(buildDependencyTargetSnapshotSql(first), group.database),
        first,
      );
      const baselineHashes = hashRowsByKey(baselineRows, first);
      const afterHashes = hashRowsByKey(afterRows, first);
      if (afterRows.length !== afterCount || afterHashes.size !== baselineHashes.size + combinedRows.length
          || [...baselineHashes].some(([key, hash]) => afterHashes.get(key) !== hash)) {
        throw new Error(`NPC migration rows changed while exact dependencies were appended to ${group.table}`);
      }
      preservedTargetEvidence.set(`${group.database}.${group.table}`, Object.freeze({
        rowCount: baselineRows.length,
        rowsSha256: `sha256:${createHash('sha256').update(canonicalJson([...baselineHashes].sort(([left], [right]) => left.localeCompare(right)))).digest('hex')}`,
      }));
    }
  }
  const readback = await verifyExactDependencyTargets({
    manifest: validated,
    databases,
    client: provisionerClient,
    preservedTargetEvidence,
  });
  const sourceEvidence = new Map(prepared.map(({ entry, sourceRows }) => [
    entry.id,
    assertRowsMatchManifest(sourceRows, entry, 'source'),
  ]));
  return Object.freeze({
    ...readback,
    dependencies: Object.freeze(readback.dependencies.map((entry) => Object.freeze({
      ...entry,
      sourceRowsSha256: sourceEvidence.get(entry.id).rowsSha256,
    }))),
  });
}
