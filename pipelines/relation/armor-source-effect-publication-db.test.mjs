import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildArmorSourceEffectPublicationPlan } from './armor-source-effect-publication.mjs';
import { executeArmorSourceEffectPublicationTransaction } from './armor-source-effect-publication-db.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const row = (key, value = 10) => ({
  record_key: hash(key), owner_kind: 'armor_set', owner_record_key: hash('owner'), owner_id: 100,
  owner_key: 'ArmorSetBonus.Test', source_kind: 'benefit_zh', source_locale: 'zh', source_line_index: 0,
  source_line: '套装奖励：移动速度提高 10%', effect_index: 0, apply_scope: 'set_bonus', variant_label: null,
  item_internal_name: null, slot_type: null, stat_key: 'move_speed', stat_label_zh: '移动速度', class_scope: 'all',
  operation: 'add', value_decimal: value, value_max_decimal: null, unit: 'percent', condition_text: null,
  raw_text: `${value}%`, parse_status: 'parsed', source_provider: 'terraria.wiki.gg', source_page: '盔甲',
  source_revision_timestamp: '2026-10-01T00:00:00.000Z', confidence: 0.9, reason: 'parsed_from_armor_set_benefit_zh',
  review_status: 'accepted', raw_json: '{}', status: 1, deleted: 0,
});

function proposal() {
  return buildArmorSourceEffectPublicationPlan({
    proposedRows: [row('next', 12)], currentRelationRows: [row('before')],
    sourceEvidenceHash: `sha256:${hash('evidence')}`,
    sourceFingerprint: { moduleRevisionId: 3, pageRevisionIds: [2] },
  });
}

function fake({ mysqlCoercionAfterWrite = false } = {}) {
  const state = { rows: [row('before')], committed: false, permit: 0, prepared: 0, outcome: [], writes: 0 };
  const connection = {
    async query(sql) {
      if (sql.startsWith('SELECT @@server_uuid')) return [[{ serverUuid: 'server' }]];
      if (sql.includes('FROM terria_v1_relation.relation_equipment_effect_attributes')) {
        const rows = structuredClone(state.rows);
        if (mysqlCoercionAfterWrite && state.writes > 0) {
          return [rows.map(current => ({ ...current,
            source_maint_table: current.source_maint_table ?? null,
            source_maint_record_key: current.source_maint_record_key ?? null,
            landing_source_key: current.landing_source_key ?? null,
            landing_content_hash: current.landing_content_hash ?? null,
            value_decimal: current.value_decimal == null ? null : Number(current.value_decimal).toFixed(4),
            value_max_decimal: current.value_max_decimal == null ? null : Number(current.value_max_decimal).toFixed(4),
            confidence: Number(current.confidence).toFixed(4),
            source_revision_timestamp: current.source_revision_timestamp == null ? null : new Date(current.source_revision_timestamp),
          }))];
        }
        return [rows];
      }
      return [[]];
    },
    async execute(sql, values) {
      if (sql.startsWith('INSERT')) {
        const columns = [...sql.matchAll(/`([^`]+)`/g)].map(match => match[1]);
        state.rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index]]))); state.writes += 1;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE') && sql.includes('status')) { const current = state.rows.find(r => r.record_key === values[2]); current.status = 0; current.deleted = 1; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE')) {
        const current = state.rows.find(r => r.record_key === values.at(-1));
        const columns = [...sql.matchAll(/`([^`]+)` = \?/g)].map(match => match[1]);
        columns.forEach((column, index) => { current[column] = values[index]; });
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    },
    async beginTransaction() {}, async commit() { state.committed = true; }, async rollback() {},
  };
  return { state, connection };
}

test('source-effect transaction rederives, prepares, commits and reads back exact owned state', async () => {
  const expected = proposal(); const f = fake();
  const result = await executeArmorSourceEffectPublicationTransaction({
    connection: f.connection, proposal: expected,
    rederiveSourceEffects: async ({ currentRelationRows }) => ({
      proposedRows: [row('next', 12)], sourceEvidenceHash: expected.sourceEvidenceHash,
      sourceFingerprint: expected.sourceFingerprint,
    }),
    assertRuntimeFence: async () => {}, consumePermit: async () => { f.state.permit += 1; },
    persistPrepared: async () => { f.state.prepared += 1; }, persistOutcome: async evidence => f.state.outcome.push(evidence),
  });
  assert.equal(result.status, 'COMMITTED');
  assert.equal(f.state.committed, true);
  assert.equal(f.state.permit, 1);
  assert.equal(f.state.prepared, 1);
  assert.equal(f.state.outcome.at(-1).status, 'COMMITTED');
});

test('source-effect transaction rolls back before permit when locked source drifts', async () => {
  const expected = proposal(); const f = fake();
  await assert.rejects(executeArmorSourceEffectPublicationTransaction({
    connection: f.connection, proposal: expected,
    rederiveSourceEffects: async ({ currentRelationRows }) => ({
      proposedRows: [row('drift', 12)], sourceEvidenceHash: expected.sourceEvidenceHash,
      sourceFingerprint: expected.sourceFingerprint,
    }),
    assertRuntimeFence: async () => {}, consumePermit: async () => { f.state.permit += 1; },
    persistPrepared: async () => { f.state.prepared += 1; }, persistOutcome: async evidence => f.state.outcome.push(evidence),
  }), /locked proposal drift/);
  assert.equal(f.state.permit, 0);
  assert.equal(f.state.committed, false);
});

test('source-effect readback normalizes MySQL decimal strings and datetime values', async () => {
  const expected = proposal(); const f = fake({ mysqlCoercionAfterWrite: true });
  const result = await executeArmorSourceEffectPublicationTransaction({
    connection: f.connection, proposal: expected,
    rederiveSourceEffects: async () => ({
      proposedRows: [row('next', 12)], sourceEvidenceHash: expected.sourceEvidenceHash,
      sourceFingerprint: expected.sourceFingerprint,
    }),
    assertRuntimeFence: async () => {}, consumePermit: async () => { f.state.permit += 1; },
    persistPrepared: async () => {}, persistOutcome: async evidence => f.state.outcome.push(evidence),
  });
  assert.equal(result.status, 'COMMITTED');
});
