import { isRecipeGroupName } from '../lib/recipe-material-reference.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { collectRawRecipes } from '../import/import-wiki-zh-recipes-to-db.mjs';

const ISOLATED_LOCAL = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_local$/;
const FORMAL_LOCAL = 'terria_v1_local';
const ITEM_COLUMNS = ['internal_name', 'name', 'name_zh'];
const STATION_COLUMNS = ['internal_name', 'name_en', 'name_zh'];

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function lookupKey(value) {
  return text(value)?.toLowerCase() ?? '';
}

function uniqueSorted(values) {
  return [...new Set(values.map(text).filter(Boolean))].sort();
}

function isGroupIngredient(name) {
  return Boolean(name) && (name.startsWith('任何') || name.startsWith('任意') || isRecipeGroupName(name));
}

export function collectRecordedRecipeDependencyNames(payload) {
  const recipes = collectRawRecipes(payload);
  const itemNames = uniqueSorted(recipes.flatMap((recipe) => [
    recipe.resultName,
    ...recipe.ingredients
      .map((ingredient) => text(ingredient.name))
      .filter((name) => name && !isGroupIngredient(name)),
  ]));
  const stationNames = uniqueSorted(recipes.flatMap((recipe) => recipe.stations));
  if (recipes.length === 0 || itemNames.length === 0) {
    throw new Error('recorded Recipe dependency seed requires at least one concrete recipe item');
  }
  return Object.freeze({ recipeCount: recipes.length, itemNames, stationNames });
}

function requireIsolatedTarget(database) {
  if (!ISOLATED_LOCAL.test(String(database ?? ''))) {
    throw new Error('recorded Recipe dependency seed requires a run-derived isolated local database');
  }
}

function requireMysqlIdentity(mysql) {
  if (mysql?.host !== '127.0.0.1' || !Number.isInteger(Number(mysql?.port))
    || !text(mysql?.readonlyUsername) || !text(mysql?.readonlyPassword)
    || !text(mysql?.username) || !text(mysql?.password)) {
    throw new Error('recorded Recipe dependency seed requires loopback readonly and provisioner identities');
  }
}

function assertRowColumns(row, table) {
  const columns = Object.keys(row ?? {}).sort();
  if (!columns.length || columns.some((column) => !/^[a-z0-9_]+$/i.test(column))) {
    throw new Error(`recorded Recipe dependency ${table} row has unsafe columns`);
  }
  return columns;
}

function matchingNames(row, columns) {
  return new Set(columns.map((column) => lookupKey(row?.[column])).filter(Boolean));
}

function unresolvedNames(names, rows, columns) {
  const available = new Set(rows.flatMap((row) => [...matchingNames(row, columns)]));
  return names.filter((name) => !available.has(lookupKey(name)));
}

async function readRowsByNames(connection, table, columns, names) {
  if (!names.length) return [];
  const placeholders = names.map(() => '?').join(', ');
  const predicates = columns.map((column) => `\`${column}\` IN (${placeholders})`);
  const [rows] = await connection.query(
    `SELECT * FROM \`${FORMAL_LOCAL}\`.\`${table}\` WHERE \`deleted\` = 0 AND (${predicates.join(' OR ')})`,
    columns.flatMap(() => names),
  );
  return rows;
}

async function readItemsByIds(connection, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT * FROM \`${FORMAL_LOCAL}\`.\`items\` WHERE \`deleted\` = 0 AND \`id\` IN (${placeholders})`,
    ids,
  );
  return rows;
}

function distinctRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = String(row?.id ?? '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function copyRows(target, database, table, rows) {
  for (const row of rows) {
    const columns = assertRowColumns(row, table);
    await target.query(
      `INSERT INTO \`${database}\`.\`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${columns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ')}`,
      columns.map((column) => row[column]),
    );
  }
}

export async function seedRecordedRecipeDependencies({
  payload,
  databases,
  mysql,
  createConnectionImpl = (options) => loadMysqlModule().createConnection(options),
} = {}) {
  requireIsolatedTarget(databases?.local);
  requireMysqlIdentity(mysql);
  const dependencies = collectRecordedRecipeDependencyNames(payload);
  const source = await createConnectionImpl({
    host: mysql.host,
    port: Number(mysql.port),
    user: mysql.readonlyUsername,
    password: mysql.readonlyPassword,
    database: FORMAL_LOCAL,
  });
  const target = await createConnectionImpl({
    host: mysql.host,
    port: Number(mysql.port),
    user: mysql.username,
    password: mysql.password,
    database: databases.local,
  });
  try {
    const [namedItems, stations] = await Promise.all([
      readRowsByNames(source, 'items', ITEM_COLUMNS, [...dependencies.itemNames, ...dependencies.stationNames]),
      readRowsByNames(source, 'crafting_stations', STATION_COLUMNS, dependencies.stationNames),
    ]);
    const stationItemIds = [...new Set(stations.map((row) => Number(row.item_id)).filter((id) => Number.isInteger(id) && id > 0))];
    const linkedItems = await readItemsByIds(source, stationItemIds);
    const items = distinctRows([...namedItems, ...linkedItems]);
    const missingItems = unresolvedNames(dependencies.itemNames, items, ITEM_COLUMNS);
    const missingStations = dependencies.stationNames.filter((name) => (
      !matchingNamesAvailable(name, items, ITEM_COLUMNS) && !matchingNamesAvailable(name, stations, STATION_COLUMNS)
    ));
    const missingStationItems = stationItemIds.filter((id) => !linkedItems.some((row) => Number(row.id) === id));
    if (missingItems.length || missingStations.length || missingStationItems.length) {
      throw new Error(`recorded Recipe dependency closure is incomplete: ${JSON.stringify({ missingItems, missingStations, missingStationItems })}`);
    }
    await copyRows(target, databases.local, 'items', items);
    await copyRows(target, databases.local, 'crafting_stations', stations);
    return Object.freeze({
      recipeCount: dependencies.recipeCount,
      itemDependencies: dependencies.itemNames.length,
      stationDependencies: dependencies.stationNames.length,
      copiedItems: items.length,
      copiedStations: stations.length,
    });
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

function matchingNamesAvailable(name, rows, columns) {
  const key = lookupKey(name);
  return rows.some((row) => matchingNames(row, columns).has(key));
}
