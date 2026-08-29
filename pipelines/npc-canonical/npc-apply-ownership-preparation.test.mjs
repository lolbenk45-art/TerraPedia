import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { TABLE_OWNERSHIP_MATRIX } from '../automation/table-ownership-matrix.mjs';
import {
  NPC_APPLY_OWNER_PHASES,
  buildNpcApplyOwnershipPreparation,
  writeNpcApplyOwnershipPreparation,
} from './npc-apply-ownership-preparation.mjs';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function loadFixtureInput() {
  const fixturePath = path.join(repoRoot, 'pipelines/test-fixtures/canonical/npc-apply.input.fixture.json');
  assert.equal(path.relative(repoRoot, fixturePath).startsWith('pipelines/test-fixtures/canonical/'), true);
  const envelope = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.equal(envelope.fixtureOnly, true);
  assert.equal(envelope.notAuthorization, true);
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-apply-fixture-'));
  const targets = [];
  const evidencePairs = [];
  let payloadBytes = 0;
  for (let index = 0; index < envelope.pairCount; index += 1) {
    const entityId = `npc-${index + 1}`;
    const buffInflictions = index < 9 ? [{ buffId: index + 1 }] : [];
    const shopCount = index < 8 ? 27 : (index === 8 ? 23 : 0);
    const shop = Array.from({ length: shopCount }, (_, n) => ({ itemName: `Item ${index + 1}-${n + 1}` }));
    const loot = Array.from({ length: 7 }, (_, n) => ({ itemName: `Loot ${index + 1}-${n + 1}` }));
    const normalizedPayload = { entityId, buffInflictions, shop, loot };
    const auditPayload = { status: 'pass', entityId, sourcePage: `Fixture ${index + 1}`, sourceRevisionTimestamp: '2026-08-22T00:00:00.000Z' };
    const normalizedRaw = `${JSON.stringify(normalizedPayload)}\n`;
    const normalizedContentHash = hash(JSON.stringify(normalizedPayload));
    auditPayload.normalizedContentHash = normalizedContentHash;
    const auditRaw = `${JSON.stringify(auditPayload)}\n`;
    const normalizedPath = `normalized-${index + 1}.json`;
    const auditPath = `audit-${index + 1}.json`;
    fs.writeFileSync(path.join(fixtureRoot, normalizedPath), normalizedRaw);
    fs.writeFileSync(path.join(fixtureRoot, auditPath), auditRaw);
    targets.push({ entityId, priority: index === 0 ? 'boss' : 'npc' });
    const pair = {
      entityId, targetEntityId: entityId, sourcePage: auditPayload.sourcePage, sourceRevisionTimestamp: auditPayload.sourceRevisionTimestamp,
      normalizedContentHash, auditContentHash: hash(JSON.stringify(auditPayload)), payloadBytes: Buffer.byteLength(normalizedRaw) + Buffer.byteLength(auditRaw),
      normalized: { path: normalizedPath, contentHash: hash(normalizedRaw), sizeBytes: Buffer.byteLength(normalizedRaw) },
      audit: { path: auditPath, contentHash: hash(auditRaw), sizeBytes: Buffer.byteLength(auditRaw) },
    };
    payloadBytes += pair.payloadBytes;
    evidencePairs.push(pair);
  }
  const targetRaw = `${JSON.stringify({ targets })}\n`;
  fs.writeFileSync(path.join(fixtureRoot, 'fixture-target-manifest.json'), targetRaw);
  return {
    repoRoot: fixtureRoot,
    input: {
      schemaVersion: envelope.schemaVersion, operationId: envelope.operationId, pairCount: envelope.pairCount, payloadBytes,
      targetManifest: { path: 'fixture-target-manifest.json', contentHash: hash(targetRaw), sizeBytes: Buffer.byteLength(targetRaw) }, evidencePairs,
    },
  };
}

const fixtureInput = loadFixtureInput();
const input = fixtureInput.input;

test('NPC apply is split into seven single-owner phases with exact physical ownership', () => {
  assert.deepEqual(NPC_APPLY_OWNER_PHASES.map((phase) => [phase.operationId, phase.capability]), [
    ['canonical-npc-facts-maint-apply', 'npc_crawler_facts'],
    ['canonical-npc-item-relations-apply', 'items'],
    ['canonical-npc-buff-relations-apply', 'buffs'],
    ['canonical-npc-town-shop-projection-apply', 'town_npc_maintenance'],
    ['canonical-npc-buff-projection-apply', 'buffs'],
    ['canonical-npc-nonboss-loot-projection-apply', 'npc_loot'],
    ['canonical-npc-boss-loot-projection-apply', 'boss_loot'],
  ]);
  assert.deepEqual(NPC_APPLY_OWNER_PHASES.map((phase) => phase.phaseIndex), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(NPC_APPLY_OWNER_PHASES[0].requiredOperationIds, [
    'canonical-npc-landing-apply',
  ]);
  assert.deepEqual(NPC_APPLY_OWNER_PHASES[6].requiredOperationIds, [
    'canonical-npc-landing-apply',
    ...NPC_APPLY_OWNER_PHASES.slice(0, 6).map((phase) => phase.operationId),
  ]);
  const ownershipByKey = new Map(TABLE_OWNERSHIP_MATRIX.map((row) => [row.key, row]));
  const allKeys = new Set();
  for (const phase of NPC_APPLY_OWNER_PHASES) {
    assert.ok(phase.ownershipKeys.length > 0, phase.operationId);
    for (const key of phase.ownershipKeys) {
      assert.equal(allKeys.has(key), false, key);
      allKeys.add(key);
      const owner = ownershipByKey.get(key);
      assert.equal(owner?.writeMode, 'write', key);
      assert.equal(owner?.capability, phase.capability, key);
    }
  }
});

test('real 25-pair evidence becomes a read-only owner-valid T1 preparation', async () => {
  const report = await buildNpcApplyOwnershipPreparation({
    repoRoot: fixtureInput.repoRoot,
    input,
    generatedAt: '2026-07-29T04:20:00.000Z',
  });
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.state, 'T1_PREPARED');
  assert.equal(report.writesDatabase, false);
  assert.equal(report.formalApplyReady, false);
  assert.equal(report.evidence.pairCount, 25);
  assert.equal(report.evidence.buffFactCount, 9);
  assert.equal(report.evidence.shopFactCount, 239);
  assert.equal(report.evidence.lootFactCount, 175);
  assert.ok(report.evidence.bossLootFactCount > 0);
  assert.ok(report.evidence.nonBossLootFactCount > 0);
  assert.equal(report.phases.length, 7);
  assert.equal(report.phases.every((phase) => phase.ownerValid === true), true);
  assert.equal(report.phases.every((phase) => phase.authorizationRequiredForFormal === true), true);
  assert.equal(report.phases.every((phase) => phase.formalExecutorRegistered === true), true);
  assert.match(report.formalBlocker, /landing prerequisite.*seven owner-specific phases.*exact authorizations/i);
  assert.doesNotMatch(report.formalBlocker, /executors.*required/i);
});

test('preparation fails closed on evidence drift or an ownership mismatch', async () => {
  const drifted = structuredClone(input);
  drifted.evidencePairs[0].normalized.contentHash = '0'.repeat(64);
  await assert.rejects(
    () => buildNpcApplyOwnershipPreparation({ repoRoot: fixtureInput.repoRoot, input: drifted }),
    /normalized.*hash mismatch/i,
  );

  const invalidPhases = structuredClone(NPC_APPLY_OWNER_PHASES);
  invalidPhases[0].ownershipKeys.push('relation.item_source_facts.items');
  await assert.rejects(
    () => buildNpcApplyOwnershipPreparation({ repoRoot: fixtureInput.repoRoot, input, phases: invalidPhases }),
    /single capability owner/i,
  );
});

test('preparation report writes atomically without changing evidence', async () => {
  const report = await buildNpcApplyOwnershipPreparation({ repoRoot: fixtureInput.repoRoot, input });
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-owner-preparation-'));
  try {
    await writeNpcApplyOwnershipPreparation({ repoRoot: targetRoot, report });
    const outputPath = path.join(
      targetRoot,
      'reports/canonical-migration/canonical-npc-ownership-preparation.json',
    );
    const written = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(written.summary.status, 'pass');
    assert.equal(written.evidence.inputHash, report.evidence.inputHash);
    assert.deepEqual(fs.readdirSync(path.dirname(outputPath)).filter((name) => name.endsWith('.tmp')), []);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});
