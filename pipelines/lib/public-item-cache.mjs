import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const PUBLIC_ITEM_CACHE_PATTERNS = Object.freeze([
  'item:public:list::*',
  'item:public:detail::*',
  'item:public:suggestions::*',
]);

export function resolveRedisConfigFromEnv(rawArgs = {}, localConfig = null) {
  return {
    host: firstText(rawArgs['redis-host'], process.env.TERRAPEDIA_REDIS_HOST, localConfig?.redis?.host, '127.0.0.1'),
    port: Number(firstText(rawArgs['redis-port'], process.env.TERRAPEDIA_REDIS_PORT, localConfig?.redis?.port, '6379')),
    password: firstDefinedText(rawArgs['redis-password'], process.env.TERRAPEDIA_REDIS_PASSWORD, localConfig?.redis?.password, ''),
    database: Number(firstText(rawArgs['redis-database'], process.env.TERRAPEDIA_REDIS_DATABASE, localConfig?.redis?.database, '0')),
  };
}

export function skippedPublicItemCacheResult(reason) {
  return {
    attempted: false,
    status: 'skipped',
    deletedKeys: 0,
    keyPatterns: PUBLIC_ITEM_CACHE_PATTERNS,
    reason,
  };
}

export async function clearPublicItemCaches(redisConfig, patterns = PUBLIC_ITEM_CACHE_PATTERNS) {
  let createClient;
  try {
    ({ createClient } = require('redis'));
  } catch (error) {
    return {
      attempted: true,
      status: 'failed',
      deletedKeys: 0,
      keyPatterns: patterns,
      error: `redis module unavailable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const client = createClient({
    socket: {
      host: redisConfig.host,
      port: redisConfig.port,
      connectTimeout: 3000,
    },
    password: toText(redisConfig.password) || undefined,
    database: redisConfig.database,
  });

  try {
    await client.connect();
    const keys = new Set();
    for (const pattern of patterns) {
      for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.add(key);
      }
    }

    if (keys.size === 0) {
      return {
        attempted: true,
        status: 'ok',
        deletedKeys: 0,
        keyPatterns: patterns,
        message: 'No public item cache keys were present.',
      };
    }

    const deletedKeys = await client.del([...keys]);
    return {
      attempted: true,
      status: 'ok',
      deletedKeys,
      keyPatterns: patterns,
    };
  } catch (error) {
    return {
      attempted: true,
      status: 'failed',
      deletedKeys: 0,
      keyPatterns: patterns,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try {
      await client.quit();
    } catch {
      // ignore close errors
    }
  }
}

function firstText(...values) {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return '';
}

function firstDefinedText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return String(value);
  }
  return '';
}

function toText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}
