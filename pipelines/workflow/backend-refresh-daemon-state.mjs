export function buildDaemonHeartbeatPayload({
  status,
  pid = process.pid,
  activeChildPid = null,
  generatedAt = new Date().toISOString(),
  lastOutputPath = null,
  lastActionId = null
} = {}) {
  return {
    activeChildPid: Number.isFinite(Number(activeChildPid)) ? Number(activeChildPid) : null,
    generatedAt,
    lastActionId: lastActionId ?? null,
    lastOutputPath: lastOutputPath ?? null,
    pid: Number.isFinite(Number(pid)) ? Number(pid) : null,
    status: status ?? 'unknown'
  };
}

export function buildDaemonStatePayload({
  status,
  generatedAt = new Date().toISOString(),
  lastCycleDurationMs = null,
  nextPlannedAt = null
} = {}) {
  return {
    generatedAt,
    lastCycleDurationMs: lastCycleDurationMs == null ? null : Number(lastCycleDurationMs),
    nextPlannedAt: nextPlannedAt ?? null,
    status: status ?? 'unknown'
  };
}
