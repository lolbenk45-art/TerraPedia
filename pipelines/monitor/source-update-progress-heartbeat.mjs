const DEFAULT_HEARTBEAT_MS = 15_000;

export function createSourceUpdateProgressHeartbeat({
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  writeProgress,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof writeProgress !== 'function') {
    throw new TypeError('writeProgress is required');
  }
  const intervalMs = normalizeHeartbeatMs(heartbeatMs);
  let current = null;
  const timer = setInterval(() => {
    if (current) {
      const timestamp = now();
      writeProgress({ ...current, generatedAt: timestamp, lastHeartbeatAt: timestamp });
    }
  }, intervalMs);
  timer.unref?.();

  return {
    publish(progress) {
      const timestamp = now();
      current = { ...progress, generatedAt: timestamp, lastHeartbeatAt: timestamp };
      writeProgress(current);
    },
    stop() {
      clearInterval(timer);
    },
  };
}

function normalizeHeartbeatMs(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_HEARTBEAT_MS;
  return parsed;
}
