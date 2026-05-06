import test from 'node:test';
import assert from 'node:assert/strict';

import { checkCrawlerSourceLayout } from '../source-layout-check.mjs';

test('checkCrawlerSourceLayout reports legacy crawler source paths as warning-only', () => {
  const result = checkCrawlerSourceLayout({
    existsSync: (targetPath) => {
      const normalized = String(targetPath).replaceAll('\\', '/');
      return normalized.includes('data/wiki-crawler/src') || normalized.includes('data/wiki-crawler/tests');
    },
  });

  assert.equal(result.status, 'warning');
  assert.equal(result.blocking, false);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /data\/wiki-crawler\/src/i);
  assert.match(result.warnings[1], /data\/wiki-crawler\/tests/i);
});
