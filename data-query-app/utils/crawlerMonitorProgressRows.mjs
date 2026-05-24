const SOURCE_SNAPSHOT_IDS = new Set([
  'domain-source-bosses',
  'domain-source-armor-sets',
  'domain-source-shimmer',
  'domain-source-town-npc-maintenance',
])

export function progressRowsFromOverview(source) {
  const tasks = Array.isArray(source?.registeredTasks) ? source.registeredTasks : [];
  const runActions = Array.isArray(source?.latestRun?.actions) ? source.latestRun.actions : [];
  const actionsById = new Map(runActions.map((action) => [String(action.id || ''), action]));
  const rows = tasks
    .filter(shouldIncludeProgressTask)
    .map((task) => ({
      ...task,
      rowKey: `task:${task.id || task.label || task.progressPath || task.reportPath || 'unknown'}`,
      action: task.id ? actionsById.get(task.id) || null : null
    }));

  const knownTaskIds = new Set(tasks.map((task) => String(task.id || '')).filter(Boolean));
  for (const action of runActions) {
    const id = String(action.id || '');
    if (id && knownTaskIds.has(id)) {
      continue;
    }
    rows.push({
      id: id || null,
      label: id || action.runner || 'legacy action',
      status: action.status || null,
      lane: action.runner || null,
      queueState: action.message || action.phase || null,
      current: action.current ?? null,
      total: action.total ?? null,
      overallCurrent: action.overallCurrent ?? null,
      overallTotal: action.overallTotal ?? null,
      percent: action.percent ?? null,
      progressKind: progressKindFromStatus(action.status),
      updatedAt: action.lastHeartbeatAt || action.updatedAt || null,
      rowKey: `action:${id || action.runner || rows.length}`,
      action
    });
  }

  return rows.sort((left, right) => progressRowRank(left) - progressRowRank(right));
}

export function sourceSnapshotRowsFromOverview(source) {
  return progressRowsFromOverview(source)
    .filter((row) => isSourceSnapshotRow(row))
    .sort((left, right) => sourceSnapshotRowRank(left) - sourceSnapshotRowRank(right))
}

export function hasLiveSourceSnapshotProgress(source) {
  return sourceSnapshotRowsFromOverview(source)
    .some((row) => ['running', 'stalled'].includes(rowStatus(row)))
}

export function isSourceSnapshotRow(row) {
  return SOURCE_SNAPSHOT_IDS.has(String(row?.id || ''))
}

export function shouldIncludeProgressTask(task) {
  const normalizedStatus = String(task?.status || '').toLowerCase();
  const normalizedKind = String(task?.progressKind || '').toLowerCase();
  return ['running', 'stalled', 'queued', 'pending', 'blocked', 'warning', 'missing', 'failed', 'error'].includes(normalizedStatus)
    || ['live', 'stalled', 'queued', 'blocked', 'missing', 'report-only', 'failed', 'error', 'warning'].includes(normalizedKind)
    || Boolean(task?.progressPath || task?.progressSource || task?.reportPath);
}

export function progressRowRank(row) {
  const normalized = rowStatus(row);
  const order = {
    stalled: 0,
    running: 1,
    failed: 2,
    error: 2,
    blocked: 3,
    queued: 4,
    pending: 4,
    missing: 5,
    warning: 6,
    'report-only': 7,
    completed: 8
  };
  return order[normalized] ?? 9;
}

export function rowStatus(row) {
  if (!row) return '';
  const status = String(row.status || row.action?.status || '').toLowerCase();
  if (['failed', 'error', 'blocked', 'warning', 'stalled', 'missing'].includes(status)) {
    return status;
  }
  const kind = String(row.progressKind || '').toLowerCase();
  if (kind === 'live') return 'running';
  if (kind) return kind;
  return status;
}

export function progressKindFromStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'running') return 'live';
  if (['pending', 'queued'].includes(normalized)) return 'queued';
  if (['blocked', 'missing', 'stalled', 'failed', 'error', 'warning'].includes(normalized)) return normalized;
  return normalized || null;
}

function sourceSnapshotRowRank(row) {
  const statusRank = progressRowRank(row)
  const id = String(row?.id || '')
  const idOrder = {
    'domain-source-bosses': 0,
    'domain-source-armor-sets': 1,
    'domain-source-shimmer': 2,
    'domain-source-town-npc-maintenance': 3,
  }
  return statusRank * 10 + (idOrder[id] ?? 9)
}
