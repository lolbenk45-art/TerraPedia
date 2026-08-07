#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import {
  hashWikiZhRecipeProjection,
  normalizeWikiZhExistingRecipeProjection,
  RECIPE_SOURCE_PROVIDER,
  sha256FileBytes,
} from './recipe-formal-contract.mjs';

const repoRoot = getProjectRoot();
const FORMAL_DATABASE = 'terria_v1_local';
const FORMAL_DECISION_ID = 'canonical-recipe-apply-20260729-03';
const EXPECTED_INPUT_HASH = '3503bdd42c623d8ec919aa3d4bc3c8e77d217f4cacb85a5bfd9d4c869752aefc';
const EXPECTED_FINAL_PROJECTION_HASH = '582c4152aa4fe770bce41c431420230e82586d8322424edf877387e184ecf20e';
const DEFAULT_EXPECTED = {
  inputPages: 41,
  inputRecipes: 3663,
  importedRecipes: 3571,
  ingredientRows: 5965,
  stationRows: 4337,
};

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const config = loadLocalStackConfig(repoRoot);
  const paths = {
    input: resolveArgPath(args.input, 'data/generated/wiki-zh-recipe-pages.latest.json'),
    pipeline: resolveArgPath(args.pipeline, 'reports/wiki-zh-recipe-sync-summary-2026-07-29.json'),
    standalone: resolveArgPath(args.standalone, 'reports/wiki-zh-recipe-import-2026-07-29.json'),
    output: resolveArgPath(args.output, 'reports/canonical-migration/canonical-recipe-formal-verification.json'),
  };
  const db = {
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? FORMAL_DATABASE,
  };
  if (db.database !== FORMAL_DATABASE) {
    throw new Error(`Recipe formal verification requires database ${FORMAL_DATABASE}; received ${db.database}`);
  }

  const mysql = loadMysqlModule();
  const connection = await mysql.createConnection(db);
  let report;
  try {
    await readonlyExecute(connection, 'SET SESSION TRANSACTION READ ONLY');
    report = await runRecipeFormalVerification({ connection, paths });
  } finally {
    await connection.end();
  }
  publishReport(paths.output, report);
  console.log(JSON.stringify({
    status: report.status,
    mode: report.mode,
    inputRecipes: report.input.recipeCount,
    wikiZhRecipes: report.formalScope.wikiZhRecipes,
    projectionHash: report.formalScope.projectionHash,
    standaloneImport: report.standaloneImport.classification,
    writesAttempted: report.writesAttempted,
  }, null, 2));
  if (report.status !== 'passed') process.exitCode = 1;
}

export async function runRecipeFormalVerification({ connection, paths, generatedAt = new Date().toISOString() }) {
  const [input, pipeline, standalone, formalSnapshot] = await Promise.all([
    readJson(paths.input),
    readJson(paths.pipeline),
    readJson(paths.standalone),
    collectFormalSnapshot(connection),
  ]);
  return buildRecipeFormalVerification({
    paths: mapRelativePaths(paths),
    hashes: {
      input: sha256FileBytes(paths.input),
      pipeline: sha256FileBytes(paths.pipeline),
      standalone: sha256FileBytes(paths.standalone),
    },
    expectedInputHash: EXPECTED_INPUT_HASH,
    expectedFinalProjectionHash: EXPECTED_FINAL_PROJECTION_HASH,
    input,
    pipeline,
    standalone,
    formalSnapshot,
    expected: DEFAULT_EXPECTED,
    generatedAt,
  });
}

export function buildRecipeFormalVerification({
  paths,
  hashes,
  expectedInputHash,
  expectedFinalProjectionHash,
  input,
  pipeline,
  standalone,
  formalSnapshot,
  expected,
  generatedAt,
}) {
  const inputPages = Array.isArray(input?.records) ? input.records.length : 0;
  const inputRecipes = countInputRecipes(input);
  const appliedImport = pipeline?.steps?.import ?? {};
  const consolidation = pipeline?.steps?.providerConsolidation ?? {};
  const displayNameBackfill = pipeline?.steps?.zhDisplayBackfill ?? {};
  const blockingReasons = [];
  const checks = [];
  const check = (name, passed, failure) => {
    checks.push({ name, status: passed ? 'passed' : 'failed' });
    if (!passed) blockingReasons.push(failure);
  };

  check(
    'input-hash-and-counts',
    hashes?.input === expectedInputHash
      && inputPages === expected.inputPages
      && inputRecipes === expected.inputRecipes,
    `input hash/count mismatch: hash=${hashes?.input}, pages=${inputPages}, recipes=${inputRecipes}`,
  );
  check(
    'embedded-applied-import',
    pipeline?.apply === true
      && appliedImport.apply === true
      && appliedImport.database === FORMAL_DATABASE
      && path.basename(String(appliedImport.inputPath ?? '')) === 'wiki-zh-recipe-pages.latest.json'
      && appliedImport.inputPages === expected.inputPages
      && appliedImport.inputRecipes === expected.inputRecipes
      && appliedImport.insertedRecipes === expected.importedRecipes
      && appliedImport.importedRecipeCountInDb === expected.importedRecipes
      && appliedImport.insertedIngredientRows === expected.ingredientRows
      && appliedImport.insertedStationRows === expected.stationRows
      && appliedImport.createdPlaceholderItems === 0
      && appliedImport.createdCraftingStations === 0
      && appliedImport.unresolvedItemRowsAfterImport === 0
      && appliedImport.unresolvedStationRowsAfterImport === 0
      && isSha256(appliedImport.recipeScopeHashTarget),
    'embedded import is not the expected applied formal result',
  );
  check(
    'embedded-applied-display-name-backfill',
    displayNameBackfill.apply === true
      && displayNameBackfill.dbName === FORMAL_DATABASE
      && displayNameBackfill?.groupIngredients?.updated === 124
      && displayNameBackfill?.stations?.updated === 239
      && displayNameBackfill?.after?.groupIngredients?.needsSync === 0
      && displayNameBackfill?.after?.ingredients?.needsSync === 0
      && displayNameBackfill?.after?.stations?.needsSync === 0,
    'embedded display-name backfill is missing or incomplete',
  );
  check(
    'embedded-applied-consolidation',
    consolidation.apply === true
      && consolidation.dryRun === false
      && isNonNegative(consolidation?.after?.recipeRows)
      && isNonNegative(consolidation?.after?.activeRecipeRows)
      && consolidation?.after?.activeResultItems === consolidation?.after?.resultItems,
    'embedded provider consolidation is missing or invalid',
  );
  check(
    'formal-database-identity',
    formalSnapshot?.database === FORMAL_DATABASE,
    `formal database identity mismatch: ${formalSnapshot?.database ?? 'missing'}`,
  );
  check(
    'formal-wiki-zh-counts',
    formalSnapshot?.wikiZhRecipes === expected.importedRecipes
      && formalSnapshot?.wikiZhIngredients === expected.ingredientRows
      && formalSnapshot?.wikiZhStations === expected.stationRows
      && formalSnapshot?.totalRecipes === consolidation?.after?.recipeRows,
    'formal wiki_zh or total recipe counts do not match the applied pipeline',
  );
  check(
    'formal-provider-consolidation-aggregates',
    formalSnapshot?.consolidationRecipeRows === consolidation?.after?.recipeRows
      && formalSnapshot?.activeRecipeRows === consolidation?.after?.activeRecipeRows
      && formalSnapshot?.resultItems === consolidation?.after?.resultItems
      && formalSnapshot?.activeResultItems === consolidation?.after?.activeResultItems,
    'formal provider consolidation aggregates do not match the applied pipeline',
  );
  check(
    'formal-post-backfill-projection-hash',
    isSha256(formalSnapshot?.projectionHash)
      && formalSnapshot.projectionHash === expectedFinalProjectionHash,
    'formal projection hash does not match the expected post-backfill scope',
  );
  check(
    'formal-unresolved-relations',
    formalSnapshot?.unresolvedItems === 0 && formalSnapshot?.unresolvedStations === 0,
    `formal unresolved relations remain: items=${formalSnapshot?.unresolvedItems}, stations=${formalSnapshot?.unresolvedStations}`,
  );

  const standaloneReasons = compareStandalone(standalone, appliedImport);
  return {
    schemaVersion: 1,
    generatedAt,
    status: blockingReasons.length === 0 ? 'passed' : 'failed',
    mode: 'read-only',
    decisionId: FORMAL_DECISION_ID,
    writesAttempted: false,
    expectedFinalProjectionHash,
    artifacts: {
      input: { path: paths.input, sha256: hashes.input },
      appliedPipeline: { path: paths.pipeline, sha256: hashes.pipeline },
      standaloneImport: { path: paths.standalone, sha256: hashes.standalone },
    },
    input: { pageCount: inputPages, recipeCount: inputRecipes, expectedSha256: expectedInputHash },
    appliedPipeline: {
      apply: pipeline?.apply === true,
      import: pickImportEvidence(appliedImport),
      displayNameBackfill: {
        apply: displayNameBackfill?.apply === true,
        database: displayNameBackfill?.dbName ?? null,
        groupIngredientsUpdated: displayNameBackfill?.groupIngredients?.updated ?? null,
        stationsUpdated: displayNameBackfill?.stations?.updated ?? null,
        after: displayNameBackfill?.after ?? null,
      },
      consolidation: {
        apply: consolidation?.apply === true,
        dryRun: consolidation?.dryRun === true,
        after: consolidation?.after ?? null,
      },
    },
    formalScope: {
      database: formalSnapshot?.database ?? null,
      totalRecipes: formalSnapshot?.totalRecipes ?? null,
      totalIngredients: formalSnapshot?.totalIngredients ?? null,
      totalStations: formalSnapshot?.totalStations ?? null,
      consolidationRecipeRows: formalSnapshot?.consolidationRecipeRows ?? null,
      activeRecipeRows: formalSnapshot?.activeRecipeRows ?? null,
      resultItems: formalSnapshot?.resultItems ?? null,
      activeResultItems: formalSnapshot?.activeResultItems ?? null,
      wikiZhRecipes: formalSnapshot?.wikiZhRecipes ?? null,
      wikiZhIngredients: formalSnapshot?.wikiZhIngredients ?? null,
      wikiZhStations: formalSnapshot?.wikiZhStations ?? null,
      unresolvedItems: formalSnapshot?.unresolvedItems ?? null,
      unresolvedStations: formalSnapshot?.unresolvedStations ?? null,
      projectionHash: formalSnapshot?.projectionHash ?? null,
    },
    standaloneImport: {
      classification: standaloneReasons.length === 0 ? 'matches-applied' : 'superseded-invalid',
      reasons: standaloneReasons,
    },
    checks,
    blockingReasons,
  };
}

export function assertReadOnlySql(sql) {
  const normalized = String(sql ?? '').trim().replace(/\s+/g, ' ');
  if (/^(SELECT|SHOW|EXPLAIN)\b/i.test(normalized)) return;
  if (/^SET SESSION TRANSACTION READ ONLY$/i.test(normalized)) return;
  throw new Error(`Read-only verifier rejected SQL: ${normalized.slice(0, 80)}`);
}

async function readonlyExecute(connection, sql, params = []) {
  assertReadOnlySql(sql);
  return connection.execute(sql, params);
}

async function collectFormalSnapshot(connection) {
  const [[databaseRow]] = await readonlyExecute(connection, 'SELECT DATABASE() AS databaseName');
  const [[totals]] = await readonlyExecute(connection, `SELECT
    (SELECT COUNT(*) FROM recipes) AS totalRecipes,
    (SELECT COUNT(*) FROM recipe_ingredients) AS totalIngredients,
    (SELECT COUNT(*) FROM recipe_stations) AS totalStations,
    (SELECT COUNT(*) FROM recipes WHERE deleted = 0) AS consolidationRecipeRows,
    (SELECT COUNT(*) FROM recipes WHERE deleted = 0 AND status = 1) AS activeRecipeRows,
    (SELECT COUNT(DISTINCT result_item_id) FROM recipes WHERE deleted = 0) AS resultItems,
    (SELECT COUNT(DISTINCT result_item_id) FROM recipes WHERE deleted = 0 AND status = 1) AS activeResultItems,
    (SELECT COUNT(*) FROM recipes WHERE COALESCE(source_provider, '') = ?) AS wikiZhRecipes`, [RECIPE_SOURCE_PROVIDER]);
  const [recipeRows] = await readonlyExecute(connection, `SELECT
    id, result_item_id, result_internal_name, result_quantity, version_scope,
    notes, source_provider, source_page, source_revision_timestamp, sort_order,
    status, deleted
    FROM recipes
    WHERE COALESCE(source_provider, '') = ?
    ORDER BY sort_order ASC, id ASC`, [RECIPE_SOURCE_PROVIDER]);
  const [ingredientRows] = await readonlyExecute(connection, `SELECT
    ri.recipe_id, ri.ingredient_item_id, ri.ingredient_internal_name,
    ri.ingredient_name_raw, ri.ingredient_group_type, ri.quantity_min,
    ri.quantity_max, ri.quantity_text, ri.sort_order
    FROM recipe_ingredients ri
    JOIN recipes r ON r.id = ri.recipe_id
    WHERE COALESCE(r.source_provider, '') = ?
    ORDER BY ri.recipe_id ASC, ri.sort_order ASC, ri.id ASC`, [RECIPE_SOURCE_PROVIDER]);
  const [stationRows] = await readonlyExecute(connection, `SELECT
    rs.recipe_id, rs.station_id, rs.station_item_id, rs.station_internal_name,
    rs.station_name_raw, rs.is_alternative, rs.sort_order
    FROM recipe_stations rs
    JOIN recipes r ON r.id = rs.recipe_id
    WHERE COALESCE(r.source_provider, '') = ?
    ORDER BY rs.recipe_id ASC, rs.sort_order ASC, rs.id ASC`, [RECIPE_SOURCE_PROVIDER]);
  const [[unresolved]] = await readonlyExecute(connection, `SELECT
    SUM(CASE WHEN COALESCE(ri.ingredient_group_type, 'item') = 'item' AND ri.ingredient_item_id IS NULL THEN 1 ELSE 0 END) AS unresolvedItems,
    (SELECT COUNT(*) FROM recipe_stations rs2 JOIN recipes r2 ON r2.id = rs2.recipe_id WHERE COALESCE(r2.source_provider, '') = ? AND rs2.station_id IS NULL) AS unresolvedStations
    FROM recipes r
    LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    WHERE COALESCE(r.source_provider, '') = ?`, [RECIPE_SOURCE_PROVIDER, RECIPE_SOURCE_PROVIDER]);
  const projection = normalizeWikiZhExistingRecipeProjection(recipeRows, ingredientRows, stationRows);
  return {
    database: databaseRow?.databaseName ?? null,
    totalRecipes: Number(totals?.totalRecipes ?? 0),
    totalIngredients: Number(totals?.totalIngredients ?? 0),
    totalStations: Number(totals?.totalStations ?? 0),
    consolidationRecipeRows: Number(totals?.consolidationRecipeRows ?? 0),
    activeRecipeRows: Number(totals?.activeRecipeRows ?? 0),
    resultItems: Number(totals?.resultItems ?? 0),
    activeResultItems: Number(totals?.activeResultItems ?? 0),
    wikiZhRecipes: Number(totals?.wikiZhRecipes ?? 0),
    wikiZhIngredients: ingredientRows.length,
    wikiZhStations: stationRows.length,
    unresolvedItems: Number(unresolved?.unresolvedItems ?? 0),
    unresolvedStations: Number(unresolved?.unresolvedStations ?? 0),
    projection,
    projectionHash: hashWikiZhRecipeProjection(projection),
  };
}

function compareStandalone(standalone, appliedImport) {
  const reasons = [];
  if (standalone?.apply !== true) reasons.push('apply is not true');
  for (const key of ['inputPages', 'inputRecipes', 'insertedRecipes', 'insertedIngredientRows', 'insertedStationRows']) {
    if (standalone?.[key] !== appliedImport?.[key]) reasons.push(`${key} does not match applied result`);
  }
  if (path.basename(String(standalone?.inputPath ?? '')) !== 'wiki-zh-recipe-pages.latest.json') {
    reasons.push('inputPath is not the canonical Recipe input');
  }
  return reasons;
}

function pickImportEvidence(value) {
  return Object.fromEntries([
    'apply', 'database', 'inputPages', 'inputRecipes', 'insertedRecipes',
    'insertedIngredientRows', 'insertedStationRows', 'createdPlaceholderItems',
    'createdCraftingStations', 'unresolvedItemRowsAfterImport',
    'unresolvedStationRowsAfterImport', 'importedRecipeCountInDb',
    'recipeScopeHashTarget',
  ].map((key) => [key, value?.[key] ?? null]));
}

function countInputRecipes(payload) {
  return (Array.isArray(payload?.records) ? payload.records : []).reduce(
    (pageSum, page) => pageSum + (Array.isArray(page?.recipeTables) ? page.recipeTables : []).reduce(
      (tableSum, table) => tableSum + (Array.isArray(table?.rows) ? table.rows.length : 0),
      0,
    ),
    0,
  );
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value ?? ''));
}

function isNonNegative(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

async function readJson(filePath) {
  return JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
}

function resolveArgPath(value, fallback) {
  return path.resolve(repoRoot, value ?? fallback);
}

function mapRelativePaths(paths) {
  return Object.fromEntries(['input', 'pipeline', 'standalone'].map((key) => [
    key,
    path.relative(repoRoot, paths[key]).replaceAll(path.sep, '/'),
  ]));
}

function publishReport(outputPath, report) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, outputPath);
}

function isDirectExecution() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
