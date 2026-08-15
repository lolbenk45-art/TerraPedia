import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeItemCanonicalBaseEntityRestorationTransaction,
} from './item-canonical-base-entity-restoration-db.mjs';

test('reconciliation locks, deletes the archived legacy occupants, inserts 5/5/5, and commits', async () => {
  const connection = recordingConnection();
  const result = await executeItemCanonicalBaseEntityRestorationTransaction({
    connection,
    proposal: fixture(),
    consumeDispatchPermit: async () => connection.events.push('consume-permit'),
  });

  assert.deepEqual(connection.events, [
    'begin', 'lock-maint', 'lock-relation', 'lock-projection', 'lock-audits', 'lock-images',
    'consume-permit', 'delete-maint', 'delete-relation', 'delete-projection', 'delete-audits',
    'insert-maint', 'insert-relation', 'insert-projection',
    'read-back', 'commit',
  ]);
  assert.deepEqual(result.insertedCounts, { maintItems: 5, relationItems: 5, projectionItems: 5 });
  assert.deepEqual(result.deletedCounts, { maintItems: 5, relationItems: 5, projectionItems: 5, itemProjectileAudits: 5 });
  const dml = connection.sql.filter((sql) => /^(?:INSERT|UPDATE|DELETE|REPLACE)/i.test(sql.trim()));
  assert.equal(dml.length, 7);
  assert.equal(dml.filter((sql) => /^INSERT\b/i.test(sql.trim())).length, 3);
  assert.equal(dml.filter((sql) => /^DELETE\b/i.test(sql.trim())).length, 4);
  assert.equal(dml.some((sql) => /\b(?:UPDATE|REPLACE|ALTER|CREATE|DROP)\b/i.test(sql)), false);
  assert.equal(dml.some((sql) => /ON\s+DUPLICATE|INSERT\s+IGNORE/i.test(sql)), false);
  const projectionLock = connection.sql.find((sql) => /projection_items/i.test(sql) && /FOR UPDATE/i.test(sql));
  const auditLock = connection.sql.find((sql) => /item_projectile_audits/i.test(sql) && /FOR UPDATE/i.test(sql));
  assert.doesNotMatch(projectionLock, /terraria_version|raw_json/i);
  assert.doesNotMatch(auditLock, /terraria_version/i);
  assert.equal(
    connection.bindings.flat().some((value) => typeof value === 'string' && /T\d{2}:\d{2}:\d{2}Z$/.test(value)),
    false,
  );
});

test('reconciliation rolls back before permit when a locked legacy row drifts', async () => {
  const connection = recordingConnection({ legacyMaintDrift: true });
  await assert.rejects(
    executeItemCanonicalBaseEntityRestorationTransaction({
      connection,
      proposal: fixture(),
      consumeDispatchPermit: async () => connection.events.push('consume-permit'),
    }),
    /legacy.*drifted|snapshot drifted/i,
  );
  assert.equal(connection.events.includes('consume-permit'), false);
  assert.equal(connection.events.includes('delete-maint'), false);
  assert.equal(connection.events.at(-1), 'rollback');
});

function fixture() {
  const keys = ['AntlionEggs', 'BoneWhip', 'RoninShirt', 'TVHeadPants', 'TimelessTravelerHood'];
  const ids = [5067, 5074, 5049, 5063, 5051];
  return {
    keys,
    sourceIds: ids,
    target: { databases: { maint: 'terria_v1_maint', relation: 'terria_v1_relation' } },
    targetCounts: { maintItems: 5, relationItems: 5, projectionItems: 5 },
    maintRows: keys.map((internalName, index) => ({
      sourceId: ids[index], internalName, rawJson: '{}', sourceProvider: 'terraria.wiki.gg',
      sourceRevisionTimestamp: '2026-03-09T22:52:58Z',
      landingSourceId: 6470, landingSourceKey: 'wiki.module.iteminfo', landingContentHash: 'a'.repeat(64),
      status: 1, deleted: 0,
    })),
    relationRows: keys.map((internalName, index) => ({
      sourceId: ids[index], internalName, recordKey: `relation-${internalName}`, rawJson: '{}', status: 1, deleted: 0,
    })),
    projectionRows: keys.map((internalName, index) => ({
      id: ids[index], internalName, relationRecordKey: `relation-${internalName}`, image: `/terrapedia-images/items/2026/08/05/${internalName}.png`, status: 1, deleted: 0,
    })),
    managedImages: keys.map((itemInternalName) => ({
      recordKey: `image-${itemInternalName}`, itemInternalName,
      cachedUrl: `/terrapedia-images/items/2026/08/05/${itemInternalName}.png`,
      isPrimary: 1, status: 1, deleted: 0,
    })),
    legacyMaintRows: legacyRows('sourceId'),
    legacyRelationRows: legacyRows('sourceId'),
    legacyProjectionRows: legacyRows('id'),
    legacyProjectileAudits: legacyRows('itemSourceId'),
  };
}

function legacyRows(idField) {
  const names = ['FestiveTopHat', 'Wiesnbrau', 'HeartArrow', 'TurkeyFeather', 'ValentineRing'];
  const ids = [5067, 5074, 5049, 5063, 5051];
  return names.map((internalName, index) => ({
    [idField]: ids[index], sourceId: ids[index], internalName, itemInternalName: internalName,
    recordKey: `legacy-${internalName}`, sourcePage: `旧版:${internalName}`,
    terrariaVersion: 'legacy', rawJson: '{"legacyNpcShopItem":true}', status: 1, deleted: 0,
  }));
}

function recordingConnection({ legacyMaintDrift = false } = {}) {
  const proposal = fixture();
  return {
    events: [], sql: [], bindings: [],
    async beginTransaction() { this.events.push('begin'); },
    async commit() { this.events.push('commit'); },
    async rollback() { this.events.push('rollback'); },
    async query(sql) {
      this.sql.push(sql);
      if (/maint_items/i.test(sql) && /FOR UPDATE/i.test(sql)) {
        this.events.push('lock-maint');
        return [proposal.legacyMaintRows.map((row) => ({
          source_id: row.sourceId, internal_name: legacyMaintDrift && row.sourceId === 5074 ? 'WrongLegacy' : row.internalName,
          record_key: row.recordKey, source_page: row.sourcePage, terraria_version: row.terrariaVersion, raw_json: row.rawJson,
          status: 1, deleted: 0,
        })), []];
      }
      if (/relation_items/i.test(sql) && /FOR UPDATE/i.test(sql)) { this.events.push('lock-relation'); return [proposal.legacyRelationRows.map(toDbRow), []]; }
      if (/projection_items/i.test(sql) && /FOR UPDATE/i.test(sql)) { this.events.push('lock-projection'); return [proposal.legacyProjectionRows.map(toDbRow), []]; }
      if (/item_projectile_audits/i.test(sql) && /FOR UPDATE/i.test(sql)) { this.events.push('lock-audits'); return [proposal.legacyProjectileAudits.map(toAuditDbRow), []]; }
      if (/relation_item_images/i.test(sql) && /FOR UPDATE/i.test(sql)) {
        this.events.push('lock-images');
        return [proposal.managedImages.map((row) => ({
          record_key: row.recordKey, item_internal_name: row.itemInternalName, cached_url: row.cachedUrl,
          is_primary: 1, status: 1, deleted: 0,
        })), []];
      }
      if (/maint_items/i.test(sql) && /ORDER BY/i.test(sql)) { this.events.push('read-back'); return [proposal.maintRows.map((row) => ({ source_id: row.sourceId, internal_name: row.internalName })), []]; }
      if (/relation_items/i.test(sql) && /ORDER BY/i.test(sql)) return [proposal.relationRows.map((row) => ({ source_id: row.sourceId, internal_name: row.internalName, record_key: row.recordKey })), []];
      if (/projection_items/i.test(sql) && /ORDER BY/i.test(sql)) return [proposal.projectionRows.map((row) => ({ id: row.id, internal_name: row.internalName, relation_record_key: row.relationRecordKey })), []];
      throw new Error(`unexpected query: ${sql}`);
    },
    async execute(sql, bindings) {
      this.sql.push(sql);
      this.bindings.push(bindings ?? []);
      const action = /^\s*(DELETE|INSERT)\b/i.exec(sql)?.[1]?.toLowerCase();
      if (/maint_items/i.test(sql)) this.events.push(`${action}-maint`);
      else if (/relation_items/i.test(sql)) this.events.push(`${action}-relation`);
      else if (/projection_items/i.test(sql)) this.events.push(`${action}-projection`);
      else if (/item_projectile_audits/i.test(sql)) this.events.push(`${action}-audits`);
      return [{ affectedRows: 5 }, []];
    },
  };
}

function toDbRow(row) {
  return {
    source_id: row.sourceId, id: row.sourceId, item_source_id: row.sourceId,
    internal_name: row.internalName, item_internal_name: row.itemInternalName,
    record_key: row.recordKey, source_page: row.sourcePage, terraria_version: row.terrariaVersion,
    raw_json: row.rawJson, status: 1, deleted: 0,
  };
}

function toAuditDbRow(row) {
  return { ...toDbRow(row), item_source_id: row.sourceId, item_internal_name: row.internalName };
}
