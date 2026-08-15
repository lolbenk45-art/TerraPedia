import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveFrontRuntimeConfig } from '../../utils/runtimeConfig.mjs';

test('backend port override feeds the default origin without requiring a duplicated origin literal', () => {
  const resolved = resolveFrontRuntimeConfig({
    cwd: '/tmp/terrapedia-runtime-config',
    env: {
      NODE_ENV: 'development',
      TERRAPEDIA_BACKEND_PORT: '19088'
    }
  });

  assert.equal(resolved.backendOrigin, 'http://localhost:19088');
});
