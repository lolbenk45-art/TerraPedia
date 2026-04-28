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
      id: 'boss-sync',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/pipeline/run-boss-sync-pipeline.mjs',
        '--apply=true'
      ]
    },
    {
      id: 'biome-sync',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/pipeline/run-biome-sync-pipeline.mjs',
        '--apply=true'
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
    },
    {
      id: 'independent-entity-sync',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/pipeline/run-independent-entity-sync-pipeline.mjs',
        '--apply=true'
      ]
    },
    {
      id: 'shimmer-sync',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/pipeline/run-shimmer-sync-pipeline.mjs',
        '--apply=true'
      ]
    },
    {
      id: 'support-sync',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/pipeline/run-support-sync-pipeline.mjs',
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
      timedOut: Boolean(result.timedOut),
      heartbeatPath: result.heartbeatPath ?? null,
      snapshotPath: result.snapshotPath ?? null,
      childStatusPath: result.childStatusPath ?? null,
      current: Number.isFinite(Number(result.current)) ? Number(result.current) : null,
      total: Number.isFinite(Number(result.total)) ? Number(result.total) : null,
      percent: Number.isFinite(Number(result.percent)) ? Number(result.percent) : null,
      phase: result.phase ?? null,
      message: result.message ?? null,
      lastHeartbeatAt: result.lastHeartbeatAt ?? null,
      updatedAt: result.updatedAt ?? null
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
