import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { extractMaintEntitiesFromLandingRow } from '../maint/sync-landing-to-maint.mjs';
import { listSourceDatasetLandingInputs } from '../landing/source-dataset-locator.mjs';

import {
  buildArmorSetImageProgressPayload,
  buildArmorSetImageRows,
  classifyArmorSetImage,
  deriveArmorSetPageTitle,
  deriveArmorSetPageTitles
} from './fetch-wiki-armor-set-images.mjs';

test('deriveArmorSetPageTitle derives common armor page titles from text keys', () => {
  assert.equal(deriveArmorSetPageTitle({ textKey: 'ArmorSetBonus.Wood' }), 'Wood armor');
  assert.equal(deriveArmorSetPageTitle({ textKey: 'ArmorSetBonus.AdamantiteMagic' }), 'Adamantite Magic armor');
  assert.equal(deriveArmorSetPageTitle({ textKey: 'Wood armor' }), 'Wood armor');
});

test('deriveArmorSetPageTitles expands split armor bonus text keys to real wiki pages', () => {
  assert.deepEqual(deriveArmorSetPageTitles({ textKey: 'ArmorSetBonus.MetalTier1' }), [
    'Copper armor',
    'Tin armor',
    'Iron armor'
  ]);
  assert.deepEqual(deriveArmorSetPageTitles({ textKey: 'ArmorSetBonus.MetalTier2' }), [
    'Silver armor',
    'Gold armor',
    'Lead armor',
    'Tungsten armor'
  ]);
  assert.deepEqual(deriveArmorSetPageTitles({ textKey: 'ArmorSetBonus.CobaltCaster' }), ['Cobalt armor']);
  assert.deepEqual(deriveArmorSetPageTitles({ textKey: 'ArmorSetBonus.MythrilMelee' }), ['Mythril armor']);
  assert.deepEqual(deriveArmorSetPageTitles({ textKey: 'ArmorSetBonus.AdamantiteRanged' }), ['Adamantite armor']);
  assert.deepEqual(deriveArmorSetPageTitles({ textKey: 'ArmorSetBonus.SquireTier3' }), ['Valhalla Knight armor']);
  assert.deepEqual(deriveArmorSetPageTitles({ textKey: 'ArmorSetBonus.CrystalNinja' }), ['Crystal Assassin armor']);
  assert.deepEqual(deriveArmorSetPageTitles({ textKey: 'ArmorSetBonus.ObsidianOutlaw' }), ['Obsidian armor']);
});

test('classifyArmorSetImage distinguishes male female demo and part files', () => {
  assert.equal(classifyArmorSetImage({ fileTitle: 'Wood armor.png', pageTitle: 'Wood armor' }), 'male');
  assert.equal(classifyArmorSetImage({ fileTitle: 'Wood armor female.png', pageTitle: 'Wood armor' }), 'female');
  assert.equal(classifyArmorSetImage({ fileTitle: 'Cactus armor (demo).gif', pageTitle: 'Cactus armor' }), 'demo');
  assert.equal(classifyArmorSetImage({ fileTitle: 'Wood Helmet.png', pageTitle: 'Wood armor' }), 'part');
  assert.equal(classifyArmorSetImage({ fileTitle: 'Adamantite Breastplate.png', pageTitle: 'Wood armor' }), 'other');
  assert.equal(classifyArmorSetImage({ fileTitle: 'Wood armor (pre-1.3.2).png', pageTitle: 'Wood armor' }), 'other');
  assert.equal(classifyArmorSetImage({ fileTitle: 'Old Wood armor.png', pageTitle: 'Wood armor' }), 'other');
});

test('buildArmorSetImageRows builds maint-compatible armor_set_images_raw records', () => {
  const actual = buildArmorSetImageRows({
    armorSets: [
      {
        textKey: 'ArmorSetBonus.Wood',
        pageTitle: 'Wood armor'
      }
    ],
    pageImageTitlesByPageTitle: new Map([
      ['Wood armor', ['Wood armor.png', 'Wood armor female.png', 'Wood Helmet.png']]
    ]),
    imageInfoByFileTitle: new Map([
      ['Wood armor.png', {
        fileTitle: 'File:Wood armor.png',
        url: 'https://terraria.wiki.gg/images/Wood_armor.png',
        mime: 'image/png',
        revisionTimestamp: '2026-06-01T12:34:56Z',
        width: 64,
        height: 64
      }],
      ['Wood armor female.png', {
        fileTitle: 'File:Wood armor female.png',
        url: 'https://terraria.wiki.gg/images/Wood_armor_female.png',
        mime: 'image/png',
        width: 64,
        height: 64
      }],
      ['Wood Helmet.png', {
        fileTitle: 'File:Wood Helmet.png',
        url: 'https://terraria.wiki.gg/images/Wood_Helmet.png',
        mime: 'image/png',
        width: 16,
        height: 16
      }]
    ])
  });

  assert.equal(actual.length, 3);
  assert.deepEqual(actual.map((row) => row.imageRole), ['male', 'female', 'part']);
  assert.equal(actual[0].textKey, 'ArmorSetBonus.Wood');
  assert.equal(actual[0].pageTitle, 'Wood armor');
  assert.equal(actual[0].sourceFileTitle, 'Wood armor.png');
  assert.equal(actual[0].originalUrl, 'https://terraria.wiki.gg/images/Wood_armor.png');
  assert.equal(actual[0].isPrimary, true);
  assert.equal(actual[1].isPrimary, false);
  assert.equal(actual[0].sourceRevisionTimestamp, '2026-06-01T12:34:56Z');
  assert.equal(actual[1].sourceRevisionTimestamp, null);
  assert.equal(actual[0].cachedUrl, null);
});

test('buildArmorSetImageRows keeps images from all mapped pages under the source armor text key', () => {
  const actual = buildArmorSetImageRows({
    armorSets: [
      {
        textKey: 'ArmorSetBonus.MetalTier1'
      }
    ],
    pageImageTitlesByPageTitle: new Map([
      ['Copper armor', ['Copper armor.png']],
      ['Tin armor', ['Tin armor.png']],
      ['Iron armor', ['Iron armor.png']]
    ]),
    imageInfoByFileTitle: new Map([
      ['Copper armor.png', {
        fileTitle: 'File:Copper armor.png',
        url: 'https://terraria.wiki.gg/images/Copper_armor.png',
        mime: 'image/png',
        width: 64,
        height: 64
      }],
      ['Tin armor.png', {
        fileTitle: 'File:Tin armor.png',
        url: 'https://terraria.wiki.gg/images/Tin_armor.png',
        mime: 'image/png',
        width: 64,
        height: 64
      }],
      ['Iron armor.png', {
        fileTitle: 'File:Iron armor.png',
        url: 'https://terraria.wiki.gg/images/Iron_armor.png',
        mime: 'image/png',
        width: 64,
        height: 64
      }]
    ])
  });

  assert.deepEqual(actual.map((row) => row.pageTitle), ['Copper armor', 'Tin armor', 'Iron armor']);
  assert.deepEqual(actual.map((row) => row.textKey), [
    'ArmorSetBonus.MetalTier1',
    'ArmorSetBonus.MetalTier1',
    'ArmorSetBonus.MetalTier1'
  ]);
  assert.deepEqual(actual.map((row) => row.isPrimary), [true, false, false]);
});

test('buildArmorSetImageProgressPayload uses monitor-visible crawler fields', () => {
  const payload = buildArmorSetImageProgressPayload({
    status: 'running',
    current: 3,
    total: 151,
    message: 'fetching armor set images',
    progressPath: 'data/generated/wiki-sync-progress.latest.json',
    outputPath: '/shared/raw/wiki/armor_set_images.parsed.latest.json',
    reportPath: '/shared/reports/fetch/fetch-armor-set-images.json',
    startedAt: '2026-06-03T00:00:00.000Z',
    now: '2026-06-03T00:01:00.000Z'
  });

  assert.equal(payload.actionId, 'armor-set-images');
  assert.equal(payload.status, 'running');
  assert.equal(payload.phase, 'fetch');
  assert.equal(payload.current, 3);
  assert.equal(payload.total, 151);
  assert.equal(payload.percent, 3 / 151 * 100);
  assert.equal(payload.childStatusPath, 'data/generated/wiki-sync-progress.latest.json');
  assert.equal(payload.outputPath, '/shared/raw/wiki/armor_set_images.parsed.latest.json');
  assert.equal(payload.reportPath, '/shared/reports/fetch/fetch-armor-set-images.json');
  assert.equal(payload.lastHeartbeatAt, '2026-06-03T00:01:00.000Z');
});

async function runOfflineArmorFetch(t, { progressPath, envProgressPath, invalidInput = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-armor-image-fetch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'input.json'), invalidInput ? '{invalid' : JSON.stringify({
    armorSets: [{ textKey: 'ArmorSetBonus.Wood' }]
  }));
  const entry = fileURLToPath(new URL('./fetch-wiki-armor-set-images.mjs', import.meta.url));
  const args = ['--input=input.json', '--raw-dir=raw/wiki', '--report-dir=reports', '--keep-snapshot=false'];
  if (progressPath) args.push(`--progress-path=${progressPath}`);
  const source = `
    import fs from 'node:fs';
    const observations = [];
    globalThis.fetch = async (url) => {
      const progress = fs.existsSync('data/generated/wiki-sync-progress.latest.json')
        ? JSON.parse(fs.readFileSync('data/generated/wiki-sync-progress.latest.json', 'utf8')) : null;
      observations.push(progress?.status === 'running' && !!progress?.lastHeartbeatAt);
      if (new URL(url).searchParams.get('action') === 'parse') {
        return new Response(JSON.stringify({ parse: { images: ['Wood armor.png'] } }));
      }
      return new Response(JSON.stringify({ query: { pages: [{ title: 'File:Wood armor.png', imageinfo: [{
        url: 'https://terraria.wiki.gg/images/Wood_armor.png', timestamp: '2026-06-01T12:34:56Z',
        width: 64, height: 64, mime: 'image/png'
      }] }] } }));
    };
    process.argv = [process.execPath, ${JSON.stringify(entry)}, ...${JSON.stringify(args)}];
    await import(${JSON.stringify(new URL('./fetch-wiki-armor-set-images.mjs', import.meta.url).href)});
    console.log('MONITOR_OBSERVATIONS:' + JSON.stringify(observations));
  `;
  const result = await new Promise((resolve) => {
    const env = { ...process.env, WORKTREE_ROOT: root, TERRAPEDIA_SHARED_DATA_ROOT: path.join(root, 'shared') };
    delete env.TERRAPEDIA_CRAWLER_ACTION_ID;
    delete env.TERRAPEDIA_CRAWLER_PROGRESS_PATH;
    if (envProgressPath) env.TERRAPEDIA_CRAWLER_PROGRESS_PATH = envProgressPath;
    const child = spawn(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: root, env, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  return { ...result, root };
}

test('offline Armor CLI preserves each file revision through raw payload and maint extraction', async (t) => {
  const result = await runOfflineArmorFetch(t);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /MONITOR_OBSERVATIONS:\[true,true\]/);
  const [landing] = await listSourceDatasetLandingInputs({
    repoRoot: result.root, sharedDataRoot: result.root, datasets: ['armor_set_images_raw']
  });
  assert.equal(landing.parseStatus, 'ok');
  assert.equal(landing.sourceRevisionTimestamp, null);
  const payload = await landing.loadPayload();
  assert.deepEqual(payload.warnings, []);
  assert.equal(payload.sourceRevisionTimestamp, null, 'a multi-file collection has no single source revision');
  assert.equal(payload.armorSetImages[0].sourceRevisionTimestamp, '2026-06-01T12:34:56Z');
  assert.equal(payload.armorSetImages[0].cachedUrl, null, 'fetch does not fabricate managed cache evidence');
  const { rows } = await extractMaintEntitiesFromLandingRow({
    id: 1, dataset_type: 'armor_set_images_raw', provider: 'terraria.wiki.gg',
    source_key: 'wiki.armor_set_images', source_page: payload.sourcePageTitle,
    content_hash: landing.contentHash, fetched_at: landing.fetchedAt,
    parsed_at: landing.parsedAt, source_revision_timestamp: landing.sourceRevisionTimestamp,
    payload_json: JSON.stringify(payload)
  });
  assert.equal(rows[0].sourceRevisionTimestamp, '2026-06-01T12:34:56Z');
  const progress = JSON.parse(fs.readFileSync(path.join(result.root, 'data/generated/wiki-sync-progress.latest.json'), 'utf8'));
  assert.equal(progress.actionId, 'armor-set-images');
  assert.equal(progress.status, 'completed');
});

for (const options of [{ progressPath: 'custom/progress.json' }, { envProgressPath: 'env/progress.json' }]) {
  test(`offline Armor CLI mirrors ${Object.keys(options)[0]} before network and at completion`, async (t) => {
    const result = await runOfflineArmorFetch(t, options);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /MONITOR_OBSERVATIONS:\[true,true\]/);
    const selected = options.progressPath ?? options.envProgressPath;
    const progress = JSON.parse(fs.readFileSync(path.join(result.root, selected), 'utf8'));
    const canonical = JSON.parse(fs.readFileSync(path.join(result.root, 'data/generated/wiki-sync-progress.latest.json'), 'utf8'));
    assert.deepEqual(canonical, progress);
    assert.equal(progress.childStatusPath, selected);
    assert.equal(progress.status, 'completed');
    const payload = JSON.parse(fs.readFileSync(path.join(result.root, 'raw/wiki/armor_set_images.parsed.latest.json'), 'utf8'));
    assert.deepEqual(payload.warnings, [], 'first request must observe monitor-visible running progress');
  });
}

test('offline Armor CLI writes failed terminal progress on invalid input without publishing raw output', async (t) => {
  const result = await runOfflineArmorFetch(t, { invalidInput: true, progressPath: 'custom/progress.json' });
  assert.notEqual(result.code, 0);
  const progress = JSON.parse(fs.readFileSync(path.join(result.root, 'custom/progress.json'), 'utf8'));
  const canonical = JSON.parse(fs.readFileSync(path.join(result.root, 'data/generated/wiki-sync-progress.latest.json'), 'utf8'));
  assert.deepEqual(canonical, progress);
  assert.equal(progress.status, 'failed');
  assert.ok(progress.lastHeartbeatAt);
  assert.equal(fs.existsSync(path.join(result.root, 'raw/wiki/armor_set_images.parsed.latest.json')), false);
});
