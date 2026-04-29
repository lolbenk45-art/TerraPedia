import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
