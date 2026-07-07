import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  computeInputFingerprint,
  createResumeState,
  loadResumeState,
  verifyResumeState,
  resolveResumeDecision,
  derivePartialPath,
  verifyResumePartialStore,
  makeSkipChecker,
  markCompleted,
  buildResumeProgressFields,
} from './crawler-resume-state.mjs';

const ACTION = 'domain-source-town-npc-maintenance';
const MODE = 'keyed_items';

test('fingerprint is order independent and changes with seed set or descriptors', () => {
  const a = computeInputFingerprint([
    { gameId: 3, internalName: 'C', pageTitle: 'C', nameZh: '三' },
    { gameId: 1, internalName: 'A', pageTitle: 'A', nameZh: '一' },
    { gameId: 2, internalName: 'B', pageTitle: 'B', nameZh: '二' },
  ]);
  const b = computeInputFingerprint([
    { gameId: 1, internalName: 'A', pageTitle: 'A', nameZh: '一' },
    { gameId: 2, internalName: 'B', pageTitle: 'B', nameZh: '二' },
    { gameId: 3, internalName: 'C', pageTitle: 'C', nameZh: '三' },
  ]);
  const c = computeInputFingerprint([
    { gameId: 1, internalName: 'A', pageTitle: 'A', nameZh: '一' },
    { gameId: 2, internalName: 'B', pageTitle: 'B', nameZh: '二' },
    { gameId: 3, internalName: 'C', pageTitle: 'C', nameZh: '三' },
    { gameId: 4, internalName: 'D', pageTitle: 'D', nameZh: '四' },
  ]);
  const d = computeInputFingerprint([
    { gameId: 1, internalName: 'A', pageTitle: 'A-renamed', nameZh: '一' },
    { gameId: 2, internalName: 'B', pageTitle: 'B', nameZh: '二' },
    { gameId: 3, internalName: 'C', pageTitle: 'C', nameZh: '三' },
  ]);

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
});

test('verifyResumeState rejects action, mode, and fingerprint mismatches', () => {
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });

  assert.equal(verifyResumeState({ state, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp }).ok, true);
  assert.equal(verifyResumeState({ state, actionId: 'x', resumeMode: MODE, inputFingerprint: fp }).reason, 'actionId-mismatch');
  assert.equal(verifyResumeState({ state, actionId: ACTION, resumeMode: 'index', inputFingerprint: fp }).reason, 'mode-mismatch');
  assert.equal(verifyResumeState({ state, actionId: ACTION, resumeMode: MODE, inputFingerprint: 'zzz' }).reason, 'fingerprint-mismatch');
});

test('resolveResumeDecision handles fresh, resume, auto, invalid mode, and missing partial store', () => {
  const fp = computeInputFingerprint([1, 2]);
  const good = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });

  assert.equal(resolveResumeDecision({ mode: 'fresh', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp }).action, 'fresh');
  assert.equal(resolveResumeDecision({ mode: 'resume', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp, partialStore: {} }).action, 'resume');
  assert.equal(resolveResumeDecision({ mode: 'resume', state: null, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp }).action, 'fail');
  assert.equal(resolveResumeDecision({ mode: 'auto', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: 'zzz' }).action, 'fresh');
  assert.equal(resolveResumeDecision({ mode: 'auto', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp, partialStore: {} }).action, 'resume');
  assert.deepEqual(resolveResumeDecision({ mode: 'bogus', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp, partialStore: {} }), { action: 'fail', reason: 'invalid-mode' });
  assert.equal(resolveResumeDecision({ mode: 'resume', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp }).reason, 'partial-missing-store');
});

test('derivePartialPath never overwrites a non-resume state path', () => {
  assert.equal(derivePartialPath('/tmp/state.resume.json'), '/tmp/state.partial.json');
  assert.equal(derivePartialPath('/tmp/state.json'), '/tmp/state.json.partial.json');
});

const completeRecord = (record, key) => record && record.gameId === Number(key) && record.payload === 'complete';

test('partial consistency fails when completed keys are missing from partial store', () => {
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  state.completedKeys.push(1, 2);

  const verdict = verifyResumePartialStore({
    state,
    partialStore: { 1: { gameId: 1, payload: 'complete' } },
    isValidRecord: completeRecord,
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'partial-missing-completed-key');
  assert.deepEqual(verdict.missingKeys, ['2']);
  assert.equal(resolveResumeDecision({
    mode: 'resume',
    state,
    actionId: ACTION,
    resumeMode: MODE,
    inputFingerprint: fp,
    partialStore: { 1: { gameId: 1, payload: 'complete' } },
    isValidRecord: completeRecord,
  }).action, 'fail');
  const shouldSkip = makeSkipChecker(state, { 1: { gameId: 1, payload: 'complete' } }, completeRecord);
  assert.equal(shouldSkip(1), true);
  assert.equal(shouldSkip(2), false);
});

test('partial consistency rejects invalid records and gameId mismatches', () => {
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  state.completedKeys.push(1, 2);

  assert.equal(verifyResumePartialStore({
    state,
    partialStore: { 1: { gameId: 1, payload: 'complete' }, 2: null },
    isValidRecord: completeRecord,
  }).reason, 'partial-invalid-record');
  assert.equal(verifyResumePartialStore({
    state,
    partialStore: { 1: { gameId: 1 }, 2: { gameId: 2, payload: 'complete' } },
    isValidRecord: completeRecord,
  }).reason, 'partial-invalid-record');
  assert.equal(verifyResumePartialStore({
    state,
    partialStore: { 1: { gameId: 1, payload: 'complete' }, 2: { gameId: 999, payload: 'complete' } },
    isValidRecord: completeRecord,
  }).reason, 'partial-key-mismatch');

  const shouldSkip = makeSkipChecker(state, { 1: { gameId: 1 }, 2: { gameId: 999, payload: 'complete' } }, completeRecord);
  assert.equal(shouldSkip(1), false);
  assert.equal(shouldSkip(2), false);
});

test('partial consistency rejects completed keys outside the current seed set', () => {
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  state.completedKeys.push(1, 999);

  const verdict = verifyResumePartialStore({
    state,
    partialStore: {
      1: { gameId: 1, payload: 'complete' },
      999: { gameId: 999, payload: 'complete' },
    },
    isValidRecord: completeRecord,
    validKeys: [1, 2],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'completed-key-out-of-scope');
  assert.deepEqual(verdict.extraKeys, ['999']);
});

test('skip and markCompleted are durable and idempotent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-state-'));
  const statePath = path.join(dir, 'nested', 's.resume.json');
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  const partialStore = {};

  const skip0 = makeSkipChecker(state, partialStore);
  assert.equal(skip0(1), false);

  partialStore[1] = { gameId: 1, payload: 'complete' };
  markCompleted({ statePath, state, key: 1 });
  partialStore[2] = { gameId: 2, payload: 'complete' };
  markCompleted({ statePath, state, key: 1 });
  markCompleted({ statePath, state, key: 2 });

  const reloaded = loadResumeState(statePath);
  assert.deepEqual(reloaded.completedKeys.map(String).sort(), ['1', '2']);
  const skip1 = makeSkipChecker(reloaded, partialStore, completeRecord);
  assert.equal(skip1(1), true);
  assert.equal(skip1(3), false);
  assert.equal(fs.readdirSync(path.dirname(statePath)).some((name) => name.endsWith('.tmp')), false);
});

test('buildResumeProgressFields returns deduped resume progress object', () => {
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  state.completedKeys.push(1, 1);

  const fields = buildResumeProgressFields(state, 2);

  assert.deepEqual(fields.resume, { mode: MODE, completed: 1, total: 2, inputFingerprint: fp });
});
