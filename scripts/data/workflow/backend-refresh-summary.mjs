import path from 'node:path';

export function buildBackendRefreshSummaryPath(outputPath) {
  const resolvedPath = path.resolve(String(outputPath ?? 'reports/backend-data-refresh.json'));
  const parsed = path.parse(resolvedPath);
  return path.join(parsed.dir, `${parsed.name}.summary.json`);
}

export function buildBackendRefreshSummary({ outputPath, report } = {}) {
  const actions = Array.isArray(report?.actions) ? report.actions : [];
  const completedActions = Number(report?.completedActions ?? 0);
  const failedActions = Number(report?.failedActions ?? 0);
  const runningActions = Number(report?.runningActions ?? 0);
  const pendingActions = Number(report?.pendingActions ?? 0);
  const timedOutActions = Number(report?.timedOutActions ?? 0);
  const lastAction = selectLastAction(actions);

  return {
    completedActions,
    failedActions,
    generatedAt: report?.generatedAt ?? new Date().toISOString(),
    lastActionId: lastAction?.id ?? null,
    outputPath: outputPath ?? null,
    pendingActions,
    runningActions,
    timedOutActions,
    totalActions: Number(report?.totalActions ?? actions.length),
    totalDurationMs: actions.reduce((sum, action) => sum + (Number(action?.durationMs) || 0), 0)
  };
}

function selectLastAction(actions) {
  const ordered = [...actions].reverse();
  return ordered.find((action) => action?.status === 'failed')
    ?? ordered.find((action) => action?.status === 'running')
    ?? ordered.find((action) => action?.status === 'completed')
    ?? null;
}
