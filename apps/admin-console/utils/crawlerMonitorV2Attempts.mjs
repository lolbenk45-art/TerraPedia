function asArray(value) {
  return Array.isArray(value) ? value : []
}

const TERMINAL_V2_STATUSES = new Set(['completed', 'failed', 'cancelled', 'timed_out', 'interrupted'])

function attemptTime(row) {
  for (const value of [row?.completedAt, row?.requestedAt]) {
    const parsed = Date.parse(value || '')
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export function compareV2TerminalAttempts(left, right) {
  return attemptTime(right) - attemptTime(left)
    || Number(right?.stateVersion || 0) - Number(left?.stateVersion || 0)
    || String(right?.attemptId || '').localeCompare(String(left?.attemptId || ''))
}

export function latestV2TerminalAttempt(rows) {
  return asArray(rows)
    .filter((attempt) => TERMINAL_V2_STATUSES.has(String(attempt?.status || '').toLowerCase()))
    .sort(compareV2TerminalAttempts)[0] || null
}

export function latestV2TerminalAttemptsByDomain(rows, currentEpoch) {
  const latestByDomain = new Map()
  const attempts = asArray(rows)
    .filter((attempt) => String(attempt?.stateStoreEpoch || '') === String(currentEpoch || ''))
    .filter((attempt) => TERMINAL_V2_STATUSES.has(String(attempt?.status || '').toLowerCase()))
    .sort(compareV2TerminalAttempts)

  for (const attempt of attempts) {
    const domains = asArray(attempt?.coveredDomains).length ? attempt.coveredDomains : [attempt?.domain]
    for (const domain of domains) {
      if (domain && !latestByDomain.has(domain)) latestByDomain.set(domain, attempt)
    }
  }

  return latestByDomain
}

export function latestSuccessfulV2AttemptsByDomain(rows, currentEpoch) {
  const latestByDomain = new Map()
  const attempts = asArray(rows)
    .filter((attempt) => String(attempt?.stateStoreEpoch || '') === String(currentEpoch || ''))
    .filter((attempt) => String(attempt?.status || '').toLowerCase() === 'completed')
    .sort(compareV2TerminalAttempts)

  for (const attempt of attempts) {
    const domains = asArray(attempt?.coveredDomains).length ? attempt.coveredDomains : [attempt?.domain]
    for (const domain of domains) {
      if (domain && !latestByDomain.has(domain)) latestByDomain.set(domain, attempt)
    }
  }
  return latestByDomain
}

export function latestActionableV2AttemptsByDomain(rows, currentEpoch) {
  return new Map([...latestV2TerminalAttemptsByDomain(rows, currentEpoch)].filter(([, attempt]) =>
    asArray(attempt?.allowedActions).includes('retry'),
  ))
}
