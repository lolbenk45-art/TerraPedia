import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildItemImageLineagePlan,
  executeItemImageLineageApply,
  OPERATION_ID,
  runItemImageLineageApply
} from './apply-item-image-lineage.mjs';

test('the plan requires the same identity set at every layer', () => {
  const plan = buildItemImageLineagePlan(planInput());

  assert.equal(plan.expectedIdentityCount, 2);
  assert.deepEqual(plan.targetKeys, ['CopperCoin', 'Torch']);
  assert.deepEqual(plan.stages.map((stage) => stage.name), ['landing', 'maint', 'relation', 'local']);
  assert.match(plan.lineageBundle.sha256, /^sha256:[a-f0-9]{64}$/);
});

test('the plan refuses a preview whose layer keys disagree', () => {
  const input = planInput();
  input.previews.relation.targetKeys = ['CopperCoin'];

  assert.throws(() => buildItemImageLineagePlan(input), /relation preview identity set differs/i);
});

test('the plan refuses a delete candidate outside the exact key set', () => {
  const input = planInput();
  input.previews.local.deleteCandidateKeys = ['SomeOtherItem'];

  assert.throws(() => buildItemImageLineagePlan(input), /delete candidate outside the owned scope/i);
});

test('apply snapshots the owned scope before the first mutation', async () => {
  const calls = [];
  const result = await executeItemImageLineageApply({
    plan: buildItemImageLineagePlan(planInput()),
    adapter: adapter({ calls })
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(calls[0], 'snapshot');
  assert.deepEqual(calls, ['snapshot', 'landing', 'maint', 'relation', 'local', 'verify']);
  assert.equal(result.snapshot.rowCount, 2);
  assert.deepEqual(result.stages.map((stage) => stage.status), ['applied', 'applied', 'applied', 'applied']);
});

test('apply keeps every stage in its own transaction', async () => {
  const transactions = [];
  await executeItemImageLineageApply({
    plan: buildItemImageLineagePlan(planInput()),
    adapter: adapter({ transactions })
  });

  assert.deepEqual(transactions, ['landing', 'maint', 'relation', 'local']);
});

test('a post-verify mismatch fails the operation and names the snapshot', async () => {
  const result = await executeItemImageLineageApply({
    plan: buildItemImageLineagePlan(planInput()),
    adapter: adapter({ parityOverride: { local: 1 } })
  });

  assert.equal(result.status, 'FAILED');
  assert.match(result.message, /local layer parity/i);
  assert.match(result.nextStep, /snapshot/i);
  assert.equal(result.snapshot.snapshotId, 'snapshot-1');
  // A failed verify must never be reported as a completed lane.
  assert.notEqual(result.status, 'COMPLETED');
});

test('a failing stage stops the chain and leaves later stages unapplied', async () => {
  const result = await executeItemImageLineageApply({
    plan: buildItemImageLineagePlan(planInput()),
    adapter: adapter({ failStage: 'relation' })
  });

  assert.equal(result.status, 'FAILED');
  assert.deepEqual(
    result.stages.map((stage) => [stage.name, stage.status]),
    [['landing', 'applied'], ['maint', 'applied'], ['relation', 'failed'], ['local', 'skipped']]
  );
  assert.match(result.nextStep, /snapshot/i);
});

test('apply preserves local image roles outside the owned scope', async () => {
  const preserved = [];
  const result = await executeItemImageLineageApply({
    plan: buildItemImageLineagePlan(planInput()),
    adapter: adapter({ preserved })
  });

  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(result.preservedLocalRoles, ['banner', 'trophy']);
});

function adapter({
  calls = [],
  transactions = [],
  preserved = [],
  parityOverride = null,
  failStage = null
} = {}) {
  return {
    async snapshotOwnedScope(plan) {
      calls.push('snapshot');
      return { snapshotId: 'snapshot-1', rowCount: plan.targetKeys.length, takenAt: '2026-08-01T00:00:00.000Z' };
    },
    async applyStage(stage) {
      calls.push(stage.name);
      transactions.push(stage.name);
      if (failStage === stage.name) throw new Error(`injected ${stage.name} failure`);
      return { rowCount: 2, landingId: stage.name === 'landing' ? 4711 : null };
    },
    async verifyParity(plan) {
      calls.push('verify');
      const counts = {
        landing: plan.expectedIdentityCount,
        maint: plan.expectedIdentityCount,
        relation: plan.expectedIdentityCount,
        local: plan.expectedIdentityCount,
        ...(parityOverride ?? {})
      };
      preserved.push('banner', 'trophy');
      return { counts, preservedLocalRoles: ['banner', 'trophy'] };
    }
  };
}

function planInput() {
  const targetKeys = ['CopperCoin', 'Torch'];
  const lineageBundleBytes = JSON.stringify({
      schemaVersion: 1,
      entity: 'item_image_lineage_bundle',
      datasetType: 'item_image_sources_raw',
      counters: { total: 2 },
      itemImages: targetKeys.map((key, index) => ({
        itemId: index + 1,
        itemInternalName: key,
        role: 'icon',
        originalUrl: `https://terraria.wiki.gg/images/${key}.png`,
        cachedUrl: `/terrapedia-images/items/${key.toLowerCase()}.png`,
        isPrimary: true,
        sortOrder: 0
      }))
  });
  return {
    contract: {
      schemaVersion: 1,
      operationId: 'canonical-item-image-lineage-apply',
      lineageBundle: { path: 'reports/audit/item-image-lineage.bundle.json', sha256: sha256(lineageBundleBytes) },
      serverFingerprint: { host: '127.0.0.1', port: 13306, serverUuid: 'uuid-1' }
    },
    lineageBundleBytes,
    previews: {
      landing: { targetKeys: [...targetKeys], deleteCandidateKeys: [] },
      maint: { targetKeys: [...targetKeys], deleteCandidateKeys: [] },
      relation: { targetKeys: [...targetKeys], deleteCandidateKeys: [] },
      local: { targetKeys: [...targetKeys], deleteCandidateKeys: [] }
    }
  };
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

test('a governed apply consumes its permit before the first mutation', async () => {
  const events = [];
  const result = await runItemImageLineageApply({
    contract: planInput().contract,
    lineageBundleBytes: planInput().lineageBundleBytes,
    previews: planInput().previews,
    generatedAt: '2026-08-01T00:00:00.000Z',
    loadAuthorizedContext: () => { events.push('authorize'); return { operationId: OPERATION_ID }; },
    consumePermit: () => { events.push('permit'); return { decisionId: 'decision-1' }; },
    createAdapter: () => ({
      async snapshotOwnedScope() { events.push('snapshot'); return { snapshotId: 's1', rowCount: 0 }; },
      async applyStage(stage) { events.push(`stage:${stage.name}`); return { rowCount: 2 }; },
      async verifyParity(plan) {
        events.push('verify');
        return {
          counts: Object.fromEntries(['landing', 'maint', 'relation', 'local']
            .map((layer) => [layer, plan.expectedIdentityCount])),
          preservedLocalRoles: ['detail']
        };
      }
    }),
    writeResult: (payload) => events.push(`result:${payload.status}`)
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.decisionId, 'decision-1');
  assert.deepEqual(events.slice(0, 4), ['authorize', 'permit', 'snapshot', 'stage:landing']);
  assert.equal(events.at(-1), 'result:COMPLETED');
});

test('an apply without an authorized packet never reaches the adapter', async () => {
  let adapterBuilt = false;
  await assert.rejects(
    runItemImageLineageApply({
      contract: planInput().contract,
      lineageBundleBytes: planInput().lineageBundleBytes,
      previews: planInput().previews,
      generatedAt: '2026-08-01T00:00:00.000Z',
      loadAuthorizedContext: () => { throw new Error('TERRAPEDIA_AUTHORIZED_PACKET_PATH is required'); },
      consumePermit: () => ({ decisionId: 'decision-1' }),
      createAdapter: () => { adapterBuilt = true; return {}; },
      writeResult: () => {}
    }),
    /TERRAPEDIA_AUTHORIZED_PACKET_PATH/
  );
  assert.equal(adapterBuilt, false);
});

test('a failed apply still writes its result so the snapshot is on record', async () => {
  const written = [];
  const result = await runItemImageLineageApply({
    contract: planInput().contract,
    lineageBundleBytes: planInput().lineageBundleBytes,
    previews: planInput().previews,
    generatedAt: '2026-08-01T00:00:00.000Z',
    loadAuthorizedContext: () => ({ operationId: OPERATION_ID }),
    consumePermit: () => ({ decisionId: 'decision-1' }),
    createAdapter: () => ({
      async snapshotOwnedScope() { return { snapshotId: 's1', rowCount: 3 }; },
      async applyStage(stage) {
        if (stage.name === 'local') throw new Error('injected local failure');
        return { rowCount: 2 };
      },
      async verifyParity() { throw new Error('verify must not run after a failed stage'); }
    }),
    writeResult: (payload) => written.push(payload)
  });

  assert.equal(result.status, 'FAILED');
  assert.equal(written.length, 1);
  assert.equal(written[0].snapshot.snapshotId, 's1');
  assert.match(written[0].nextStep, /snapshot s1/);
});
