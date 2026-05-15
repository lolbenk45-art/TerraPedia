import test from 'node:test';
import assert from 'node:assert/strict';

import { runRefreshBuffPageEvidenceBatch } from './refresh-buff-page-evidence-batch.mjs';

test('runRefreshBuffPageEvidenceBatch dry-run fetches serially, writes report and progress, and does not write output', async () => {
  const writes = new Map();
  const calls = [];
  const summary = await runRefreshBuffPageEvidenceBatch(
    {
      input: '/tmp/buffs.standardized.json',
      items: '/tmp/items.standardized.json',
      output: '/tmp/buffs.out.json',
      'dry-run': true,
      limit: '2',
      'cache-dir': '/tmp/buff-cache',
      'progress-path': '/tmp/progress.json',
      'report-path': '/tmp/report.json',
      'sample-limit': '1',
      'request-delay-ms': '0'
    },
    {
      readJson: (filePath) => {
        if (filePath.endsWith('items.standardized.json')) {
          return { records: [] };
        }
        return {
          records: [
            {
              id: 20,
              internalName: 'Poisoned',
              englishName: 'Poisoned',
              localized: { en: { page: 'Poisoned' } }
            },
            {
              id: 39,
              internalName: 'CursedInferno',
              englishName: 'Cursed Inferno',
              localized: { en: { page: 'Cursed Inferno' } },
              sourceEvidence: { parseStatus: 'parsed' }
            }
          ]
        };
      },
      fileExists: () => false,
      fetchPagePayload: async ({ pageTitle }) => {
        calls.push(pageTitle);
        return {
          pageTitle,
          revisionTimestamp: '2026-05-15T00:00:00Z',
          sections: [{ line: 'Immune NPCs', anchor: 'Immune_NPCs' }],
          html: `
            <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
            <ul><li><a href="/wiki/Blue_Slime" title="Blue Slime">Blue Slime</a></li></ul>
          `,
          wikitext: ''
        };
      },
      writeJson: (filePath, payload) => writes.set(filePath, payload)
    }
  );

  assert.deepEqual(calls, ['Poisoned', 'Cursed Inferno']);
  assert.equal(summary.totalSelected, 2);
  assert.equal(summary.categories.fetched, 2);
  assert.equal(summary.categories.patched, 2);
  assert.equal(writes.has('/tmp/buffs.out.json'), false);
  assert.equal(writes.get('/tmp/report.json').entries.length, 2);
  assert.equal(writes.get('/tmp/progress.json').status, 'completed');
});

test('runRefreshBuffPageEvidenceBatch supports cache hits, filters, and skipped_existing', async () => {
  const writes = new Map();
  const summary = await runRefreshBuffPageEvidenceBatch(
    {
      input: '/tmp/buffs.standardized.json',
      items: '/tmp/items.standardized.json',
      output: '/tmp/buffs.out.json',
      'cache-dir': '/tmp/buff-cache',
      'only-missing': true,
      ids: '20,39',
      'internal-names': 'Poisoned,CursedInferno',
      'progress-path': '/tmp/progress.json',
      'report-path': '/tmp/report.json',
      'request-delay-ms': '0'
    },
    {
      readJson: (filePath) => {
        if (filePath === '/tmp/buff-cache/20-poisoned.json') {
          return {
            pageTitle: 'Poisoned',
            sections: [{ line: 'Immune NPCs', anchor: 'Immune_NPCs' }],
            html: `
              <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
              <ul><li><a href="/wiki/Blue_Slime" title="Blue Slime">Blue Slime</a></li></ul>
            `,
            wikitext: ''
          };
        }
        if (filePath.endsWith('items.standardized.json')) {
          return { records: [] };
        }
        return {
          records: [
            {
              id: 20,
              internalName: 'Poisoned',
              englishName: 'Poisoned',
              localized: { en: { page: 'Poisoned' } }
            },
            {
              id: 39,
              internalName: 'CursedInferno',
              englishName: 'Cursed Inferno',
              localized: { en: { page: 'Cursed Inferno' } },
              sourceEvidence: { parseStatus: 'parsed' },
              sourceItems: [{ internalName: 'CursedArrow' }]
            }
          ]
        };
      },
      fileExists: (filePath) => filePath === '/tmp/buff-cache/20-poisoned.json',
      fetchPagePayload: async () => {
        throw new Error('should not fetch cached or skipped records');
      },
      writeJson: (filePath, payload) => writes.set(filePath, payload)
    }
  );

  assert.equal(summary.categories.cache_hit, 1);
  assert.equal(summary.categories.skipped_existing, 1);
  assert.equal(summary.categories.patched, 1);
  assert.equal(writes.get('/tmp/buffs.out.json').records[0].immuneNpcCount, 1);
});

test('runRefreshBuffPageEvidenceBatch resumes after last completed buff and uses canonical revision cache keys', async () => {
  const writes = new Map();
  const readFiles = [];
  const fetchCalls = [];
  const summary = await runRefreshBuffPageEvidenceBatch(
    {
      input: '/tmp/buffs.standardized.json',
      items: '/tmp/items.standardized.json',
      output: '/tmp/buffs.out.json',
      'cache-dir': '/tmp/buff-cache',
      'progress-path': '/tmp/progress.json',
      'report-path': '/tmp/report.json',
      'request-delay-ms': '0',
      resume: true
    },
    {
      readJson: (filePath) => {
        readFiles.push(filePath);
        if (filePath === '/tmp/progress.json') {
          return { status: 'running', lastBuffId: 20 };
        }
        if (filePath === '/tmp/buff-cache/cursed-inferno__123.json') {
          return {
            pageTitle: 'Cursed Inferno',
            canonicalPageTitle: 'Cursed Inferno',
            revisionId: 123,
            sections: [{ line: 'Immune NPCs', anchor: 'Immune_NPCs' }],
            html: `
              <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
              <ul><li><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian">Dungeon Guardian</a></li></ul>
            `,
            wikitext: ''
          };
        }
        if (filePath.endsWith('items.standardized.json')) {
          return { records: [] };
        }
        return {
          records: [
            { id: 20, internalName: 'Poisoned', englishName: 'Poisoned', localized: { en: { page: 'Poisoned' } } },
            {
              id: 39,
              internalName: 'CursedInferno',
              englishName: 'Cursed Inferno',
              localized: { en: { page: 'Cursed Inferno' } },
              sourceEvidence: {
                canonicalPageTitle: 'Cursed Inferno',
                revisionId: 123
              }
            }
          ]
        };
      },
      fileExists: (filePath) => filePath === '/tmp/progress.json' || filePath === '/tmp/buff-cache/cursed-inferno__123.json',
      fetchPagePayload: async ({ pageTitle }) => {
        fetchCalls.push(pageTitle);
        throw new Error('should not fetch resumed or revision-cached records');
      },
      writeJson: (filePath, payload) => writes.set(filePath, payload)
    }
  );

  assert.deepEqual(fetchCalls, []);
  assert.equal(summary.totalSelected, 1);
  assert.equal(summary.resumeFromIndex, 1);
  assert.equal(summary.categories.cache_hit, 1);
  assert.ok(readFiles.includes('/tmp/buff-cache/cursed-inferno__123.json'));
  assert.equal(writes.get('/tmp/report.json').entries[0].buffId, 39);
});

test('runRefreshBuffPageEvidenceBatch only-missing still refreshes legacy facts without page evidence', async () => {
  const calls = [];
  await runRefreshBuffPageEvidenceBatch(
    {
      input: '/tmp/buffs.standardized.json',
      items: '/tmp/items.standardized.json',
      output: '/tmp/buffs.out.json',
      'only-missing': true,
      'progress-path': '/tmp/progress.json',
      'report-path': '/tmp/report.json',
      'request-delay-ms': '0'
    },
    {
      readJson: (filePath) => {
        if (filePath.endsWith('items.standardized.json')) {
          return { records: [] };
        }
        return {
          records: [
            {
              id: 323,
              internalName: 'OnFire3',
              englishName: 'Hellfire',
              localized: { en: { page: 'Hellfire' } },
              sourceItems: [{ internalName: 'LegacyFlameSource' }]
            }
          ]
        };
      },
      fileExists: () => false,
      fetchPagePayload: async ({ pageTitle }) => {
        calls.push(pageTitle);
        return {
          pageTitle,
          sections: [{ line: 'Immune NPCs', anchor: 'Immune_NPCs' }],
          html: `
            <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
            <ul><li><a href="/wiki/Meteor_Head" title="Meteor Head">Meteor Head</a></li></ul>
          `,
          wikitext: ''
        };
      },
      writeJson: () => {}
    }
  );

  assert.deepEqual(calls, ['Hellfire']);
});

test('runRefreshBuffPageEvidenceBatch reports unresolved facts for incomplete parser output', async () => {
  const writes = new Map();
  const summary = await runRefreshBuffPageEvidenceBatch(
    {
      input: '/tmp/buffs.standardized.json',
      items: '/tmp/items.standardized.json',
      output: '/tmp/buffs.out.json',
      'progress-path': '/tmp/progress.json',
      'report-path': '/tmp/report.json',
      'request-delay-ms': '0'
    },
    {
      readJson: (filePath) => {
        if (filePath.endsWith('items.standardized.json')) {
          return { records: [] };
        }
        return {
          records: [
            {
              id: 20,
              internalName: 'Poisoned',
              englishName: 'Poisoned',
              localized: { en: { page: 'Poisoned' } }
            }
          ]
        };
      },
      fileExists: () => false,
      fetchPagePayload: async () => ({
        pageTitle: 'Poisoned',
        sections: [
          { line: 'From player', anchor: 'From_player' },
          { line: 'Immune NPCs', anchor: 'Immune_NPCs' }
        ],
        html: `
          <h2><span class="mw-headline" id="From_player">From player</span></h2>
          <p>No parseable rows.</p>
          <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
          <ul><li><a href="/wiki/Blue_Slime" title="Blue Slime">Blue Slime</a></li></ul>
        `,
        wikitext: ''
      }),
      writeJson: (filePath, payload) => writes.set(filePath, payload)
    }
  );

  assert.equal(summary.categories.parse_incomplete, 1);
  assert.equal(summary.categories.patched, 1);
  assert.deepEqual(writes.get('/tmp/report.json').entries[0].unresolvedFacts, [
    { group: 'sourceItems', status: 'no_rows', sections: ['From player'] }
  ]);
});
