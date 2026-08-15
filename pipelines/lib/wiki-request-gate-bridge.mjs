import fs from 'node:fs';
import { createWikiRequestGate } from './wiki-request-gate.mjs';

const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
const gate = createWikiRequestGate();

try {
  const body = await gate.runTextRequest(input.url, {
    method: input.method || 'GET',
    headers: input.headers || {},
    body: input.body ?? null,
    profile: input.profile || 'page',
    sourceKey: input.sourceKey || input.url,
    timeoutMs: Number(input.timeoutMs || 20_000)
  });
  process.stdout.write(`${JSON.stringify({
    status: 200,
    statusText: 'OK',
    url: input.url,
    body
  })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
}
