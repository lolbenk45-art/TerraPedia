import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertFrozenSourceMonitorStateMatches,
  readFrozenSourceMonitorState,
  sourceDispatchIdentityFromEnvironment,
} from './source-dispatch-identity.mjs';

const HASH = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'source-dispatch-identity-'));
  const state = {
    checkedAt: '2026-09-03T10:00:00.000Z',
    summary: { probeHealthy: true, errorSources: 0 },
    sources: [{
      key: 'wiki.module.iteminfo',
      status: 'ok',
      checkedAt: '2026-09-03T10:00:00.000Z',
      currentValue: HASH('source-a'),
      changed: true,
    }],
  };
  const statePath = path.join(repoRoot, 'data', 'generated', 'source-update-monitor.latest.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state));
  return {
    repoRoot,
    statePath,
    state,
    identity: {
      sourceFingerprint: HASH('source-a'),
      sourceRunIdentity: state.checkedAt,
      sourceContentIdentity: HASH(JSON.stringify(state)),
    },
  };
}

test('reads and freezes the exact probe state for a scheduler identity', () => {
  const value = fixture();
  try {
    const frozen = readFrozenSourceMonitorState({
      identity: value.identity,
      domain: 'items',
      repoRoot: value.repoRoot,
      sourceStatePath: value.statePath,
    });
    assert.equal(frozen.runIdentity, value.identity.sourceRunIdentity);
    assert.equal(frozen.contentIdentity, value.identity.sourceContentIdentity);
    assert.equal(frozen.source.currentValue, value.identity.sourceFingerprint);
    assert.doesNotThrow(() => assertFrozenSourceMonitorStateMatches(value.identity, frozen));
  } finally {
    fs.rmSync(value.repoRoot, { recursive: true, force: true });
  }
});

test('rejects a changed probe timestamp or content identity before source work', () => {
  const value = fixture();
  try {
    assert.throws(() => readFrozenSourceMonitorState({
      identity: { ...value.identity, sourceRunIdentity: '2026-09-03T10:01:00.000Z' },
      domain: 'items',
      repoRoot: value.repoRoot,
      sourceStatePath: value.statePath,
    }), /checkedAt does not match/i);
    assert.throws(() => readFrozenSourceMonitorState({
      identity: { ...value.identity, sourceContentIdentity: HASH('changed-state') },
      domain: 'items',
      repoRoot: value.repoRoot,
      sourceStatePath: value.statePath,
    }), /content identity does not match/i);
  } finally {
    fs.rmSync(value.repoRoot, { recursive: true, force: true });
  }
});

test('rejects a probe source entry whose content fingerprint drifted', () => {
  const value = fixture();
  try {
    const state = { ...value.state, sources: [{ ...value.state.sources[0], currentValue: HASH('source-b') }] };
    assert.throws(() => readFrozenSourceMonitorState({
      identity: { ...value.identity, sourceContentIdentity: HASH(JSON.stringify(state)) },
      domain: 'items',
      repoRoot: value.repoRoot,
      sourceStatePath: value.statePath,
      readFileImpl: () => JSON.stringify(state),
    }), /frozen source fingerprint does not match/i);
  } finally {
    fs.rmSync(value.repoRoot, { recursive: true, force: true });
  }
});

test('rejects a source monitor state reached through a symbolic-link leaf or ancestor', () => {
  for (const mode of ['leaf', 'ancestor']) {
    const value = fixture();
    const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), `source-dispatch-${mode}-target-`));
    try {
      if (mode === 'leaf') {
        const externalStatePath = path.join(externalRoot, 'source-update-monitor.latest.json');
        fs.writeFileSync(externalStatePath, JSON.stringify(value.state));
        fs.rmSync(value.statePath);
        fs.symlinkSync(externalStatePath, value.statePath, 'file');
      } else {
        const externalGeneratedRoot = path.join(externalRoot, 'generated');
        fs.mkdirSync(externalGeneratedRoot, { recursive: true });
        fs.writeFileSync(
          path.join(externalGeneratedRoot, 'source-update-monitor.latest.json'),
          JSON.stringify(value.state),
        );
        fs.rmSync(path.dirname(value.statePath), { recursive: true, force: true });
        fs.symlinkSync(externalGeneratedRoot, path.dirname(value.statePath), 'dir');
      }

      assert.throws(() => readFrozenSourceMonitorState({
        identity: value.identity,
        domain: 'items',
        repoRoot: value.repoRoot,
        sourceStatePath: value.statePath,
      }), /ordinary file|symbolic-link/i);
    } finally {
      fs.rmSync(value.repoRoot, { recursive: true, force: true });
      fs.rmSync(externalRoot, { recursive: true, force: true });
    }
  }
});

test('rejects a source monitor state replaced during a read', () => {
  const value = fixture();
  try {
    assert.throws(() => readFrozenSourceMonitorState({
      identity: value.identity,
      domain: 'items',
      repoRoot: value.repoRoot,
      sourceStatePath: value.statePath,
      readFileImpl: (filePath) => {
        const bytes = fs.readFileSync(filePath, 'utf8');
        fs.renameSync(filePath, `${filePath}.replaced`);
        fs.writeFileSync(filePath, bytes);
        return bytes;
      },
    }), /identity changed|monitor state/i);
  } finally {
    fs.rmSync(value.repoRoot, { recursive: true, force: true });
  }
});

test('rejects scheduler source identity values for a manual requester', () => {
  assert.throws(
    () => sourceDispatchIdentityFromEnvironment({
      TERRAPEDIA_CRAWLER_REQUESTED_BY: 'manual-owner',
      TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: HASH('source-a'),
      TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: '2026-09-03T10:00:00.000Z',
      TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: HASH('source-state'),
    }),
    /manual.*source dispatch identity|source dispatch identity.*manual/i,
  );
});
