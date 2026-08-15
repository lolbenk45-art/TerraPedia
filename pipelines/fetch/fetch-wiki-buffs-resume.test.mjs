import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildBuffPageImmunityResumeContext,
  collectBuffPageImmunityFacts,
  writeFailedBuffFetchProgress
} from './fetch-wiki-buffs.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, 'fetch-wiki-buffs.mjs');

test('resume retries a buff that crashed after partial write before markCompleted', async () => {
  const ctx = createTempResumeFixture();
  const fetchLog = [];

  await assert.rejects(
    () => runCollectWithResumeContext(ctx, {
      mode: 'fresh',
      fetchLog,
      crashPoint: 'after-partial-before-mark',
      crashAfter: 1
    }),
    /intentional buff resume crash/
  );

  assert.equal(readJson(ctx.partialPath)['1'].buffId, 1);
  assert.equal(readJson(ctx.statePath).completedKeys.includes(1), false);

  await runCollectWithResumeContext(ctx, { mode: 'resume', fetchLog });

  assert.deepEqual(readJson(ctx.statePath).completedKeys.map(String).sort(), ['1', '2']);
  assert.equal(fetchLog.filter((entry) => entry.buffId === 1).length, 2);
});

test('resume skips a buff that crashed after markCompleted', async () => {
  const ctx = createTempResumeFixture();
  const fetchLog = [];

  await assert.rejects(
    () => runCollectWithResumeContext(ctx, {
      mode: 'fresh',
      fetchLog,
      crashPoint: 'after-mark',
      crashAfter: 1
    }),
    /intentional buff resume crash/
  );

  await runCollectWithResumeContext(ctx, { mode: 'resume', fetchLog });

  assert.equal(fetchLog.filter((entry) => entry.buffId === 1).length, 1);
  assert.equal(fetchLog.filter((entry) => entry.buffId === 2).length, 1);
  assert.deepEqual(readJson(ctx.statePath).completedKeys.map(String).sort(), ['1', '2']);
});

test('after-mark crash error carries current resume progress fields', async () => {
  const ctx = createTempResumeFixture();
  let crashError = null;

  try {
    await runCollectWithResumeContext(ctx, {
      mode: 'fresh',
      crashPoint: 'after-mark',
      crashAfter: 1
    });
  } catch (error) {
    crashError = error;
  }

  assert.match(crashError?.message, /intentional buff resume crash/);
  assert.equal(readJson(ctx.statePath).completedKeys.includes(1), true);
  assert.equal(crashError.resumeFields.resume.completed, 1);
  assert.equal(crashError.resumeCurrent, 1);
  assert.equal(crashError.resumeTotal, 2);
});

test('failed progress can use after-mark crash resume fields without under-reporting completed keys', async () => {
  const ctx = createTempResumeFixture();
  let crashError = null;
  try {
    await runCollectWithResumeContext(ctx, {
      mode: 'fresh',
      crashPoint: 'after-mark',
      crashAfter: 1
    });
  } catch (error) {
    crashError = error;
  }
  const progressPath = path.join(ctx.tempDir, 'progress-after-mark.json');

  writeFailedBuffFetchProgress({
    progressPath,
    startedAt: new Date().toISOString(),
    error: crashError,
    current: crashError.resumeCurrent,
    total: crashError.resumeTotal,
    resumeFields: crashError.resumeFields
  });

  const progress = readJson(progressPath);
  assert.equal(progress.status, 'failed');
  assert.equal(progress.resume.completed, 1);
  assert.equal(progress.current, 1);
  assert.equal(progress.total, 2);
});

test('fresh ignores old state and clears stale partial records before collecting', async () => {
  const ctx = createTempResumeFixture();
  fs.mkdirSync(path.dirname(ctx.statePath), { recursive: true });
  fs.writeFileSync(ctx.statePath, JSON.stringify({
    actionId: 'buff-page-immunity-refresh',
    resumeMode: 'keyed_items',
    inputFingerprint: 'stale',
    completedKeys: [99],
    updatedAt: new Date().toISOString()
  }, null, 2));
  fs.writeFileSync(ctx.partialPath, JSON.stringify({
    99: {
      buffId: 99,
      sourceEvidence: { parseStatus: 'parsed' }
    }
  }, null, 2));

  const fetchLog = [];
  await runCollectWithResumeContext(ctx, { mode: 'fresh', fetchLog });

  assert.deepEqual(Object.keys(readJson(ctx.partialPath)).sort(), ['1', '2']);
  assert.deepEqual(readJson(ctx.statePath).completedKeys.map(String).sort(), ['1', '2']);
  assert.deepEqual(fetchLog.map((entry) => entry.buffId).sort(), [1, 2]);
});

test('resume fails on changed buff ids or page titles, while auto downgrades fresh', async () => {
  const ctx = createTempResumeFixture();
  await runCollectWithResumeContext(ctx, { mode: 'fresh' });

  const changed = {
    ...ctx,
    buffs: [
      { id: 1, internalName: 'One', englishName: 'One' },
      { id: 2, internalName: 'Two', englishName: 'Two' }
    ],
    localizedByLang: {
      en: {
        1: { page: 'One Changed' },
        2: { page: 'Two' }
      }
    }
  };

  let mismatchError = null;
  try {
    buildBuffPageImmunityResumeContext({
      baseBuffs: changed.buffs,
      localizedByLang: changed.localizedByLang,
      requestedResumeMode: 'resume',
      statePath: changed.statePath
    });
  } catch (error) {
    mismatchError = error;
  }
  assert.match(
    mismatchError?.message,
    /resume 校验失败\(fingerprint-mismatch\)：请用 --resume-mode=fresh 重跑，或确认输入未变/
  );
  assert.equal(mismatchError.resumeFields.resume.mode, 'keyed_items');
  assert.equal(mismatchError.resumeFields.resume.total, 2);

  fs.writeFileSync(changed.partialPath, JSON.stringify({
    99: {
      buffId: 99,
      sourceEvidence: { parseStatus: 'parsed' }
    }
  }, null, 2));

  await runCollectWithResumeContext(changed, { mode: 'auto' });

  assert.deepEqual(Object.keys(readJson(changed.partialPath)).sort(), ['1', '2']);
  assert.deepEqual(readJson(changed.statePath).completedKeys.map(String).sort(), ['1', '2']);
});

test('single page fetch failure is not marked complete and failed progress reports completed total', async () => {
  const ctx = createTempResumeFixture();
  const resume = buildBuffPageImmunityResumeContext({
    baseBuffs: ctx.buffs,
    localizedByLang: ctx.localizedByLang,
    requestedResumeMode: 'fresh',
    statePath: ctx.statePath
  });

  await collectBuffPageImmunityFacts({
    buffs: ctx.buffs,
    localizedByLang: ctx.localizedByLang,
    fetchPagePayload: async ({ pageTitle }) => {
      if (pageTitle === 'One') {
        throw new Error('simulated page failure');
      }
      return buildParsedPayload(pageTitle);
    },
    resume
  });

  assert.equal(readJson(ctx.partialPath)['1'], undefined);
  assert.deepEqual(readJson(ctx.statePath).completedKeys.map(String), ['2']);

  const progressPath = path.join(ctx.tempDir, 'progress.json');
  writeFailedBuffFetchProgress({
    progressPath,
    startedAt: new Date().toISOString(),
    error: new Error('1/2 buffs 完成，其余抓取或解析失败'),
    resumeFields: resume.progressFields()
  });

  const progress = readJson(progressPath);
  assert.equal(progress.status, 'failed');
  assert.match(progress.message, /1\/2/);
  assert.equal(progress.resume.completed, 1);
  assert.equal(progress.resume.total, 2);
});

test('writeFailedBuffFetchProgress writes monitor failed payload shape', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-buff-resume-progress-'));
  const progressPath = path.join(tempDir, 'fetch-wiki-buffs-progress.latest.json');

  writeFailedBuffFetchProgress({
    progressPath,
    startedAt: new Date().toISOString(),
    error: new Error('boom'),
    resumeFields: {
      resume: {
        mode: 'keyed_items',
        completed: 0,
        total: 2,
        inputFingerprint: 'abc'
      }
    }
  });

  const progress = readJson(progressPath);
  assert.equal(progress.status, 'failed');
  assert.equal(progress.actionId, 'buff-page-immunity-refresh');
  assert.equal(typeof progress.generatedAt, 'string');
  assert.equal(typeof progress.lastHeartbeatAt, 'string');
  assert.equal(progress.childStatusPath.endsWith('fetch-wiki-buffs-progress.latest.json'), true);
  assert.equal(progress.resume.mode, 'keyed_items');
});

test('source declares resume CLI and helper contracts without spawning wiki fetch', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');

  assert.match(source, /options\['resume-mode'\]/);
  assert.match(source, /options\['resume-state'\]/);
  assert.match(source, /DEFAULT_BUFF_RESUME_STATE_PATH/);
  assert.match(source, /path\.join\(repoRoot,\s*'data',\s*'generated',\s*'resume'/);
  assert.match(source, /derivePartialPath/);
  assert.match(source, /buildResumeProgressFields/);
});

async function runCollectWithResumeContext(ctx, {
  mode,
  fetchLog = [],
  crashPoint = null,
  crashAfter = null
} = {}) {
  const resume = buildBuffPageImmunityResumeContext({
    baseBuffs: ctx.buffs,
    localizedByLang: ctx.localizedByLang,
    requestedResumeMode: mode,
    statePath: ctx.statePath
  });
  const crashIfConfigured = (point, detail) => {
    if (crashPoint === point && crashAfter != null && detail.attempted >= crashAfter) {
      throw new Error(`intentional buff resume crash at ${point}`);
    }
  };

  return collectBuffPageImmunityFacts({
    buffs: ctx.buffs,
    localizedByLang: ctx.localizedByLang,
    fetchPagePayload: async ({ pageTitle }) => {
      const buffId = pageTitle === 'One' ? 1 : 2;
      fetchLog.push({ buffId, pageTitle });
      return buildParsedPayload(pageTitle);
    },
    resume,
    crashIfConfigured
  });
}

function createTempResumeFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-buff-resume-'));
  const statePath = path.join(tempDir, 'data', 'generated', 'resume', 'buff-page-immunity-refresh.resume.json');
  return {
    tempDir,
    statePath,
    partialPath: statePath.replace(/\.resume\.json$/, '.partial.json'),
    buffs: [
      { id: 1, internalName: 'One', englishName: 'One' },
      { id: 2, internalName: 'Two', englishName: 'Two' }
    ],
    localizedByLang: {
      en: {
        1: { page: 'One' },
        2: { page: 'Two' }
      }
    }
  };
}

function buildParsedPayload(pageTitle) {
  return {
    pageTitle,
    canonicalPageTitle: pageTitle,
    revisionId: 123,
    revisionTimestamp: '2026-07-07T00:00:00Z',
    sections: [
      { line: 'From player', anchor: 'From_player' },
      { line: 'From enemy', anchor: 'From_enemy' },
      { line: 'Immune NPCs', anchor: 'Immune_NPCs' }
    ],
    wikitext: '',
    html: `
      <h2><span class="mw-headline" id="From_player">From player</span></h2>
      <ul><li><a href="/wiki/${pageTitle}_Potion" title="${pageTitle} Potion">${pageTitle} Potion</a></li></ul>
      <h2><span class="mw-headline" id="From_enemy">From enemy</span></h2>
      <ul><li><a href="/wiki/${pageTitle}_Enemy" title="${pageTitle} Enemy">${pageTitle} Enemy</a></li></ul>
      <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
      <ul><li><a href="/wiki/${pageTitle}_NPC" title="${pageTitle} NPC">${pageTitle} NPC</a></li></ul>
    `
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
