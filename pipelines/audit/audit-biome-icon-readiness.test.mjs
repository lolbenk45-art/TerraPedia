import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditBiomeIconReadiness,
  parseAuditBiomeIconReadinessArgs
} from './audit-biome-icon-readiness.mjs';

const GENERATED_AT = '2026-06-14T00:00:00.000Z';

test('auditBiomeIconReadiness treats official no-image biome sections as known exceptions', () => {
  const report = auditBiomeIconReadiness({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images'],
    biomes: [
      {
        id: 241,
        code: 'spike_caves',
        nameEn: 'Spike Caves',
        nameZh: '尖刺洞穴',
        iconUrl: null,
        sourcePage: 'Biomes#Spike_Caves'
      }
    ]
  });

  assert.equal(report.readOnly, true);
  assert.equal(report.status, 'ok');
  assert.deepEqual(report.summary, {
    totalRows: 1,
    managedIconRows: 0,
    wikiFallbackRows: 0,
    invalidUrlRows: 0,
    missingIconRows: 0,
    knownNoRepresentativeImageRows: 1
  });
  assert.deepEqual(report.missingIconBiomes, []);
  assert.deepEqual(report.knownNoRepresentativeImageBiomes, [
    {
      id: 241,
      code: 'spike_caves',
      nameEn: 'Spike Caves',
      nameZh: '尖刺洞穴',
      reason: 'official_no_representative_image',
      sourcePage: 'Biomes#Spike_Caves'
    }
  ]);
});

test('auditBiomeIconReadiness separates managed, wiki fallback, and invalid icon URLs', () => {
  const report = auditBiomeIconReadiness({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images'],
    biomes: [
      {
        id: 1,
        code: 'forest',
        nameEn: 'Forest',
        nameZh: '森林',
        iconUrl: 'http://localhost:9000/terrapedia-images/biomes/forest.png'
      },
      {
        id: 2,
        code: 'desert',
        nameEn: 'Desert',
        nameZh: '沙漠',
        iconUrl: 'https://terraria.wiki.gg/images/Desert_icon.png'
      },
      {
        id: 3,
        code: 'bad',
        nameEn: 'Bad',
        nameZh: '坏链接',
        iconUrl: 'not-a-url'
      }
    ]
  });

  assert.equal(report.status, 'warning');
  assert.equal(report.summary.totalRows, 3);
  assert.equal(report.summary.managedIconRows, 1);
  assert.equal(report.summary.wikiFallbackRows, 1);
  assert.equal(report.summary.invalidUrlRows, 1);
  assert.equal(report.summary.missingIconRows, 0);
  assert.deepEqual(report.wikiFallbackBiomes.map((row) => row.code), ['desert']);
  assert.deepEqual(report.invalidUrlBiomes.map((row) => row.code), ['bad']);
});

test('parseAuditBiomeIconReadinessArgs rejects mutation flags', () => {
  assert.throws(
    () => parseAuditBiomeIconReadinessArgs(['--write-db=true']),
    /read-only biome icon readiness audit refuses mutation flag: --write-db/
  );
});
