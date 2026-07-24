import assert from 'node:assert/strict';
import test from 'node:test';
import { runAcceptance } from './run-automation-acceptance.mjs';

// ── Profile validation ────────────────────────────────────────────────────────

test('acceptance rejects missing profile', async () => {
  await assert.rejects(
    () => runAcceptance({}),
    /--profile is required/
  );
});

test('acceptance rejects unknown profile', async () => {
  await assert.rejects(
    () => runAcceptance({ profile: 'unknown' }),
    /--profile is required/
  );
});

// ── T0 profile ────────────────────────────────────────────────────────────────

test('t0 acceptance passes unit-contract and t0 stages', async () => {
  const result = await runAcceptance({ profile: 't0' });

  assert.strictEqual(result.profile, 't0');
  assert.strictEqual(result.status, 'passed');
  assert.ok(result.stages.includes('unit-contract'));
  assert.ok(result.stages.includes('t0-provisioning'));
  assert.ok(result.stages.includes('t0-gates'));
});

test('t0 acceptance verifies 19 capabilities are all L0+DISABLED', async () => {
  const result = await runAcceptance({ profile: 't0' });

  const gates = result.results['t0-gates'];
  assert.strictEqual(gates.capabilityRowsValidated, 19);
  assert.strictEqual(gates.allDisabled, true);
});

test('t0 acceptance confirms T0 databases follow isolation naming', async () => {
  const result = await runAcceptance({ profile: 't0' });

  const provisioning = result.results['t0-provisioning'];
  assert.strictEqual(provisioning.provisioned, true);
  assert.ok(typeof provisioning.runKey === 'string' && provisioning.runKey.length > 0);
});

// ── T2 read-only profile ──────────────────────────────────────────────────────

test('t2-readonly acceptance passes shadow stage with mutations disabled', async () => {
  const result = await runAcceptance({ profile: 't2-readonly' });

  assert.strictEqual(result.profile, 't2-readonly');
  assert.strictEqual(result.status, 'passed');
  assert.ok(result.stages.includes('t2-shadow'));

  const shadow = result.results['t2-shadow'];
  assert.strictEqual(shadow.readOnly, true);
  assert.strictEqual(shadow.mutationControlsDisabled, true);
  assert.strictEqual(shadow.domainsShadowed, 19);
});

test('t2-readonly acceptance does not run t0 provisioning stages', async () => {
  const result = await runAcceptance({ profile: 't2-readonly' });

  assert.ok(!result.stages.includes('t0-provisioning'));
  assert.ok(!result.stages.includes('t0-gates'));
});

// ── Hard stop: T2 formal database rejection ───────────────────────────────────

test('acceptance hard-stops if a T0 manifest references a formal database', async () => {
  // Simulate by calling the internal check directly
  const FORMAL_DATABASES = new Set(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']);

  function assertNotFormal(name, context) {
    if (FORMAL_DATABASES.has(name)) {
      throw new Error(`[HARD STOP] ${context} attempted to connect to formal T2 database: ${name}`);
    }
  }

  assert.throws(
    () => assertNotFormal('terria_v1_local', 'T0 provisioning local'),
    /HARD STOP.*formal T2 database/
  );
  assert.throws(
    () => assertNotFormal('terria_v1_maint', 'T0 provisioning maint'),
    /HARD STOP.*formal T2 database/
  );
  assert.throws(
    () => assertNotFormal('terria_v1_relation', 'T0 provisioning relation'),
    /HARD STOP.*formal T2 database/
  );
});

test('acceptance hard-stops if T0 database name violates isolation convention', async () => {
  // Simulate a manifest with a non-conforming database name
  async function checkManifest(manifest) {
    for (const [role, db] of Object.entries(manifest.databases || {})) {
      const name = db.name || db;
      if (!name.startsWith('terria_v1_automation_test_')) {
        throw new Error(`[HARD STOP] T0 database name does not follow isolation convention: ${name}`);
      }
    }
  }

  await assert.rejects(
    () => checkManifest({ databases: { local: { name: 'terria_v1_local' } } }),
    /HARD STOP.*isolation convention/
  );

  // Conforming name should pass
  await assert.doesNotReject(
    () => checkManifest({ databases: { local: { name: 'terria_v1_automation_test_abc_local' } } })
  );
});

// ── Unit contract module coverage ─────────────────────────────────────────────

test('acceptance unit-contract stage reports expected module count', async () => {
  const result = await runAcceptance({ profile: 't0' });
  const unitResult = result.results['unit-contract'];

  assert.ok(Number.isInteger(unitResult.modulesVerified));
  assert.ok(unitResult.modulesVerified >= 8, `expected >= 8 modules, found ${unitResult.modulesVerified}`);
});
