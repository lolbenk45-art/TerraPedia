import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  NPC_CANONICAL_LIMITS,
  buildNpcCrawlerFactEvidence,
  validateNpcCrawlerFactRunEvidence,
  verifyNpcBridgeRetirement,
} from './npc-canonical-contract.mjs';

function fixture() {
  const normalized = {
    entityId: 'medusa',
    source: { pageTitle: 'Medusa' },
    sourceMetadata: {
      revisionTimestamp: '2026-07-27T01:00:00Z',
      fetchedAt: '2026-07-27T01:01:00Z',
      parsedAt: '2026-07-27T01:02:00Z',
    },
    buffInflictions: [{ buffName: 'Stoned', durationText: '1-4 seconds' }],
    shop: { normalizedRows: [] },
    loot: [{ itemName: 'Medusa Head', chanceText: '1%' }],
  };
  return {
    normalized,
    audit: {
      status: 'pass',
      entityId: 'medusa',
      sourcePage: 'Medusa',
      sourceRevisionTimestamp: '2026-07-27T01:00:00Z',
      normalizedContentHash: crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
      auditedAt: '2026-07-27T01:03:00Z',
      reasons: [],
    },
  };
}

test('NPC canonical contract freezes paired normalized and audit identity', () => {
  const evidence = buildNpcCrawlerFactEvidence(fixture());

  assert.equal(evidence.entityId, 'medusa');
  assert.equal(evidence.sourcePage, 'Medusa');
  assert.equal(evidence.sourceRevisionTimestamp, '2026-07-27T01:00:00Z');
  assert.match(evidence.recordKey, /^[a-f0-9]{64}$/);
  assert.match(evidence.normalizedContentHash, /^[a-f0-9]{64}$/);
  assert.match(evidence.auditContentHash, /^[a-f0-9]{64}$/);
  assert.equal(evidence.parseStatus, 'ok');
  assert.equal(evidence.payload.audit.status, 'pass');
});

test('NPC canonical contract rejects missing, failing, or mismatched audit evidence', () => {
  const { normalized, audit } = fixture();
  assert.throws(() => buildNpcCrawlerFactEvidence({ normalized }), /matching audit evidence/i);
  assert.throws(() => buildNpcCrawlerFactEvidence({ normalized, audit: { ...audit, status: 'warn' } }), /audit status/i);
  assert.throws(() => buildNpcCrawlerFactEvidence({ normalized, audit: { ...audit, entityId: 'zombie' } }), /entity identity/i);
  assert.throws(() => buildNpcCrawlerFactEvidence({ normalized, audit: { ...audit, normalizedContentHash: '0'.repeat(64) } }), /content hash/i);
});

test('NPC canonical limits fail closed at the provisional design bounds', () => {
  assert.deepEqual(NPC_CANONICAL_LIMITS, {
    basePayloadBytes: 16 * 1024 * 1024,
    factPayloadBytes: 2 * 1024 * 1024,
    factsPerRun: 2048,
    factRunBytes: 64 * 1024 * 1024,
  });

  const { normalized, audit } = fixture();
  const oversized = { ...normalized, padding: 'x'.repeat(NPC_CANONICAL_LIMITS.factPayloadBytes) };
  assert.throws(
    () => buildNpcCrawlerFactEvidence({
      normalized: oversized,
      audit: {
        ...audit,
        normalizedContentHash: crypto.createHash('sha256').update(JSON.stringify(oversized)).digest('hex'),
      },
    }),
    /2 MiB/i,
  );
});

test('NPC canonical run limits reject too many facts and excessive aggregate bytes', () => {
  const fact = { payloadBytes: 32 * 1024 };
  assert.deepEqual(
    validateNpcCrawlerFactRunEvidence([fact, fact]),
    { factCount: 2, payloadBytes: 64 * 1024 },
  );
  assert.throws(
    () => validateNpcCrawlerFactRunEvidence(
      Array.from({ length: NPC_CANONICAL_LIMITS.factsPerRun + 1 }, () => ({ payloadBytes: 1 })),
    ),
    /2,048 facts per run/i,
  );
  assert.throws(
    () => validateNpcCrawlerFactRunEvidence([
      { payloadBytes: NPC_CANONICAL_LIMITS.factRunBytes },
      { payloadBytes: 1 },
    ]),
    /64 MiB per run/i,
  );
});

test('NPC canonical contract reports zero unclassified bridge consumers', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-contract-'));
  fs.mkdirSync(path.join(repoRoot, 'scripts', 'data'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'scripts', 'data', 'consumer.mjs'), "const source = 'data/standardized/npcs.standardized.json';\n");

  const report = verifyNpcBridgeRetirement({ repoRoot, generatedAt: '2026-07-27T00:00:00Z' });
  assert.equal(report.status, 'pass');
  assert.equal(report.referenceCount, 0);
});
