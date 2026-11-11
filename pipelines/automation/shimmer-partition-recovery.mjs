import { isDeepStrictEqual } from 'node:util';
import { getVerifiedShimmerPartitionScope, matchesShimmerPartitionRow, SHIMMER_PARTITION_SCOPES } from './shimmer-partition-contract.mjs';

/** Caller owns the transaction and has locked the run's mutation generations. */
export async function verifyShimmerExecutionFences(connection, bundle, { committed = false } = {}) {
  const generations = bundle?.baseline?.generations;
  const fences = bundle?.importPlan?.shimmerPartition?.fences;
  if (bundle?.domainId !== 'shimmer' || !Array.isArray(generations) || generations.length !== 6
      || !Array.isArray(fences) || fences.length !== 6 || !bundle.runId) {
    throw new Error('Shimmer execution requires six final-run fences and generations');
  }
  if (!committed && bundle.executionMode === 'ACTIVATION_GATED_AUTO') {
    const approval = bundle.importPlan.shimmerPolicyApproval;
    if (!approval?.actor || approval.policyVersion !== bundle.policy?.policyVersion
        || approval.policyHash !== bundle.policy?.policyHash || approval.policySetHash !== bundle.policy?.policySetHash) {
      throw new Error('Shimmer execution is missing its persisted policy approval binding');
    }
    const [rows] = await connection.query(
      'SELECT pv.approved_by AS approvedBy, o.username, o.status AS ownerStatus'
      + ' FROM crawler_automation_policy p JOIN crawler_automation_policy_version pv'
      + ' ON pv.domain_id = p.domain_id AND pv.policy_version = p.current_version'
      + ' JOIN crawler_automation_owner o ON o.singleton_key = 1'
      + ' WHERE p.domain_id = ? AND p.current_version = ? AND pv.policy_hash = ?'
      + ' AND p.current_level = ? AND p.operational_state = ? FOR UPDATE',
      ['shimmer', approval.policyVersion, approval.policyHash, 'L2', 'ACTIVE'],
    );
    if (rows?.length !== 1 || rows[0].approvedBy !== approval.actor
        || rows[0].username !== approval.actor || rows[0].ownerStatus !== 'ACTIVE') {
      throw new Error('Shimmer persisted policy approval changed before execution');
    }
  }
  for (const scope of SHIMMER_PARTITION_SCOPES) {
    const generation = generations.find((entry) => entry.table === scope.table);
    const expected = fences.find((entry) => entry.table === scope.table);
    if (!getVerifiedShimmerPartitionScope(generation)
        || expected?.databaseRole !== scope.databaseRole || expected.logicalPredicateHash !== scope.logicalPredicateHash
        || expected.latestRunId !== bundle.runId || Number(expected.generation) !== Number(generation.generation)
        || !Number.isSafeInteger(Number(generation.generation)) || Number(generation.generation) < 0
        || typeof expected.fenceToken !== 'string' || !expected.fenceToken.trim()) {
      throw new Error(`Shimmer final-run fence binding is invalid: ${scope.table}`);
    }
    const [rows] = await connection.query(
      'SELECT field_group AS fieldGroup, logical_predicate_hash AS logicalPredicateHash,'
      + ' latest_run_id AS latestRunId, fence_token AS fenceToken, before_generation AS beforeGeneration,'
      + ' committed_generation AS committedGeneration, commit_marker AS commitMarker,'
      + ' expires_at > CURRENT_TIMESTAMP AS active FROM crawler_automation_write_fence'
      + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ? FOR UPDATE',
      [bundle.baseline.environmentId, scope.databaseRole, scope.table],
    );
    const matches = (rows ?? []).filter((row) => row.fieldGroup === scope.fieldGroup
      && row.logicalPredicateHash === scope.logicalPredicateHash);
    const actual = matches[0];
    if (matches.length !== 1 || actual.latestRunId !== bundle.runId || actual.fenceToken !== expected.fenceToken
        || Number(actual.beforeGeneration) !== Number(expected.generation)
        || (committed ? (Number(actual.committedGeneration) !== Number(expected.generation) + 1
          || actual.commitMarker !== bundle.bundleHash?.slice(7))
          : (!Number(actual.active) || actual.committedGeneration != null || actual.commitMarker != null))
        || (rows ?? []).some((row) => row !== actual && Number(row.active))) {
      throw new Error(`Shimmer database fence is missing, stale or conflicting: ${scope.table}`);
    }
  }
}

/** Restore one registered partition only; never upsert across another owner's key. */
export async function restoreShimmerScopeSnapshot(connection, scope, baselineRows) {
  const definition = getVerifiedShimmerPartitionScope(scope);
  if (!definition) throw new Error('Shimmer recovery requires an exact registered scope');
  if (!Array.isArray(baselineRows)) throw new Error('Shimmer recovery baseline rows are missing');
  const baseline = new Map();
  for (const row of baselineRows) {
    if (!validId(row?.id) || !matchesShimmerPartitionRow(definition, row)) {
      throw new Error(`Shimmer recovery baseline escapes partition: ${definition.table}`);
    }
    if (baseline.has(String(row.id))) throw new Error('Shimmer recovery baseline has duplicate IDs');
    for (const key of Object.keys(row)) quoteIdentifier(key);
    baseline.set(String(row.id), row);
  }
  const table = quoteIdentifier(definition.table);
  const [where, params] = definition.table === 'world_contexts' ? ['code = ?', ['SHIMMER']]
    : definition.table === 'entity_source_snapshots' ? ['provider = ? AND source_page = ?', ['wiki_zh', '微光']]
      : ['source_provider = ? AND source_page = ? AND deleted = 0', ['wiki_zh', '微光']];
  const read = async () => {
    const [rows] = await connection.query(`SELECT * FROM ${table} WHERE ${where} ORDER BY \`id\` FOR UPDATE`, params);
    return rows ?? [];
  };
  const current = await read();
  if (current.some((row) => !validId(row?.id) || !matchesShimmerPartitionRow(definition, row))) {
    throw new Error('Shimmer recovery current rows escape partition');
  }
  // Include baseline IDs that this run soft-disabled; preserve unrelated history.
  const currentById = new Map();
  for (const row of baselineRows) {
    const [rows] = await connection.query(`SELECT * FROM ${table} WHERE \`id\` = ? FOR UPDATE`, [row.id]);
    const existing = rows?.[0];
    const membershipRow = existing && definition.capability === 'shimmer' ? { ...existing, deleted: 0 } : existing;
    if ((rows?.length ?? 0) > 1 || (existing && !matchesShimmerPartitionRow(definition, membershipRow))) {
      throw new Error(`Shimmer recovery ID collision with another partition: ${definition.table}/${row.id}`);
    }
    if (existing) currentById.set(String(row.id), existing);
  }
  const mutate = async (sql, values) => {
    const [result] = await connection.query(sql, values);
    if (Number(result?.affectedRows) !== 1) throw new Error('Shimmer recovery mutation was not persisted (affected rows)');
  };
  for (const row of current) {
    if (!baseline.has(String(row.id))) {
      await mutate(`DELETE FROM ${table} WHERE \`id\` = ? AND ${where}`, [row.id, ...params]);
    }
  }
  for (const row of baselineRows) {
    const existing = currentById.get(String(row.id));
    if (existing && isDeepStrictEqual(existing, row)) continue;
    if (existing) {
      const columns = Object.keys(row).filter((key) => key !== 'id');
      await mutate(`UPDATE ${table} SET ${columns.map((key) => `${quoteIdentifier(key)} = ?`).join(', ')} WHERE \`id\` = ?`,
        [...columns.map((key) => row[key]), row.id]);
    } else {
      const columns = Object.keys(row);
      await mutate(`INSERT INTO ${table} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((key) => row[key]));
    }
  }
  const after = await read();
  const afterById = new Map(after.map((row) => [String(row.id), row]));
  if (after.length !== baselineRows.length || baselineRows.some((row) => !isDeepStrictEqual(afterById.get(String(row.id)), row))) {
    throw new Error('Shimmer recovery partition readback does not match baseline');
  }
}

function validId(value) {
  return /^(?:[1-9][0-9]*)$/.test(String(value ?? '')) && (typeof value !== 'number' || Number.isSafeInteger(value));
}
function quoteIdentifier(value) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error('Unsafe Shimmer recovery identifier');
  return `\`${value}\``;
}
