import { DATABASE_ROLES } from './automation-database-contract.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';

const APPLY_TABLE = 'crawler_automation_apply';
const ACQUIRED_BORROWED_CONNECTION_SETS = new WeakMap();
const PROTOCOL_ERROR_CARRIER = Symbol('protocolErrorCarrier');
const CANONICAL_CONNECTION_CONFIG_FIELDS = Object.freeze(new Set([
  'host',
  'port',
  'user',
  'password',
  'database',
]));
const MANIFEST_SCALAR_FIELDS = Object.freeze(new Set([
  'schemaVersion',
  'runId',
]));
const MANIFEST_FIELDS = Object.freeze(new Set([
  'schemaVersion',
  'runId',
  'databases',
  'serverIdentity',
]));
const SERVER_IDENTITY_SCALAR_FIELDS = Object.freeze(new Set([
  'host',
  'port',
  'serverUuid',
]));
const SERVER_IDENTITY_FIELDS = Object.freeze(new Set([
  'host',
  'port',
  'serverUuid',
]));
const DATABASE_DESCRIPTOR_SCALAR_FIELDS = Object.freeze(new Set([
  'role',
  'name',
  'host',
  'port',
  'serverUuid',
  'supportsTransactions',
  'allTablesInnoDB',
  'transactionCapable',
  'engine',
]));
const DATABASE_DESCRIPTOR_FIELDS = Object.freeze(new Set([
  'role',
  'name',
  'host',
  'port',
  'serverUuid',
  'supportsTransactions',
  'allTablesInnoDB',
  'transactionCapable',
  'engine',
  'engines',
]));
const REQUIRED_MANIFEST_FIELDS = ['schemaVersion', 'runId', 'databases', 'serverIdentity'];
const STAGE_ORDER = Object.freeze(['maint', 'relation', 'local']);
const STAGE_EXPECTED_STATUS = Object.freeze({
  maint: 'STARTED',
  relation: 'MAINT_COMMITTED',
  local: 'RELATION_COMMITTED'
});
const STAGE_COMMITTED_STATUS = Object.freeze({
  maint: 'MAINT_COMMITTED',
  relation: 'RELATION_COMMITTED',
  local: 'LOCAL_COMMITTED'
});
const APPLY_PROTOCOLS = Object.freeze(new Set([
  'same_server_single_transaction',
  'cross_server_staged'
]));
const APPLY_MODES = Object.freeze(new Set(['AUTO_APPLY_L2', 'APPROVED_OWNER_L1']));
// States that indicate another worker already owns recovery (or has completed
// compensation). Ordinary stage markers are intentionally excluded: a failed
// recovery transition must still be retried/observed rather than mistaken for
// an active recovery owner.
const RECOVERY_OWNER_STATUSES = Object.freeze(new Set([
  'COMPENSATION_REQUIRED',
  'COMPENSATING',
  'COMPENSATION_FAILED',
  'RECOVERY_REQUIRED',
  'COMPENSATED',
  // A terminal COMMITTED row must never be downgraded after a late or
  // ambiguous acknowledgement. It is safe for a recovery caller to observe
  // and reconcile, but not to claim with a competing status transition.
  'COMMITTED'
]));
const SAME_SERVER_RECOVERY_STATUSES = Object.freeze(new Set([
  'DB_COMMITTED',
  'POST_VERIFY_FAILED'
]));
const TRUSTED_MYSQL = createTrustedMysqlBoundary();

function createTrustedMysqlBoundary() {
  const mysql = loadMysqlModule();
  if (typeof mysql?.createPool !== 'function') {
    throw new Error('declared mysql2 pool factory is unavailable');
  }
  return Object.freeze({
    createPool: mysql.createPool.bind(mysql),
  });
}

function requireField(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function requireQueryConnection(connection, label) {
  if (!connection || typeof connection.query !== 'function') {
    throw new Error(`${label} connection query capability is required`);
  }
  return connection;
}

function requireCoordinatorTransaction(connection) {
  const methods = ['beginTransaction', 'commit', 'rollback'];
  const missing = methods.filter((method) => typeof connection?.[method] !== 'function');
  if (missing.length > 0) {
    throw new Error(`staged coordinator transaction capability is required (missing ${missing.join(', ')})`);
  }
  return connection;
}

function requireConnectionTopology(connections, protocol) {
  if (protocol !== 'cross_server_staged') return;

  for (let index = 0; index < DATABASE_ROLES.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < DATABASE_ROLES.length; otherIndex += 1) {
      const role = DATABASE_ROLES[index];
      const otherRole = DATABASE_ROLES[otherIndex];
      if (connections[role] === connections[otherRole]) {
        throw new Error(
          `cross-server protocol requires a distinct physical connection for ${role} and ${otherRole}`
        );
      }
    }
  }
}

function requirePhysicalThreadId(connection, label) {
  let threadId;
  try {
    threadId = connection?.threadId;
  } catch {
    throw new Error(`${label} physical threadId is unreadable`);
  }
  if (!Number.isSafeInteger(threadId) || threadId < 1) {
    throw new Error(`${label} must expose a positive physical threadId`);
  }
  return threadId;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function ownDataDescriptors(value, label) {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be a plain data-only record`);
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new Error(`${label} must be a plain data-only record`);
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') {
      throw new Error(`${label} must not contain symbol properties`);
    }
    if (!Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) {
      throw new Error(`${label}.${key} must be a data-only property`);
    }
  }
  return descriptors;
}

function snapshotDataRecord(value, label, {
  allowedFields,
  unknownFieldError,
  scalarFields,
} = {}) {
  const descriptors = ownDataDescriptors(value, label);
  const snapshot = {};
  for (const key of Object.keys(descriptors)) {
    if (allowedFields && !allowedFields.has(key)) {
      throw new Error(unknownFieldError?.(key) ?? `${label} contains unsupported field ${key}`);
    }
    const fieldValue = descriptors[key].value;
    // Scalar values are copied from their data descriptors without invoking
    // coercion hooks. Null/undefined remain valid inputs so the existing
    // required-field validators can report their canonical errors; every
    // other object or function is rejected at the trusted boundary.
    if (scalarFields?.has(key)
        && fieldValue !== null
        && (typeof fieldValue === 'object' || typeof fieldValue === 'function')) {
      throw new Error(`${label}.${key} must be a primitive scalar`);
    }
    snapshot[key] = fieldValue;
  }
  return Object.freeze(snapshot);
}

function snapshotEngineCollection(value, label) {
  if (Array.isArray(value)) {
    let descriptors;
    try {
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      throw new Error(`${label} must be data-only`);
    }
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new Error(`${label} must be data-only`);
    }
    const values = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
          || typeof descriptor.value !== 'string') {
        throw new Error(`${label} must contain only data strings`);
      }
      values.push(descriptor.value);
    }
    for (const key of Reflect.ownKeys(descriptors)) {
      if (key === 'length') continue;
      if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length) {
        throw new Error(`${label} must be a dense data-only array`);
      }
    }
    return Object.freeze(values);
  }

  const snapshot = snapshotDataRecord(value, label);
  if (Object.values(snapshot).some((engine) => typeof engine !== 'string')) {
    throw new Error(`${label} must contain only data strings`);
  }
  return snapshot;
}

function snapshotDatabaseDescriptor(value, label) {
  const snapshot = snapshotDataRecord(value, label, {
    allowedFields: DATABASE_DESCRIPTOR_FIELDS,
    scalarFields: DATABASE_DESCRIPTOR_SCALAR_FIELDS,
  });
  if (!Object.prototype.hasOwnProperty.call(snapshot, 'engines')) return snapshot;
  return Object.freeze({
    ...snapshot,
    engines: snapshotEngineCollection(snapshot.engines, `${label}.engines`),
  });
}

function snapshotManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('manifest is required');
  }
  const top = snapshotDataRecord(manifest, 'manifest', {
    allowedFields: MANIFEST_FIELDS,
    scalarFields: MANIFEST_SCALAR_FIELDS,
  });
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!top[field]) throw new Error(`manifest.${field} is required`);
  }

  const serverIdentity = snapshotDataRecord(top.serverIdentity, 'manifest.serverIdentity', {
    allowedFields: SERVER_IDENTITY_FIELDS,
    scalarFields: SERVER_IDENTITY_SCALAR_FIELDS,
  });
  const databaseInputs = snapshotDataRecord(top.databases, 'manifest.databases', {
    allowedFields: new Set(DATABASE_ROLES),
    unknownFieldError: (role) => `manifest.databases contains unknown role: ${role}`,
  });
  const databases = {};
  for (const role of DATABASE_ROLES) {
    if (!databaseInputs[role]) {
      throw new Error(`manifest.databases.${role} is required`);
    }
    databases[role] = snapshotDatabaseDescriptor(
      databaseInputs[role],
      `manifest.databases.${role}`
    );
  }

  return Object.freeze({
    schemaVersion: top.schemaVersion,
    runId: top.runId,
    databases: Object.freeze(databases),
    serverIdentity,
  });
}

function snapshotCanonicalConnectionConfig(connectionConfig) {
  if (!connectionConfig || typeof connectionConfig !== 'object' || Array.isArray(connectionConfig)) {
    throw new Error('canonical connectionConfig is required');
  }
  const inputs = snapshotDataRecord(connectionConfig, 'connectionConfig', {
    allowedFields: new Set(DATABASE_ROLES),
    unknownFieldError: (role) => `connectionConfig contains unsupported database role ${role}`,
  });
  const snapshot = {};
  for (const role of DATABASE_ROLES) {
    const options = inputs[role];
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new Error(`${role} connectionConfig must be a plain canonical connection object`);
    }
    snapshot[role] = snapshotDataRecord(options, `${role} connectionConfig`, {
      allowedFields: CANONICAL_CONNECTION_CONFIG_FIELDS,
      unknownFieldError: (field) => `${role} connectionConfig contains unsupported field ${field}`,
      scalarFields: CANONICAL_CONNECTION_CONFIG_FIELDS,
    });
  }
  return Object.freeze(snapshot);
}

function requireCanonicalConnectionOptions(options, descriptor, role) {
  if (!isPlainRecord(options)) {
    throw new Error(`${role} connectionConfig must be a plain canonical connection object`);
  }
  for (const key of Object.keys(options)) {
    if (!CANONICAL_CONNECTION_CONFIG_FIELDS.has(key)) {
      throw new Error(`${role} connectionConfig contains unsupported field ${key}`);
    }
  }

  const host = requireNonEmptyString(options.host, `${role} connectionConfig.host`);
  if (host !== descriptor.host) {
    throw new Error(`${role} connectionConfig.host must match the manifest`);
  }
  if (!Number.isSafeInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`${role} connectionConfig.port must be a valid port`);
  }
  if (options.port !== descriptor.port) {
    throw new Error(`${role} connectionConfig.port must match the manifest`);
  }
  const user = requireNonEmptyString(options.user, `${role} connectionConfig.user`);
  if (typeof options.password !== 'string') {
    throw new Error(`${role} connectionConfig.password must be a string`);
  }
  const database = requireNonEmptyString(options.database, `${role} connectionConfig.database`);
  if (database !== descriptor.name) {
    throw new Error(`${role} connectionConfig.database must match the manifest`);
  }

  // Only this copied, literal configuration reaches mysql2. In particular,
  // untrusted stream, socket, pool, and factory fields cannot cross this
  // boundary even when they are present as non-enumerable source properties.
  return Object.freeze({
    host,
    port: options.port,
    user,
    password: options.password,
    database,
    connectionLimit: 1,
    waitForConnections: true,
    queueLimit: 0,
    multipleStatements: false,
    dateStrings: true,
  });
}

function canonicalConnectionOptionsByRole(manifest, connectionConfig, protocol) {
  if (!isPlainRecord(connectionConfig)) {
    throw new Error('canonical connectionConfig is required');
  }
  for (const key of Object.keys(connectionConfig)) {
    if (!DATABASE_ROLES.includes(key)) {
      throw new Error(`connectionConfig contains unsupported database role ${key}`);
    }
  }

  const optionsByRole = {};
  for (const role of DATABASE_ROLES) {
    optionsByRole[role] = requireCanonicalConnectionOptions(
      connectionConfig[role],
      manifest.databases[role],
      role
    );
  }

  if (protocol === 'same_server_single_transaction') {
    const coordinator = optionsByRole.local;
    for (const role of DATABASE_ROLES) {
      const options = optionsByRole[role];
      if (options.user !== coordinator.user || options.password !== coordinator.password) {
        throw new Error('same-server connectionConfig must use one credential set for all database roles');
      }
    }
  }

  return Object.freeze(optionsByRole);
}

function rejectCallerSuppliedMysqlHandles({
  connections,
  pools,
  borrowedConnectionSet,
  borrowedConnections,
} = {}) {
  if (connections !== undefined
      || pools !== undefined
      || borrowedConnectionSet !== undefined
      || borrowedConnections !== undefined) {
    throw new Error('caller-supplied mysql pools, connections, and borrowed capabilities are not supported');
  }
}

function requireProtocolOwnedPool(pool, role) {
  if (!pool || typeof pool.getConnection !== 'function' || typeof pool.end !== 'function') {
    throw new Error(`${role} database protocol-owned pool is unusable`);
  }
  return pool;
}

function createProtocolOwnedPool(options, role) {
  try {
    return TRUSTED_MYSQL.createPool(options);
  } catch (error) {
    const wrapped = new Error(`${role} database protocol-owned pool construction failed`);
    wrapped.cause = error;
    throw wrapped;
  }
}

function requireProtocolOwnedBorrowedConnection(connection, role) {
  requireQueryConnection(connection, `${role} database`);
  if (typeof connection.release !== 'function') {
    throw new Error(`${role} borrowed connection release capability is required`);
  }
  return Object.freeze({
    connection,
    threadId: requirePhysicalThreadId(connection, `${role} database`),
  });
}

async function releaseBorrowedResources({ roleRecords = {}, pools = {} } = {}) {
  const errors = [];
  const releasedConnections = new Set();
  for (const record of Object.values(roleRecords)) {
    const connection = record?.connection;
    if (!connection || releasedConnections.has(connection)) continue;
    releasedConnections.add(connection);
    try {
      await connection.release();
    } catch (error) {
      errors.push(error);
    }
  }

  const endedPools = new Set();
  for (const pool of Object.values(pools)) {
    if (!pool || endedPools.has(pool)) continue;
    endedPools.add(pool);
    try {
      if (typeof pool.end !== 'function') {
        throw new Error('protocol-owned pool end capability is required');
      }
      await pool.end();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    const error = new Error('borrowed connection release failed');
    error.suppressed = errors;
    throw error;
  }
}

async function borrowConnectionFromProtocolOwnedPool(pool, role) {
  requireProtocolOwnedPool(pool, role);
  let connection;
  try {
    connection = await pool.getConnection();
  } catch (error) {
    const wrapped = new Error(`${role} database borrowed connection acquisition failed`);
    wrapped.cause = error;
    throw wrapped;
  }
  try {
    return requireProtocolOwnedBorrowedConnection(connection, role);
  } catch (error) {
    if (connection && typeof connection.release === 'function') {
      try {
        await connection.release();
      } catch (releaseError) {
        appendSuppressed(error, releaseError);
      }
    }
    throw error;
  }
}

/**
 * This private issuer is the only code path that creates pools and records
 * borrowed handles. Capabilities never leave this module: public executors
 * mint and consume one in the same call frame.
 */
async function issueProtocolOwnedBorrowedConnectionSet({
  protocol,
  connectionOptionsByRole,
  serverDescriptorsByRole,
} = {}) {
  if (!APPLY_PROTOCOLS.has(protocol)) {
    throw new Error(`unsupported borrowed connection protocol: ${protocol}`);
  }

  const optionsByRole = connectionOptionsByRole;
  const protocolOwnedPools = {};
  const roleRecords = {};
  try {
    if (protocol === 'same_server_single_transaction') {
      const coordinatorPool = createProtocolOwnedPool(optionsByRole.local, 'local');
      for (const role of DATABASE_ROLES) {
        protocolOwnedPools[role] = coordinatorPool;
      }
      requireProtocolOwnedPool(coordinatorPool, 'local');
      const coordinator = await borrowConnectionFromProtocolOwnedPool(coordinatorPool, 'local');
      for (const role of DATABASE_ROLES) {
        roleRecords[role] = Object.freeze({
          role,
          serverUuid: serverDescriptorsByRole?.[role]?.serverUuid,
          ...coordinator,
        });
      }
    } else {
      for (const role of DATABASE_ROLES) {
        const pool = createProtocolOwnedPool(optionsByRole[role], role);
        protocolOwnedPools[role] = pool;
        requireProtocolOwnedPool(pool, role);
        roleRecords[role] = Object.freeze({
          role,
          serverUuid: serverDescriptorsByRole?.[role]?.serverUuid,
          ...(await borrowConnectionFromProtocolOwnedPool(pool, role)),
        });
      }
    }

    const connections = Object.freeze(Object.fromEntries(
      DATABASE_ROLES.map((role) => [role, roleRecords[role].connection])
    ));
    if (protocol === 'cross_server_staged') {
      // Reject the same borrowed handle aliased across roles before any
      // identity query.  Connection IDs are server-local, so this object-level
      // topology check complements (rather than replaces) the server/ID key
      // below.
      requireConnectionTopology(connections, protocol);
      const physicalIdentityKeys = new Set(DATABASE_ROLES.map((role) => (
        JSON.stringify([roleRecords[role].serverUuid, roleRecords[role].threadId])
      )));
      if (physicalIdentityKeys.size !== DATABASE_ROLES.length) {
        throw new Error('cross-server protocol requires distinct borrowed physical connections');
      }
    }

    const capability = Object.freeze({});
    ACQUIRED_BORROWED_CONNECTION_SETS.set(capability, {
      protocol,
      connections,
      roleRecords: Object.freeze({ ...roleRecords }),
      pools: Object.freeze({ ...protocolOwnedPools }),
      consumed: false,
      released: false,
    });
    return capability;
  } catch (error) {
    try {
      await releaseBorrowedResources({ roleRecords, pools: protocolOwnedPools });
    } catch (cleanupError) {
      appendSuppressed(error, cleanupError);
    }
    throw error;
  }
}

function consumeBorrowedConnectionSet(borrowedConnectionSet, protocol) {
  if (!borrowedConnectionSet
      || (typeof borrowedConnectionSet !== 'object' && typeof borrowedConnectionSet !== 'function')) {
    throw new Error('acquisition-bound borrowed connection set is required');
  }
  const acquired = ACQUIRED_BORROWED_CONNECTION_SETS.get(borrowedConnectionSet);
  if (!acquired || acquired.protocol !== protocol) {
    throw new Error('acquisition-bound borrowed connection set is required for this protocol');
  }
  if (acquired.consumed || acquired.released) {
    throw new Error('one-shot borrowed connection capability is already consumed');
  }
  acquired.consumed = true;
  return acquired;
}

function requireBorrowedConnectionHandles(acquired) {
  const protocol = acquired.protocol;

  const connections = acquired.connections;
  const physicalConnectionIds = new Map();
  const physicalIdentityKeys = new Map();
  for (const role of DATABASE_ROLES) {
    const connection = connections[role];
    const record = acquired.roleRecords[role];
    if (!record || record.connection !== connection || record.role !== role) {
      throw new Error(`acquisition-bound borrowed connection record is required for ${role}`);
    }
    requireProtocolOwnedBorrowedConnection(connection, role);
    const connectionId = requirePhysicalThreadId(connection, `${role} database`);
    if (connectionId !== record.threadId) {
      throw new Error(`${role} borrowed connection physical threadId drift detected`);
    }
    physicalConnectionIds.set(role, record.threadId);
    physicalIdentityKeys.set(
      role,
      JSON.stringify([record.serverUuid, record.threadId])
    );
  }

  if (protocol === 'cross_server_staged') {
    const seen = new Set();
    for (const role of DATABASE_ROLES) {
      const physicalIdentityKey = physicalIdentityKeys.get(role);
      if (seen.has(physicalIdentityKey)) {
        throw new Error(`cross-server protocol requires a distinct physical connection for ${role}`);
      }
      seen.add(physicalIdentityKey);
    }
  }

  return Object.freeze({
    connections,
    physicalConnectionIds,
    roleRecords: acquired.roleRecords,
  });
}

async function releaseBorrowedConnectionSet(capability, acquired = ACQUIRED_BORROWED_CONNECTION_SETS.get(capability)) {
  if (!acquired) return;
  if (acquired.released) return;
  acquired.released = true;
  ACQUIRED_BORROWED_CONNECTION_SETS.delete(capability);
  await releaseBorrowedResources({
    roleRecords: acquired.roleRecords,
    pools: acquired.pools,
  });
}

async function withConsumedBorrowedConnectionSet(borrowedConnectionSet, protocol, work) {
  const capability = consumeBorrowedConnectionSet(borrowedConnectionSet, protocol);
  let terminalError = null;
  try {
    return await work(requireBorrowedConnectionHandles(capability));
  } catch (caughtError) {
    terminalError = asProtocolError(caughtError);
    throw terminalError;
  } finally {
    try {
      await releaseBorrowedConnectionSet(borrowedConnectionSet, capability);
    } catch (releaseError) {
      if (terminalError) {
        appendSuppressed(terminalError, releaseError);
      } else {
        throw releaseError;
      }
    }
  }
}

async function withProtocolOwnedBorrowedConnectionSet({
  protocol,
  connectionOptionsByRole,
  serverDescriptorsByRole,
}, work) {
  const capability = await issueProtocolOwnedBorrowedConnectionSet({
    protocol,
    connectionOptionsByRole,
    serverDescriptorsByRole,
  });
  return withConsumedBorrowedConnectionSet(capability, protocol, work);
}

async function assertBorrowedConnectionIdentity(connection, descriptor, role, expectedConnectionId) {
  let rows;
  try {
    [rows] = await connection.query(
      'SELECT @@server_uuid AS serverUuid, @@port AS port, DATABASE() AS databaseName, CONNECTION_ID() AS connectionId'
    );
  } catch (error) {
    const wrapped = new Error(`borrowed connection ${role} identity readback failed`);
    wrapped.cause = error;
    throw wrapped;
  }

  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object') {
    throw new Error(`borrowed connection ${role} identity readback must return exactly one row`);
  }

  const actual = rows[0];
  if (actual.serverUuid !== descriptor.serverUuid) {
    throw new Error(`borrowed connection ${role} server UUID mismatch`);
  }
  if (!Number.isSafeInteger(actual.port) || actual.port !== descriptor.port) {
    throw new Error(`borrowed connection ${role} port mismatch`);
  }
  if (actual.databaseName !== descriptor.name) {
    throw new Error(`borrowed connection ${role} database mismatch`);
  }
  if (!Number.isSafeInteger(actual.connectionId) || actual.connectionId !== expectedConnectionId) {
    throw new Error(`borrowed connection ${role} physical connection identity mismatch`);
  }
}

async function assertBorrowedConnectionTopology(manifest, connections, protocol, physicalConnectionIds) {
  const identityRoles = protocol === 'same_server_single_transaction'
    ? ['local']
    : DATABASE_ROLES;
  for (const role of identityRoles) {
    await assertBorrowedConnectionIdentity(
      connections[role],
      manifest.databases[role],
      role,
      physicalConnectionIds.get(role)
    );
  }
}

function assertBorrowedConnectionThreadIds(acquired) {
  for (const role of DATABASE_ROLES) {
    const record = acquired.roleRecords?.[role];
    if (!record) {
      throw new Error(`acquisition-bound borrowed connection record is required for ${role}`);
    }
    if (requirePhysicalThreadId(record.connection, `${role} database`) !== record.threadId) {
      throw new Error(`${role} borrowed connection physical threadId drift detected`);
    }
  }
}

function errorMessage(error) {
  try {
    if (typeof error?.message === 'string' && error.message.trim()) return error.message;
  } catch {
    // Fall through for hostile/frozen/non-standard thrown values.
  }
  try {
    const text = String(error);
    return text.trim() || 'protocol operation failed';
  } catch {
    return 'protocol operation failed';
  }
}

function asProtocolError(error) {
  try {
    if (error?.[PROTOCOL_ERROR_CARRIER] === true) return error;
  } catch {
    // A proxy may reject property reads; wrap it below.
  }
  try {
    if (error
        && (typeof error === 'object' || typeof error === 'function')
        && Object.isExtensible(error)) {
      // Preserve ordinary mutable Error identity. Existing recovery paths hold
      // that reference and must see metadata added by nested compensation.
      return error;
    }
  } catch {
    // Treat an exotic object that rejects extensibility inspection as an
    // immutable external boundary and carry it below.
  }
  const carrier = new Error(errorMessage(error));
  Object.defineProperty(carrier, PROTOCOL_ERROR_CARRIER, { value: true });
  try {
    Object.defineProperty(carrier, 'cause', {
      value: error,
      configurable: true,
      enumerable: false,
      writable: true,
    });
  } catch {
    // Native Error instances permit this, but do not let an exotic value mask
    // the terminal failure if a host object behaves unexpectedly.
  }
  return carrier;
}

async function requireVerification(work, context, required, label) {
  if (typeof work !== 'function') throw new Error(`${label} callback is required`);
  let result;
  try {
    result = await work(context);
  } catch (error) {
    // Verification callbacks are external boundaries. A frozen Error or a
    // primitive cannot carry the reconciliation metadata required by terminal
    // recovery, so preserve it as cause on a mutable protocol carrier.
    throw asProtocolError(error);
  }
  if (required.some((field) => result?.[field] !== true)) throw new Error(`${label} failed`);
  return result;
}

async function runCoordinatorTransaction(connection, label, work) {
  let transactionStarted = false;
  let commitAttempted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await work();
    commitAttempted = true;
    try {
      await connection.commit();
    } catch (caughtError) {
      const error = asProtocolError(caughtError);
      // The transaction body may already be durable even though the client
      // lost its COMMIT acknowledgement. This wrapper is used only for
      // coordinator state transitions, so every such outcome must reach the
      // caller as a reconciliation blocker rather than a retryable clean
      // failure.
      markError(error, 'writeAcknowledged', 'unknown');
      markError(error, 'requiresReadbackReconciliation', true);
      throw error;
    }
    transactionStarted = false;
    return result;
  } catch (caughtError) {
    const error = asProtocolError(caughtError);
    if (transactionStarted && !commitAttempted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        appendSuppressed(error, rollbackError);
      }
    }
    throw error;
  }
}

async function persistFailureStatusPreservingOriginal({
  connection,
  label,
  originalError,
  work,
}) {
  const error = asProtocolError(originalError);
  try {
    return await runCoordinatorTransaction(connection, label, work);
  } catch (statusError) {
    appendSuppressed(error, statusError);
    markError(error, 'requiresReadbackReconciliation', true);
    return Object.freeze({ persisted: false, row: null, error: statusError });
  }
}

async function runRecoveryStatusTransactionPreservingOriginal({
  connection,
  label,
  originalError,
  work,
}) {
  const error = asProtocolError(originalError);
  try {
    return Object.freeze({
      completed: true,
      result: await runCoordinatorTransaction(connection, label, work),
    });
  } catch (statusError) {
    appendSuppressed(error, statusError);
    markError(error, 'requiresReadbackReconciliation', true);
    return Object.freeze({ completed: false, error: statusError });
  }
}

function assertExactAffectedRows(result, label) {
  if (typeof result?.affectedRows !== 'number'
      || !Number.isSafeInteger(result.affectedRows)
      || result.affectedRows !== 1) {
    if (String(label).includes('stage marker')) {
      const error = new Error(`${label} update did not affect exactly one apply record (affectedRows must be exactly one)`);
      markError(error, 'writeAcknowledged', false);
      throw error;
    }
    const error = new Error(`${label} affectedRows must be exactly one`);
    markError(error, 'writeAcknowledged', false);
    throw error;
  }
}

function markError(error, property, value) {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return error;
  try {
    error[property] = value;
  } catch {
    // Frozen/custom errors are still valid operation errors. Metadata is only
    // advisory and must never mask the original failure.
  }
  return error;
}

function allowedRecoveryStatuses({ protocol, expectedStatus, ambiguousStages }) {
  if (protocol === 'same_server_single_transaction') {
    // A same-server COMMIT acknowledgement can only be recovered from the
    // durable DB_COMMITTED marker, or from the explicit post-verification
    // failure marker. STARTED/FAILED/unknown rows do not prove that the
    // transaction was committed and must never be rewritten by recovery.
    const candidate = expectedStatus ?? 'DB_COMMITTED';
    return SAME_SERVER_RECOVERY_STATUSES.has(candidate)
      ? new Set([candidate])
      : new Set();
  }

  if (protocol === 'cross_server_staged') {
    const stages = Array.isArray(ambiguousStages) ? ambiguousStages : [];
    const allowed = new Set();
    for (const stage of stages) {
      if (STAGE_EXPECTED_STATUS[stage]) allowed.add(STAGE_EXPECTED_STATUS[stage]);
      if (STAGE_COMMITTED_STATUS[stage]) allowed.add(STAGE_COMMITTED_STATUS[stage]);
    }
    if (allowed.size === 0 && expectedStatus) allowed.add(expectedStatus);
    return allowed;
  }

  return new Set();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseGenerationJson(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      const wrapped = new Error(`${label} committed generation JSON is invalid`);
      wrapped.cause = error;
      throw wrapped;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} committed generation JSON is invalid`);
  }
  return value;
}

function validateGenerationMap(generations, label, { requireAllRoles = true } = {}) {
  if (!generations || typeof generations !== 'object' || Array.isArray(generations)) {
    throw new Error(`${label} must be an object`);
  }

  if (requireAllRoles) {
    for (const role of STAGE_ORDER) {
      if (!Object.prototype.hasOwnProperty.call(generations, role)) {
        throw new Error(`${label}.${role} is required`);
      }
    }
  }

  for (const [role, generation] of Object.entries(generations)) {
    if (!STAGE_ORDER.includes(role)) {
      throw new Error(`${label}.${role} is not a supported database role`);
    }
    if (!Number.isSafeInteger(generation) || generation < 0) {
      throw new Error(`${label}.${role} must be a non-negative integer`);
    }
  }
  return generations;
}

function freezeGenerationMap(generations) {
  return Object.freeze({ ...generations });
}

function validateAppliedGenerations(appliedGenerations, beforeGenerations, label = 'appliedGenerations') {
  validateGenerationMap(beforeGenerations, 'beforeGenerations');
  validateGenerationMap(appliedGenerations, label);
  for (const role of STAGE_ORDER) {
    if (appliedGenerations[role] <= beforeGenerations[role]) {
      throw new Error(`${label}.${role} must advance beyond beforeGenerations.${role}`);
    }
  }
  return appliedGenerations;
}

function assertGenerationReadback(row, expectedGenerations, label) {
  if (expectedGenerations === undefined) return;
  const actual = parseGenerationJson(row?.committed_generation_json, label);
  if (canonicalJson(actual) !== canonicalJson(expectedGenerations)) {
    throw new Error(`${label} committed generation readback mismatch`);
  }
}

function validateStageGeneration(stage, stageGenerations, beforeGenerations) {
  if (!stageGenerations || typeof stageGenerations !== 'object' || Array.isArray(stageGenerations)) {
    throw new Error(`stage generation result for ${stage} must be an object`);
  }
  if (!Object.prototype.hasOwnProperty.call(stageGenerations, stage)) {
    throw new Error(`stage generation for ${stage} is required`);
  }
  const unexpectedStages = Object.keys(stageGenerations).filter((key) => key !== stage);
  if (unexpectedStages.length > 0) {
    throw new Error(`stage generation result for ${stage} contains unexpected roles: ${unexpectedStages.join(',')}`);
  }

  const generation = stageGenerations[stage];
  const before = beforeGenerations?.[stage];
  if (!Number.isSafeInteger(before) || before < 0) {
    throw new Error(`before generation for ${stage} must be a non-negative integer`);
  }
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new Error(`stage generation for ${stage} must be a non-negative integer`);
  }
  if (generation <= before) {
    throw new Error(`stage generation for ${stage} must advance beyond before generation`);
  }
  return generation;
}

function getRowField(row, camelName, snakeName) {
  if (Object.prototype.hasOwnProperty.call(row ?? {}, camelName)) {
    return { present: true, value: row[camelName] };
  }
  if (Object.prototype.hasOwnProperty.call(row ?? {}, snakeName)) {
    return { present: true, value: row[snakeName] };
  }
  return { present: false, value: undefined };
}

function assertApplyIdentityReadback(row, expectedIdentity, label) {
  const identity = expectedIdentity ?? {};
  const fields = [
    ['runId', 'run_id'],
    ['bundleHash', 'bundle_hash'],
    ['policySetHash', 'policy_set_hash'],
    ['decisionHash', 'decision_hash'],
    ['approvalId', 'approval_id'],
    ['mode', 'mode'],
    ['commitProtocol', 'commit_protocol']
  ];

  for (const [camelName, snakeName] of fields) {
    if (!Object.prototype.hasOwnProperty.call(identity, camelName)) continue;
    const actual = getRowField(row, camelName, snakeName);
    if (!actual.present || actual.value !== identity[camelName]) {
      throw new Error(`${label} ${camelName} identity readback mismatch`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(identity, 'beforeGenerations')) {
    const actualBefore = getRowField(row, 'beforeGenerations', 'before_generation_json');
    if (!actualBefore.present) {
      throw new Error(`${label} beforeGenerations identity readback mismatch`);
    }
    const parsedBefore = parseGenerationJson(actualBefore.value, `${label} before generations`);
    if (canonicalJson(parsedBefore) !== canonicalJson(identity.beforeGenerations)) {
      throw new Error(`${label} beforeGenerations identity readback mismatch`);
    }
  }
}

function readbackIdentity(row, runId, bundleHash, label, expectedIdentity) {
  const identity = expectedIdentity ?? { runId, bundleHash };
  assertApplyIdentityReadback(row, identity, label);
}

function buildApplyIdentity({
  runId,
  bundleHash,
  policySetHash,
  decisionHash,
  approvalId,
  mode,
  protocol,
  beforeGenerations
}) {
  const normalizedRunId = requireField(runId, 'runId');
  const normalizedBundleHash = requireField(bundleHash, 'bundleHash');
  const normalizedPolicySetHash = requireField(policySetHash, 'policySetHash');
  const normalizedDecisionHash = requireField(decisionHash, 'decisionHash');
  const normalizedMode = requireField(mode, 'mode');
  if (!APPLY_MODES.has(normalizedMode)) {
    throw new Error(`mode must be one of: ${Array.from(APPLY_MODES).join(', ')}`);
  }
  if (!APPLY_PROTOCOLS.has(protocol)) {
    throw new Error(`commit protocol is unsupported: ${protocol}`);
  }

  const normalizedApprovalId = approvalId === undefined || approvalId === null ? null : approvalId;
  if (normalizedApprovalId !== null
      && (!Number.isSafeInteger(normalizedApprovalId) || normalizedApprovalId < 1)) {
    throw new Error('approvalId must be a positive safe integer or null');
  }

  validateGenerationMap(beforeGenerations, 'beforeGenerations');
  return Object.freeze({
    runId: normalizedRunId,
    bundleHash: normalizedBundleHash,
    policySetHash: normalizedPolicySetHash,
    decisionHash: normalizedDecisionHash,
    approvalId: normalizedApprovalId,
    mode: normalizedMode,
    commitProtocol: protocol,
    beforeGenerations: Object.freeze({ ...beforeGenerations })
  });
}

async function readApplyRecord(
  connection,
  runId,
  bundleHash,
  label = 'apply record',
  expectedIdentity,
  { forUpdate = false } = {}
) {
  const lockClause = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(
    `SELECT status, committed_generation_json,
            run_id AS runId, bundle_hash AS bundleHash,
            policy_set_hash AS policySetHash, decision_hash AS decisionHash,
            approval_id AS approvalId, mode,
            commit_protocol AS commitProtocol, before_generation_json
     FROM ${APPLY_TABLE}
     WHERE run_id = ? AND bundle_hash = ?${lockClause}`,
    [runId, bundleHash]
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`${label} readback must return exactly one row`);
  }
  const row = rows[0];
  readbackIdentity(row, runId, bundleHash, label, expectedIdentity);
  return row;
}

async function persistIntent(connection, {
  runId,
  bundleHash,
  policySetHash,
  decisionHash,
  approvalId,
  mode,
  beforeGenerations,
  protocol,
  identity,
  lockReadback = false
}) {
  const [result] = await connection.query(
    `INSERT INTO ${APPLY_TABLE}
       (run_id, bundle_hash, policy_set_hash, decision_hash, approval_id, mode, status,
        before_generation_json, commit_protocol, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'STARTED', ?, ?, NOW())`,
    [
      runId,
      bundleHash,
      policySetHash,
      decisionHash,
      approvalId,
      mode,
      JSON.stringify(beforeGenerations),
      protocol
    ]
  );
  assertExactAffectedRows(result, `${protocol} apply intent insert`);
  const expectedIdentity = identity ?? buildApplyIdentity({
    runId,
    bundleHash,
    policySetHash,
    decisionHash,
    approvalId,
    mode,
    protocol,
    beforeGenerations
  });
  const row = await readApplyRecord(
    connection,
    runId,
    bundleHash,
    `${protocol} apply intent`,
    expectedIdentity,
    { forUpdate: lockReadback }
  );
  if (row.status !== 'STARTED') {
    throw new Error(`${protocol} apply intent status readback mismatch`);
  }
  const actualBefore = parseGenerationJson(row.before_generation_json, `${protocol} apply intent`);
  if (canonicalJson(actualBefore) !== canonicalJson(beforeGenerations)) {
    throw new Error(`${protocol} apply intent generation readback mismatch`);
  }
  return row;
}

function statusSetClause(status, completed) {
  const safeStatus = String(status).replace(/[^A-Z_]/g, '');
  if (!safeStatus || safeStatus !== status) throw new Error('invalid apply status');
  return `status = '${safeStatus}'${completed ? ', completed_at = NOW()' : ''}`;
}

async function persistApplyStatus(connection, {
  runId,
  bundleHash,
  status,
  expectedStatus,
  expectedCommittedGenerations,
  committedGenerations,
  completed = false,
  label = `${status} apply status`,
  marker = false,
  identity,
  lockReadback = marker
}) {
  const where = ['run_id = ?', 'bundle_hash = ?'];
  const params = [runId, bundleHash];
  let setClause;

  if (marker) {
    setClause = `status = ?, committed_generation_json = ?${completed ? ', completed_at = NOW()' : ''}`;
    params.unshift(status, JSON.stringify(committedGenerations));
  } else {
    setClause = statusSetClause(status, completed);
  }

  if (expectedStatus !== undefined && expectedStatus !== null) {
    if (Array.isArray(expectedStatus)
        || typeof expectedStatus !== 'string'
        || !/^[A-Z][A-Z_]*$/.test(expectedStatus)) {
      throw new Error(`${label} expectedStatus must be one exact status`);
    }
    where.push('status = ?');
    params.push(expectedStatus);
  }

  // Every state transition is an identity-preserving CAS. This prevents a
  // late worker from updating a row that has been re-used/interleaved under
  // the same run/bundle key. `<=>` gives MySQL's NULL-safe comparison for the
  // optional approval id.
  if (identity) {
    where.push(
      'policy_set_hash = ?',
      'decision_hash = ?',
      'approval_id <=> ?',
      'mode = ?',
      'commit_protocol = ?',
      'before_generation_json = CAST(? AS JSON)'
    );
    params.push(
      identity.policySetHash,
      identity.decisionHash,
      identity.approvalId,
      identity.mode,
      identity.commitProtocol,
      JSON.stringify(identity.beforeGenerations)
    );
  }

  if (expectedCommittedGenerations !== undefined) {
    const expectedJson = JSON.stringify(expectedCommittedGenerations);
    if (expectedCommittedGenerations === null) {
      where.push('committed_generation_json IS NULL');
    } else {
      where.push('committed_generation_json = CAST(? AS JSON)');
      params.push(expectedJson);
    }
  }

  let result;
  try {
    [result] = await connection.query(
      `UPDATE ${APPLY_TABLE} SET ${setClause}
       WHERE ${where.join(' AND ')}`,
      params
    );
  } catch (error) {
    // The server may have applied the mutation even when its acknowledgement
    // was lost. Callers must treat this as an unknown write outcome and never
    // blindly downgrade/compensate a potentially terminal row.
    markError(error, 'writeAcknowledged', 'unknown');
    throw error;
  }
  try {
    assertExactAffectedRows(result, label);
  } catch (error) {
    markError(error, 'writeAcknowledged', false);
    throw error;
  }

  const expectedIdentity = identity ?? { runId, bundleHash };
  let row;
  try {
    row = await readApplyRecord(
      connection,
      runId,
      bundleHash,
      label,
      expectedIdentity,
      { forUpdate: lockReadback }
    );
  } catch (error) {
    // A successful UPDATE followed by an unreadable or mismatched row leaves
    // the durable outcome unknown. It is never equivalent to an acknowledged
    // write and must not unlock automatic compensation.
    markError(error, 'writeAcknowledged', 'unknown');
    throw error;
  }
  if (row.status !== status) {
    const error = new Error(`${label} status readback mismatch`);
    markError(error, 'writeAcknowledged', 'unknown');
    throw error;
  }
  try {
    assertGenerationReadback(row, committedGenerations, label);
  } catch (error) {
    markError(error, 'writeAcknowledged', 'unknown');
    throw error;
  }
  return row;
}

async function readApplyStatusSafely(
  connection,
  runId,
  bundleHash,
  identity,
  { forUpdate = false } = {}
) {
  // “Safely” means fail-closed, not “hide every read error”. Identity,
  // cardinality, and generation mismatches are evidence that this worker may
  // be looking at another writer's row; callers must observe and propagate
  // that fact before attempting any recovery CAS.
  return readApplyRecord(connection, runId, bundleHash, 'apply recovery', identity, { forUpdate });
}

async function persistFailureStatus(connection, {
  runId,
  bundleHash,
  status,
  expectedStatus,
  expectedCommittedGenerations,
  committedGenerations,
  label,
  identity,
  lockReadback = false
}) {
  try {
    const row = await persistApplyStatus(connection, {
      runId,
      bundleHash,
      status,
      expectedStatus,
      expectedCommittedGenerations,
      committedGenerations,
      completed: true,
      label,
      identity,
      lockReadback
    });
    return Object.freeze({ persisted: true, row, error: null });
  } catch (error) {
    try {
      const row = await readApplyStatusSafely(connection, runId, bundleHash, identity, {
        forUpdate: lockReadback
      });
      return Object.freeze({ persisted: false, row, error });
    } catch (readbackError) {
      // Preserve both the failed transition and the evidence that prevented a
      // trustworthy readback. A caller may retain the original operation error
      // while surfacing this as a reconciliation blocker.
      appendSuppressed(error, readbackError);
      markError(error, 'requiresReadbackReconciliation', true);
      return Object.freeze({ persisted: false, row: null, error, readbackError });
    }
  }
}

async function compensateApplyFailure({
  connection,
  connections,
  runId,
  bundleHash,
  beforeGenerations,
  appliedGenerations,
  committedStages,
  ambiguousStages,
  reason,
  expectedStatus,
  recoveryStatus,
  compensateWork,
  error,
  identity,
  statusWriteError = null
}) {
  error = asProtocolError(error);
  let compensationExpectedStatus;
  const hasAmbiguousStages = Array.isArray(ambiguousStages) && ambiguousStages.length > 0;
  const statusOutcomeUnknown = statusWriteError !== null
    || error?.writeAcknowledged === 'unknown'
    || error?.requiresReadbackReconciliation === true;
  const quarantineOnly = hasAmbiguousStages || statusOutcomeUnknown;
  const knownCommittedGenerations = quarantineOnly
    ? undefined
    : (Object.keys(appliedGenerations ?? {}).length > 0
      ? Object.freeze({ ...appliedGenerations })
      : undefined);

  // Observe the row before attempting a recovery transition. If another
  // worker has already claimed recovery (or finalized the apply), do not issue
  // a competing status write; the compare-and-swap below is a second race
  // barrier for callers that observe the old state.
  let existing;
  try {
    existing = await runCoordinatorTransaction(connection, 'recovery pre-read', () => readApplyStatusSafely(
      connection,
      runId,
      bundleHash,
      identity,
      { forUpdate: true }
    ));
  } catch (readbackError) {
    appendSuppressed(error, readbackError);
    markError(error, 'requiresReadbackReconciliation', true);
    return Object.freeze({ attempted: false, compensation: null, quarantined: true });
  }
  if (!existing) {
    const guardError = new Error('apply recovery status readback is unavailable');
    appendSuppressed(error, guardError);
    markError(error, 'requiresReadbackReconciliation', true);
    return Object.freeze({ attempted: false, compensation: null });
  }
  if (existing && RECOVERY_OWNER_STATUSES.has(existing.status)) {
    if (statusOutcomeUnknown) markError(error, 'requiresReadbackReconciliation', true);
    return Object.freeze({ attempted: false, compensation: null, row: existing });
  }

  // Recovery must claim a known state that is valid for this protocol and the
  // failure point. An unknown/FAILED/STARTED state outside that exact set is
  // not evidence that the attempted mutation is ours, so leave it untouched.
  const allowedStatuses = allowedRecoveryStatuses({
    protocol: identity?.commitProtocol,
    expectedStatus,
    ambiguousStages
  });
  if (!allowedStatuses.has(existing.status)) {
    const guardError = new Error('apply recovery status readback is not an allowed non-terminal state');
    appendSuppressed(error, guardError);
    markError(error, 'requiresReadbackReconciliation', true);
    return Object.freeze({ attempted: false, compensation: null, row: existing });
  }
  if (!existing.status || RECOVERY_OWNER_STATUSES.has(existing.status) || existing.status === 'COMMITTED') {
    const guardError = new Error('apply recovery status is terminal or already owned');
    appendSuppressed(error, guardError);
    markError(error, 'requiresReadbackReconciliation', true);
    return Object.freeze({ attempted: false, compensation: null, row: existing });
  }
  compensationExpectedStatus = existing.status;

  // Preserve the exact generation payload observed with the status. This is
  // the second CAS component for quarantine transitions and prevents a stale
  // worker from replacing a newer writer's marker. A malformed payload cannot
  // be used as proof and therefore blocks recovery altogether.
  let observedCommittedGenerations;
  try {
    observedCommittedGenerations = parseGenerationJson(
      existing.committed_generation_json,
      'compensation precondition'
    );
    if (observedCommittedGenerations !== null) {
      validateGenerationMap(observedCommittedGenerations, 'compensation precondition generations', {
        requireAllRoles: false
      });
    }
  } catch (guardError) {
    appendSuppressed(error, guardError);
    markError(error, 'requiresReadbackReconciliation', true);
    return Object.freeze({ attempted: false, compensation: null, quarantined: true, row: existing });
  }

  // Compensation is only safe when the exact committed-generation payload is
  // still the one produced by this operation. A drifted or unreadable row may
  // represent an external writer; fail closed without invoking user work.
  if (knownCommittedGenerations) {
    try {
      assertGenerationReadback(existing, knownCommittedGenerations, 'compensation precondition');
    } catch (guardError) {
      appendSuppressed(error, guardError);
      markError(error, 'requiresReadbackReconciliation', true);
      return Object.freeze({ attempted: false, compensation: null, row: existing });
    }
  }

  if (recoveryStatus && !compensationExpectedStatus) {
    const guardError = new Error('recovery status CAS has no non-terminal expected status');
    appendSuppressed(error, guardError);
    return Object.freeze({ attempted: false, compensation: null, row: existing });
  }

  let recoveryRow = existing;
  if (recoveryStatus) {
    const transition = await runRecoveryStatusTransactionPreservingOriginal({
      connection,
      label: `${recoveryStatus} recovery status`,
      originalError: error,
      work: () => persistFailureStatus(connection, {
        runId,
        bundleHash,
        status: recoveryStatus,
        expectedStatus: compensationExpectedStatus,
        expectedCommittedGenerations: observedCommittedGenerations,
        committedGenerations: observedCommittedGenerations,
        label: `${recoveryStatus} apply status`,
        identity,
        lockReadback: true
      }),
    });
    if (!transition.completed) {
      return Object.freeze({ attempted: false, compensation: null, quarantined: true });
    }
    const recovery = transition.result;
    if (!recovery.persisted) {
      // Another recovery worker may have won the CAS. Never overwrite or repeat
      // its recovery, and never mask the operation error with metadata failure.
      if (recovery.row && RECOVERY_OWNER_STATUSES.has(recovery.row.status)) {
        return Object.freeze({ attempted: false, compensation: null, row: recovery.row });
      }
      appendSuppressed(error, recovery.error);
      markError(error, 'requiresReadbackReconciliation', true);
      return Object.freeze({ attempted: false, compensation: null });
    }
    recoveryRow = recovery.row ?? existing;
    compensationExpectedStatus = recoveryStatus;
  }

  // An ambiguous stage has no trustworthy committed-generation snapshot. It
  // is safe to durably quarantine the apply for a dedicated recovery worker,
  // but unsafe to run user compensation or claim COMPENSATING here.
  if (quarantineOnly) {
    markError(error, 'requiresReadbackReconciliation', true);
    return Object.freeze({
      attempted: false,
      compensation: null,
      quarantined: true,
      row: recoveryRow
    });
  }

  if (typeof compensateWork !== 'function') {
    return Object.freeze({ attempted: false, compensation: null });
  }

  const compensationTransition = await runRecoveryStatusTransactionPreservingOriginal({
    connection,
    label: 'COMPENSATING recovery status',
    originalError: error,
    work: () => persistFailureStatus(connection, {
      runId,
      bundleHash,
      status: 'COMPENSATING',
      expectedStatus: compensationExpectedStatus,
      expectedCommittedGenerations: knownCommittedGenerations,
      committedGenerations: knownCommittedGenerations,
      label: 'COMPENSATING apply status',
      identity,
      lockReadback: true
    }),
  });
  if (!compensationTransition.completed) {
    return Object.freeze({ attempted: false, compensation: null, quarantined: true });
  }
  const compensationStatus = compensationTransition.result;

  if (!compensationStatus.persisted) {
    // Another recovery worker may have won the CAS. Never overwrite or repeat
    // its recovery, and never mask the operation error with metadata failure.
    if (compensationStatus.row && RECOVERY_OWNER_STATUSES.has(compensationStatus.row.status)) {
      return Object.freeze({ attempted: false, compensation: null, row: compensationStatus.row });
    }
    appendSuppressed(error, compensationStatus.error);
    markError(error, 'requiresReadbackReconciliation', true);
    return Object.freeze({ attempted: false, compensation: null });
  }

  try {
    const compensation = await compensateWork({
      connections: connections ?? { maint: connection, relation: connection, local: connection },
      runId,
      bundleHash,
      beforeGenerations,
      appliedGenerations,
      committedStages,
      ambiguousStages,
      reason
    });
    if (compensation?.status !== 'compensated') {
      throw new Error('compensation did not complete');
    }

    await runCoordinatorTransaction(connection, 'COMPENSATED recovery status', () => persistApplyStatus(connection, {
      runId,
      bundleHash,
      status: 'COMPENSATED',
      expectedStatus: 'COMPENSATING',
      expectedCommittedGenerations: knownCommittedGenerations,
      committedGenerations: knownCommittedGenerations,
      completed: true,
      label: 'COMPENSATED apply status',
      identity,
      lockReadback: true
    }));
    attachCompensation(error, compensation);
    return Object.freeze({ attempted: true, compensation });
  } catch (caughtCompensationError) {
    const compensationError = asProtocolError(caughtCompensationError);
    // A failed compensation callback or an uncertain COMPENSATED transition
    // means the original post-commit operation is no longer self-verifying.
    // Even if the fallback terminal marker is later written, a recovery
    // observer must read back the data and apply row before anything retries.
    markError(compensationError, 'requiresReadbackReconciliation', true);
    markError(error, 'requiresReadbackReconciliation', true);
    try {
      await runCoordinatorTransaction(connection, 'COMPENSATION_FAILED recovery status', () => persistApplyStatus(connection, {
        runId,
        bundleHash,
        status: 'COMPENSATION_FAILED',
        expectedStatus: 'COMPENSATING',
        expectedCommittedGenerations: knownCommittedGenerations,
        committedGenerations: knownCommittedGenerations,
        completed: true,
        label: 'COMPENSATION_FAILED apply status',
        identity,
        lockReadback: true
      }));
    } catch (statusError) {
      appendSuppressed(compensationError, statusError);
      // The compensation callback has already failed. If its durable terminal
      // marker is also unknown, the caller cannot safely infer either the
      // data state or who owns recovery; retain that uncertainty on the
      // original operation error so the outer runner must reconcile it.
      markError(compensationError, 'requiresReadbackReconciliation', true);
      markError(error, 'requiresReadbackReconciliation', true);
    }
    appendSuppressed(error, compensationError);
    return Object.freeze({ attempted: true, compensation: null });
  }
}

function assertManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('manifest is required');
  }

  REQUIRED_MANIFEST_FIELDS.forEach((field) => {
    if (!manifest[field]) throw new Error(`manifest.${field} is required`);
  });

  if (!Number.isSafeInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) {
    throw new Error('manifest.schemaVersion must be a positive integer');
  }
  requireField(manifest.runId, 'manifest.runId');

  if (!manifest.databases || typeof manifest.databases !== 'object' || Array.isArray(manifest.databases)) {
    throw new Error('manifest.databases is required');
  }

  const unknownRoles = Object.keys(manifest.databases)
    .filter((role) => !DATABASE_ROLES.includes(role));
  if (unknownRoles.length > 0) {
    throw new Error(`manifest.databases contains unknown role: ${unknownRoles.join(',')}`);
  }

  DATABASE_ROLES.forEach((role) => {
    if (!manifest.databases[role]) {
      throw new Error(`manifest.databases.${role} is required`);
    }
  });

  const validateServerDescriptor = (descriptor, label, expectedRole, { requireDatabaseProof = false } = {}) => {
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
      throw new Error(`${label} must be an object`);
    }
    if (expectedRole !== undefined) {
      const role = requireField(descriptor.role, `${label}.role`);
      if (role !== expectedRole) {
        throw new Error(`${label}.role must be ${expectedRole}`);
      }
    }
    requireField(descriptor.host, `${label}.host`);
    if (!Number.isSafeInteger(descriptor.port) || descriptor.port < 1 || descriptor.port > 65535) {
      throw new Error(`${label}.port must be an integer between 1 and 65535`);
    }
    requireField(descriptor.serverUuid, `${label}.serverUuid`);

    if (requireDatabaseProof || descriptor.name !== undefined) {
      const name = requireField(descriptor.name, `${label}.name`);
      if (!/^[A-Za-z0-9_$-]+$/.test(name)) {
        throw new Error(`${label}.name is not a valid database identifier`);
      }
    }

    // A single-transaction or staged write is only safe with explicit proof
    // that every target supports transactions and uses InnoDB. Omission is
    // therefore failure, not an implicit capability grant.
    if (requireDatabaseProof) {
      for (const capabilityField of ['supportsTransactions', 'allTablesInnoDB']) {
        if (typeof descriptor[capabilityField] !== 'boolean') {
          throw new Error(`${label}.${capabilityField} must be boolean`);
        }
        if (!descriptor[capabilityField]) {
          throw new Error(`${label}.${capabilityField} must be true for a writable apply`);
        }
      }
    }

    if (descriptor.transactionCapable !== undefined) {
      if (typeof descriptor.transactionCapable !== 'boolean') {
        throw new Error(`${label}.transactionCapable must be boolean`);
      }
      if (!descriptor.transactionCapable) {
        throw new Error(`${label}.transactionCapable must be true for a writable apply`);
      }
    }

    if (descriptor.engine !== undefined) {
      if (typeof descriptor.engine !== 'string' || descriptor.engine.trim().toUpperCase() !== 'INNODB') {
        throw new Error(`${label}.engine must be InnoDB`);
      }
    }
    if (descriptor.engines !== undefined) {
      const engines = descriptor.engines;
      const values = Array.isArray(engines) ? engines : Object.values(engines ?? {});
      if (!engines || typeof engines !== 'object' || values.length === 0
          || values.some((engine) => typeof engine !== 'string' || engine.trim().toUpperCase() !== 'INNODB')) {
        throw new Error(`${label}.engines must contain only InnoDB entries`);
      }
    }
    return descriptor;
  };

  validateServerDescriptor(manifest.serverIdentity, 'manifest.serverIdentity');
  const identityKey = `${manifest.serverIdentity.host}:${manifest.serverIdentity.port}:${manifest.serverIdentity.serverUuid}`;
  const descriptorKeys = new Set();
  DATABASE_ROLES.forEach((role) => {
    const descriptor = validateServerDescriptor(
      manifest.databases[role],
      `manifest.databases.${role}`,
      role,
      { requireDatabaseProof: true }
    );
    descriptorKeys.add(`${descriptor.host}:${descriptor.port}:${descriptor.serverUuid}`);
  });
  if (!descriptorKeys.has(identityKey)) {
    throw new Error('manifest.serverIdentity must match at least one database descriptor');
  }

  return true;
}

function classifyServers(manifest) {
  const serverIds = new Set();
  DATABASE_ROLES.forEach((role) => {
    const db = manifest.databases[role];
    const serverId = `${db.host}:${db.port}:${db.serverUuid}`;
    serverIds.add(serverId);
  });

  return {
    isSameServer: serverIds.size === 1,
    serverCount: serverIds.size,
    serverIds: Array.from(serverIds)
  };
}

function determineCommitProtocolFromValidatedManifest(manifest) {
  const classification = classifyServers(manifest);

  if (classification.isSameServer) {
    return Object.freeze({
      protocol: 'same_server_single_transaction',
      serverCount: 1,
      requiresStaging: false,
      canUseSingleTransaction: true
    });
  }

  return Object.freeze({
    protocol: 'cross_server_staged',
    serverCount: classification.serverCount,
    requiresStaging: true,
    canUseSingleTransaction: false,
    stageOrder: ['maint', 'relation', 'local']
  });
}

export function determineCommitProtocol(manifest) {
  const manifestSnapshot = snapshotManifest(manifest);
  assertManifest(manifestSnapshot);
  return determineCommitProtocolFromValidatedManifest(manifestSnapshot);
}

function requireExecutorManifest(manifest, runId, expectedProtocol) {
  const manifestSnapshot = snapshotManifest(manifest);
  assertManifest(manifestSnapshot);
  const selection = determineCommitProtocolFromValidatedManifest(manifestSnapshot);
  if (manifestSnapshot.runId !== runId) {
    throw new Error('manifest.runId must match runId');
  }
  if (selection.protocol !== expectedProtocol) {
    throw new Error(`manifest protocol must be ${expectedProtocol} for this executor`);
  }
  return Object.freeze({ manifest: manifestSnapshot, selection });
}

export async function executeSameServerTransaction({
  manifest,
  connectionConfig,
  connections: suppliedConnections,
  pools,
  borrowedConnectionSet,
  borrowedConnections,
  runId,
  bundleHash,
  policySetHash,
  decisionHash,
  approvalId,
  mode,
  beforeGenerations,
  applyWork,
  preCommitVerifyWork,
  postCommitVerifyWork,
  compensateWork
} = {}) {
  requireField(runId, 'runId');
  requireField(bundleHash, 'bundleHash');
  requireField(mode, 'mode');
  const executorManifest = requireExecutorManifest(
    manifest,
    runId,
    'same_server_single_transaction'
  );
  rejectCallerSuppliedMysqlHandles({
    connections: suppliedConnections,
    pools,
    borrowedConnectionSet,
    borrowedConnections,
  });
  const connectionOptionsByRole = canonicalConnectionOptionsByRole(
    executorManifest.manifest,
    snapshotCanonicalConnectionConfig(connectionConfig),
    executorManifest.selection.protocol
  );
  return withProtocolOwnedBorrowedConnectionSet(
    {
      protocol: 'same_server_single_transaction',
      connectionOptionsByRole,
      serverDescriptorsByRole: executorManifest.manifest.databases,
    },
    async (acquired) => {
  const connections = acquired.connections;
  if (connections.maint !== connections.relation || connections.relation !== connections.local) {
    throw new Error('same-server protocol requires one shared transaction connection');
  }

  if (!beforeGenerations || typeof beforeGenerations !== 'object') {
    throw new Error('beforeGenerations is required');
  }
  validateGenerationMap(beforeGenerations, 'beforeGenerations');

  if (typeof applyWork !== 'function') {
    throw new Error('applyWork callback is required');
  }
  const txnConnection = requireCoordinatorTransaction(connections.local);
  const physicalConnectionIds = acquired.physicalConnectionIds;
  const frozenBeforeGenerations = freezeGenerationMap(beforeGenerations);
  const identity = buildApplyIdentity({
    runId,
    bundleHash,
    policySetHash,
    decisionHash,
    approvalId,
    mode,
    protocol: 'same_server_single_transaction',
    beforeGenerations: frozenBeforeGenerations
  });

  // Use one transaction-capable local connection as the coordinator. Calling
  // transaction methods rather than transaction SQL through a generic query
  // interface prevents a pool from silently splitting the work across
  // physical connections.
  let databaseCommitted = false;
  let transactionStarted = false;

  try {
    await assertBorrowedConnectionTopology(
      executorManifest.manifest,
      connections,
      'same_server_single_transaction',
      physicalConnectionIds
    );
    await txnConnection.beginTransaction();
    transactionStarted = true;
    // The coordinator must still be the exact server, schema, and physical
    // session we verified before BEGIN. threadId alone is not an identity
    // proof, so this full SQL readback is deliberately the first operation
    // after beginTransaction and precedes the durable intent write.
    await assertBorrowedConnectionTopology(
      executorManifest.manifest,
      connections,
      'same_server_single_transaction',
      physicalConnectionIds
    );
    assertBorrowedConnectionThreadIds(acquired);
    await persistIntent(txnConnection, {
      runId,
      bundleHash,
      policySetHash,
      decisionHash,
      approvalId,
      mode,
      beforeGenerations: frozenBeforeGenerations,
      protocol: 'same_server_single_transaction',
      identity,
      lockReadback: true
    });

    // Verify the current state while the intent is recorded, but before any
    // business-table mutation begins. This ordering is part of the commit
    // contract: a failed precondition must not produce a partial apply.
    await requireVerification(preCommitVerifyWork, {
      connections,
      runId,
      beforeGenerations: frozenBeforeGenerations,
      appliedGenerations: freezeGenerationMap(frozenBeforeGenerations)
    }, ['relationIntegrity'], 'pre-commit verification');

    const appliedGenerations = await applyWork({
      connections,
      runId,
      beforeGenerations: frozenBeforeGenerations,
      transactionActive: true
    });
    if (!appliedGenerations || typeof appliedGenerations !== 'object' || Array.isArray(appliedGenerations)) {
      throw new Error('applyWork must return appliedGenerations object');
    }
    validateAppliedGenerations(appliedGenerations, frozenBeforeGenerations);
    const frozenAppliedGenerations = Object.freeze({ ...appliedGenerations });

    await persistApplyStatus(txnConnection, {
      runId,
      bundleHash,
      status: 'DB_COMMITTED',
      expectedStatus: 'STARTED',
      expectedCommittedGenerations: null,
      committedGenerations: frozenAppliedGenerations,
      label: 'DB_COMMITTED apply status',
      marker: true,
      identity
    });

    try {
      await txnConnection.commit();
      databaseCommitted = true;
      transactionStarted = false;
    } catch (commitError) {
      // A connection error does not tell us whether the server committed. Do
      // not issue a blind ROLLBACK; route the outcome through recovery.
      const error = asProtocolError(commitError);
      databaseCommitted = true;
      transactionStarted = false;
      markError(error, 'requiresReadbackReconciliation', true);
      try {
        await compensateApplyFailure({
          connection: txnConnection,
          connections,
          runId,
          bundleHash,
          beforeGenerations: frozenBeforeGenerations,
          appliedGenerations: frozenAppliedGenerations,
          committedStages: {},
          ambiguousStages: STAGE_ORDER.slice(),
          reason: 'ambiguous_commit_outcome',
          expectedStatus: 'DB_COMMITTED',
          recoveryStatus: 'COMPENSATION_REQUIRED',
          compensateWork,
          error,
          identity
        });
      } catch (recoveryError) {
        appendSuppressed(error, recoveryError);
        markError(error, 'requiresReadbackReconciliation', true);
      }
      throw error;
    }

    try {
      await requireVerification(postCommitVerifyWork, {
        connections,
        runId,
        appliedGenerations: frozenAppliedGenerations
      },
        ['apiSamples', 'cacheVisible'], 'post-commit verification');
    } catch (error) {
      const failure = await persistFailureStatusPreservingOriginal({
        connection: txnConnection,
        label: 'POST_VERIFY_FAILED status',
        originalError: error,
        work: () => persistFailureStatus(txnConnection, {
          runId,
          bundleHash,
          status: 'POST_VERIFY_FAILED',
          expectedStatus: 'DB_COMMITTED',
          expectedCommittedGenerations: frozenAppliedGenerations,
          committedGenerations: frozenAppliedGenerations,
          label: 'POST_VERIFY_FAILED apply status',
          identity,
          lockReadback: true
        }),
      });
      if (!failure.persisted) appendSuppressed(error, failure.error);
      await compensateApplyFailure({
        connection: txnConnection,
        connections,
        runId,
        bundleHash,
        beforeGenerations: frozenBeforeGenerations,
        appliedGenerations: frozenAppliedGenerations,
        committedStages: {},
        ambiguousStages: [],
        reason: 'post_commit_verification_failed',
        expectedStatus: failure.persisted ? 'POST_VERIFY_FAILED' : (failure.row?.status ?? 'DB_COMMITTED'),
        // A confirmed POST_VERIFY_FAILED marker already identifies the exact
        // recovery state; transition directly to COMPENSATING. Only an
        // unacknowledged/mismatched failure write needs a durable quarantine
        // marker before recovery can be retried.
        recoveryStatus: failure.persisted ? undefined : 'COMPENSATION_REQUIRED',
        compensateWork,
        error,
        identity,
        statusWriteError: failure.persisted ? null : failure.error
      });
      throw error;
    }

    try {
      await runCoordinatorTransaction(txnConnection, 'same-server final status', () => persistApplyStatus(txnConnection, {
        runId,
        bundleHash,
        status: 'COMMITTED',
        expectedStatus: 'DB_COMMITTED',
        expectedCommittedGenerations: frozenAppliedGenerations,
        committedGenerations: frozenAppliedGenerations,
        completed: true,
        label: 'COMMITTED apply status',
        identity,
        lockReadback: true
      }));
    } catch (caughtStatusError) {
      const statusError = asProtocolError(caughtStatusError);
      // An exact-one final update followed by a lost/mismatched readback is an
      // ambiguous terminal outcome. Never downgrade a row that may already be
      // COMMITTED; leave reconciliation to a dedicated recovery observer.
      if (statusError?.writeAcknowledged !== false) {
        try {
          const observed = await runCoordinatorTransaction(txnConnection, 'final status reconciliation readback', () => (
            readApplyStatusSafely(txnConnection, runId, bundleHash, identity, { forUpdate: true })
          ));
          if (observed?.status === 'COMMITTED') {
            markError(statusError, 'terminalStatusObserved', true);
          }
        } catch (readbackError) {
          appendSuppressed(statusError, readbackError);
        }
        markError(statusError, 'requiresReadbackReconciliation', true);
      } else {
        await compensateApplyFailure({
          connection: txnConnection,
          connections,
          runId,
          bundleHash,
          beforeGenerations: frozenBeforeGenerations,
          appliedGenerations: frozenAppliedGenerations,
          committedStages: {},
          ambiguousStages: [],
          reason: 'final_status_persistence_failed',
          expectedStatus: 'DB_COMMITTED',
          expectedCommittedGenerations: frozenAppliedGenerations,
          recoveryStatus: 'COMPENSATION_REQUIRED',
          compensateWork,
          error: statusError,
          identity,
          statusWriteError: statusError
        });
      }
      throw statusError;
    }

    return Object.freeze({
      protocol: 'same_server_single_transaction',
      status: 'committed',
      appliedGenerations: frozenAppliedGenerations
    });
  } catch (error) {
    if (transactionStarted && !databaseCommitted) {
      try {
        await txnConnection.rollback();
      } catch (rollbackError) {
        console.error('Transaction rollback failed:', rollbackError);
      }
    }
    throw error;
  }
    }
  );
}

export async function executeStagedProtocol({
  manifest,
  connectionConfig,
  connections: suppliedConnections,
  pools,
  borrowedConnectionSet,
  borrowedConnections,
  runId,
  bundleHash,
  policySetHash,
  decisionHash,
  approvalId,
  mode,
  beforeGenerations,
  applyWork,
  preCommitVerifyWork,
  postCommitVerifyWork,
  compensateWork
} = {}) {
  requireField(runId, 'runId');
  requireField(bundleHash, 'bundleHash');
  requireField(mode, 'mode');
  const executorManifest = requireExecutorManifest(
    manifest,
    runId,
    'cross_server_staged'
  );
  rejectCallerSuppliedMysqlHandles({
    connections: suppliedConnections,
    pools,
    borrowedConnectionSet,
    borrowedConnections,
  });
  const connectionOptionsByRole = canonicalConnectionOptionsByRole(
    executorManifest.manifest,
    snapshotCanonicalConnectionConfig(connectionConfig),
    executorManifest.selection.protocol
  );
  return withProtocolOwnedBorrowedConnectionSet(
    {
      protocol: 'cross_server_staged',
      connectionOptionsByRole,
      serverDescriptorsByRole: executorManifest.manifest.databases,
    },
    async (acquired) => {
  const connections = acquired.connections;
  requireConnectionTopology(connections, 'cross_server_staged');

  if (!beforeGenerations || typeof beforeGenerations !== 'object') {
    throw new Error('beforeGenerations is required');
  }
  validateGenerationMap(beforeGenerations, 'beforeGenerations');

  if (typeof applyWork !== 'function') {
    throw new Error('applyWork callback is required');
  }
  const coordinator = requireCoordinatorTransaction(connections.local);
  const physicalConnectionIds = acquired.physicalConnectionIds;
  const frozenBeforeGenerations = freezeGenerationMap(beforeGenerations);
  const identity = buildApplyIdentity({
    runId,
    bundleHash,
    policySetHash,
    decisionHash,
    approvalId,
    mode,
    protocol: 'cross_server_staged',
    beforeGenerations: frozenBeforeGenerations
  });

  // The intent is durable before any remote stage starts. The coordinator
  // transaction capability is checked first so a FOR UPDATE claim can never
  // be mistaken for a durable lock under autocommit.
  await assertBorrowedConnectionTopology(
    executorManifest.manifest,
    connections,
    'cross_server_staged',
    physicalConnectionIds
  );
  await runCoordinatorTransaction(coordinator, 'staged apply intent', () => persistIntent(coordinator, {
    runId,
    bundleHash,
    policySetHash,
    decisionHash,
    approvalId,
    mode,
    beforeGenerations: frozenBeforeGenerations,
    protocol: 'cross_server_staged',
    identity,
    lockReadback: true
  }));

  const committedStages = {};
  const ambiguousStages = new Set();
  let durableStatus = 'STARTED';
  let failureReason = 'partial_commit_or_post_commit_verification_failed';
  let finalStatusError = null;

  try {
    await requireVerification(preCommitVerifyWork, {
      connections,
      runId,
      beforeGenerations: frozenBeforeGenerations,
      appliedGenerations: Object.freeze({})
    }, ['relationIntegrity'], 'pre-commit verification');

    for (const stage of STAGE_ORDER) {
      const expectedStatus = STAGE_EXPECTED_STATUS[stage];
      const stageIndex = STAGE_ORDER.indexOf(stage);
      let transactionStarted = false;
      let applyStarted = false;
      let markerAttempted = false;
      let commitAttempted = false;

      try {
        await coordinator.beginTransaction();
        transactionStarted = true;

        const shouldProceed = await checkStagedPreconditions(
          coordinator,
          runId,
          bundleHash,
          stage,
          committedStages,
          identity
        );
        if (!shouldProceed) {
          throw new Error(`staged precondition failed for ${stage}`);
        }

        applyStarted = true;
        const stageGenerations = await applyWork({
          connections: { [stage]: connections[stage] },
          runId,
          beforeGenerations: freezeGenerationMap({ [stage]: frozenBeforeGenerations[stage] }),
          stage,
          transactionActive: false,
          coordinatorTransactionActive: true
        });
        validateStageGeneration(stage, stageGenerations, frozenBeforeGenerations);

        const expectedCommittedGenerations = stageIndex === 0
          ? null
          : Object.freeze({ ...committedStages });
        const committedGenerationJson = Object.freeze({
          ...committedStages,
          [stage]: stageGenerations[stage]
        });
        markerAttempted = true;
        await persistApplyStatus(coordinator, {
          runId,
          bundleHash,
          status: STAGE_COMMITTED_STATUS[stage],
          expectedStatus,
          expectedCommittedGenerations,
          committedGenerations: committedGenerationJson,
          label: `${stage.toUpperCase()} stage marker`,
          marker: true,
          identity
        });

        commitAttempted = true;
        try {
          await coordinator.commit();
          transactionStarted = false;
        } catch (commitError) {
          // A lost COMMIT acknowledgement leaves both the remote write and
          // the marker outcome unknown. Never issue a blind rollback.
          transactionStarted = false;
          ambiguousStages.add(stage);
          throw commitError;
        }

        committedStages[stage] = stageGenerations[stage];
        durableStatus = STAGE_COMMITTED_STATUS[stage];
      } catch (caughtError) {
        const error = asProtocolError(caughtError);
        // Once apply or marker work began, the remote stage may have committed
        // even if the callback/query reported an error. Preserve that stage as
        // ambiguous for recovery rather than writing a clean FAILED state.
        if (applyStarted || markerAttempted || commitAttempted || error?.preconditionUnknown) {
          ambiguousStages.add(stage);
        }
        if (transactionStarted && !commitAttempted) {
          try {
            await coordinator.rollback();
          } catch (rollbackError) {
            appendSuppressed(error, rollbackError);
          }
        }
        throw error;
      }
    }

    await requireVerification(postCommitVerifyWork, {
      connections,
      runId,
      appliedGenerations: Object.freeze({ ...committedStages })
    }, ['relationIntegrity', 'apiSamples', 'cacheVisible'], 'post-commit verification');

    try {
      await runCoordinatorTransaction(coordinator, 'staged final status', () => persistApplyStatus(coordinator, {
        runId,
        bundleHash,
        status: 'COMMITTED',
        expectedStatus: 'LOCAL_COMMITTED',
        expectedCommittedGenerations: Object.freeze({ ...committedStages }),
        committedGenerations: Object.freeze({ ...committedStages }),
        completed: true,
        label: 'COMMITTED apply status',
        identity,
        lockReadback: true
      }));
    } catch (error) {
      failureReason = 'final_status_persistence_failed';
      finalStatusError = error;
      throw error;
    }

    return Object.freeze({
      protocol: 'cross_server_staged',
      status: 'committed',
      appliedGenerations: Object.freeze({ ...committedStages })
    });
  } catch (caughtError) {
    const error = asProtocolError(caughtError);
    // A final COMMITTED mutation that was acknowledged (or whose outcome is
    // unknown) must not be downgraded by recovery. Leave it for reconciliation
    // even if a subsequent readback is unavailable.
    if (failureReason === 'final_status_persistence_failed'
        && finalStatusError?.writeAcknowledged !== false) {
      try {
        const observed = await runCoordinatorTransaction(coordinator, 'staged final status reconciliation readback', () => (
          readApplyStatusSafely(coordinator, runId, bundleHash, identity, { forUpdate: true })
        ));
        if (observed?.status === 'COMMITTED') markError(error, 'terminalStatusObserved', true);
      } catch (readbackError) {
        appendSuppressed(error, readbackError);
      }
      markError(error, 'requiresReadbackReconciliation', true);
      throw error;
    }

    const needsRecovery = Object.keys(committedStages).length > 0 || ambiguousStages.size > 0;
    if (!needsRecovery) {
      let failure;
      try {
        failure = await runCoordinatorTransaction(coordinator, 'staged FAILED status', () => (
          persistFailureStatus(coordinator, {
            runId,
            bundleHash,
            status: 'FAILED',
            expectedStatus: durableStatus,
            expectedCommittedGenerations: Object.keys(committedStages).length === 0
              ? null
              : Object.freeze({ ...committedStages }),
            label: 'FAILED apply status',
            identity,
            lockReadback: true
          })
        ));
      } catch (statusError) {
        appendSuppressed(error, statusError);
        markError(error, 'requiresReadbackReconciliation', true);
        throw error;
      }
      if (!failure.persisted) appendSuppressed(error, failure.error);
      throw error;
    }

    // When a stage outcome is ambiguous, the durable row may legitimately be
    // either the prior marker or the marker written just before a lost
    // acknowledgement. Let the recovery observer validate that live state;
    // never pass a broad historical status list into a CAS.
    const expectedStatus = ambiguousStages.size > 0 ? undefined : durableStatus;
    await compensateApplyFailure({
      connection: coordinator,
      connections,
      runId,
      bundleHash,
      beforeGenerations: frozenBeforeGenerations,
      appliedGenerations: Object.freeze({ ...committedStages }),
      committedStages: Object.freeze({ ...committedStages }),
      ambiguousStages: Array.from(ambiguousStages),
      reason: failureReason,
      expectedStatus,
      recoveryStatus: 'COMPENSATION_REQUIRED',
      compensateWork,
      error,
      identity,
      statusWriteError: failureReason === 'final_status_persistence_failed'
        ? finalStatusError
        : null
    });
    throw error;
  }
    }
  );
}

function attachCompensation(error, compensation) {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')) return;
  try {
    error.compensation = compensation;
  } catch {
    // Error metadata is best effort. Never mask the original operation error.
  }
}

function appendSuppressed(error, suppressed) {
  if (error === null || error === undefined || suppressed === null || suppressed === undefined) return;

  try {
    if (typeof error.addSuppressed === 'function') {
      try {
        error.addSuppressed(suppressed);
        return;
      } catch {
        // Fall through to the portable array representation when possible.
      }
    }

    if (Array.isArray(error.suppressed)) {
      try {
        error.suppressed.push(suppressed);
      } catch {
        // A frozen/custom error may reject metadata mutation; preserve the error.
      }
      return;
    }

    try {
      error.suppressed = [suppressed];
    } catch {
      // A primitive, frozen object, or throwing proxy cannot carry metadata.
    }
  } catch {
    // Metadata attachment must never replace the operation or compensation error.
  }
}

async function checkStagedPreconditions(
  coordinatorConnection,
  runId,
  bundleHash,
  stage,
  committedStages,
  identity
) {
  let rows;
  try {
    [rows] = await coordinatorConnection.query(
      `SELECT status, committed_generation_json,
              run_id AS runId, bundle_hash AS bundleHash,
              policy_set_hash AS policySetHash, decision_hash AS decisionHash,
              approval_id AS approvalId, mode,
              commit_protocol AS commitProtocol, before_generation_json
       FROM ${APPLY_TABLE}
       WHERE run_id = ? AND bundle_hash = ? FOR UPDATE`,
      [runId, bundleHash]
    );
  } catch (error) {
    markError(error, 'preconditionUnknown', true);
    throw error;
  }

  if (!Array.isArray(rows) || rows.length !== 1) {
    const error = new Error('staged precondition readback must return exactly one apply record');
    markError(error, 'preconditionUnknown', true);
    throw error;
  }

  const row = rows[0];
  try {
    readbackIdentity(row, runId, bundleHash, 'staged precondition', identity);
  } catch (error) {
    markError(error, 'preconditionUnknown', true);
    throw error;
  }
  const status = row.status;

  // Check that prior stages are committed
  const stageIndex = STAGE_ORDER.indexOf(stage);

  if (stageIndex < 0) return false;

  for (let i = 0; i < stageIndex; i++) {
    const priorStage = STAGE_ORDER[i];
    if (!Object.prototype.hasOwnProperty.call(committedStages, priorStage)
        || committedStages[priorStage] === null || committedStages[priorStage] === undefined) {
      return false;
    }
  }

  // Each stage can proceed only from the exact durable marker written by the
  // immediately preceding checkpoint. Recovery and terminal states must never
  // be treated as an invitation to resume a staged apply.
  if (status !== STAGE_EXPECTED_STATUS[stage]) return false;

  // The durable marker and the in-memory prefix must agree. A status-only
  // readback is insufficient: an interleaved writer could leave the expected
  // status with a different generation payload.
  const expectedGenerations = Object.fromEntries(
    STAGE_ORDER
      .slice(0, stageIndex)
      .filter((priorStage) => Object.prototype.hasOwnProperty.call(committedStages, priorStage))
      .map((priorStage) => [priorStage, committedStages[priorStage]])
  );
  let actualGenerations;
  try {
    actualGenerations = parseGenerationJson(
      row.committed_generation_json,
      'staged precondition'
    ) ?? {};
  } catch (error) {
    markError(error, 'preconditionUnknown', true);
    throw error;
  }
  if (canonicalJson(actualGenerations) !== canonicalJson(expectedGenerations)) {
    const error = new Error(`staged precondition generation readback mismatch for ${stage}`);
    markError(error, 'preconditionUnknown', true);
    throw error;
  }

  return true;
}

export function requireCompensationSnapshot(applyRecord) {
  if (!applyRecord || !applyRecord.status) {
    throw new Error('apply record is required');
  }

  const status = applyRecord.status;
  const protocol = applyRecord.commit_protocol;

  // Only an explicitly acknowledged terminal success is safe to treat as
  // non-recoverable. Every other status/protocol combination is fail-closed:
  // callers must obtain a recovery snapshot before attempting further work.
  if ((protocol === 'same_server_single_transaction' || protocol === 'cross_server_staged')
      && (status === 'COMMITTED' || status === 'COMPENSATED')) {
    return false;
  }
  return true;
}
