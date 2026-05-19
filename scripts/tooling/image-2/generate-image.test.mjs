import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const cliPath = path.join(repoRoot, 'scripts/tooling/image-2/generate-image.mjs');

async function withStubServer(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}/v1`, server);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

test('generate-image saves b64_json without printing the API key', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-xlab-image-'));
  const configPath = path.join(tempDir, 'xlab.json');
  const outputDir = path.join(tempDir, 'out');
  const apiKey = 'secret-test-key';
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64'
  );

  let requestBody;
  let authorizationHeader;
  await withStubServer(
    (request, response) => {
      authorizationHeader = request.headers.authorization;
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/v1/images/generations');

      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ data: [{ b64_json: pngBytes.toString('base64') }] }));
      });
    },
    async (baseURL) => {
      fs.writeFileSync(configPath, JSON.stringify({ baseURL, apikey: apiKey }));

      const result = await runCli(
        [
          '--config',
          configPath,
          '--prompt',
          'a test image',
          '--output-dir',
          outputDir,
          '--filename-prefix',
          'test-image',
          '--quiet-json'
        ]
      );

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(result.stdout.includes(apiKey), false);
      assert.equal(result.stderr.includes(apiKey), false);
      assert.equal(result.stdout.includes('\n  "ok"'), false);

      const summary = JSON.parse(result.stdout);
      assert.equal(summary.ok, true);
      assert.equal(summary.prompt, 'a test image');
      assert.equal(summary.model, 'gpt-image-2');
      assert.equal(summary.output.includes(outputDir), true);
      assert.equal(fs.readFileSync(summary.output).equals(pngBytes), true);
    }
  );

  assert.equal(authorizationHeader, `Bearer ${apiKey}`);
  assert.equal(requestBody.model, 'gpt-image-2');
  assert.equal(requestBody.prompt, 'a test image');
  assert.equal(requestBody.response_format, 'b64_json');
});
