import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'fetch-wiki-biomes.mjs');

test('biome fetch writes monitor progress to explicit and canonical paths', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-biomes-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const progressPath = path.join(tempDir, 'progress.json');
  const canonicalProgressPath = path.join(worktreeRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');
  const mockApiPath = writeBiomeMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--progress-path=${progressPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_CRAWLER_ACTION_ID: 'test-biomes-refresh',
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'test-biomes-refresh');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.phase, 'write');
  assert.equal(progress.current, 1);
  assert.equal(progress.total, 1);
  assert.equal(progress.overallCurrent, 1);
  assert.equal(progress.overallTotal, 1);
  assert.match(progress.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(progress.lastHeartbeatAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(path.resolve(progress.childStatusPath), progressPath);
  assert.match(progress.outputPath, /wiki-biomes\.latest\.json$/);
  assert.match(progress.reportPath, /wiki-biomes-summary-\d{4}-\d{2}-\d{2}\.md$/);

  const canonicalProgress = JSON.parse(fs.readFileSync(canonicalProgressPath, 'utf8'));
  assert.equal(canonicalProgress.actionId, 'test-biomes-refresh');
  assert.equal(canonicalProgress.status, 'completed');
  assert.equal(path.resolve(canonicalProgress.childStatusPath), canonicalProgressPath);

  const output = JSON.parse(fs.readFileSync(path.join(worktreeRoot, 'data', 'generated', 'wiki-biomes.latest.json'), 'utf8'));
  assert.equal(output.records.length, 1);
  assert.equal(output.unresolved.length, 0);
  assert.equal(output.records[0].iconUrl, 'https://terraria.wiki.gg/images/Forest_biome.png');
});

test('default biome fetch progress path follows WORKTREE_ROOT when omitted', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-biomes-default-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const progressPath = path.join(worktreeRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');
  const mockApiPath = writeBiomeMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = spawnSync(process.execPath, [
    scriptPath
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_CRAWLER_ACTION_ID: 'test-biomes-default-refresh',
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(progressPath), true);

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'test-biomes-default-refresh');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.current, 1);
  assert.equal(progress.total, 1);
  assert.equal(path.resolve(progress.childStatusPath), progressPath);
});

test('biome fetch records overview sections for mini and micro biomes without standalone pages', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-biome-sections-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const progressPath = path.join(tempDir, 'progress.json');
  const mockApiPath = writeBiomeSectionMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--progress-path=${progressPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_CRAWLER_ACTION_ID: 'test-biome-sections-refresh',
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const output = JSON.parse(fs.readFileSync(path.join(worktreeRoot, 'data', 'generated', 'wiki-biomes.latest.json'), 'utf8'));
  assert.equal(output.unresolved.length, 0);

  const glowingMoss = output.records.find(record => record.requestedTitle === 'Glowing moss biome');
  assert.equal(glowingMoss?.title, 'Glowing moss biome');
  assert.equal(glowingMoss?.topGroup, 'Mini-biomes');
  assert.equal(glowingMoss?.sourceType, 'overview_section');
  assert.equal(glowingMoss?.sourcePageTitle, 'Biomes');
  assert.equal(glowingMoss?.sourceSectionAnchor, 'Glowing_moss_biome');
  assert.equal(glowingMoss?.sourceUrl, 'https://terraria.wiki.gg/wiki/Biomes#Glowing_moss_biome');
  assert.equal(glowingMoss?.intro, 'Glowing moss biome is a naturally generated mini-biome.');
  assert.equal(glowingMoss?.iconUrl, 'https://terraria.wiki.gg/images/Glowing_Moss.png');

  const flowerPatch = output.records.find(record => record.requestedTitle === 'Flower patch');
  assert.equal(flowerPatch?.title, 'Flower patch');
  assert.equal(flowerPatch?.topGroup, 'Micro-biomes');
  assert.equal(flowerPatch?.sourceType, 'overview_section');
  assert.equal(flowerPatch?.sourcePageTitle, 'Biomes');
  assert.equal(flowerPatch?.sourceSectionAnchor, 'Flower_patch');
  assert.equal(flowerPatch?.sourceUrl, 'https://terraria.wiki.gg/wiki/Biomes#Flower_patch');
  assert.equal(flowerPatch?.intro, 'A flower patch is a tiny surface micro-biome.');

  const undergroundCabin = output.records.find(record => record.requestedTitle === 'Underground Cabin');
  assert.equal(undergroundCabin?.title, 'Underground Cabin');
  assert.equal(undergroundCabin?.topGroup, 'Treasure rooms');
  assert.equal(undergroundCabin?.sourceSectionAnchor, 'Underground_Cabin');
  assert.equal(undergroundCabin?.iconUrl, 'https://terraria.wiki.gg/images/thumb/Underground_Cabin.png/200px-Underground_Cabin.png');

  const aether = output.records.find(record => record.requestedTitle === 'Aether');
  assert.equal(aether?.title, 'The Aether');
  assert.equal(aether?.sourceType, undefined);
  assert.equal(aether?.sourceUrl, 'https://terraria.wiki.gg/wiki/The_Aether');

  const gemstoneCave = output.records.find(record => record.requestedTitle === 'Gemstone cave');
  assert.equal(gemstoneCave?.title, 'Gemstone cave');
  assert.equal(gemstoneCave?.sourceType, 'overview_section');
  assert.equal(gemstoneCave?.sourceUrl, 'https://terraria.wiki.gg/wiki/Biomes#Gemstone_cave');

  const spikeCaves = output.records.find(record => record.requestedTitle === 'Spike Caves');
  assert.equal(spikeCaves?.title, 'Spike Caves');
  assert.equal(spikeCaves?.sourceType, 'overview_section');
  assert.equal(spikeCaves?.intro, 'Spike Caves contain traps and spikes.');

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'test-biome-sections-refresh');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.current, 6);
  assert.equal(progress.total, 6);
});

test('biome fetch follows biome-specific page links from overview sections before choosing page images', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-biome-links-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const progressPath = path.join(tempDir, 'progress.json');
  const mockApiPath = writeBiomeSpecificPageMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--progress-path=${progressPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_CRAWLER_ACTION_ID: 'test-biome-specific-links',
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const output = JSON.parse(fs.readFileSync(path.join(worktreeRoot, 'data', 'generated', 'wiki-biomes.latest.json'), 'utf8'));
  assert.equal(output.unresolved.length, 0);

  const meteorite = output.records.find(record => record.requestedTitle === 'Meteorite');
  assert.equal(meteorite?.title, 'Meteorite (biome)');
  assert.equal(meteorite?.sourceUrl, 'https://terraria.wiki.gg/wiki/Meteorite_(biome)');
  assert.equal(meteorite?.iconUrl, 'https://terraria.wiki.gg/images/BiomeBannerMeteor.png');
  assert.deepEqual(meteorite?.aliases, ['Meteorite', 'Meteorite (biome)']);

  const undergroundCabin = output.records.find(record => record.requestedTitle === 'Underground Cabin');
  assert.equal(undergroundCabin?.title, 'Underground Cabin');
  assert.equal(undergroundCabin?.iconUrl, 'https://terraria.wiki.gg/images/thumb/Underground_Cabin.png/200px-Underground_Cabin.png');
  assert.notEqual(undergroundCabin?.iconUrl, 'https://terraria.wiki.gg/images/thumb/Paint_Roller.png/32px-Paint_Roller.png');

  const stonePatch = output.records.find(record => record.requestedTitle === 'Stone patch');
  assert.equal(stonePatch?.title, 'Stone patch');
  assert.equal(stonePatch?.sourceType, 'overview_section');
  assert.equal(stonePatch?.sourceUrl, 'https://terraria.wiki.gg/wiki/Biomes#Stone_patch');
  assert.equal(output.records.some(record => record.title === 'Stone Block'), false);
});

function writeBiomeMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-api.json');
  fs.writeFileSync(mockPath, JSON.stringify({
    query: {
      pages: [{
        pageid: 101,
        title: 'Forest',
        revisions: [{
          revid: 202,
          timestamp: '2026-05-20T00:00:00Z',
          content: 'mock forest revision'
        }]
      }]
    },
    parse: {
      title: 'Biomes',
      pageid: 303,
      sections: [
        { level: '2', line: 'Surface and Underground' },
        { level: '3', line: 'Forest' }
      ],
      text: `
        <div class="mw-parser-output">
          <table class="infobox">
            <tr><td><img alt="Desktop version" src="/images/Desktop_only.png?8fb4d9" /></td></tr>
            <tr><td><img alt="Forest biome" src="/images/Forest_biome.png?123abc" /></td></tr>
          </table>
          <p>The Forest is the central surface biome.</p>
        </div>`
    }
  }), 'utf8');
  return mockPath;
}

function writeBiomeSectionMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-api.json');
  const biomesRevision = {
    query: {
      pages: [{
        pageid: 303,
        title: 'Biomes',
        revisions: [{
          revid: 404,
          timestamp: '2026-05-20T00:00:00Z',
          content: 'mock biomes revision'
        }]
      }]
    }
  };
  const biomesParse = {
    parse: {
      title: 'Biomes',
      pageid: 303,
      sections: [
        { level: '2', line: 'Mini-biomes', anchor: 'Mini-biomes', index: '24' },
        { level: '3', line: 'Glowing moss biome', anchor: 'Glowing_moss_biome', index: '25' },
        { level: '3', line: 'Aether', anchor: 'Aether', index: '26' },
        { level: '2', line: 'Micro-biomes', anchor: 'Micro-biomes', index: '37' },
        { level: '3', line: 'Flower patch', anchor: 'Flower_patch', index: '38' },
        { level: '3', line: 'Gemstone cave', anchor: 'Gemstone_cave', index: '42' },
        { level: '3', line: 'Spike Caves', anchor: 'Spike_Caves', index: '44' },
        { level: '2', line: 'Treasure rooms', anchor: 'Treasure_rooms', index: '45' },
        { level: '3', line: 'Underground Cabin', anchor: 'Underground_Cabin', index: '46' }
      ],
      text: `
        <div class="mw-parser-output">
          <h2><span id="Mini-biomes">Mini-biomes</span></h2>
          <h3><span id="Glowing_moss_biome">Glowing moss biome</span></h3>
          <figure><img alt="Glowing Moss" src="/images/Glowing_Moss.png?123abc" /></figure>
          <p>Glowing moss biome is a naturally generated mini-biome.</p>
          <h3><span id="Aether">Aether</span></h3>
          <p>The Aether is a rare mini-biome.</p>
          <h2><span id="Micro-biomes">Micro-biomes</span></h2>
          <h3><span id="Flower_patch">Flower patch</span></h3>
          <p>A flower patch is a tiny surface micro-biome.</p>
          <h3><span id="Gemstone_cave">Gemstone cave</span></h3>
          <p>A gemstone cave contains gemstone clusters.</p>
          <h3><span id="Spike_Caves">Spike Caves</span></h3>
          <p>Spike Caves contain traps and spikes.</p>
          <h2><span id="Treasure_rooms">Treasure rooms</span></h2>
          <h3><span id="Underground_Cabin">Underground Cabin</span></h3>
          <div class="floatright"><a href="/wiki/File:Underground_Cabin_in_Ice_biome.png" class="image"><img alt="Underground Cabin in Ice biome.png" src="/images/thumb/Underground_Cabin_in_Ice_biome.png/250px-Underground_Cabin_in_Ice_biome.png?abc123" width="250" height="138" /></a></div>
          <p>An Underground Cabin is a small generated treasure room.</p>
        </div>`
    }
  };
  fs.writeFileSync(mockPath, JSON.stringify({
    __byRequest: {
      'query:revisions:Biomes': biomesRevision,
      'parse:text:Biomes': biomesParse,
      'parse:sections:Biomes': biomesParse,
      'query:revisions:Glowing moss biome': biomesRevision,
      'query:revisions:Flower patch': biomesRevision,
      'query:revisions:Gemstone cave': {
        query: { pages: [{ pageid: 505, title: 'Gems', revisions: [{ revid: 606, timestamp: '2026-05-20T00:00:00Z', content: 'mock gems revision' }] }] }
      },
      'query:revisions:Spike Caves': {
        query: { pages: [{ ns: 0, title: 'Spike Caves', missing: true }] }
      },
      'query:revisions:Aether': {
        query: { pages: [{ pageid: 707, title: 'The Aether', revisions: [{ revid: 808, timestamp: '2026-05-20T00:00:00Z', content: 'mock aether revision' }] }] }
      },
      'parse:text:The Aether': {
        parse: {
          title: 'The Aether',
          pageid: 707,
          text: '<div class="mw-parser-output"><p>The Aether is a rare mini-biome.</p></div>'
        }
      },
      'query:revisions:Underground Cabin': {
        query: { pages: [{ pageid: 909, title: 'Underground Cabin', revisions: [{ revid: 1001, timestamp: '2026-05-20T00:00:00Z', content: 'mock cabin revision' }] }] }
      },
      'parse:text:Underground Cabin': {
        parse: {
          title: 'Underground Cabin',
          pageid: 909,
          text: `
            <div class="mw-parser-output">
              <p>An Underground Cabin is a small generated treasure room.</p>
              <div class="message-box noexcerpt"><div class="icon"><img alt="Click to see a list of candidates for image population" src="/images/thumb/Paint_Roller.png/32px-Paint_Roller.png?681adb" width="32" height="34" /></div></div>
              <ul class="gallery mw-gallery-traditional">
                <li class="gallerybox"><div class="thumb"><a href="/wiki/File:Underground_Cabin.png" class="image"><img alt="An Underground Cabin." src="/images/thumb/Underground_Cabin.png/200px-Underground_Cabin.png?29f8d3" width="200" height="139" /></a></div></li>
              </ul>
            </div>`
        }
      }
    }
  }), 'utf8');
  return mockPath;
}

function writeBiomeSpecificPageMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-api.json');
  const biomesRevision = {
    query: {
      pages: [{
        pageid: 303,
        title: 'Biomes',
        revisions: [{
          revid: 404,
          timestamp: '2026-05-20T00:00:00Z',
          content: 'mock biomes revision'
        }]
      }]
    }
  };
  const biomesParse = {
    parse: {
      title: 'Biomes',
      pageid: 303,
      sections: [
        { level: '2', line: 'Mini-biomes', anchor: 'Mini-biomes', index: '24' },
        { level: '3', line: 'Meteorite', anchor: 'Meteorite', index: '33' },
        { level: '2', line: 'Micro-biomes', anchor: 'Micro-biomes', index: '34' },
        { level: '3', line: 'Stone patch', anchor: 'Stone_patch', index: '35' },
        { level: '2', line: 'Treasure rooms', anchor: 'Treasure_rooms', index: '45' },
        { level: '3', line: 'Underground Cabin', anchor: 'Underground_Cabin', index: '46' }
      ],
      text: `
        <div class="mw-parser-output">
          <h2><span id="Mini-biomes">Mini-biomes</span></h2>
          <h3><span id="Meteorite">Meteorite</span><a href="/wiki/Biomes?action=edit&amp;section=33" title="Edit section: Meteorite">edit</a></h3>
          <div class="floatright"><a href="/wiki/File:BiomeBannerMeteor.png" class="image"><img alt="BiomeBannerMeteor.png" src="/images/thumb/BiomeBannerMeteor.png/300px-BiomeBannerMeteor.png?19964e" width="300" height="80" /></a></div>
          <p>The <a href="/wiki/Meteorite_(biome)" title="Meteorite (biome)">Meteorite</a> biome is a mini-biome.</p>
          <h2><span id="Micro-biomes">Micro-biomes</span></h2>
          <h3><span id="Stone_patch">Stone patch</span><a href="/wiki/Biomes?action=edit&amp;section=34" title="Edit section: Stone patch">edit</a></h3>
          <p>A <a href="/wiki/Stone_Block" title="Stone Block">Stone Block</a> patch is a micro-biome.</p>
          <h2><span id="Treasure_rooms">Treasure rooms</span></h2>
          <h3><span id="Underground_Cabin">Underground Cabin</span><a href="/wiki/Biomes?action=edit&amp;section=46" title="Edit section: Underground Cabin">edit</a></h3>
          <div class="floatright"><a href="/wiki/File:Underground_Cabin_in_Ice_biome.png" class="image"><img alt="Underground Cabin in Ice biome.png" src="/images/thumb/Underground_Cabin_in_Ice_biome.png/250px-Underground_Cabin_in_Ice_biome.png?a610b5" width="250" height="138" /></a></div>
          <p><a href="/wiki/Underground_Cabin" title="Underground Cabin">Underground Cabins</a> are found in the Cavern layer.</p>
        </div>`
    }
  };

  fs.writeFileSync(mockPath, JSON.stringify({
    __byRequest: {
      'query:revisions:Biomes': biomesRevision,
      'parse:text:Biomes': biomesParse,
      'parse:sections:Biomes': biomesParse,
      'query:revisions:Meteorite (biome)': {
        query: { pages: [{ pageid: 111, title: 'Meteorite (biome)', revisions: [{ revid: 222, timestamp: '2026-05-20T00:00:00Z', content: 'mock meteorite biome revision' }] }] }
      },
      'parse:text:Meteorite (biome)': {
        parse: {
          title: 'Meteorite (biome)',
          pageid: 111,
          text: `
            <div class="mw-parser-output">
              <div class="center"><div class="floatnone"><a href="/wiki/File:BiomeBannerMeteor.png" class="image"><img alt="BiomeBannerMeteor.png" src="/images/BiomeBannerMeteor.png?19964e" width="464" height="124" /></a></div></div>
              <p>A Meteorite biome is a mini-biome formed when a meteor crashes.</p>
              <img alt="Meteorite" src="/images/thumb/Meteorite.png/12px-Meteorite.png?e7cc21" width="12" height="12" />
            </div>`
        }
      },
      'query:revisions:Stone patch': {
        query: { pages: [{ pageid: 303, title: 'Biomes', revisions: [{ revid: 404, timestamp: '2026-05-20T00:00:00Z', content: 'mock biomes revision' }] }] }
      },
      'query:revisions:Underground Cabin': {
        query: { pages: [{ pageid: 909, title: 'Underground Cabin', revisions: [{ revid: 1001, timestamp: '2026-05-20T00:00:00Z', content: 'mock cabin revision' }] }] }
      },
      'parse:text:Underground Cabin': {
        parse: {
          title: 'Underground Cabin',
          pageid: 909,
          text: `
            <div class="mw-parser-output">
              <p>Underground Cabins are small subterranean structures generated at world creation.</p>
              <div class="message-box noexcerpt"><div class="icon"><a href="/wiki/Category:Pages_needing_images" title="Click to see a list of candidates for image population"><img alt="Click to see a list of candidates for image population" src="/images/thumb/Paint_Roller.png/32px-Paint_Roller.png?681adb" width="32" height="34" data-file-width="38" data-file-height="40" /></a></div></div>
              <ul class="gallery mw-gallery-traditional">
                <li class="gallerybox"><div class="thumb"><a href="/wiki/File:Underground_Cabin.png" class="image" title="An Underground Cabin."><img alt="An Underground Cabin." src="/images/thumb/Underground_Cabin.png/200px-Underground_Cabin.png?29f8d3" width="200" height="139" data-file-width="576" data-file-height="400" /></a></div></li>
              </ul>
            </div>`
        }
      }
    }
  }), 'utf8');
  return mockPath;
}
