import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const APPROVED_PREFIXES = Object.freeze([
  'data/generated/',
  'data/standardized/',
  'data/wiki-crawler/',
  'data/standardized-view/',
]);

export function readRecordedResponse({ sourcePath, repoRoot = process.cwd(), limit = 2, maxLimit = 5, requestUrl = '/recorded-fixture' } = {}) {
  const source = requireDownloadedJsonPath(sourcePath, repoRoot);
  if (!Number.isInteger(Number(maxLimit)) || Number(maxLimit) < 1 || Number(maxLimit) > 100) {
    throw new Error('recorded response maxLimit must be between 1 and 100');
  }
  if (!Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > Number(maxLimit)) {
    throw new Error(`recorded response limit must be between 1 and ${Number(maxLimit)}`);
  }
  const payload = JSON.parse(fs.readFileSync(source, 'utf8'));
  const records = Array.isArray(payload) ? payload : payload.records;
  if (!Array.isArray(records)) throw new Error('recorded response JSON must contain records');
  const selected = records.slice(0, Number(limit));
  return {
    request: { method: 'GET', url: String(requestUrl), networkAccess: false, sourcePath: sourcePath.replaceAll('\\', '/') },
    response: {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-terrapedia-recorded-response': 'true' },
      body: JSON.stringify({ ...(!Array.isArray(payload) ? payload : {}), records: selected }),
    },
    records: selected,
    sourceHash: `sha256:${createHash('sha256').update(fs.readFileSync(source)).digest('hex')}`,
  };
}

export function materializeRecordedResponse({ sourcePath, repoRoot = process.cwd(), markerRoot, limit = 2, maxLimit = 5, requestUrl } = {}) {
  const root = path.resolve(String(markerRoot ?? ''));
  if (!root || root === path.parse(root).root) throw new Error('marker-owned root is required');
  const marker = path.join(root, '.terrapedia-recorded-response-root');
  if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8').trim() !== 'terrapedia-recorded-response-root-v1') {
    throw new Error('marker-owned root marker is missing or invalid');
  }
  const response = readRecordedResponse({ sourcePath, repoRoot, limit, maxLimit, requestUrl });
  const output = path.join(root, 'recorded-http-response.json');
  fs.writeFileSync(output, `${JSON.stringify(response, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return { ...response, path: output };
}

function requireDownloadedJsonPath(sourcePath, repoRoot) {
  const normalized = String(sourcePath ?? '').replaceAll('\\', '/');
  if (/^(?:https?:)?\/\//i.test(normalized) || path.isAbsolute(normalized)) {
    throw new Error('recorded response requires a repository-relative downloaded JSON path');
  }
  if (!APPROVED_PREFIXES.some((prefix) => normalized.startsWith(prefix)) || !normalized.endsWith('.json')) {
    throw new Error('recorded response source must be an approved downloaded JSON path');
  }
  const resolved = path.resolve(repoRoot, normalized);
  if (!fs.existsSync(resolved)) throw new Error(`recorded response source is missing: ${normalized}`);
  return resolved;
}
