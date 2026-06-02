import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditMissingLocalEvidence,
  buildConnectionConfig,
  buildFamilySearchTokens,
  classifyMissingEvidence,
  createMysqlMissingEvidenceLoader,
  filterComponentItemCandidates,
  filterFamilyItemCandidates,
  normalizeSearchText,
  parseArgs,
  validateMissingLocalEvidenceReport,
  writeMissingLocalEvidenceReport
} from './biome-wikitext-missing-local-evidence-audit.mjs';

function localDomainReportFixture() {
  return {
    entity: 'biome_wikitext_local_domain_resolution_audit',
    generatedAt: '2026-06-02T06:00:00.000Z',
    summary: {
      total: 5,
      byRecommendation: {
        missing_local_entity_needs_backfill: 4,
        ambiguous_npc_variant_needs_decision: 1
      }
    },
    rows: [
      missingRow(1, 'Forest', 'npc', 'Blue Dragonfly', 'Critters'),
      missingRow(2, 'Jungle', 'npc', 'Cockatiels', 'Critters'),
      missingRow(3, 'Desert', 'item', 'Mummy set', 'From Normal, Dark, Blood, and Light Mummies'),
      missingRow(4, 'The Underworld', 'item', 'Obsidian furniture', 'From terrain'),
      {
        inputIndex: 5,
        original: {
          index: 5,
          rowKey: 'forest:npc:ambiguous:zombie:5',
          biomeCode: 'forest',
          pageTitle: 'Forest',
          matchType: 'npc',
          matchStatus: 'ambiguous',
          section: 'Characters',
          source: 'During the night',
          name: 'Zombie',
          candidateMatches: [{ internalName: 'Zombie' }],
          needsUserDecision: true
        },
        recommendation: 'ambiguous_npc_variant_needs_decision',
        evidenceOnly: true,
        needsUserDecision: true
      }
    ]
  };
}

function missingRow(index, pageTitle, matchType, name, source) {
  return {
    inputIndex: index,
    original: {
      index,
      rowKey: `${pageTitle}:${matchType}:missing:${name}:${index}`,
      biomeCode: pageTitle.toLowerCase().replace(/\s+/g, '_'),
      pageTitle,
      matchType,
      matchStatus: 'missing',
      section: 'Unique Drops',
      source,
      name,
      candidateMatches: [],
      needsUserDecision: true
    },
    recommendation: 'missing_local_entity_needs_backfill',
    evidenceOnly: true,
    needsUserDecision: true
  };
}

function fakeEvidence(row) {
  const name = row.original.name;
  if (name === 'Blue Dragonfly') {
    return {
      normalizedNpcCandidates: [{ id: 596, internalName: 'BlueDragonfly', name: 'Dragonfly' }],
      familyNpcCandidates: [],
      componentItemCandidates: [],
      familyItemCandidates: []
    };
  }
  if (name === 'Cockatiels') {
    return {
      normalizedNpcCandidates: [],
      familyNpcCandidates: [{ id: 674, internalName: 'YellowCockatiel', name: 'Yellow Cockatiel' }, { id: 675, internalName: 'GrayCockatiel', name: 'Gray Cockatiel' }],
      componentItemCandidates: [],
      familyItemCandidates: []
    };
  }
  if (name === 'Mummy set') {
    return {
      normalizedNpcCandidates: [],
      familyNpcCandidates: [],
      componentItemCandidates: [{ id: 870, internalName: 'MummyMask', name: 'Mummy Mask' }, { id: 871, internalName: 'MummyShirt', name: 'Mummy Shirt' }, { id: 872, internalName: 'MummyPants', name: 'Mummy Pants' }],
      familyItemCandidates: []
    };
  }
  return {
    normalizedNpcCandidates: [],
    familyNpcCandidates: [],
    componentItemCandidates: [],
    familyItemCandidates: [{ id: 1458, internalName: 'ObsidianDoor', name: 'Obsidian Door' }, { id: 1460, internalName: 'ObsidianTable', name: 'Obsidian Table' }]
  };
}

test('auditMissingLocalEvidence filters missing rows and classifies weaker local evidence', async () => {
  const report = await auditMissingLocalEvidence({
    localDomainReport: localDomainReportFixture(),
    generatedAt: '2026-06-02T07:00:00.000Z',
    loadEvidenceForRow: async (row) => fakeEvidence(row)
  });

  assert.equal(report.entity, 'biome_wikitext_missing_local_evidence_audit');
  assert.equal(report.generatedAt, '2026-06-02T07:00:00.000Z');
  assert.equal(report.summary.total, 4);
  assert.deepEqual(report.rows.map((row) => row.inputIndex), [1, 2, 3, 4]);
  assert.deepEqual(report.rows.map((row) => row.recommendation), [
    'normalized_internal_name_candidate',
    'weak_npc_family_candidate_needs_decision',
    'component_item_set_candidate',
    'item_family_candidate'
  ]);
  assert.equal(report.rows[0].normalizedNpcCandidates[0].internalName, 'BlueDragonfly');
  assert.equal(report.rows[2].componentItemCandidates.length, 3);
  assert.equal(validateMissingLocalEvidenceReport(report).valid, true);
});

test('classifyMissingEvidence chooses strongest evidence category without deciding a mapping', () => {
  assert.equal(classifyMissingEvidence({ normalizedNpcCandidates: [{}] }), 'normalized_internal_name_candidate');
  assert.equal(classifyMissingEvidence({ familyNpcCandidates: [{}] }), 'weak_npc_family_candidate_needs_decision');
  assert.equal(classifyMissingEvidence({ componentItemCandidates: [{}, {}, {}] }), 'component_item_set_candidate');
  assert.equal(classifyMissingEvidence({ familyItemCandidates: [{}] }), 'item_family_candidate');
  assert.equal(classifyMissingEvidence({}), 'still_missing_after_local_evidence_audit');
});

test('normalizeSearchText strips punctuation, spaces, collection suffixes, and plural suffixes', () => {
  assert.equal(normalizeSearchText('Blue Dragonfly'), 'bluedragonfly');
  assert.equal(normalizeSearchText("Pedguin's set"), 'pedguin');
  assert.equal(normalizeSearchText('Cockatiels'), 'cockatiel');
  assert.equal(normalizeSearchText('Obsidian furniture'), 'obsidian');
  assert.equal(normalizeSearchText('Underworld decorative Banners'), 'underworld');
});

test('buildFamilySearchTokens avoids generic adjective and item-type matches', () => {
  assert.deepEqual(buildFamilySearchTokens('Red Admiral Butterfly'), ['Butterfly']);
  assert.deepEqual(buildFamilySearchTokens('Black Scorpion'), ['Scorpion']);
  assert.deepEqual(buildFamilySearchTokens('Dart Trap Slime'), ['Slime']);
  assert.deepEqual(buildFamilySearchTokens('Cockatiels'), ['Cockatiel']);
  assert.deepEqual(buildFamilySearchTokens('Mummy set'), ['Mummy']);
  assert.deepEqual(buildFamilySearchTokens('Shiren Hat'), ['Shiren']);
  assert.deepEqual(buildFamilySearchTokens('Underworld decorative Banners'), ['Underworld']);
});

test('item evidence filters remove misleading banner and non-family item matches', () => {
  assert.deepEqual(filterComponentItemCandidates({ name: 'Mummy set' }, [
    { internalName: 'MummyBanner', name: 'Mummy Banner' },
    { internalName: 'MummyMask', name: 'Mummy Mask' },
    { internalName: 'MummyShirt', name: 'Mummy Shirt' },
    { internalName: 'MummyPants', name: 'Mummy Pants' }
  ]).map((match) => match.internalName), ['MummyMask', 'MummyShirt', 'MummyPants']);

  assert.deepEqual(filterFamilyItemCandidates({ name: 'Obsidian furniture' }, [
    { internalName: 'ObsidianBrick', name: 'Obsidian Brick' },
    { internalName: 'ObsidianDoor', name: 'Obsidian Door' },
    { internalName: 'ObsidianTable', name: 'Obsidian Table' }
  ]).map((match) => match.internalName), ['ObsidianDoor', 'ObsidianTable']);

  assert.deepEqual(filterFamilyItemCandidates({ name: 'Mummy set' }, [
    { internalName: 'MummyBanner', name: 'Mummy Banner' },
    { internalName: 'MummyMask', name: 'Mummy Mask' },
    { internalName: 'MummyShirt', name: 'Mummy Shirt' },
    { internalName: 'MummyPants', name: 'Mummy Pants' }
  ]).map((match) => match.internalName), ['MummyMask', 'MummyShirt', 'MummyPants']);

  assert.deepEqual(filterFamilyItemCandidates({ name: 'Underworld decorative Banners' }, [
    { internalName: 'MusicBoxOWUnderworld', name: 'Music Box (Underworld)' },
    { internalName: 'TeleportationPylonUnderworld', name: 'Underworld Pylon' }
  ]), []);
});

test('parseArgs and buildConnectionConfig keep local-only execution', () => {
  assert.throws(() => parseArgs([]), /--input is required/);
  assert.throws(() => parseArgs(['--input=x.json', '--apply=true']), /Unknown option: --apply/);
  assert.deepEqual(parseArgs(['--input=a.json', '--output=b.json']), { input: 'a.json', output: 'b.json' });
  assert.equal(buildConnectionConfig({ TERRAPEDIA_DB_SOCKET: '/run/mysqld/mysqld.sock' }).database, 'terria_v1_local');
  assert.equal(buildConnectionConfig({ TERRAPEDIA_DB_HOST: 'localhost' }).host, 'localhost');
  assert.throws(() => buildConnectionConfig({ TERRAPEDIA_DB_HOST: '10.0.0.2' }), /Refusing non-local database host/);
  assert.throws(() => buildConnectionConfig({ TERRAPEDIA_DB_SOCKET: '/tmp/mysql.sock' }), /Refusing non-local database socket/);
  assert.throws(() => buildConnectionConfig({ TERRAPEDIA_DB_NAME: 'prod' }), /Refusing non-local database/);
});

test('createMysqlMissingEvidenceLoader only issues schema-qualified SELECT queries', async () => {
  const captured = [];
  const connection = {
    async execute(sql, params) {
      captured.push({ sql, params });
      assert.match(sql.trim(), /^SELECT\b/i);
      assert.match(sql, /`terria_v1_local`\.`(npcs|items)`/);
      if (sql.includes('`npcs`')) return [[{ id: 596, internal_name: 'BlueDragonfly', name: 'Dragonfly', name_zh: '蓝蜻蜓' }]];
      return [[{ id: 870, internal_name: 'MummyMask', name: 'Mummy Mask', name_zh: '木乃伊面具' }]];
    }
  };
  const loader = createMysqlMissingEvidenceLoader({ connection });

  const npcEvidence = await loader(missingRow(1, 'Forest', 'npc', 'Blue Dragonfly', 'Critters'));
  const itemEvidence = await loader(missingRow(2, 'Desert', 'item', 'Mummy set', 'From Mummies'));

  assert.ok(captured.length >= 4);
  assert.equal(npcEvidence.normalizedNpcCandidates[0].internalName, 'BlueDragonfly');
  assert.equal(itemEvidence.componentItemCandidates[0].internalName, 'MummyMask');
  assert.deepEqual(itemEvidence.familyItemCandidates, []);
});

test('validateMissingLocalEvidenceReport rejects malformed or non-gated rows', async () => {
  const report = await auditMissingLocalEvidence({
    localDomainReport: localDomainReportFixture(),
    loadEvidenceForRow: async (row) => fakeEvidence(row)
  });
  report.rows[0].evidenceOnly = false;
  delete report.rows[1].original.rowKey;
  report.rows[2].recommendation = 'made_up';

  const result = validateMissingLocalEvidenceReport(report);

  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /not evidenceOnly/);
  assert.match(result.issues.join('\n'), /missing original.rowKey/);
  assert.match(result.issues.join('\n'), /unsupported recommendation/);
});

test('writeMissingLocalEvidenceReport writes only JSON report using injected loader', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-local-evidence-'));
  const inputPath = path.join(dir, 'local-domain.json');
  const outputPath = path.join(dir, 'missing-evidence.json');
  fs.writeFileSync(inputPath, `${JSON.stringify(localDomainReportFixture())}\n`, 'utf8');

  const result = await writeMissingLocalEvidenceReport({
    inputPath,
    outputPath,
    loadEvidenceForRow: async (row) => fakeEvidence(row),
    generatedAt: '2026-06-02T07:00:00.000Z'
  });
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(result.outputPath, outputPath);
  assert.equal(output.sourceReportPath, inputPath);
  assert.equal(output.summary.total, 4);
  assert.equal(output.rows[3].recommendation, 'item_family_candidate');
});

test('script source has no SQL write, network/process module, crawler/fetch/import/backfill/load script, or apply path', () => {
  const source = fs.readFileSync(new URL('./biome-wikitext-missing-local-evidence-audit.mjs', import.meta.url), 'utf8');
  const forbiddenPatterns = [
    /^\s*(INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|ALTER)\b/im,
    /CREATE\s+TABLE/i,
    /--apply/,
    /node:child_process/,
    /node:https/,
    /node:http/,
    /fetch\(/,
    /scripts\/data\/(crawler|fetch|import|backfill|load)/i
  ];
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern);
  }
});
