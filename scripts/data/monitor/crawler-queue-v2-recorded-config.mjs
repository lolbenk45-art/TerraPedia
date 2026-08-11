export function resolveRecordedRecipeConfig(env = process.env) {
  if (String(env.TERRAPEDIA_RECORDED_RECIPE ?? '').trim() !== 'true') return null;
  const required = ['TERRAPEDIA_RECORDED_RECIPE_REPO_ROOT', 'TERRAPEDIA_RECORDED_RECIPE_MARKER_ROOT', 'TERRAPEDIA_RECORDED_RECIPE_DB', 'TERRAPEDIA_RECORDED_RECIPE_MYSQL_HOST', 'TERRAPEDIA_RECORDED_RECIPE_MYSQL_PORT', 'TERRAPEDIA_RECORDED_RECIPE_MYSQL_USER', 'TERRAPEDIA_RECORDED_RECIPE_MYSQL_PASSWORD'];
  for (const key of required) {
    if (!String(env[key] ?? '').trim()) throw new Error(`recorded Recipe mode requires ${key}`);
  }
  const port = Number(env.TERRAPEDIA_RECORDED_RECIPE_MYSQL_PORT);
  const limit = Number(env.TERRAPEDIA_RECORDED_RECIPE_LIMIT ?? 2);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('recorded Recipe MySQL port is invalid');
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new Error('recorded Recipe limit must be 1..5');
  return Object.freeze({
    repoRoot: env.TERRAPEDIA_RECORDED_RECIPE_REPO_ROOT,
    markerRoot: env.TERRAPEDIA_RECORDED_RECIPE_MARKER_ROOT,
    database: env.TERRAPEDIA_RECORDED_RECIPE_DB,
    mysql: { host: env.TERRAPEDIA_RECORDED_RECIPE_MYSQL_HOST, port, username: env.TERRAPEDIA_RECORDED_RECIPE_MYSQL_USER, password: env.TERRAPEDIA_RECORDED_RECIPE_MYSQL_PASSWORD },
    limit,
  });
}

export function resolveRecordedItemConfig(env = process.env) {
  if (String(env.TERRAPEDIA_RECORDED_ITEM ?? '').trim() !== 'true') return null;
  const required = ['TERRAPEDIA_RECORDED_ITEM_REPO_ROOT', 'TERRAPEDIA_RECORDED_ITEM_MARKER_ROOT', 'TERRAPEDIA_RECORDED_ITEM_LOCAL_DB', 'TERRAPEDIA_RECORDED_ITEM_MAINT_DB', 'TERRAPEDIA_RECORDED_ITEM_RELATION_DB', 'TERRAPEDIA_RECORDED_ITEM_MYSQL_HOST', 'TERRAPEDIA_RECORDED_ITEM_MYSQL_PORT', 'TERRAPEDIA_RECORDED_ITEM_MYSQL_USER', 'TERRAPEDIA_RECORDED_ITEM_MYSQL_PASSWORD', 'TERRAPEDIA_RECORDED_ITEM_READONLY_USER', 'TERRAPEDIA_RECORDED_ITEM_READONLY_PASSWORD'];
  for (const key of required) {
    if (!String(env[key] ?? '').trim()) throw new Error(`recorded Item mode requires ${key}`);
  }
  const port = Number(env.TERRAPEDIA_RECORDED_ITEM_MYSQL_PORT);
  const limit = Number(env.TERRAPEDIA_RECORDED_ITEM_LIMIT ?? 100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('recorded Item MySQL port is invalid');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('recorded Item limit must be 1..100');
  return Object.freeze({
    repoRoot: env.TERRAPEDIA_RECORDED_ITEM_REPO_ROOT,
    markerRoot: env.TERRAPEDIA_RECORDED_ITEM_MARKER_ROOT,
    databases: { local: env.TERRAPEDIA_RECORDED_ITEM_LOCAL_DB, maint: env.TERRAPEDIA_RECORDED_ITEM_MAINT_DB, relation: env.TERRAPEDIA_RECORDED_ITEM_RELATION_DB },
    mysql: { host: env.TERRAPEDIA_RECORDED_ITEM_MYSQL_HOST, port, username: env.TERRAPEDIA_RECORDED_ITEM_MYSQL_USER, password: env.TERRAPEDIA_RECORDED_ITEM_MYSQL_PASSWORD, readonlyUsername: env.TERRAPEDIA_RECORDED_ITEM_READONLY_USER, readonlyPassword: env.TERRAPEDIA_RECORDED_ITEM_READONLY_PASSWORD },
    limit,
  });
}
