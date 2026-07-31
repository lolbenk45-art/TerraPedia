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
        '--entity=items,npcs,projectiles,bosses,biomes,categories'
      ]
    },
    {
      id: 'wiki-items-refresh',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/workflow/run-wiki-sync.mjs',
        '--mode=apply',
        '--entity=items'
      ]
    },
    {
      id: 'wiki-items-force-refresh',
      manualOnly: true,
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/workflow/run-wiki-sync.mjs',
        '--mode=apply',
        '--entity=items',
        '--force=true'
      ]
    },
    {
      id: 'wiki-npcs-refresh',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/workflow/run-wiki-sync.mjs',
        '--mode=apply',
        '--entity=npcs'
      ]
    },
    {
      id: 'wiki-npcs-force-refresh',
      manualOnly: true,
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/workflow/run-wiki-sync.mjs',
        '--mode=apply',
        '--entity=npcs',
        '--force=true'
      ]
    },
    {
      id: 'wiki-projectiles-refresh',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/workflow/run-wiki-sync.mjs',
        '--mode=apply',
        '--entity=projectiles'
      ]
    },
    {
      id: 'wiki-projectiles-force-refresh',
      manualOnly: true,
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/workflow/run-wiki-sync.mjs',
        '--mode=apply',
        '--entity=projectiles',
        '--force=true'
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
      id: 'item-image-source-verification',
      manualOnly: true,
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/fetch/fetch-item-image-source-verification.mjs',
        '--input=reports/authorization/canonical/canonical-item-image-source-verification.input.json',
        '--output=reports/audit/item-image-source-verification.latest.json',
        '--batch-size=8',
        '--max-requests=877'
      ]
    },
    {
      id: 'recipe-reference-sync',
      runner: 'node',
      timeoutMs: timeoutMs ?? 15 * 60 * 1000,
      args: [
        'scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs',
        '--recipe-reference=reports/backend-refresh/recipe-material-reference.latest.json',
        '--apply=false'
      ]
    },
    {
      id: 'recipe-reference-apply',
      manualOnly: true,
      runner: 'node',
      timeoutMs: timeoutMs ?? 15 * 60 * 1000,
      args: [
        'scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs',
        '--recipe-reference=reports/backend-refresh/recipe-material-reference.latest.json',
        '--apply=true'
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
      id: 'npc-loot-backfill',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/import/import-normal-npc-loot-to-db.mjs',
        '--dry-run=true',
        '--report-json=<outputPath>'
      ]
    },
    {
      id: 'npc-loot-apply',
      manualOnly: true,
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/import/import-normal-npc-loot-to-db.mjs',
        '--dry-run=false',
        '--report-json=<outputPath>'
      ]
    },
    {
      id: 'boss-loot-backfill',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/import/import-boss-loot-to-db.mjs',
        '--dry-run=true',
        '--report-json=<outputPath>'
      ]
    },
    {
      id: 'boss-loot-apply',
      manualOnly: true,
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/import/import-boss-loot-to-db.mjs',
        '--dry-run=false',
        '--report-json=<outputPath>'
      ]
    },
    {
      id: 'item-group-canonical-preview',
      manualOnly: true,
      runner: 'node',
      timeoutMs: timeoutMs ?? 15 * 60 * 1000,
      args: [
        'scripts/data/item-groups/item-group-canonical-action.mjs',
        '--action-id=item-group-canonical-preview'
      ]
    },
    {
      id: 'item-group-canonical-apply',
      manualOnly: true,
      runner: 'node',
      timeoutMs: timeoutMs ?? 15 * 60 * 1000,
      args: [
        'scripts/data/item-groups/item-group-canonical-action.mjs',
        '--action-id=item-group-canonical-apply'
      ]
    },
    {
      id: 'npc-crawler-facts-preview',
      manualOnly: true,
      runner: 'node',
      timeoutMs: timeoutMs ?? 15 * 60 * 1000,
      args: [
        'scripts/data/npc-canonical/npc-crawler-fact-action.mjs',
        '--action-id=npc-crawler-facts-preview'
      ]
    },
    {
      id: 'npc-crawler-facts-apply',
      manualOnly: true,
      runner: 'node',
      timeoutMs: timeoutMs ?? 15 * 60 * 1000,
      args: [
        'scripts/data/npc-canonical/npc-crawler-fact-action.mjs',
        '--action-id=npc-crawler-facts-apply'
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
      id: 'biome-preview',
      manualOnly: true,
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/pipeline/run-biome-sync-pipeline.mjs',
        '--apply=false'
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
    },
    {
      id: 'wiki-audio-assets-refresh',
      runner: 'node',
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      args: [
        'scripts/data/fetch/fetch-wiki-audio-assets.mjs',
        '--limit-per-scope=3',
        '--max-api-pages-per-prefix=1',
        '--max-total-files=12',
        '--max-file-bytes=10485760'
      ]
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    actions: requestedSteps.length === 0
      ? actions.filter((action) => !action.manualOnly)
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
      updatedAt: result.updatedAt ?? null,
      plannedCount: finiteOrNull(result.plannedCount),
      actualCount: finiteOrNull(result.actualCount),
      skippedCount: finiteOrNull(result.skippedCount),
      failedCount: finiteOrNull(result.failedCount),
      estimatedRequests: finiteOrNull(result.estimatedRequests),
      estimatedRecords: finiteOrNull(result.estimatedRecords),
      resultKind: result.resultKind ?? null,
      resumeOutcome: result.resumeOutcome ?? null
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

function finiteOrNull(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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
