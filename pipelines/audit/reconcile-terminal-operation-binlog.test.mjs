import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  parseMysqlbinlogRowTransactions,
  reconcileTerminalOperationBinlog,
} from './reconcile-terminal-operation-binlog.mjs';

const BINLOG_FIXTURE = `# at 50
#260824  5:18:58 server id 1  end_log_pos 75 CRC32 0x00000000  Anonymous_GTID last_committed=0 sequence_number=1 transaction_length=50
# at 75
#260824  5:18:58 server id 1  end_log_pos 100 CRC32 0x00000000  Query thread_id=76 exec_time=0 error_code=0
CREATE TABLE IF NOT EXISTS example (id INT)
# at 100
#260824  5:18:59 server id 1  end_log_pos 180 CRC32 0x00000000  Anonymous_GTID last_committed=1 sequence_number=2 transaction_length=500
# original_commit_timestamp=1787519939374705 (2026-08-24 05:18:59.374705 CST)
# at 180
#260824  5:18:59 server id 1  end_log_pos 250 CRC32 0x00000000  Query thread_id=77 exec_time=0 error_code=0
BEGIN
# at 250
#260824  5:18:59 server id 1  end_log_pos 300 CRC32 0x00000000  Write_rows: table id 1 flags: STMT_END_F
### INSERT INTO \`terria_v1_local\`.\`crawler_automation_decision\`
###   @1='decision-1'
# at 300
#260824  5:18:59 server id 1  end_log_pos 350 CRC32 0x00000000  Update_rows: table id 2 flags: STMT_END_F
### UPDATE \`terria_v1_local\`.\`world_contexts\`
### WHERE
###   @1='DEFAULT'
### SET
###   @1='DEFAULT'
# at 350
#260824  5:18:59 server id 1  end_log_pos 380 CRC32 0x00000000  Xid = 901
COMMIT/*!*/;
# at 380
#260824  5:19:00 server id 1  end_log_pos 460 CRC32 0x00000000  Anonymous_GTID last_committed=2 sequence_number=3 transaction_length=300
# original_commit_timestamp=1787519940000000 (2026-08-24 05:19:00.000000 CST)
# at 460
#260824  5:19:00 server id 1  end_log_pos 500 CRC32 0x00000000  Query thread_id=78 exec_time=0 error_code=0
BEGIN
# at 500
#260824  5:19:00 server id 1  end_log_pos 550 CRC32 0x00000000  Delete_rows: table id 3 flags: STMT_END_F
### DELETE FROM \`terria_v1_relation\`.\`projection_bosses\`
### WHERE
###   @1=1
# at 550
#260824  5:19:00 server id 1  end_log_pos 580 CRC32 0x00000000  Xid = 902
COMMIT/*!*/;
`;

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function fixture() {
  const packet = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    operationId: 'operation-1',
    decisionIdentity: 'decision-1',
    packetHash: `sha256:${'a'.repeat(64)}`,
  })}\n`);
  const ledger = Buffer.from(`${JSON.stringify([{
    decisionIdentity: 'decision-1',
    dispatchPermitHash: `sha256:${'b'.repeat(64)}`,
  }])}\n`);
  const terminal = Buffer.from('{"status":"completed"}\n');
  const binlog = Buffer.from('immutable-binlog-bytes');
  const contract = {
    schemaVersion: 1,
    operationId: 'operation-1',
    decisionIdentity: 'decision-1',
    binding: {
      mode: 'intrinsic-row-markers',
      residualRisk: null,
    },
    packet: { path: 'reports/packet.json', bytesSha256: sha256(packet) },
    decisionLedger: {
      path: 'reports/used-decisions.json',
      bytesSha256: sha256(ledger),
      dispatchPermitHash: `sha256:${'b'.repeat(64)}`,
    },
    terminalArtifacts: [{ path: 'reports/result.json', bytesSha256: sha256(terminal) }],
    binlog: {
      path: '/var/lib/mysql/binlog.000001',
      bytesSha256: sha256(binlog),
      sizeBytes: binlog.length,
      indexPath: '/var/lib/mysql/binlog.index',
      startPosition: 50,
      stopPosition: 580,
    },
    expected: {
      gtidTransactionCount: 3,
      statementOnlyTransactionCount: 1,
      rowTransactionCount: 2,
      firstRowTransactionPosition: 100,
      rowEventCount: 3,
      tableOperations: [
        { database: 'terria_v1_local', table: 'crawler_automation_decision', operation: 'INSERT', count: 1 },
        { database: 'terria_v1_local', table: 'world_contexts', operation: 'UPDATE', count: 1 },
        { database: 'terria_v1_relation', table: 'projection_bosses', operation: 'DELETE', count: 1 },
      ],
      markers: ['decision-1'],
    },
  };
  return { binlog, contract, ledger, packet, terminal };
}

test('parses exact row operations, positions, thread IDs, and XIDs from decoded mysqlbinlog', () => {
  const parsed = parseMysqlbinlogRowTransactions(BINLOG_FIXTURE);
  assert.equal(parsed.gtidTransactionCount, 3);
  assert.equal(parsed.statementOnlyTransactionCount, 1);
  assert.equal(parsed.transactions.length, 2);
  assert.deepEqual(parsed.transactions[0], {
    startPosition: 100,
    endPosition: 380,
    xidEventPosition: 350,
    xid: 901,
    threadId: 77,
    originalCommitTimestampMicros: '1787519939374705',
    originalCommitTimestamp: '2026-08-24 05:18:59.374705 CST',
    rowEventCount: 2,
    tableOperations: [
      { database: 'terria_v1_local', table: 'crawler_automation_decision', operation: 'INSERT', count: 1 },
      { database: 'terria_v1_local', table: 'world_contexts', operation: 'UPDATE', count: 1 },
    ],
  });
  assert.deepEqual(parsed.tableOperations, [
    { database: 'terria_v1_local', table: 'crawler_automation_decision', operation: 'INSERT', count: 1 },
    { database: 'terria_v1_local', table: 'world_contexts', operation: 'UPDATE', count: 1 },
    { database: 'terria_v1_relation', table: 'projection_bosses', operation: 'DELETE', count: 1 },
  ]);
});

test('reconciles only rotated immutable binlog bytes bound to packet, ledger, permit, and terminal artifacts', () => {
  const input = fixture();
  const result = reconcileTerminalOperationBinlog({
    contract: input.contract,
    packetBytes: input.packet,
    decisionLedgerBytes: input.ledger,
    terminalArtifactBytes: new Map([['reports/result.json', input.terminal]]),
    binlogBytes: input.binlog,
    binlogIndexText: './binlog.000001\n./binlog.000002\n',
    decodedBinlog: BINLOG_FIXTURE,
  });
  assert.equal(result.status, 'RECONCILED');
  assert.equal(result.readOnly, true);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.permitReplay, false);
  assert.equal(result.currentTableCountInference, false);
  assert.deepEqual(result.binding, {
    mode: 'intrinsic-row-markers',
    intrinsicTransactionBinding: true,
    residualRisk: null,
  });
  assert.equal(result.changedRows.total, 3);
  assert.equal(result.executionEnvelope.gtidTransactionCount, 3);
  assert.equal(result.executionEnvelope.statementOnlyTransactionCount, 1);
  assert.equal(result.immutableEvidence.binlog.rotated, true);
  assert.match(result.resultHash, /^sha256:[a-f0-9]{64}$/);
});

test('fails closed for an active binlog, hash drift, count drift, or missing marker', () => {
  const input = fixture();
  const base = {
    contract: input.contract,
    packetBytes: input.packet,
    decisionLedgerBytes: input.ledger,
    terminalArtifactBytes: new Map([['reports/result.json', input.terminal]]),
    binlogBytes: input.binlog,
    binlogIndexText: './binlog.000001\n',
    decodedBinlog: BINLOG_FIXTURE,
  };
  assert.throws(() => reconcileTerminalOperationBinlog(base), /active binlog/i);
  assert.throws(() => reconcileTerminalOperationBinlog({
    ...base,
    binlogIndexText: './binlog.000001\n./binlog.000002\n',
    packetBytes: Buffer.from('drift'),
  }), /packet.*hash drift/i);
  assert.throws(() => reconcileTerminalOperationBinlog({
    ...base,
    binlogIndexText: './binlog.000001\n./binlog.000002\n',
    contract: {
      ...input.contract,
      expected: { ...input.contract.expected, rowEventCount: 4 },
    },
  }), /row event count drift/i);
  assert.throws(() => reconcileTerminalOperationBinlog({
    ...base,
    binlogIndexText: './binlog.000001\n./binlog.000002\n',
    contract: {
      ...input.contract,
      expected: { ...input.contract.expected, markers: ['absent-marker'] },
    },
  }), /required marker/i);
});
