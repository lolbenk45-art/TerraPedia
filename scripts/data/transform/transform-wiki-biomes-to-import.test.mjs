import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, 'transform-wiki-biomes-to-import.mjs');

test('transform passes through valid extracted biome image URLs', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biome-transform-'));
  const generatedDir = path.join(tempDir, 'data', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(path.join(generatedDir, 'wiki-biomes.latest.json'), JSON.stringify({
    entity: 'wiki_biomes',
    generatedAt: '2026-05-20T00:00:00.000Z',
    overview: { title: 'Biomes' },
    derivedRecords: [],
    unresolved: [],
    records: [{
      topGroup: 'Surface and Underground',
      requestedTitle: 'Forest',
      title: 'Forest',
      revisionTimestamp: '2026-05-20T00:00:00Z',
      intro: 'The Forest is the central surface biome.',
      aliases: ['Forest'],
      iconUrl: 'https://terraria.wiki.gg/images/Forest_biome.png',
    }],
  }), 'utf8');

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: tempDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(fs.readFileSync(path.join(generatedDir, 'wiki-biomes.importable.latest.json'), 'utf8'));
  assert.equal(output.biomes[0].iconUrl, 'https://terraria.wiki.gg/images/Forest_biome.png');
});

test('transform keeps intentional overview section records as micro biome imports', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biome-transform-section-'));
  const generatedDir = path.join(tempDir, 'data', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(path.join(generatedDir, 'wiki-biomes.latest.json'), JSON.stringify({
    entity: 'wiki_biomes',
    generatedAt: '2026-05-20T00:00:00.000Z',
    overview: { title: 'Biomes' },
    derivedRecords: [],
    unresolved: [],
    records: [{
      topGroup: 'Micro-biomes',
      sectionGroup: 'Flower patch',
      requestedTitle: 'Flower patch',
      title: 'Flower patch',
      sourceType: 'overview_section',
      sourcePageTitle: 'Biomes',
      sourceSectionAnchor: 'Flower_patch',
      revisionTimestamp: '2026-05-20T00:00:00Z',
      intro: 'A flower patch is a tiny surface micro-biome.',
      aliases: ['Flower patch'],
      iconUrl: 'https://terraria.wiki.gg/images/Flower_Patch.png',
    }]
  }), 'utf8');

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: tempDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(fs.readFileSync(path.join(generatedDir, 'wiki-biomes.importable.latest.json'), 'utf8'));
  assert.equal(output.biomes.length, 1);
  assert.equal(output.biomes[0].code, 'flower_patch');
  assert.equal(output.biomes[0].nameEn, 'Flower patch');
  assert.equal(output.biomes[0].nameZh, '花丛');
  assert.equal(output.biomes[0].layerType, 'micro_biome');
  assert.equal(output.biomes[0].biomeType, 'micro_biome');
  assert.equal(output.biomes[0].sourcePage, 'Biomes#Flower_patch');
});

test('transform keeps Chinese names for redirected biome titles with aliases', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biome-transform-alias-'));
  const generatedDir = path.join(tempDir, 'data', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(path.join(generatedDir, 'wiki-biomes.latest.json'), JSON.stringify({
    entity: 'wiki_biomes',
    generatedAt: '2026-05-20T00:00:00.000Z',
    overview: { title: 'Biomes' },
    derivedRecords: [],
    unresolved: [],
    records: [{
      topGroup: 'Mini-biomes',
      sectionGroup: 'Aether',
      requestedTitle: 'Aether',
      title: 'The Aether',
      revisionTimestamp: '2026-05-20T00:00:00Z',
      intro: 'The Aether is a rare mini-biome.',
      aliases: ['Aether', 'The Aether'],
      iconUrl: 'https://terraria.wiki.gg/images/BiomeBannerAether.png',
    }]
  }), 'utf8');

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: tempDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(fs.readFileSync(path.join(generatedDir, 'wiki-biomes.importable.latest.json'), 'utf8'));
  assert.equal(output.biomes[0].code, 'aether');
  assert.equal(output.biomes[0].nameEn, 'The Aether');
  assert.equal(output.biomes[0].nameZh, '以太');
  assert.equal(output.biomes[0].aliasEn, 'Aether');
});

test('transform derives canonical code from requested overview title when linked page is broader than the biome', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biome-transform-requested-code-'));
  const generatedDir = path.join(tempDir, 'data', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(path.join(generatedDir, 'wiki-biomes.latest.json'), JSON.stringify({
    entity: 'wiki_biomes',
    generatedAt: '2026-05-20T00:00:00.000Z',
    overview: { title: 'Biomes' },
    derivedRecords: [],
    unresolved: [],
    records: [{
      topGroup: 'Mini-biomes',
      sectionGroup: 'Glowing moss biome',
      requestedTitle: 'Glowing moss biome',
      title: 'Moss',
      revisionTimestamp: '2026-05-20T00:00:00Z',
      intro: 'Moss appears in glowing moss chambers.',
      aliases: ['Glowing moss biome', 'Moss'],
      iconUrl: 'https://terraria.wiki.gg/images/thumb/Moss_Chamber.jpg/94px-Moss_Chamber.jpg',
    }]
  }), 'utf8');

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: tempDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(fs.readFileSync(path.join(generatedDir, 'wiki-biomes.importable.latest.json'), 'utf8'));
  assert.equal(output.biomes[0].code, 'glowing_moss');
  assert.equal(output.biomes[0].nameEn, 'Moss');
  assert.equal(output.biomes[0].nameZh, '发光苔藓群系');
  assert.equal(output.biomes[0].aliasEn, 'Glowing moss biome');
});
