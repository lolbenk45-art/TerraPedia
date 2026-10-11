const DEFAULT_HEARTBEAT_MS = 15_000;

export function createSourceUpdateProgressHeartbeat({
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  writeProgress,
  now = () => new Date().toISOString(),
  onError = null,
} = {}) {
  if (typeof writeProgress !== 'function') {
    throw new TypeError('writeProgress is required');
  }
  if (onError != null && typeof onError !== 'function') {
    throw new TypeError('onError must be a function when provided');
  }
  const intervalMs = normalizeHeartbeatMs(heartbeatMs);
  let current = null;
  let writeError = null;
  let timer = null;

  const recordWriteError = (error) => {
    if (writeError != null) {
      return;
    }
    writeError = error instanceof Error ? error : new Error(String(error));
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
    try {
      onError?.(writeError);
    } catch {
      // Progress failure must not become an uncaught timer exception.
    }
  };

  const write = (progress, { allowAfterError = false } = {}) => {
    if (writeError != null && !allowAfterError && progress.status !== 'failed') {
      throw writeError;
    }
    try {
      writeProgress(progress);
    } catch (error) {
      recordWriteError(error);
      throw error;
    }
  };

  const stop = () => {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  };

  timer = setInterval(() => {
    if (current) {
      const timestamp = now();
      try {
        write({ ...current, generatedAt: timestamp, lastHeartbeatAt: timestamp });
      } catch {
        // recordWriteError() stops the timer and exposes the failure to the caller.
      }
    }
  }, intervalMs);
  timer.unref?.();

  return {
    publish(progress) {
      const timestamp = now();
      current = { ...progress, generatedAt: timestamp, lastHeartbeatAt: timestamp };
      write(current);
    },
    assertHealthy() {
      if (writeError != null) {
        throw writeError;
      }
    },
    stop,
    getError() {
      return writeError;
    },
  };
}

function normalizeHeartbeatMs(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_HEARTBEAT_MS;
  return parsed;
}
