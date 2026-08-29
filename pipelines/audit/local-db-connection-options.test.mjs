import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLocalDbConnectionOptions } from './local-db-connection-options.mjs';

test('buildLocalDbConnectionOptions gives explicit local environment values precedence over stack config', () => {
  const options = buildLocalDbConnectionOptions({
    config: {
      database: {
        host: '127.0.0.1',
        port: 3306,
        username: 'config-user',
        password: 'config-password'
      }
    },
    env: {
      TERRAPEDIA_DB_HOST: '127.0.0.1',
      TERRAPEDIA_DB_PORT: '13306',
      TERRAPEDIA_DB_USERNAME: 'root',
      TERRAPEDIA_DB_PASSWORD: 'root'
    }
  });

  assert.deepEqual(options, {
    host: '127.0.0.1',
    port: 13306,
    user: 'root',
    password: 'root'
  });
});

test('buildLocalDbConnectionOptions defaults to the documented local MySQL port', () => {
  assert.equal(buildLocalDbConnectionOptions({ config: {}, env: {} }).port, 13306);
});
