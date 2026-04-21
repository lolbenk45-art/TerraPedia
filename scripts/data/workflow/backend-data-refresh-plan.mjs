export function buildBackendDataRefreshPlan(options = {}) {
  const itemPageLimit = normalizePositiveInteger(options.itemPageLimit, 100);
  const requestedSteps = normalizeSteps(options.steps);
  const actions = [
    {
      id: 'wiki-core-refresh',
      runner: 'node',
      args: [
        'scripts/data/workflow/run-wiki-sync.mjs',
        '--mode=apply',
        '--entity=items,npcs,bosses,biomes,categories'
      ]
    },
    {
      id: 'item-pages-refresh',
      runner: 'node',
      args: [
        'scripts/data/workflow/run-wiki-sync.mjs',
        '--mode=apply',
        '--entity=item_pages',
        `--page-limit=${itemPageLimit}`,
        '--with-recipes=true'
      ]
    },
    {
      id: 'recipe-reference-sync',
      runner: 'node',
      args: [
        'scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs'
      ]
    },
    {
      id: 'item-detail-sync',
      runner: 'node',
      args: [
        'scripts/data/pipeline/run-item-detail-sync-pipeline.mjs',
        '--with-boss-loot=true'
      ]
    },
    {
      id: 'town-npc-fetch',
      runner: 'python',
      args: [
        'scripts/data/fetch/fetch-wiki-town-npc-maintenance.py'
      ]
    },
    {
      id: 'town-npc-import',
      runner: 'node',
      args: [
        'scripts/data/import/import-wiki-town-npcs-to-db.mjs',
        '--apply=true'
      ]
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    actions: requestedSteps.length === 0
      ? actions
      : actions.filter((action) => requestedSteps.includes(action.id))
  };
}

export function buildBackendDataRefreshReport(plan, actionResults = []) {
  const resultById = new Map(actionResults.map((entry) => [entry.id, entry]));
  const actions = plan.actions.map((action) => {
    const result = resultById.get(action.id) ?? {};
    return {
      id: action.id,
      runner: action.runner,
      args: action.args,
      status: result.status ?? 'pending',
      durationMs: Number.isFinite(Number(result.durationMs)) ? Number(result.durationMs) : null
    };
  });

  return {
    generatedAt: plan.generatedAt,
    totalActions: actions.length,
    completedActions: actions.filter((action) => action.status === 'completed').length,
    failedActions: actions.filter((action) => action.status === 'failed').length,
    pendingActions: actions.filter((action) => action.status === 'pending').length,
    actions
  };
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.trunc(numeric);
}

function normalizeSteps(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
