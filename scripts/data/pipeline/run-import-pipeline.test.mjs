import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'run-import-pipeline.mjs');

test('run-import-pipeline dry-run writes backend preview report without applying writes', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-import-dry-run-'));
  const sharedDataRoot = path.join(tempDir, 'shared');
  const inputPath = path.join(tempDir, 'items.json');
  fs.writeFileSync(inputPath, JSON.stringify({
    source: 'pipeline-dry-run-test',
    items: [
      { name: 'Iron Pickaxe', internalName: 'IronPickaxe', categoryCode: 'PICKAXE' },
      { name: 'Broken', internalName: 'Broken', categoryCode: 'UNKNOWN_CATEGORY' }
    ]
  }), 'utf8');

  const requests = [];
  const server = http.createServer(async (request, response) => {
    const body = await readBody(request);
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization ?? null,
      body: body ? JSON.parse(body) : null
    });

    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/auth/login') {
      response.end(JSON.stringify({ success: true, data: { token: 'mock-admin-token' } }));
      return;
    }

    if (request.url === '/api/items/import?dryRun=true') {
      response.end(JSON.stringify({
        success: true,
        data: {
          total: 2,
          created: 1,
          updated: 0,
          skipped: 1,
          errors: [],
          toBeCreated: [{ name: 'Iron Pickaxe', internalName: 'IronPickaxe', reason: 'new_item' }],
          toBeUpdated: [],
          toBeSkipped: [{ name: 'Broken', internalName: 'Broken', reason: 'categoryCode not found: UNKNOWN_CATEGORY' }]
        }
      }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ success: false, message: 'unexpected request' }));
  });

  await listen(server);
  const { port } = server.address();
  const result = await runNode([
    scriptPath,
    inputPath,
    '--dry-run=true',
    `--url=http://127.0.0.1:${port}/api/items/import`
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      TERRAPEDIA_SHARED_DATA_ROOT: sharedDataRoot,
      TERRAPEDIA_ADMIN_PASSWORD: 'mock-password'
    }
  });
  await close(server);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Dry run: true/);
  assert.match(result.stdout, /HTTP Status: 200/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|Transport error/i);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, '/api/items/import?dryRun=true');
  assert.equal(requests[1].authorization, 'Bearer mock-admin-token');
  assert.equal(requests[1].body.source, 'pipeline-dry-run-test');

  const dryRunDir = path.join(sharedDataRoot, 'reports', 'dry-run');
  const reports = fs.readdirSync(dryRunDir).filter((entry) => entry.endsWith('.json'));
  assert.equal(reports.length, 1);

  const report = JSON.parse(fs.readFileSync(path.join(dryRunDir, reports[0]), 'utf8'));
  assert.equal(report.dryRun, true);
  assert.equal(report.request.dryRun, true);
  assert.equal(report.request.source, 'pipeline-dry-run-test');
  assert.equal(report.toBeCreated.length, 1);
  assert.equal(report.toBeUpdated.length, 0);
  assert.equal(report.toBeSkipped.length, 1);
  assert.deepEqual(Object.keys(report.toBeCreated[0]).sort(), ['internalName', 'name', 'reason'].sort());
});

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function runNode(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
