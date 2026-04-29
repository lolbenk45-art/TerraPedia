#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  clearWikiRequestGateCooldown,
  fetchWikiPageMetadataBatch,
  numericOption,
  parseCliArgs,
  sharedDataPath
} from '../lib/wiki-item-utils.mjs';
import {
  buildManifestRecordKey,
  buildManifestRecordMap,
  createContentHash,
  DEFAULT_WIKI_MONITOR_STATE_PATH,
  DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
  DEFAULT_WIKI_SYNC_PLAN_PATH,
  loadWikiMonitorState,
  loadWikiSourceManifest,
  loadWikiSyncPlan,
  saveWikiMonitorState,
  saveWikiSourceManifest,
  saveWikiSyncPlan,
  upsertManifestRecord
} from '../lib/wiki-sync-manifest.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile
} from './backend-refresh-runtime-state.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const generatedRoot = path.resolve(repoRoot, 'data', 'generated');
const DEFAULT_WIKI_SYNC_PROGRESS_PATH = path.join(generatedRoot, 'wiki-sync-progress.latest.json');
const sharedRawWikiRoot = sharedDataPath('raw', 'wiki');
const seedScriptPath = path.join(repoRoot, 'scripts', 'data', 'workflow', 'seed-wiki-source-manifest.mjs');
const zhEnrichScriptPath = path.join(repoRoot, 'scripts', 'data', 'workflow', 'run-zh-enrich.mjs');
const imageSyncScriptPath = path.join(repoRoot, 'scripts', 'data', 'workflow', 'run-image-sync.mjs');

const CATEGORY_TEMPLATE_TITLES = [
  'Template:Master Template Tiles',
  'Template:Master Template Weapons',
  'Template:Master Template Tools',
  'Template:Master Template Consumables',
  'Template:Master Template Furniture',
  'Template:Master Template Equipables'
];

const ENTITY_CONFIG = {
  items: {
    entityFamily: 'items',
    sourceKind: 'module',
    sourceKeys: ['wiki.module.iteminfo'],
    titles: ['Module:Iteminfo/data'],
    scriptPath: path.join(repoRoot, 'scripts', 'data', 'fetch', 'fetch-wiki-iteminfo.mjs'),
    scriptArgs: () => [],
    latestJsonPath: path.join(sharedRawWikiRoot, 'module__iteminfo__data.latest.json'),
    estimatedRequests: 1
  },
  npcs: {
    entityFamily: 'npcs',
    sourceKind: 'module',
    sourceKeys: ['wiki.module.npcinfo'],
    titles: ['Module:Npcinfo/data'],
    scriptPath: path.join(repoRoot, 'scripts', 'data', 'fetch', 'fetch-wiki-npcinfo.mjs'),
    scriptArgs: () => [],
    latestJsonPath: path.join(sharedRawWikiRoot, 'module__npcinfo__data.latest.json'),
    estimatedRequests: 1
  },
  projectiles: {
    entityFamily: 'projectiles',
    sourceKind: 'module',
    sourceKeys: ['wiki.module.projectileinfo'],
    titles: ['Module:Projectileinfo/data'],
    scriptPath: path.join(repoRoot, 'scripts', 'data', 'fetch', 'fetch-wiki-projectileinfo.mjs'),
    scriptArgs: () => [],
    latestJsonPath: path.join(sharedRawWikiRoot, 'module__projectileinfo__data.latest.json'),
    estimatedRequests: 1
  },
  armor_sets: {
    entityFamily: 'armor_sets',
    sourceKind: 'module',
    sourceKeys: ['wiki.module.armorsetbonuses'],
    titles: ['Module:ArmorSetBonuses'],
    scriptPath: path.join(repoRoot, 'scripts', 'data', 'fetch', 'fetch-wiki-armorsetbonuses.mjs'),
    scriptArgs: () => [],
    latestJsonPath: path.join(sharedRawWikiRoot, 'module__armorsetbonuses.latest.json'),
    estimatedRequests: 1
  },
  buffs: {
    entityFamily: 'buffs',
    sourceKind: 'template',
    sourceKeys: ['wiki.page.template_getbuffinfo'],
    titles: ['Template:GetBuffInfo'],
    scriptPath: path.join(repoRoot, 'scripts', 'data', 'fetch', 'fetch-wiki-buffs.mjs'),
    scriptArgs: (options) => [`--langs=${String(options.langs ?? 'en').trim() || 'en'}`],
    latestJsonPath: path.join(sharedRawWikiRoot, 'template__getbuffinfo.latest.json'),
    estimatedRequests: 18
  },
  bosses: {
    entityFamily: 'bosses',
    sourceKind: 'page_family_anchor',
    sourceKeys: ['wiki.page.bosses_anchor'],
    titles: ['Bosses'],
    scriptPath: path.join(repoRoot, 'scripts', 'data', 'fetch', 'fetch-wiki-bosses.mjs'),
    scriptArgs: () => [],
    latestJsonPath: path.join(generatedRoot, 'wiki-bosses.latest.json'),
    estimatedRequests: 80
  },
  biomes: {
    entityFamily: 'biomes',
    sourceKind: 'page_family_anchor',
    sourceKeys: ['wiki.page.biomes_anchor'],
    titles: ['Biomes'],
    scriptPath: path.join(repoRoot, 'scripts', 'data', 'fetch', 'fetch-wiki-biomes.mjs'),
    scriptArgs: () => [],
    latestJsonPath: path.join(generatedRoot, 'wiki-biomes.latest.json'),
    estimatedRequests: 70
  },
  categories: {
    entityFamily: 'categories',
    sourceKind: 'page_family_anchor',
    sourceKeys: CATEGORY_TEMPLATE_TITLES.map((title) => `wiki.page.${slugify(title)}`),
    titles: CATEGORY_TEMPLATE_TITLES,
    scriptPath: path.join(repoRoot, 'scripts', 'data', 'fetch', 'fetch-wiki-item-categories.mjs'),
    scriptArgs: () => [],
    latestJsonPath: path.join(generatedRoot, 'wiki-item-categories.latest.json'),
    estimatedRequests: 20
  },
  item_pages: {
    entityFamily: 'item_pages',
    sourceKind: 'page',
    sourceKeys: ['wiki.page.item_detail'],
    titles: [],
    scriptPath: path.join(repoRoot, 'scripts', 'data', 'fetch', 'fetch-wiki-item-pages.mjs'),
    scriptArgs: (options) => {
      const args = [];
      const limit = Math.max(1, Math.min(100, numericOption(options['page-limit'] ?? options.limit, 100)));
      args.push(`--limit=${limit}`);
      args.push('--concurrency=1');
      args.push('--delay-ms=5000');
      args.push('--jitter-ms=2000');
      args.push(`--only-changed=${booleanOption(options['only-changed'] ?? options.onlyChanged, true)}`);
      args.push(`--with-recipes=${booleanOption(options['with-recipes'] ?? options.withRecipes, false)}`);
      if (booleanOption(options['allow-full-corpus'] ?? options.allowFullCorpus, false)) {
        args.push('--allow-full-corpus=true');
      }
      if (typeof options.items === 'string' && options.items.trim() !== '') {
        args.push(`--items=${options.items.trim()}`);
      }
      return args;
    },
    latestJsonPath: null,
    estimatedRequests: Math.max(1, Math.min(100, numericOption(parseCliArgs(process.argv.slice(2))['page-limit'], 100))) * 2
  },
  zh: {
    entityFamily: 'zh',
    sourceKind: 'workflow_enrich',
    sourceKeys: ['workflow.zh'],
    titles: [],
    scriptPath: zhEnrichScriptPath,
    scriptArgs: (rawOptions) => {
      const scopes = normalizeWorkflowScopes(rawOptions.scopes ?? rawOptions.scope ?? 'projectiles,buffs', ['items', 'npcs', 'projectiles', 'buffs']);
      return [`--apply=true`, `--scopes=${scopes.join(',')}`];
    },
    latestJsonPath: null,
    estimatedRequests: 0
  },
  images: {
    entityFamily: 'images',
    sourceKind: 'workflow_sync',
    sourceKeys: ['workflow.images'],
    titles: [],
    scriptPath: imageSyncScriptPath,
    scriptArgs: (rawOptions) => {
      const scopes = normalizeWorkflowScopes(rawOptions.scopes ?? rawOptions.scope ?? 'projectiles,buffs', ['items', 'npcs', 'projectiles', 'buffs']);
      const args = [`--apply=true`, `--scopes=${scopes.join(',')}`];
      if (typeof rawOptions.apiBase === 'string' && rawOptions.apiBase.trim() !== '') {
        args.push(`--apiBase=${rawOptions.apiBase.trim()}`);
      }
      if (typeof rawOptions.managedUrlPrefix === 'string' && rawOptions.managedUrlPrefix.trim() !== '') {
        args.push(`--managedUrlPrefix=${rawOptions.managedUrlPrefix.trim()}`);
      }
      return args;
    },
    latestJsonPath: null,
    estimatedRequests: 0
  }
};

const options = parseCliArgs(process.argv.slice(2));
const mode = String(options.mode ?? 'monitor').trim().toLowerCase();
const monitorStatePath = path.resolve(process.cwd(), options['monitor-state'] ?? DEFAULT_WIKI_MONITOR_STATE_PATH);
const manifestPath = path.resolve(process.cwd(), options['manifest-path'] ?? DEFAULT_WIKI_SOURCE_MANIFEST_PATH);
const planPath = path.resolve(process.cwd(), options['plan-path'] ?? DEFAULT_WIKI_SYNC_PLAN_PATH);
const progressPath = path.resolve(
  process.cwd(),
  options['progress-path'] ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? DEFAULT_WIKI_SYNC_PROGRESS_PATH
);
const requestedEntities = resolveRequestedEntities(options);

if (options['clear-cooldown'] === true || String(options['clear-cooldown'] ?? '').toLowerCase() === 'true') {
  clearWikiRequestGateCooldown();
}

switch (mode) {
  case 'monitor':
    await runMonitor();
    break;
  case 'plan':
    await runPlan();
    break;
  case 'apply':
    await runApply({ resume: false });
    break;
  case 'resume':
    await runApply({ resume: true });
    break;
  default:
    throw new Error(`Unsupported --mode value: ${mode}`);
}

async function runMonitor() {
  const previousState = loadWikiMonitorState(monitorStatePath);
  const previousByKey = new Map((previousState.sources ?? []).map((entry) => [entry.key, entry]));
  const checkedAt = new Date().toISOString();
  const sources = [];
  writeWikiSyncProgress({
    status: 'running',
    phase: 'monitor',
    message: `checking ${requestedEntities.length} wiki source group(s)`,
    current: 0,
    total: requestedEntities.length,
    generatedAt: checkedAt
  });

  for (let entityIndex = 0; entityIndex < requestedEntities.length; entityIndex += 1) {
    const entityName = requestedEntities[entityIndex];
    const config = ENTITY_CONFIG[entityName];
    if (!config || config.titles.length === 0) {
      writeWikiSyncProgress({
        status: 'running',
        phase: 'monitor',
        message: `checked ${entityName}`,
        current: entityIndex + 1,
        total: requestedEntities.length
      });
      continue;
    }
    const pages = await fetchWikiPageMetadataBatch({
      titles: config.titles,
      includeLanglinks: false
    });
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const key = config.sourceKeys[index] ?? `${config.sourceKeys[0]}:${page.pageTitle ?? index}`;
      const previous = previousByKey.get(key) ?? null;
      sources.push({
        key,
        entityFamily: config.entityFamily,
        sourceKind: config.sourceKind,
        pageId: page.pageId,
        pageTitle: page.pageTitle,
        revisionId: page.revisionId,
        revisionTimestamp: page.revisionTimestamp,
        checkedAt,
        changed: previous?.revisionTimestamp != null ? previous.revisionTimestamp !== page.revisionTimestamp : false,
        previousRevisionTimestamp: previous?.revisionTimestamp ?? null,
        status: page.missing ? 'missing' : 'ok'
      });
    }
    writeWikiSyncProgress({
      status: 'running',
      phase: 'monitor',
      message: `checked ${entityName}`,
      current: entityIndex + 1,
      total: requestedEntities.length
    });
  }

  const state = {
    checkedAt,
    requestedEntities,
    sources
  };
  saveWikiMonitorState(monitorStatePath, state);
  writeWikiSyncProgress({
    status: 'completed',
    phase: 'monitor',
    message: `checked ${sources.length} wiki source(s)`,
    current: requestedEntities.length,
    total: requestedEntities.length
  });

  console.log(JSON.stringify({
    checkedAt,
    changedSources: sources.filter((entry) => entry.changed).length,
    requestedEntities,
    sourceCount: sources.length,
    statePath: monitorStatePath
  }, null, 2));
}

async function runPlan() {
  writeWikiSyncProgress({
    status: 'running',
    phase: 'plan',
    message: `planning ${requestedEntities.join(', ')}`,
    current: 0,
    total: requestedEntities.length
  });
  ensureSeededManifest();
  const manifest = loadWikiSourceManifest(manifestPath);
  const monitorState = await ensureMonitorState();
  const manifestMap = buildManifestRecordMap(manifest);
  const monitorSourceMap = new Map((monitorState.sources ?? []).map((entry) => [entry.key, entry]));
  const actions = [];
  let estimatedRequests = 0;

  for (const entityName of requestedEntities) {
    const config = ENTITY_CONFIG[entityName];
    if (!config) {
      continue;
    }

    if (entityName === 'zh') {
      const action = buildZhAction(config, options);
      if (action) {
        actions.push(action);
        estimatedRequests += action.estimatedRequests;
      }
      continue;
    }

    if (entityName === 'images') {
      const action = buildImageAction(config, options);
      if (action) {
        actions.push(action);
        estimatedRequests += action.estimatedRequests;
      }
      continue;
    }

    if (entityName === 'item_pages') {
      const action = buildItemPageAction(config, options);
      actions.push(action);
      estimatedRequests += action.estimatedRequests;
      continue;
    }

    const manifestRecords = config.titles.map((title, index) => {
      return manifestMap.get(buildManifestRecordKey({
        entityFamily: config.entityFamily,
        sourceKind: config.sourceKind,
        sourceKey: config.sourceKeys[index] ?? config.sourceKeys[0],
        lang: 'en',
        pageTitle: title
      })) ?? null;
    });
    const monitorRecords = config.sourceKeys.map((key) => monitorSourceMap.get(key)).filter(Boolean);
    const hasSourceChange = monitorRecords.some((entry) => entry.changed);
    const missingManifest = manifestRecords.some((entry) => entry == null || !entry.localPath || !fs.existsSync(entry.localPath));
    if (!hasSourceChange && !missingManifest) {
      continue;
    }

    actions.push({
      id: `${config.entityFamily}-refresh`,
      entityFamily: config.entityFamily,
      type: 'run_script',
      reason: hasSourceChange ? 'source_changed' : 'missing_local_snapshot',
      estimatedRequests: config.estimatedRequests,
      command: process.execPath,
      args: [config.scriptPath, ...config.scriptArgs(options)],
      sourceKeys: config.sourceKeys,
      status: 'pending'
    });
    estimatedRequests += config.estimatedRequests;
  }

  const plan = {
    actions,
    estimatedRequests,
    generatedAt: new Date().toISOString(),
    requestedEntities,
    resumeToken: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    runMode: 'plan',
    shards: actions
      .filter((entry) => entry.entityFamily === 'item_pages')
      .map((entry) => ({ entityFamily: entry.entityFamily, estimatedRequests: entry.estimatedRequests }))
  };
  saveWikiSyncPlan(planPath, plan);
  writeWikiSyncProgress({
    status: 'completed',
    phase: 'plan',
    message: `planned ${actions.length} wiki sync action(s)`,
    current: actions.length,
    total: actions.length
  });

  console.log(JSON.stringify({
    actionCount: actions.length,
    estimatedRequests,
    generatedAt: plan.generatedAt,
    planPath,
    requestedEntities,
    resumeToken: plan.resumeToken
  }, null, 2));
}

async function runApply({ resume }) {
  writeWikiSyncProgress({
    status: 'running',
    phase: resume ? 'resume' : 'apply',
    message: resume ? 'resuming wiki sync plan' : 'preparing wiki sync plan',
    current: 0,
    total: 0
  });
  ensureSeededManifest();
  let plan = loadWikiSyncPlan(planPath);
  if (!resume || plan.actions.length === 0) {
    await runPlan();
    plan = loadWikiSyncPlan(planPath);
  }

  let manifest = loadWikiSourceManifest(manifestPath);
  for (let actionIndex = 0; actionIndex < plan.actions.length; actionIndex += 1) {
    const action = plan.actions[actionIndex];
    if (action.status === 'completed') {
      writeWikiSyncProgress({
        status: 'running',
        phase: resume ? 'resume' : 'apply',
        message: `skipped completed ${action.id}`,
        current: actionIndex + 1,
        total: plan.actions.length
      });
      continue;
    }

    plan = markAction(plan, action.id, 'running');
    saveWikiSyncPlan(planPath, plan);
    writeWikiSyncProgress({
      status: 'running',
      phase: resume ? 'resume' : 'apply',
      message: `running ${action.id} (${actionIndex + 1}/${plan.actions.length})`,
      current: actionIndex,
      total: plan.actions.length
    });
    const result = spawnSync(action.command, action.args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        TERRAPEDIA_CRAWLER_ACTION_ID: action.id,
        TERRAPEDIA_CRAWLER_PROGRESS_PATH: progressPath
      },
      stdio: 'inherit'
    });
    if (result.status !== 0) {
      plan = markAction(plan, action.id, 'failed');
      saveWikiSyncPlan(planPath, plan);
      writeWikiSyncProgress({
        status: 'failed',
        phase: resume ? 'resume' : 'apply',
        message: `failed ${action.id}`,
        current: actionIndex,
        total: plan.actions.length
      });
      throw new Error(`Workflow action failed: ${action.id}`);
    }

    if (action.entityFamily !== 'item_pages') {
      manifest = await updateManifestForEntity(manifest, action.entityFamily);
      saveWikiSourceManifest(manifestPath, manifest);
    }

    plan = markAction(plan, action.id, 'completed');
    saveWikiSyncPlan(planPath, plan);
    writeWikiSyncProgress({
      status: 'running',
      phase: resume ? 'resume' : 'apply',
      message: `completed ${action.id} (${actionIndex + 1}/${plan.actions.length})`,
      current: actionIndex + 1,
      total: plan.actions.length
    });
  }

  writeWikiSyncProgress({
    status: 'completed',
    phase: resume ? 'resume' : 'apply',
    message: `completed ${plan.actions.filter((entry) => entry.status === 'completed').length} wiki sync action(s)`,
    current: plan.actions.length,
    total: plan.actions.length
  });

  console.log(JSON.stringify({
    actionCount: plan.actions.length,
    completed: plan.actions.filter((entry) => entry.status === 'completed').length,
    manifestPath,
    planPath,
    resumeToken: plan.resumeToken
  }, null, 2));
}

async function ensureMonitorState() {
  const current = loadWikiMonitorState(monitorStatePath);
  if ((current.sources ?? []).length > 0) {
    return current;
  }
  await runMonitor();
  return loadWikiMonitorState(monitorStatePath);
}

function ensureSeededManifest() {
  if (fs.existsSync(manifestPath)) {
    return;
  }
  const result = spawnSync(process.execPath, [seedScriptPath, manifestPath], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error('Failed to seed wiki source manifest');
  }
}

function resolveRequestedEntities(rawOptions) {
  const requested = String(rawOptions.entity ?? rawOptions.entities ?? 'items,npcs,projectiles,armor_sets,buffs,bosses,biomes,categories')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(requested)].filter((entry) => ENTITY_CONFIG[entry]);
}

function buildItemPageAction(config, rawOptions) {
  const limit = Math.max(1, Math.min(100, numericOption(rawOptions['page-limit'] ?? rawOptions.limit, 100)));
  const hasItemsFilter = typeof rawOptions.items === 'string' && rawOptions.items.trim() !== '';
  const allowFullCorpus = booleanOption(rawOptions['allow-full-corpus'] ?? rawOptions.allowFullCorpus, false);
  if (!allowFullCorpus && !hasItemsFilter && limit > 100) {
    throw new Error('item_pages planning requires --items or --page-limit <= 100');
  }
  return {
    id: `${config.entityFamily}-refresh`,
    entityFamily: config.entityFamily,
    type: 'run_script',
    reason: hasItemsFilter ? 'manual_item_selection' : 'manual_shard_refresh',
    estimatedRequests: config.estimatedRequests,
    command: process.execPath,
    args: [config.scriptPath, ...config.scriptArgs(rawOptions)],
    sourceKeys: config.sourceKeys,
    status: 'pending'
  };
}

function buildZhAction(config, rawOptions) {
  const scopes = normalizeWorkflowScopes(rawOptions.scopes ?? rawOptions.scope ?? 'projectiles,buffs', ['items', 'npcs', 'projectiles', 'buffs']);
  const summary = summarizeZhScopes(scopes);
  const force = booleanOption(rawOptions.force, false);
  if (!force && summary.missingZh === 0) {
    return null;
  }
  return {
    id: 'zh-enrich',
    entityFamily: 'zh',
    type: 'run_script',
    reason: force ? 'manual_force' : 'missing_standardized_zh',
    estimatedRequests: summary.estimatedRequests,
    metadata: summary,
    command: process.execPath,
    args: [config.scriptPath, ...config.scriptArgs(rawOptions)],
    sourceKeys: config.sourceKeys,
    status: 'pending'
  };
}

function buildImageAction(config, rawOptions) {
  const scopes = normalizeWorkflowScopes(rawOptions.scopes ?? rawOptions.scope ?? 'projectiles,buffs', ['items', 'npcs', 'projectiles', 'buffs']);
  const summary = summarizeImageScopes(scopes, rawOptions.managedUrlPrefix);
  const force = booleanOption(rawOptions.force, false);
  if (!force && summary.unmanagedImageCount === 0) {
    return null;
  }
  return {
    id: 'image-sync',
    entityFamily: 'images',
    type: 'run_script',
    reason: force ? 'manual_force' : 'unmanaged_standardized_images',
    estimatedRequests: summary.unmanagedImageCount,
    metadata: summary,
    command: process.execPath,
    args: [config.scriptPath, ...config.scriptArgs(rawOptions)],
    sourceKeys: config.sourceKeys,
    status: 'pending'
  };
}

async function updateManifestForEntity(manifest, entityFamily) {
  const config = ENTITY_CONFIG[entityFamily];
  if (!config) {
    return manifest;
  }

  if (entityFamily === 'zh') {
    return updateWorkflowManifestForScopes(manifest, 'zh', normalizeWorkflowScopes(options.scopes ?? options.scope ?? 'projectiles,buffs', ['items', 'npcs', 'projectiles', 'buffs']));
  }

  if (entityFamily === 'images') {
    return updateWorkflowManifestForScopes(manifest, 'images', normalizeWorkflowScopes(options.scopes ?? options.scope ?? 'projectiles,buffs', ['items', 'npcs', 'projectiles', 'buffs']));
  }

  if (config.latestJsonPath && fs.existsSync(config.latestJsonPath) && entityFamily !== 'bosses' && entityFamily !== 'biomes' && entityFamily !== 'categories') {
    const payload = JSON.parse(fs.readFileSync(config.latestJsonPath, 'utf8'));
    return upsertModuleManifestRecords(manifest, config, payload);
  }

  const metadata = await fetchWikiPageMetadataBatch({
    titles: config.titles,
    includeLanglinks: false
  });

  let nextManifest = manifest;
  for (let index = 0; index < metadata.length; index += 1) {
    const page = metadata[index];
    nextManifest = upsertManifestRecord(nextManifest, {
      contentHash: null,
      entityFamily: config.entityFamily,
      lang: 'en',
      lastFetchedAt: new Date().toISOString(),
      lastParsedAt: new Date().toISOString(),
      localPath: config.latestJsonPath,
      pageId: page.pageId,
      pageTitle: page.pageTitle ?? config.titles[index],
      requestedPageTitle: config.titles[index],
      revisionId: page.revisionId,
      revisionTimestamp: page.revisionTimestamp,
      sourceKey: config.sourceKeys[index] ?? config.sourceKeys[0],
      sourceKind: config.sourceKind,
      status: 'ok'
    });
  }
  return nextManifest;
}

function upsertModuleManifestRecords(manifest, config, payload) {
  return upsertManifestRecord(manifest, {
    contentHash: createContentHash(payload.moduleContent ?? JSON.stringify(payload)),
    entityFamily: config.entityFamily,
    lang: 'en',
    lastFetchedAt: payload.fetchedAt ?? new Date().toISOString(),
    lastParsedAt: payload.fetchedAt ?? new Date().toISOString(),
    localPath: config.latestJsonPath,
    pageId: payload.pageId ?? null,
    pageTitle: payload.pageTitle ?? config.titles[0],
    requestedPageTitle: config.titles[0],
    revisionId: payload.revisionId ?? null,
    revisionTimestamp: payload.revisionTimestamp ?? null,
    sourceKey: config.sourceKeys[0],
    sourceKind: config.sourceKind,
    status: 'ok'
  });
}

function markAction(plan, actionId, status) {
  return {
    ...plan,
    actions: plan.actions.map((entry) => {
      if (entry.id !== actionId) {
        return entry;
      }
      return {
        ...entry,
        status
      };
    })
  };
}

function writeWikiSyncProgress(progress) {
  const generatedAt = progress.generatedAt ?? new Date().toISOString();
  const actionId = process.env.TERRAPEDIA_CRAWLER_ACTION_ID ?? 'wiki-sync';
  const payload = buildActionProgressPayload({
    ...progress,
    actionId,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath
  });
  writeJsonFile(progressPath, payload);
  if (progressPath !== DEFAULT_WIKI_SYNC_PROGRESS_PATH) {
    writeJsonFile(DEFAULT_WIKI_SYNC_PROGRESS_PATH, {
      ...payload,
      childStatusPath: DEFAULT_WIKI_SYNC_PROGRESS_PATH
    });
  }
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '');
}

function summarizeZhScopes(scopes) {
  const modules = {};
  let missingZh = 0;
  let estimatedRequests = 0;

  for (const scope of scopes) {
    const filePath = path.join(repoRoot, 'data', 'standardized', `${scope}.standardized.json`);
    if (!fs.existsSync(filePath)) {
      modules[scope] = { filePath, missingZh: 0, total: 0 };
      continue;
    }
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const records = Array.isArray(payload?.records) ? payload.records : [];
    const moduleMissing = records.filter((record) => !hasZhValue(record)).length;
    missingZh += moduleMissing;
    if ((scope === 'items' || scope === 'npcs') && moduleMissing > 0) {
      estimatedRequests += Math.ceil(moduleMissing / 50);
    } else if (scope === 'projectiles' && moduleMissing > 0) {
      estimatedRequests += 1;
    }
    modules[scope] = {
      filePath,
      missingZh: moduleMissing,
      total: records.length
    };
  }

  return { estimatedRequests, missingZh, modules, scopes };
}

function summarizeImageScopes(scopes, managedUrlPrefix) {
  const modules = {};
  let unmanagedImageCount = 0;
  const prefixes = [typeof managedUrlPrefix === 'string' && managedUrlPrefix.trim() !== '' ? managedUrlPrefix.trim() : 'http://localhost:9000/terrapedia-images'];

  for (const scope of scopes) {
    const filePath = path.join(repoRoot, 'data', 'standardized', `${scope}.standardized.json`);
    if (!fs.existsSync(filePath)) {
      modules[scope] = { filePath, total: 0, unmanaged: 0 };
      continue;
    }
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const records = Array.isArray(payload?.records) ? payload.records : [];
    const unmanaged = records.filter((record) => {
      const imageUrl = toText(record?.imageUrl);
      return imageUrl && !isManagedImageUrl(imageUrl, prefixes);
    }).length;
    unmanagedImageCount += unmanaged;
    modules[scope] = {
      filePath,
      total: records.length,
      unmanaged
    };
  }

  return { managedUrlPrefixes: prefixes, modules, scopes, unmanagedImageCount };
}

function hasZhValue(record) {
  return Boolean(toText(record?.nameZh) || toText(record?.localized?.zh?.name));
}

function isManagedImageUrl(value, managedUrlPrefixes) {
  const imageUrl = toText(value);
  if (!imageUrl) {
    return false;
  }
  return managedUrlPrefixes.some((prefix) => imageUrl.startsWith(prefix));
}

function updateWorkflowManifestForScopes(manifest, workflowKey, scopes) {
  let nextManifest = manifest;
  for (const scope of scopes) {
    const filePath = path.join(repoRoot, 'data', 'standardized', `${scope}.standardized.json`);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    nextManifest = upsertManifestRecord(nextManifest, {
      contentHash: createContentHash(fs.readFileSync(filePath, 'utf8')),
      entityFamily: workflowKey,
      lang: 'en',
      lastFetchedAt: new Date().toISOString(),
      lastParsedAt: new Date().toISOString(),
      localPath: filePath,
      pageId: null,
      pageTitle: path.basename(filePath),
      requestedPageTitle: path.basename(filePath),
      revisionId: null,
      revisionTimestamp: null,
      sourceKey: `workflow.${workflowKey}.${scope}`,
      sourceKind: workflowKey === 'zh' ? 'workflow_enrich' : 'workflow_sync',
      status: 'ok'
    });
  }
  return nextManifest;
}

function normalizeWorkflowScopes(rawValue, allowedScopes) {
  const allowed = new Set(allowedScopes);
  return [...new Set(
    String(rawValue ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  )].filter((scope) => allowed.has(scope));
}

function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return fallback;
}
