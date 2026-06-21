import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS,
  createFixtureTransport,
  runDomainSmoke
} from './wiki-monitor-domain-smoke.mjs';

const DOMAIN_IDS = WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS.map((domain) => domain.domain);

function makeTmpRun() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-domain-smoke-'));
  return {
    root,
    options: {
      'run-id': 'offline-smoke',
      'output-dir': path.join(root, 'out'),
      'report-path': path.join(root, 'report.json'),
      'latest-report-path': path.join(root, 'latest.json'),
      'progress-path': path.join(root, 'progress.json')
    }
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('runs all ten base domains offline and reports completed', async () => {
  const { root, options } = makeTmpRun();
  const fixture = Object.fromEntries(DOMAIN_IDS.map((domain) => [domain, 10]));

  const report = await runDomainSmoke(options, createFixtureTransport(fixture));

  assert.equal(report.status, 'completed');
  assert.equal(report.domainCount, 10);
  assert.equal(report.completedDomains, 10);
  assert.equal(report.failedDomains, 0);
  assert.deepEqual(report.domains.map((entry) => entry.domain), DOMAIN_IDS);

  for (const domain of DOMAIN_IDS) {
    const filePath = path.join(root, 'out', `${domain}.json`);
    assert.ok(fs.existsSync(filePath), `expected output file for ${domain}`);
    const record = readJson(filePath);
    assert.equal(record.domain, domain);
    assert.equal(record.status, 'completed');
    assert.equal(record.actualCount, 10);
    assert.equal(record.records.length, 10);
  }
});

test('marks a domain partial when fewer than limit records return', async () => {
  const { options } = makeTmpRun();
  const fixture = Object.fromEntries(DOMAIN_IDS.map((domain) => [domain, 10]));
  fixture.npcs = 4;

  const report = await runDomainSmoke(options, createFixtureTransport(fixture));

  assert.equal(report.status, 'partial');
  const npcs = report.domains.find((entry) => entry.domain === 'npcs');
  assert.equal(npcs.status, 'partial');
  assert.equal(npcs.actualCount, 4);
});

test('isolates a failed domain without aborting the rest of the run', async () => {
  const { root, options } = makeTmpRun();
  const fixture = Object.fromEntries(DOMAIN_IDS.map((domain) => [domain, 10]));
  fixture.bosses = 'fail';

  const report = await runDomainSmoke(options, createFixtureTransport(fixture));

  assert.equal(report.status, 'failed');
  assert.equal(report.failedDomains, 1);
  assert.equal(report.completedDomains, 9);

  const bosses = report.domains.find((entry) => entry.domain === 'bosses');
  assert.equal(bosses.status, 'failed');
  assert.ok(bosses.error, 'failed domain records an error message');
  assert.equal(bosses.records.length, 0);

  for (const domain of DOMAIN_IDS.filter((id) => id !== 'bosses')) {
    assert.ok(fs.existsSync(path.join(root, 'out', `${domain}.json`)), `expected ${domain} output despite bosses failure`);
  }
});

test('writes a progress file that ends in a terminal state with full counts', async () => {
  const { root, options } = makeTmpRun();
  const fixture = Object.fromEntries(DOMAIN_IDS.map((domain) => [domain, 10]));

  await runDomainSmoke(options, createFixtureTransport(fixture));

  const progress = readJson(path.join(root, 'progress.json'));
  assert.equal(progress.actionId, 'wiki-monitor-domain-smoke');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.current, 10);
  assert.equal(progress.total, 10);
  assert.equal(progress.domains.length, 10);
});

test('does not pollute the default latest report path during a redirected run', async () => {
  const { root, options } = makeTmpRun();
  const fixture = Object.fromEntries(DOMAIN_IDS.map((domain) => [domain, 10]));

  await runDomainSmoke(options, createFixtureTransport(fixture));

  assert.ok(fs.existsSync(path.join(root, 'latest.json')), 'latest report honors the override path');
});

test('clamps fixture counts above the per-domain limit', async () => {
  const { options } = makeTmpRun();
  const fixture = Object.fromEntries(DOMAIN_IDS.map((domain) => [domain, 50]));

  const report = await runDomainSmoke(options, createFixtureTransport(fixture));

  for (const entry of report.domains) {
    assert.equal(entry.actualCount, 10, `${entry.domain} clamps to the 10 record limit`);
  }
});
