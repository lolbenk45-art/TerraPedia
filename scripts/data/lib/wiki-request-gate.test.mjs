import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createWikiRequestGate } from './wiki-request-gate.mjs';

test('runJsonRequest waits out an existing cooldown before fetching', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-gate-'));
  const statePath = path.join(tempDir, 'gate.json');
  fs.writeFileSync(statePath, JSON.stringify({
    schemaVersion: '1.0.0',
    hostKey: 'terraria.wiki.gg',
    cooldownUntil: '2026-04-29T09:35:45.996Z',
    consecutiveThrottleFailures: 3,
    failureCount: 3,
    lastError: 'HTTP 403 Forbidden',
    lastFailureAt: '2026-04-29T09:15:45.996Z',
    lastRequestAt: null,
    successCount: 0,
    throttleFailureCount: 3
  }, null, 2), 'utf8');

  const sleeps = [];
  let fetchCount = 0;
  const gate = createWikiRequestGate({
    statePath,
    nowFn: () => Date.parse('2026-04-29T09:15:45.996Z'),
    sleepFn: async (ms) => sleeps.push(ms),
    requestProfiles: {
      revision: { baseDelayMs: 0, jitterMs: 0, maxAttempts: 1, cooldownMs: 10_000 }
    },
    fetchFn: async () => {
      fetchCount += 1;
      return okJsonResponse({ ok: true });
    }
  });

  const payload = await gate.runJsonRequest('https://terraria.wiki.gg/api.php?action=query', {
    profile: 'revision'
  });

  assert.deepEqual(payload, { ok: true });
  assert.equal(fetchCount, 1);
  assert.equal(sleeps.length, 1);
  assert.equal(sleeps[0], 20 * 60_000);

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.cooldownUntil, null);
  assert.equal(state.consecutiveThrottleFailures, 0);
});

test('runJsonRequest waits after throttle failures trigger cooldown, then retries same request', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-gate-'));
  const statePath = path.join(tempDir, 'gate.json');
  const sleeps = [];
  let fetchCount = 0;
  const gate = createWikiRequestGate({
    statePath,
    nowFn: () => Date.parse('2026-04-29T09:15:45.996Z'),
    sleepFn: async (ms) => sleeps.push(ms),
    requestProfiles: {
      revision: { baseDelayMs: 0, jitterMs: 0, maxAttempts: 4, cooldownMs: 10_000 }
    },
    fetchFn: async () => {
      fetchCount += 1;
      if (fetchCount <= 3) {
        return textResponse({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          body: '<html><title>Just a second...</title></html>'
        });
      }
      return okJsonResponse({ ok: true });
    }
  });

  const payload = await gate.runJsonRequest('https://terraria.wiki.gg/api.php?action=query', {
    profile: 'revision',
    sourceKey: 'Martian Work Bench'
  });

  assert.deepEqual(payload, { ok: true });
  assert.equal(fetchCount, 4);
  assert.ok(sleeps.some((ms) => ms >= 10_000));

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.cooldownUntil, null);
  assert.equal(state.consecutiveThrottleFailures, 0);
  assert.equal(state.successCount, 1);
});

test('runJsonRequest records alert when Cloudflare failures reach threshold', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-gate-'));
  const statePath = path.join(tempDir, 'gate.json');
  const alerts = [];
  const gate = createWikiRequestGate({
    statePath,
    nowFn: () => Date.parse('2026-05-20T05:00:00.000Z'),
    sleepFn: async () => {},
    requestProfiles: {
      revision: { baseDelayMs: 0, jitterMs: 0, maxAttempts: 3, cooldownMs: 10_000 }
    },
    fetchFn: async () => textResponse({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      body: '<html><title>Just a second... Cloudflare</title></html>'
    }),
    alertFn: (alert) => alerts.push(alert)
  });

  await assert.rejects(
    () => gate.runJsonRequest('https://terraria.wiki.gg/api.php?action=query', {
      profile: 'revision',
      sourceKey: 'Cloudflare Probe'
    }),
    /Forbidden/
  );

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'cloudflare');
  assert.equal(alerts[0].context.consecutiveFailures, 3);
});

test('runJsonRequest uses external fallback for wiki.gg challenge responses', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-gate-'));
  const statePath = path.join(tempDir, 'gate.json');
  let fetchCount = 0;
  let fallbackCount = 0;
  const gate = createWikiRequestGate({
    statePath,
    nowFn: () => Date.parse('2026-04-29T09:15:45.996Z'),
    sleepFn: async () => {},
    requestProfiles: {
      parse: { baseDelayMs: 0, jitterMs: 0, maxAttempts: 1, cooldownMs: 10_000 }
    },
    fetchFn: async () => {
      fetchCount += 1;
      return textResponse({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        body: '<!doctype html><title data-i18n="pag-title">Just a second... - wiki.gg</title>'
      });
    },
    externalRequestFn: async ({ url, method, headers }) => {
      fallbackCount += 1;
      assert.equal(String(url), 'https://terraria.wiki.gg/api.php?action=parse&maxlag=5&format=json');
      assert.equal(method, 'GET');
      assert.equal(headers['user-agent'], 'TerraPedia/2.0 (+https://terraria.wiki.gg/api.php)');
      return {
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({ ok: true, via: 'external' })
      };
    }
  });

  const payload = await gate.runJsonRequest('https://terraria.wiki.gg/api.php?action=parse', {
    profile: 'parse',
    sourceKey: 'Tin Shortsword'
  });

  assert.deepEqual(payload, { ok: true, via: 'external' });
  assert.equal(fetchCount, 1);
  assert.equal(fallbackCount, 1);

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.failureCount, 0);
  assert.equal(state.successCount, 1);
});

test('runJsonRequest commits gate state through temp file rename', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-gate-'));
  const statePath = path.join(tempDir, 'gate.json');
  const writeTargets = [];
  const renameTargets = [];
  const originalWriteFileSync = fs.writeFileSync;
  const originalRenameSync = fs.renameSync;

  fs.writeFileSync = function writeFileSyncSpy(filePath, ...args) {
    writeTargets.push(path.resolve(String(filePath)));
    return originalWriteFileSync.call(this, filePath, ...args);
  };
  fs.renameSync = function renameSyncSpy(oldPath, newPath) {
    renameTargets.push({
      oldPath: path.resolve(String(oldPath)),
      newPath: path.resolve(String(newPath))
    });
    return originalRenameSync.call(this, oldPath, newPath);
  };

  try {
    const gate = createWikiRequestGate({
      statePath,
      nowFn: () => Date.parse('2026-04-29T09:15:45.996Z'),
      sleepFn: async () => {},
      requestProfiles: {
        revision: { baseDelayMs: 0, jitterMs: 0, maxAttempts: 1, cooldownMs: 10_000 }
      },
      fetchFn: async () => okJsonResponse({ ok: true })
    });

    await gate.runJsonRequest('https://terraria.wiki.gg/api.php?action=query', {
      profile: 'revision'
    });
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    fs.renameSync = originalRenameSync;
  }

  const resolvedStatePath = path.resolve(statePath);
  assert.ok(writeTargets.length > 0);
  assert.ok(renameTargets.length > 0);
  assert.ok(writeTargets.every((target) => target !== resolvedStatePath));
  assert.ok(renameTargets.every(({ oldPath, newPath }) => {
    return path.dirname(oldPath) === tempDir && oldPath !== resolvedStatePath && newPath === resolvedStatePath;
  }));

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.successCount, 1);
});

test('separate gate instances preserve shared state counters', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-gate-'));
  const statePath = path.join(tempDir, 'gate.json');
  const requestProfiles = {
    revision: { baseDelayMs: 0, jitterMs: 0, maxAttempts: 1, cooldownMs: 10_000 }
  };

  const firstGate = createWikiRequestGate({
    statePath,
    nowFn: () => Date.parse('2026-04-29T09:15:46.996Z'),
    sleepFn: async () => {},
    requestProfiles,
    fetchFn: async () => okJsonResponse({ ok: true, gate: 'first' })
  });
  const secondGate = createWikiRequestGate({
    statePath,
    nowFn: () => Date.parse('2026-04-29T09:15:45.996Z'),
    sleepFn: async () => {},
    requestProfiles,
    fetchFn: async () => okJsonResponse({ ok: true, gate: 'second' })
  });

  await firstGate.runJsonRequest('https://terraria.wiki.gg/api.php?action=query', {
    profile: 'revision'
  });
  await secondGate.runJsonRequest('https://terraria.wiki.gg/api.php?action=query', {
    profile: 'revision'
  });

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.successCount, 2);
  assert.equal(state.failureCount, 0);
  assert.equal(state.lastRequestAt, '2026-04-29T09:15:46.996Z');
});

test('separate gate processes preserve shared state counters', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-gate-'));
  const statePath = path.join(tempDir, 'gate.json');
  const modulePath = fileURLToPath(import.meta.url).replace(/\.test\.mjs$/, '.mjs');
  const workerCode = `
    import { createWikiRequestGate } from ${JSON.stringify(pathToFileURL(modulePath).href)};
    const gate = createWikiRequestGate({
      statePath: process.env.STATE_PATH,
      requestProfiles: {
        revision: { baseDelayMs: 0, jitterMs: 0, maxAttempts: 1, cooldownMs: 10_000 }
      },
      sleepFn: async () => {},
      fetchFn: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ ok: true })
      }),
      externalRequestFn: null
    });
    for (let i = 0; i < 40; i += 1) {
      await gate.runJsonRequest('https://terraria.wiki.gg/api.php?action=query', { profile: 'revision' });
    }
  `;

  const children = Array.from({ length: 4 }, () => spawn(process.execPath, [
    '--input-type=module',
    '--eval',
    workerCode
  ], {
    env: { ...process.env, STATE_PATH: statePath },
    stdio: ['ignore', 'ignore', 'pipe']
  }));
  const results = await Promise.all(children.map((child) => new Promise((resolve) => {
    let stderr = '';
    child.stderr.on('data', (chunk) => stderr += chunk);
    child.on('close', (code) => resolve({ code, stderr }));
  })));

  assert.deepEqual(results.map(({ code }) => code), [0, 0, 0, 0]);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.successCount, 160);
  assert.equal(fs.existsSync(`${statePath}.lock`), false);
});

function okJsonResponse(body) {
  return textResponse({
    ok: true,
    status: 200,
    statusText: 'OK',
    body: JSON.stringify(body)
  });
}

function textResponse({ ok, status, statusText, body }) {
  return {
    ok,
    status,
    statusText,
    text: async () => body
  };
}
