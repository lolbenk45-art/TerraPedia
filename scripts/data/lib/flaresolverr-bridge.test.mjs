import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveFlareSolverrUrl, runFlareSolverrRequest } from './flaresolverr-bridge.mjs';

test('resolveFlareSolverrUrl requires explicit configuration', () => {
  assert.equal(resolveFlareSolverrUrl(''), null);
  assert.equal(resolveFlareSolverrUrl('  http://127.0.0.1:8191/v1  '), 'http://127.0.0.1:8191/v1');
});

test('runFlareSolverrRequest maps POST requests to request.post payloads', async () => {
  const calls = [];
  const result = await runFlareSolverrRequest({
    flaresolverrUrl: 'http://127.0.0.1:8191/v1',
    url: 'https://terraria.wiki.gg/api.php?action=parse',
    method: 'POST',
    headers: {
      'user-agent': 'TerraPedia/2.0 (+https://terraria.wiki.gg/api.php)',
      host: 'terraria.wiki.gg'
    },
    body: 'action=parse&page=Torch',
    timeoutMs: 20_000,
    fetchFn: async (input, init) => {
      calls.push({ input: String(input), init });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          status: 'ok',
          solution: {
            status: 200,
            response: '{"ok":true}'
          }
        })
      };
    }
  });

  assert.deepEqual(result, {
    status: 200,
    statusText: '',
    body: '{"ok":true}'
  });
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0].init.body);
  assert.equal(payload.cmd, 'request.post');
  assert.equal(payload.postData, 'action=parse&page=Torch');
  assert.equal(payload.headers['user-agent'], 'TerraPedia/2.0 (+https://terraria.wiki.gg/api.php)');
  assert.equal('host' in payload.headers, false);
});

test('runFlareSolverrRequest marks service failures as retryable cloudflare failures', async () => {
  await assert.rejects(
    () => runFlareSolverrRequest({
      url: 'https://terraria.wiki.gg/api.php?action=parse',
      flaresolverrUrl: 'http://127.0.0.1:8191/v1',
      fetchFn: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:8191');
      }
    }),
    (error) => {
      assert.match(error.message, /ECONNREFUSED/);
      assert.equal(error.retryable, true);
      assert.equal(error.cloudflare, true);
      return true;
    }
  );
});
