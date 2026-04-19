import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveNpcLiveSource } from '../src/live/npc-live-source.mjs';

test('resolveNpcLiveSource resolves pageId to pageTitle and then fetches the page payload', async () => {
  const calls = [];
  const source = await resolveNpcLiveSource(
    { pageId: 107 },
    {
      fetchWikiApiJsonImpl: async ({ url }) => {
        calls.push(['metadata', url.searchParams.get('pageids')]);
        return {
          query: {
            pages: [
              {
                pageid: 107,
                title: 'Goblin Tinkerer',
                pageprops: {
                  description: 'A helpful NPC who can reforge items.'
                }
              }
            ]
          }
        };
      },
      fetchWikiPagePayloadImpl: async ({ pageTitle }) => {
        calls.push(['payload', pageTitle]);
        return {
          pageId: 107,
          pageTitle,
          revisionTimestamp: '2026-04-16T00:00:00Z',
          wikitext: "'''Goblin Tinkerer''' is a helpful NPC who can reforge items."
        };
      }
    }
  );

  assert.deepEqual(calls, [
    ['metadata', '107'],
    ['payload', 'Goblin Tinkerer']
  ]);
  assert.equal(source.entityId, 'goblin-tinkerer');
  assert.equal(source.pageTitle, 'Goblin Tinkerer');
  assert.equal(source.pageDescription, 'A helpful NPC who can reforge items.');
  assert.equal(source.revisionText, "'''Goblin Tinkerer''' is a helpful NPC who can reforge items.");
  assert.deepEqual(source.relations, {
    relatedNpcs: [],
    relatedItems: [],
    relatedBiomes: []
  });
});

test('resolveNpcLiveSource fetches pageTitle directly when pageTitle is provided', async () => {
  const calls = [];
  const source = await resolveNpcLiveSource(
    { pageTitle: 'Goblin Tinkerer' },
    {
      fetchWikiApiJsonImpl: async ({ url }) => {
        calls.push(['metadata', url.searchParams.get('titles')]);
        return {
          query: {
            pages: [
              {
                pageid: 107,
                title: 'Goblin Tinkerer',
                pageprops: {
                  description: 'A helpful NPC who can reforge items.'
                }
              }
            ]
          }
        };
      },
      fetchWikiPagePayloadImpl: async ({ pageTitle }) => {
        calls.push(['payload', pageTitle]);
        return {
          pageId: 107,
          pageTitle,
          revisionTimestamp: '2026-04-16T00:00:00Z',
          wikitext: "'''Goblin Tinkerer''' is a helpful NPC who can reforge items."
        };
      }
    }
  );

  assert.deepEqual(calls, [
    ['metadata', 'Goblin Tinkerer'],
    ['payload', 'Goblin Tinkerer']
  ]);
  assert.equal(source.entityId, 'goblin-tinkerer');
});
