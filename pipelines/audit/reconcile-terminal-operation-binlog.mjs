#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { getProjectRoot } from '../lib/project-root.mjs';

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const BINLOG_NAME_PATTERN = /^binlog\.\d{6}$/;

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function requireText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function requireSha256(value, label) {
  const result = requireText(value, label);
  if (!SHA256_PATTERN.test(result)) throw new Error(`${label} must be sha256`);
  return result;
}

function requirePositiveInteger(value, label) {
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) throw new Error(`${label} must be a positive integer`);
  return result;
}

function tableOperationKey({ database, table, operation }) {
  return `${database}\u0000${table}\u0000${operation}`;
}

function normalizeTableOperations(values) {
  return values
    .map((value) => ({
      database: requireText(value?.database, 'table operation database'),
      table: requireText(value?.table, 'table operation table'),
      operation: requireText(value?.operation, 'table operation operation').toUpperCase(),
      count: requirePositiveInteger(value?.count, 'table operation count'),
    }))
    .sort((a, b) => tableOperationKey(a).localeCompare(tableOperationKey(b)));
}

function aggregateTableOperations(transactions) {
  const totals = new Map();
  for (const transaction of transactions) {
    for (const value of transaction.tableOperations) {
      const key = tableOperationKey(value);
      const current = totals.get(key) ?? { ...value, count: 0 };
      current.count += value.count;
      totals.set(key, current);
    }
  }
  return [...totals.values()].sort((a, b) => tableOperationKey(a).localeCompare(tableOperationKey(b)));
}

function parseEventEndPosition(line) {
  const match = line.match(/\bend_log_pos\s+(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function finalizeTransaction(current, line, eventPosition) {
  const xidMatch = line.match(/\bXid\s*=\s*(\d+)\b/);
  if (!xidMatch || current.rowEventCount === 0) return null;
  const endPosition = parseEventEndPosition(line);
  if (!Number.isInteger(endPosition)) throw new Error('mysqlbinlog Xid event is missing end_log_pos');
  return {
    startPosition: current.startPosition,
    endPosition,
    xidEventPosition: eventPosition,
    xid: Number(xidMatch[1]),
    threadId: current.threadId,
    originalCommitTimestampMicros: current.originalCommitTimestampMicros,
    originalCommitTimestamp: current.originalCommitTimestamp,
    rowEventCount: current.rowEventCount,
    tableOperations: normalizeTableOperations([...current.tableOperations.values()]),
  };
}

export function parseMysqlbinlogRowTransactions(decodedBinlog) {
  const input = requireText(decodedBinlog, 'decoded mysqlbinlog');
  const transactions = [];
  let firstGtidPosition = null;
  let gtidTransactionCount = 0;
  let eventPosition = null;
  let current = null;
  for (const line of input.split(/\r?\n/)) {
    const positionMatch = line.match(/^# at (\d+)$/);
    if (positionMatch) {
      eventPosition = Number(positionMatch[1]);
      continue;
    }
    if (/\bAnonymous_GTID\b/.test(line)) {
      if (!Number.isInteger(eventPosition)) throw new Error('mysqlbinlog GTID event is missing a start position');
      if (firstGtidPosition == null) firstGtidPosition = eventPosition;
      gtidTransactionCount += 1;
      current = {
        startPosition: eventPosition,
        threadId: null,
        originalCommitTimestampMicros: null,
        originalCommitTimestamp: null,
        rowEventCount: 0,
        tableOperations: new Map(),
      };
      continue;
    }
    if (!current) continue;
    const timestampMatch = line.match(/^# original_commit_timestamp=(\d+) \(([^)]+)\)$/);
    if (timestampMatch) {
      current.originalCommitTimestampMicros = timestampMatch[1];
      current.originalCommitTimestamp = timestampMatch[2];
      continue;
    }
    const threadMatch = line.match(/\bQuery\s+thread_id=(\d+)\b/);
    if (threadMatch) {
      current.threadId = Number(threadMatch[1]);
      continue;
    }
    const rowMatch = line.match(/^### (INSERT INTO|UPDATE|DELETE FROM) `([^`]+)`\.`([^`]+)`$/);
    if (rowMatch) {
      const operation = rowMatch[1].split(' ')[0];
      const value = { database: rowMatch[2], table: rowMatch[3], operation, count: 1 };
      const key = tableOperationKey(value);
      const prior = current.tableOperations.get(key);
      current.tableOperations.set(key, prior ? { ...prior, count: prior.count + 1 } : value);
      current.rowEventCount += 1;
      continue;
    }
    if (/\bXid\s*=/.test(line)) {
      const transaction = finalizeTransaction(current, line, eventPosition);
      if (transaction) transactions.push(transaction);
      current = null;
    }
  }
  if (current?.rowEventCount > 0) throw new Error('decoded mysqlbinlog ended before the row transaction Xid');
  if (transactions.length === 0) throw new Error('decoded mysqlbinlog contains no committed row transactions');
  return {
    firstGtidPosition,
    gtidTransactionCount,
    statementOnlyTransactionCount: gtidTransactionCount - transactions.length,
    transactions,
    rowEventCount: transactions.reduce((sum, transaction) => sum + transaction.rowEventCount, 0),
    tableOperations: aggregateTableOperations(transactions),
  };
}

function assertBytesHash(bytes, expected, label) {
  const actual = sha256(bytes);
  if (actual !== requireSha256(expected, `${label} expected hash`)) {
    throw new Error(`${label} hash drift: expected ${expected}, received ${actual}`);
  }
  return actual;
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function assertRotatedBinlog({ binlogPath, indexText }) {
  const name = path.basename(requireText(binlogPath, 'binlog path'));
  if (!BINLOG_NAME_PATTERN.test(name)) throw new Error('binlog path must name a numbered MySQL binlog');
  const names = requireText(indexText, 'binlog index')
    .split(/\r?\n/)
    .map((line) => path.basename(line.trim()))
    .filter(Boolean);
  const index = names.indexOf(name);
  if (index < 0) throw new Error('binlog is not listed in the bound binlog index');
  if (index === names.length - 1) throw new Error('active binlog cannot be immutable reconciliation evidence');
  return { name, indexEntry: names[index], rotated: true, successor: names[index + 1] };
}

function assertExpectedResults({ contract, parsed, decodedBinlog }) {
  const expected = contract.expected ?? {};
  const gtidTransactionCount = requirePositiveInteger(expected.gtidTransactionCount, 'expected GTID transaction count');
  const rowTransactionCount = requirePositiveInteger(expected.rowTransactionCount, 'expected row transaction count');
  const statementOnlyTransactionCount = Number(expected.statementOnlyTransactionCount);
  if (!Number.isInteger(statementOnlyTransactionCount) || statementOnlyTransactionCount < 0) {
    throw new Error('expected statement-only transaction count must be a nonnegative integer');
  }
  const rowEventCount = requirePositiveInteger(expected.rowEventCount, 'expected row event count');
  if (parsed.gtidTransactionCount !== gtidTransactionCount) {
    throw new Error(`GTID transaction count drift: expected ${gtidTransactionCount}, received ${parsed.gtidTransactionCount}`);
  }
  if (parsed.transactions.length !== rowTransactionCount) {
    throw new Error(`row transaction count drift: expected ${rowTransactionCount}, received ${parsed.transactions.length}`);
  }
  if (parsed.statementOnlyTransactionCount !== statementOnlyTransactionCount) {
    throw new Error(`statement-only transaction count drift: expected ${statementOnlyTransactionCount}, received ${parsed.statementOnlyTransactionCount}`);
  }
  if (parsed.rowEventCount !== rowEventCount) {
    throw new Error(`row event count drift: expected ${rowEventCount}, received ${parsed.rowEventCount}`);
  }
  const expectedOperations = normalizeTableOperations(expected.tableOperations ?? []);
  if (JSON.stringify(parsed.tableOperations) !== JSON.stringify(expectedOperations)) {
    throw new Error('table operation counts drifted from the immutable reconciliation contract');
  }
  const startPosition = requirePositiveInteger(contract.binlog?.startPosition, 'binlog start position');
  const stopPosition = requirePositiveInteger(contract.binlog?.stopPosition, 'binlog stop position');
  const firstRowTransactionPosition = requirePositiveInteger(expected.firstRowTransactionPosition, 'expected first row transaction position');
  if (parsed.firstGtidPosition !== startPosition
      || parsed.transactions[0].startPosition !== firstRowTransactionPosition
      || parsed.transactions.at(-1).endPosition !== stopPosition) {
    throw new Error('binlog transaction position range drifted');
  }
  const markers = Array.isArray(expected.markers) ? expected.markers.map((value) => requireText(value, 'required marker')) : [];
  for (const marker of markers) {
    if (!decodedBinlog.includes(marker)) throw new Error(`required marker is missing from decoded binlog: ${marker}`);
  }
  return {
    gtidTransactionCount,
    statementOnlyTransactionCount,
    rowTransactionCount,
    firstRowTransactionPosition,
    rowEventCount,
    tableOperations: expectedOperations,
    markers,
  };
}

export function reconcileTerminalOperationBinlog({
  contract,
  packetBytes,
  decisionLedgerBytes,
  terminalArtifactBytes = new Map(),
  binlogBytes,
  binlogIndexText,
  decodedBinlog,
} = {}) {
  if (Number(contract?.schemaVersion) !== 1) throw new Error('reconciliation contract schemaVersion must be 1');
  const operationId = requireText(contract.operationId, 'operationId');
  const decisionIdentity = requireText(contract.decisionIdentity, 'decisionIdentity');
  const bindingMode = requireText(contract.binding?.mode, 'binding mode');
  if (!['intrinsic-row-markers', 'cross-artifact-correlation'].includes(bindingMode)) {
    throw new Error('binding mode must be intrinsic-row-markers or cross-artifact-correlation');
  }
  const residualRisk = contract.binding?.residualRisk == null
    ? null
    : requireText(contract.binding.residualRisk, 'binding residual risk');
  if (bindingMode === 'cross-artifact-correlation' && residualRisk == null) {
    throw new Error('cross-artifact correlation requires an explicit residual risk');
  }
  const packetSha256 = assertBytesHash(packetBytes, contract.packet?.bytesSha256, 'packet');
  const packet = parseJsonBytes(packetBytes, 'packet');
  if (packet.operationId !== operationId || packet.decisionIdentity !== decisionIdentity) {
    throw new Error('packet operation or decision identity drifted');
  }
  const ledgerSha256 = assertBytesHash(decisionLedgerBytes, contract.decisionLedger?.bytesSha256, 'decision ledger');
  const ledger = parseJsonBytes(decisionLedgerBytes, 'decision ledger');
  if (!Array.isArray(ledger)) throw new Error('decision ledger must be a JSON array');
  const decision = ledger.find((entry) => entry?.decisionIdentity === decisionIdentity);
  const dispatchPermitHash = requireSha256(contract.decisionLedger?.dispatchPermitHash, 'dispatch permit hash');
  if (decision?.dispatchPermitHash !== dispatchPermitHash) {
    throw new Error('decision ledger dispatch permit hash drifted');
  }
  const binlogSha256 = assertBytesHash(binlogBytes, contract.binlog?.bytesSha256, 'binlog');
  const expectedSize = requirePositiveInteger(contract.binlog?.sizeBytes, 'binlog sizeBytes');
  if (Buffer.byteLength(binlogBytes) !== expectedSize) throw new Error('binlog size drifted');
  const rotation = assertRotatedBinlog({ binlogPath: contract.binlog?.path, indexText: binlogIndexText });
  const artifacts = [];
  for (const descriptor of contract.terminalArtifacts ?? []) {
    const artifactPath = requireText(descriptor?.path, 'terminal artifact path');
    const bytes = terminalArtifactBytes.get(artifactPath);
    if (bytes == null) throw new Error(`terminal artifact is missing: ${artifactPath}`);
    artifacts.push({ path: artifactPath, bytesSha256: assertBytesHash(bytes, descriptor.bytesSha256, `terminal artifact ${artifactPath}`) });
  }
  const parsed = parseMysqlbinlogRowTransactions(decodedBinlog);
  const expected = assertExpectedResults({ contract, parsed, decodedBinlog });
  const base = {
    schemaVersion: 1,
    operationId,
    decisionIdentity,
    status: 'RECONCILED',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    databaseWrites: false,
    permitReplay: false,
    currentTableCountInference: false,
    binding: {
      mode: bindingMode,
      intrinsicTransactionBinding: bindingMode === 'intrinsic-row-markers',
      residualRisk,
    },
    immutableEvidence: {
      packet: { path: contract.packet.path, bytesSha256: packetSha256, packetHash: packet.packetHash ?? null },
      decisionLedger: { path: contract.decisionLedger.path, bytesSha256: ledgerSha256, dispatchPermitHash },
      terminalArtifacts: artifacts,
      binlog: {
        path: contract.binlog.path,
        bytesSha256: binlogSha256,
        sizeBytes: expectedSize,
        indexPath: contract.binlog.indexPath,
        ...rotation,
        decodedWindowSha256: sha256(Buffer.from(decodedBinlog)),
        startPosition: contract.binlog.startPosition,
        stopPosition: contract.binlog.stopPosition,
      },
    },
    assertions: {
      packetBound: true,
      decisionLedgerBound: true,
      dispatchPermitConsumed: true,
      binlogRotated: true,
      binlogHashBound: true,
      transactionRangeBound: true,
      tableOperationCountsBound: true,
      requiredMarkersPresent: true,
      noReplay: true,
      noCurrentCountInference: true,
    },
    executionEnvelope: {
      startPosition: contract.binlog.startPosition,
      stopPosition: contract.binlog.stopPosition,
      gtidTransactionCount: parsed.gtidTransactionCount,
      statementOnlyTransactionCount: parsed.statementOnlyTransactionCount,
      rowTransactionCount: parsed.transactions.length,
      firstRowTransactionPosition: parsed.transactions[0].startPosition,
    },
    changedRows: {
      total: parsed.rowEventCount,
      tableOperations: parsed.tableOperations,
    },
    expected,
    transactions: parsed.transactions,
  };
  return { ...base, resultHash: sha256(Buffer.from(JSON.stringify(base))) };
}

function parseArgs(argv) {
  const result = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key, ...rest] = token.slice(2).split('=');
    result[key] = rest.join('=') || true;
  }
  return result;
}

function requireRepositoryFile(root, relativePath, label) {
  const target = path.resolve(root, requireText(relativePath, label));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} must stay inside the repository`);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be an ordinary file`);
  return target;
}

function decodeBinlog({ binary, binlogPath, startPosition, stopPosition }) {
  const result = spawnSync(binary, [
    '--base64-output=DECODE-ROWS',
    '-vv',
    `--start-position=${startPosition}`,
    `--stop-position=${stopPosition}`,
    binlogPath,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`mysqlbinlog failed with exit ${result.status}: ${result.stderr}`);
  return result.stdout;
}

export function runTerminalOperationBinlogReconciliation({ contractPath, outputPath, mysqlbinlogBinary = 'mysqlbinlog' } = {}) {
  const root = getProjectRoot();
  const resolvedContract = requireRepositoryFile(root, contractPath, 'reconciliation contract');
  const contract = JSON.parse(fs.readFileSync(resolvedContract, 'utf8'));
  const packetPath = requireRepositoryFile(root, contract.packet?.path, 'packet');
  const ledgerPath = requireRepositoryFile(root, contract.decisionLedger?.path, 'decision ledger');
  const terminalArtifactBytes = new Map((contract.terminalArtifacts ?? []).map((descriptor) => {
    const artifactPath = requireRepositoryFile(root, descriptor.path, 'terminal artifact');
    return [descriptor.path, fs.readFileSync(artifactPath)];
  }));
  const binlogPath = path.resolve(requireText(contract.binlog?.path, 'binlog path'));
  const binlogIndexPath = path.resolve(requireText(contract.binlog?.indexPath, 'binlog index path'));
  for (const [target, label] of [[binlogPath, 'binlog'], [binlogIndexPath, 'binlog index']]) {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be an ordinary file`);
  }
  const decoded = decodeBinlog({
    binary: mysqlbinlogBinary,
    binlogPath,
    startPosition: contract.binlog.startPosition,
    stopPosition: contract.binlog.stopPosition,
  });
  const result = reconcileTerminalOperationBinlog({
    contract,
    packetBytes: fs.readFileSync(packetPath),
    decisionLedgerBytes: fs.readFileSync(ledgerPath),
    terminalArtifactBytes,
    binlogBytes: fs.readFileSync(binlogPath),
    binlogIndexText: fs.readFileSync(binlogIndexPath, 'utf8'),
    decodedBinlog: decoded,
  });
  const resolvedOutput = path.resolve(root, requireText(outputPath, 'output path'));
  const relativeOutput = path.relative(root, resolvedOutput);
  if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) throw new Error('output path must stay inside the repository');
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const result = runTerminalOperationBinlogReconciliation({
      contractPath: args.contract,
      outputPath: args.output,
      mysqlbinlogBinary: args.mysqlbinlog ?? 'mysqlbinlog',
    });
    console.log(JSON.stringify({
      operationId: result.operationId,
      decisionIdentity: result.decisionIdentity,
      status: result.status,
      changedRows: result.changedRows.total,
      resultHash: result.resultHash,
      output: args.output,
    }));
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
