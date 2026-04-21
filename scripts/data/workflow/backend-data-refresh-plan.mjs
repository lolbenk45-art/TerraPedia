export function buildBackendDataRefreshPlan(options = {}) {
  const itemPageLimit = normalizePositiveInteger(options.itemPageLimit, 100);
  const requestedSteps = normalizeSteps(options.steps);
  const timeoutMs = normalizePositiveInteger(options.timeoutMs, null);
  const actions = [
    {
      id: 'wiki-core-refresh',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/workflow/run-wiki-sync.mjs',
        '--mode=apply',
        '--entity=items,npcs,bosses,biomes,categories'
      ]
    },
    {
      id: 'item-pages-refresh',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
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
      timeoutMs: timeoutMs ?? 15 * 60 * 1000,
      args: [
        'scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs',
        '--recipe-reference=reports/backend-refresh/recipe-material-reference.latest.json'
      ]
    },
    {
      id: 'item-detail-sync',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/pipeline/run-item-detail-sync-pipeline.mjs',
        '--with-boss-loot=true'
      ]
    },
    {
      id: 'town-npc-sync',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/pipeline/run-town-npc-sync-pipeline.mjs',
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
      timeoutMs: action.timeoutMs,
      durationMs: Number.isFinite(Number(result.durationMs)) ? Number(result.durationMs) : null,
      timedOut: Boolean(result.timedOut)
    };
  });

  return {
    generatedAt: plan.generatedAt,
    totalActions: actions.length,
    completedActions: actions.filter((action) => action.status === 'completed').length,
    failedActions: actions.filter((action) => action.status === 'failed').length,
    runningActions: actions.filter((action) => action.status === 'running').length,
    timedOutActions: actions.filter((action) => action.timedOut).length,
    pendingActions: actions.filter((action) => action.status === 'pending').length,
    actions
  };
}

export function resolvePendingBackendDataRefreshActions(plan, report) {
  const completedIds = new Set(
    Array.isArray(report?.actions)
      ? report.actions
        .filter((action) => action?.status === 'completed')
        .map((action) => action.id)
      : []
  );
  return plan.actions.filter((action) => !completedIds.has(action.id));
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
