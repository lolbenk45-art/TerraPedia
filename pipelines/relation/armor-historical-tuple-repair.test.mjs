import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ARMOR_HISTORICAL_TUPLE_REPAIR_OPERATION_ID,
  HISTORICAL_ARMOR_TUPLE_SCOPE,
  buildArmorHistoricalTupleRepairProposal,
  executeArmorHistoricalTupleRepairTransaction,
  readArmorHistoricalTupleRepairSnapshot,
  validateArmorHistoricalTupleRepairProposal,
} from './armor-historical-tuple-repair.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const candidate = JSON.parse(fs.readFileSync(
  path.join(repoRoot, '.local/tmp/armor-source-relation-alignment-candidate-20261001-01.json'),
));

function fixtureRows() {
  const candidates = candidate.sets.filter((entry) => entry.status === 'candidate_alignment');
  const maintArmorSets = candidates.map((entry) => ({
    id: entry.current.maintId,
    record_key: entry.current.maintRecordKey,
    text_key: entry.textKey,
    sets_json: JSON.stringify(entry.current.maintSets),
    unique_item_ids_json: JSON.stringify(entry.current.maintSets.flat()),
    raw_json: JSON.stringify({ textKey: entry.textKey, sets: entry.current.maintSets }),
    status: 1,
    deleted: 0,
  }));
  const relationArmorSets = candidates.map((entry) => ({
    id: entry.current.maintId,
    record_key: entry.current.relationRecordKey,
    source_maint_record_key: entry.current.maintRecordKey,
    source_maint_id: entry.current.maintId,
    text_key: entry.textKey,
    sets_json: JSON.stringify(entry.current.relationSets),
    unique_item_ids_json: JSON.stringify(entry.current.relationSets.flat()),
    raw_json: JSON.stringify({ textKey: entry.textKey, sets: entry.current.relationSets }),
    status: 1,
    deleted: 0,
  }));
  const ids = new Set(candidates.flatMap((entry) => entry.proposedRelationItems.map((row) => row.itemSourceId)));
  const maintItems = [...ids].map((id) => {
    const row = candidates.flatMap((entry) => entry.proposedRelationItems).find((item) => item.itemSourceId === id);
    const slot = row.itemSlotRole === 'head' ? 'headSlot' : row.itemSlotRole === 'body' ? 'bodySlot' : 'legSlot';
    return {
      id,
      source_id: id,
      internal_name: row.itemInternalName,
      english_name: row.itemName,
      raw_json: JSON.stringify({ id, internalName: row.itemInternalName, name: row.itemName, [slot]: id }),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Module:Iteminfo/data',
      source_revision_timestamp: '2026-03-09T22:52:58.000Z',
      landing_source_id: 6470,
      landing_source_key: 'wiki.module.iteminfo',
      landing_content_hash: 'a'.repeat(64),
      status: 1,
      deleted: 0,
    };
  });
  const relationArmorSetItems = candidates.flatMap((entry) => entry.delta.extraRelationTuples.map((row) => ({
    id: row.id,
    record_key: `${row.id}`.padStart(64, '0'),
    armor_set_record_key: entry.current.relationRecordKey,
    text_key: entry.textKey,
    set_variant_index: row.setVariantIndex,
    part_index: row.partIndex,
    item_source_id: row.itemSourceId,
    item_internal_name: row.itemInternalName,
    item_name: row.itemInternalName,
    part_role: row.partRole,
    slot_type: row.partRole === 'head' ? 'headSlot' : 'bodySlot',
    equipment_slot_id: row.itemSourceId,
    source_maint_table: 'maint_items',
    source_maint_id: row.itemSourceId,
    status: 1,
    deleted: 0,
  })));
  const projectionItems = maintItems.map((item) => ({
    id: item.id,
    name_zh: `中文 ${item.id}`,
    image: `/items/${item.id}.png`,
    status: 1,
    deleted: 0,
  }));
  const projectionItemById = new Map(projectionItems.map((item) => [item.id, item]));
  const projectionArmorSets = candidates.map((entry) => {
    const owner = relationArmorSets.find((row) => row.text_key === entry.textKey);
    const parts = relationArmorSetItems.filter((row) => row.armor_set_record_key === owner.record_key);
    const relatedItems = parts.map((part) => {
      const item = projectionItemById.get(part.item_source_id);
      return {
        id: item.id,
        itemId: item.id,
        sourceId: item.id,
        internalName: part.item_internal_name,
        name: part.item_name,
        nameZh: item.name_zh,
        image: item.image,
        partRole: part.part_role,
        slotType: part.slot_type,
        equipmentSlotId: part.equipment_slot_id,
        setVariantIndex: part.set_variant_index,
        partIndex: part.part_index,
      };
    });
    const ids = [...new Set(parts.map((part) => part.item_source_id))];
    return {
      id: owner.id,
      relation_record_key: owner.record_key,
      text_key: owner.text_key,
      sets_json: owner.sets_json,
      unique_item_ids_json: owner.unique_item_ids_json,
      current_item_ids_json: JSON.stringify(ids),
      related_items_json: JSON.stringify(relatedItems),
      status: 1,
      deleted: 0,
    };
  });
  return { maintArmorSets, relationArmorSets, relationArmorSetItems, maintItems, projectionArmorSets, projectionItems };
}

function buildProposal() {
  return buildArmorHistoricalTupleRepairProposal({
    candidateArtifact: candidate,
    currentRows: fixtureRows(),
    serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
    generatedAt: '2026-10-04T08:00:00.000Z',
  });
}

function transactionConnection(proposal, {
  extraChild = null,
  enforcePartSlots = false,
  reverseTerminalChildren = false,
  decimalConfidence = false,
} = {}) {
  const calls = [];
  const rows = fixtureRows();
  const retiring = proposal.changes.relationItemRetirements.map((change) => change.before);
  const activeSlots = new Map(retiring.map((row) => [Number(row.id), `${row.armor_set_record_key}:${row.set_variant_index}:${row.part_index}`]));
  let mutationStarted = false;
  const connection = {
    async query(sql, params = []) {
      calls.push({ type: 'query', sql, params });
      if (sql.includes('relation_armor_set_items') && sql.includes('WHERE record_key IN')) {
        const children = structuredClone(proposal.changes.relationItemInserts);
        if (decimalConfidence) for (const child of children) child.confidence = Number(child.confidence).toFixed(4);
        if (reverseTerminalChildren) children.reverse();
        return [children];
      }
      if (sql.includes('relation_armor_set_items') && sql.includes('armor_set_record_key IN')) {
        return [[...structuredClone(retiring), ...(extraChild ? [structuredClone(extraChild)] : [])]];
      }
      if (sql.includes('relation_armor_set_items')) {
        const ids = new Set(params.map(Number));
        return [retiring.filter((row) => ids.has(Number(row.id))).map((row) => structuredClone(row))];
      }
      if (sql.includes('projection_armor_sets')) {
        const changes = proposal.changes.projectionArmorSetUpdates;
        return [(mutationStarted ? changes.map((change) => change.after) : changes.map((change) => change.before)).map((row) => structuredClone(row))];
      }
      if (sql.includes('projection_items')) return [structuredClone(proposal.projectionItemRows)];
      if (sql.includes('maint_armor_sets')) {
        const changes = proposal.changes.maintParentUpdates;
        return [(mutationStarted ? changes.map((change) => change.after) : changes.map((change) => change.before)).map((row) => structuredClone(row))];
      }
      if (sql.includes('relation_armor_sets')) {
        const changes = proposal.changes.relationParentUpdates;
        return [(mutationStarted ? changes.map((change) => change.after) : changes.map((change) => change.before)).map((row) => structuredClone(row))];
      }
      if (sql.includes('maint_items')) return [structuredClone(rows.maintItems)];
      return [[]];
    },
    async execute(sql, params = []) {
      calls.push({ type: 'execute', sql, params });
      mutationStarted = true;
      if (sql.includes('relation_armor_set_items') && sql.startsWith('UPDATE')) {
        activeSlots.delete(Number(params[0]));
      }
      if (sql.includes('relation_armor_set_items') && sql.startsWith('INSERT')) {
        const slotKey = `${params[1]}:${params[3]}:${params[4]}`;
        if (enforcePartSlots && [...activeSlots.values()].includes(slotKey)) throw new Error('duplicate active armor set part slot');
        activeSlots.set(`new:${params[0]}`, slotKey);
      }
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { calls.push({ type: 'begin' }); },
    async commit() { calls.push({ type: 'commit' }); },
    async rollback() { calls.push({ type: 'rollback' }); },
  };
  return { connection, calls };
}

test('builds the bounded 15-set historical tuple repair with exact insert and retirement counts', () => {
  const proposal = buildArmorHistoricalTupleRepairProposal({
    candidateArtifact: candidate,
    currentRows: fixtureRows(),
    serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
    generatedAt: '2026-10-04T08:00:00.000Z',
  });

  assert.equal(proposal.operationId, ARMOR_HISTORICAL_TUPLE_REPAIR_OPERATION_ID);
  assert.deepEqual(proposal.scope, HISTORICAL_ARMOR_TUPLE_SCOPE);
  assert.equal(proposal.changes.maintParentUpdates.length, 15);
  assert.equal(proposal.changes.relationParentUpdates.length, 15);
  assert.equal(proposal.changes.relationItemInserts.length, 45);
  assert.equal(proposal.changes.relationItemRetirements.length, 30);
  assert.equal(proposal.changes.projectionArmorSetUpdates.length, 15);
  assert.equal(proposal.databaseWrites, false);
  assert.equal(proposal.executable, false);
  assert.doesNotThrow(() => validateArmorHistoricalTupleRepairProposal(proposal));
});

test('serializes relation confidence at the MySQL DECIMAL(5,4) scale', () => {
  const proposal = buildProposal();

  assert.equal(proposal.changes.relationItemInserts[0].confidence, '1.0000');
});

test('derives projection membership from the corrected relation tuples and preserves item display metadata', () => {
  const proposal = buildProposal();
  const projection = proposal.changes.projectionArmorSetUpdates[0];
  const entry = candidate.sets.find((set) => set.textKey === projection.text_key);
  const related = JSON.parse(projection.after.related_items_json);

  assert.deepEqual(JSON.parse(projection.after.sets_json), entry.source.sets);
  assert.deepEqual(JSON.parse(projection.after.unique_item_ids_json), entry.source.uniqueItemIds);
  assert.deepEqual(related.map((part) => [part.sourceId, part.partRole, part.partIndex]),
    proposal.changes.relationItemInserts.filter((part) => part.text_key === projection.text_key)
      .map((part) => [part.item_source_id, part.part_role, part.part_index]));
  assert.ok(related.every((part) => part.nameZh && part.image));
});

test('rejects a candidate whose locked owner baseline drifted', () => {
  const rows = fixtureRows();
  rows.relationArmorSets[0].sets_json = '[[2199,2200,2202]]';
  assert.throws(() => buildArmorHistoricalTupleRepairProposal({
    candidateArtifact: candidate,
    currentRows: rows,
    serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
    generatedAt: '2026-10-04T08:00:00.000Z',
  }), /relation parent baseline drifted/);
});

test('rejects any scope expansion beyond the owner-bound historical groups', () => {
  const altered = structuredClone(candidate);
  altered.sets = altered.sets.map((entry) => entry.textKey === 'ArmorSetBonus.Shroomite'
    ? { ...entry, status: 'candidate_alignment', current: { ...entry.current, maintId: 999 } }
    : entry);
  assert.throws(() => buildArmorHistoricalTupleRepairProposal({
    candidateArtifact: altered,
    currentRows: fixtureRows(),
    serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
    generatedAt: '2026-10-04T08:00:00.000Z',
  }), /exactly the 15 owner-bound historical groups/);
});

test('locks and compares the complete active child set for each affected owner', async () => {
  const proposal = buildProposal();
  const { connection, calls } = transactionConnection(proposal);

  await readArmorHistoricalTupleRepairSnapshot({ connection, proposal, forUpdate: true });

  const childRead = calls.find((call) => call.type === 'query' && call.sql.includes('relation_armor_set_items'));
  assert.match(childRead.sql, /WHERE armor_set_record_key IN/);
  assert.match(childRead.sql, /status = 1 AND deleted = 0 FOR UPDATE/);
  assert.deepEqual(childRead.params, proposal.changes.relationParentUpdates.map((change) => change.record_key));
});

test('rejects an unproposed active child before permit consumption', async () => {
  const proposal = buildProposal();
  const extraChild = {
    ...structuredClone(proposal.changes.relationItemRetirements[0].before),
    id: 999991,
    record_key: 'f'.repeat(64),
    part_index: 99,
  };
  const { connection, calls } = transactionConnection(proposal, { extraChild });
  let permitConsumptions = 0;

  await assert.rejects(executeArmorHistoricalTupleRepairTransaction({
    connection,
    proposal,
    assertRuntimeFence: async () => {},
    consumePermit: async () => { permitConsumptions += 1; },
    persistPrepared: async () => {},
    persistOutcome: async () => {},
  }), /relationArmorSetItems locked baseline drifted/);

  assert.equal(permitConsumptions, 0);
  assert.ok(calls.some((call) => call.type === 'rollback'));
});

test('retires occupying part indexes before inserting replacement children', async () => {
  const proposal = buildProposal();
  const { connection, calls } = transactionConnection(proposal, { enforcePartSlots: true });

  const result = await executeArmorHistoricalTupleRepairTransaction({
    connection,
    proposal,
    assertRuntimeFence: async () => {},
    consumePermit: async () => {},
    persistPrepared: async () => {},
    persistOutcome: async () => {},
  });

  const firstRetirement = calls.findIndex((call) => call.type === 'execute' && call.sql.includes('SET status = 0'));
  const firstInsert = calls.findIndex((call) => call.type === 'execute' && call.sql.startsWith('INSERT'));
  assert.ok(firstRetirement >= 0 && firstInsert > firstRetirement);
  assert.equal(result.status, 'COMMITTED');
});

test('preserves audit timestamps while updating maint and relation parents', async () => {
  const proposal = buildProposal();
  const { connection, calls } = transactionConnection(proposal);

  await executeArmorHistoricalTupleRepairTransaction({
    connection,
    proposal,
    assertRuntimeFence: async () => {},
    consumePermit: async () => {},
    persistPrepared: async () => {},
    persistOutcome: async () => {},
  });

  const parentUpdates = calls.filter((call) => call.type === 'execute'
    && call.sql.startsWith('UPDATE')
    && (call.sql.includes('maint_armor_sets') || call.sql.includes('relation_armor_sets')));
  assert.equal(parentUpdates.length, 30);
  assert.ok(parentUpdates.every((call) => /`updated_at` = `updated_at`/.test(call.sql)));
});

test('terminal child readback selects only proposal-owned insert columns', async () => {
  const proposal = buildProposal();
  const { connection, calls } = transactionConnection(proposal);

  await executeArmorHistoricalTupleRepairTransaction({
    connection,
    proposal,
    assertRuntimeFence: async () => {},
    consumePermit: async () => {},
    persistPrepared: async () => {},
    persistOutcome: async () => {},
  });

  const terminalRead = calls.find((call) => call.type === 'query'
    && call.sql.includes('relation_armor_set_items')
    && call.sql.includes('WHERE record_key IN'));
  assert.ok(terminalRead);
  assert.doesNotMatch(terminalRead.sql, /SELECT \*/);
  assert.match(terminalRead.sql, /item_source_id/);
  assert.match(terminalRead.sql, /part_index/);
  assert.match(terminalRead.sql, /ORDER BY record_key/);
});

test('terminal child verification normalizes DECIMAL values and ignores row order', async () => {
  const proposal = buildProposal();
  const { connection } = transactionConnection(proposal, { decimalConfidence: true, reverseTerminalChildren: true });

  const result = await executeArmorHistoricalTupleRepairTransaction({
    connection,
    proposal,
    assertRuntimeFence: async () => {},
    consumePermit: async () => {},
    persistPrepared: async () => {},
    persistOutcome: async () => {},
  });

  assert.equal(result.status, 'COMMITTED');
});
