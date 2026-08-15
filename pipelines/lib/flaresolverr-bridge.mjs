const DEFAULT_FLARESOLVERR_URL = 'http://127.0.0.1:8191/v1';

export function resolveFlareSolverrUrl(value = process.env.TERRAPEDIA_FLARESOLVERR_URL) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

export async function runFlareSolverrRequest({
  url,
  method = 'GET',
  headers = {},
  body = null,
  timeoutMs = 20_000,
  flaresolverrUrl = resolveFlareSolverrUrl() ?? DEFAULT_FLARESOLVERR_URL,
  fetchFn = globalThis.fetch
} = {}) {
  if (!url) {
    throw new Error('FlareSolverr request url is required');
  }
  if (typeof fetchFn !== 'function') {
    throw new Error('FlareSolverr fallback requires fetch');
  }

  const requestMethod = String(method || 'GET').toUpperCase();
  const payload = {
    cmd: requestMethod === 'POST' ? 'request.post' : 'request.get',
    url: String(url),
    maxTimeout: Number(timeoutMs) || 20_000,
    headers: normalizeHeaders(headers)
  };
  if (requestMethod === 'POST' && body != null) {
    payload.postData = String(body);
  }

  let response;
  try {
    response = await fetchFn(flaresolverrUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Number(timeoutMs) + 5_000)
    });
  } catch (error) {
    throw buildFlareSolverrError(`FlareSolverr request failed: ${compactText(error instanceof Error ? error.message : error)}`);
  }
  const rawBody = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw buildFlareSolverrError(`FlareSolverr request failed HTTP ${response.status}: ${compactText(rawBody)}`);
  }
  if (!parsed || parsed.status !== 'ok' || !parsed.solution) {
    const message = parsed?.message ?? parsed?.error ?? rawBody;
    throw buildFlareSolverrError(`FlareSolverr request failed: ${compactText(message)}`);
  }

  const solution = parsed.solution;
  const solutionStatus = Number(solution.status ?? 200);
  return {
    status: Number.isFinite(solutionStatus) && solutionStatus > 0 ? solutionStatus : 200,
    statusText: String(solution.statusText ?? ''),
    body: String(solution.response ?? '')
  };
}

function buildFlareSolverrError(message) {
  const error = new Error(message);
  error.retryable = true;
  error.cloudflare = true;
  return error;
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .map(([key, value]) => [String(key).toLowerCase(), String(value)])
      .filter(([key]) => key !== 'content-length' && key !== 'host')
  );
}

function compactText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}
