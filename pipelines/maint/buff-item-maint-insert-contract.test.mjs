import assert from 'node:assert/strict';
import test from 'node:test';

import * as contract from './buff-item-maint-insert-contract.mjs';
import { parseIteminfoModulePayload } from '../lib/wiki-item-utils.mjs';
import { extractMaintEntitiesFromLandingRow } from './sync-landing-to-maint.mjs';
import { sourceFixture, proposalInput } from './buff-item-maint-insert.fixture.mjs';

const identities = [
  [6148, 'PalworldMinionTrustyCattiva', 389],
  [6149, 'PalworldMinionTrustyFoxsparks', 390],
  [6155, 'LightningStrike', 399],
  [6161, 'ClayPotMinion', 393],
  [6164, 'ForbiddenMinion', 394],
  [6173, 'ArcSurge', 400],
];

test('derives exactly six deferred maint inserts from a bounded source landing', async () => {
  assert.equal(typeof contract.buildBuffItemMaintInsertProposal, 'function', 'six-Item proposal builder is missing');
  const result = await contract.buildBuffItemMaintInsertProposal(proposalInput());
  assert.equal(result.executable, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.applyAllowed, false);
  assert.equal(result.landing.source_key, 'canonical.buff-item-dependency.buff-items-test-01');
  assert.equal(result.landing.id, undefined);
  assert.equal(result.landing.is_current, 0, 'bounded source evidence must stay outside generic current-item sync');
  const data = parseIteminfoModulePayload(JSON.parse(result.landing.payload_json).moduleContent);
  assert.deepEqual(Object.keys(data).filter(key => /^\d+$/.test(key)).map(Number), identities.map(([id]) => id));
  assert.equal(data._generated, 'fixture-generation');
  assert.equal(data._terrariaversion, '1.4.5.7');
  const extracted = await extractMaintEntitiesFromLandingRow({ ...result.landing, id: 55 });
  assert.deepEqual(result.maintInserts.map(row => row.source_id), identities.map(([id]) => id));
  assert.ok(result.maintInserts.every(row => row.id === undefined && row.landing_source_id === null));
  assert.deepEqual(extracted.rows.map(row => row.sourceId), identities.map(([id]) => id));
  assert.equal(result.sourceBinding.pages.length, 3);
  assert.match(result.contractHash, /^sha256:[a-f0-9]{64}$/);
});

test('rejects missing or altered source identities despite valid capture hashes', async () => {
  assert.equal(typeof contract.buildBuffItemMaintInsertProposal, 'function');
  for (const change of [data => delete data[6148], data => { data[6148].internalName = 'WrongItem'; },
    data => { data[6148].id = 9999; }, data => { data._terrariaversion = ''; }]) {
    await assert.rejects(contract.buildBuffItemMaintInsertProposal(proposalInput({ source: sourceFixture(change) })), /source|identity|version/i);
  }
});

test('rejects existing maint identities including inactive rows and case-folded names', async () => {
  assert.equal(typeof contract.buildBuffItemMaintInsertProposal, 'function');
  const template = (await contract.buildBuffItemMaintInsertProposal(proposalInput())).maintInserts[0];
  for (const row of [
    { ...template, id: 10, landing_source_id: 11, status: 0, deleted: 1 },
    { ...template, id: 10, landing_source_id: 11, source_id: 9999, internal_name: 'palworldminiontrustycattiva' },
  ]) {
    const maint = { ...row, created_at: '2026-10-01 01:00:00', updated_at: '2026-10-01 01:00:00' };
    await assert.rejects(contract.buildBuffItemMaintInsertProposal(proposalInput({ maintRows: [maint] })), /identity conflicts/i);
  }
});

test('rejects reusing the bounded landing namespace', async () => {
  assert.equal(typeof contract.buildBuffItemMaintInsertProposal, 'function');
  const template = (await contract.buildBuffItemMaintInsertProposal(proposalInput())).landing;
  await assert.rejects(contract.buildBuffItemMaintInsertProposal(proposalInput({ landingRows: [
    { ...template, id: 1, created_at: '2026-10-01 01:00:00', updated_at: '2026-10-01 01:00:00' },
  ] })), /namespace already exists/i);
});

test('rejects source-byte tampering before derivation', async () => {
  assert.equal(typeof contract.buildBuffItemMaintInsertProposal, 'function');
  const source = sourceFixture();
  source.semanticCapture.pages[0].rawBytes = Buffer.from('{}');
  await assert.rejects(contract.buildBuffItemMaintInsertProposal(proposalInput({ source })), /source|hash/i);
});

test('bounds the Lua delimiter even when source text contains a closing long-string token', async () => {
  const source = sourceFixture(data => { data[6148].description = 'text ]=] closing token'; });
  const proposal = await contract.buildBuffItemMaintInsertProposal(proposalInput({ source }));
  const parsed = parseIteminfoModulePayload(JSON.parse(proposal.landing.payload_json).moduleContent);
  assert.equal(parsed[6148].description, 'text ]=] closing token');
});

test('preserves existing maint and historical item landing rows in the baseline', async () => {
  const blank = await contract.buildBuffItemMaintInsertProposal(proposalInput());
  const dates = { created_at: '2026-10-01 01:00:00', updated_at: '2026-10-01 01:00:00' };
  const maint = { ...blank.maintInserts[0], id: 9, source_id: 1, internal_name: 'CopperPickaxe', landing_source_id: 11, ...dates };
  const landing = { ...blank.landing, id: 11, source_key: 'wiki.module.iteminfo', ...dates };
  const result = await contract.buildBuffItemMaintInsertProposal(proposalInput({ maintRows: [maint], landingRows: [landing] }));
  assert.deepEqual(result.before.maintRows, [maint]);
  assert.deepEqual(result.before.landingRows, [landing]);
});
