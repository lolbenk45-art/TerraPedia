import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const frontRoot = path.resolve(import.meta.dirname, '..', '..')
const reportRoot = path.resolve(frontRoot, '..', 'reports', 'e2e')
const staticArtifactDirectory = '/tmp/terrapedia-user-auth-e2e.static-check'
const createdPaths = []
let createdStaticArtifactDirectory = false

test.after(() => {
  for (const directory of createdPaths) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
  if (createdStaticArtifactDirectory) {
    fs.rmSync(staticArtifactDirectory, { recursive: true, force: true })
  }
})

const newRunId = () => randomBytes(16).toString('hex')

const durableArtifactDirectory = (runId) => path.join(reportRoot, runId, 'artifacts')

const makeDurableArtifactDirectory = (runId, mode = 0o700) => {
  const runDirectory = path.dirname(durableArtifactDirectory(runId))
  const artifactDirectory = durableArtifactDirectory(runId)

  fs.mkdirSync(artifactDirectory, { recursive: true, mode: 0o700 })
  fs.chmodSync(artifactDirectory, mode)
  createdPaths.push(runDirectory)
  return artifactDirectory
}

const configEnvironment = (artifactDirectory, runId) => ({
  E2E_BASE_URL: 'http://127.0.0.1:15177',
  E2E_BACKEND_BASE_URL: 'http://127.0.0.1:18081',
  E2E_RUN_ID: runId,
  E2E_RUN_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  E2E_ARTIFACT_DIR: artifactDirectory,
})

const loadConfig = (artifactDirectory, runId, afterLoad = '') => spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `await import('./playwright.config.ts'); ${afterLoad}`,
  ],
  {
    cwd: frontRoot,
    env: configEnvironment(artifactDirectory, runId),
    encoding: 'utf8',
  },
)

const assertRejected = (result) => {
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /E2E_ARTIFACT_DIR|artifact directory/i)
}

test('rejects a missing durable E2E artifact directory before Playwright loads', () => {
  const runId = newRunId()
  const artifactDirectory = durableArtifactDirectory(runId)

  assertRejected(loadConfig(artifactDirectory, runId))
})

test('rejects a durable artifact directory with group or other permissions', () => {
  const runId = newRunId()
  const artifactDirectory = makeDurableArtifactDirectory(runId, 0o750)

  assertRejected(loadConfig(artifactDirectory, runId))
})

test('rejects a durable artifact directory that is a symbolic link', () => {
  const runId = newRunId()
  const artifactDirectory = durableArtifactDirectory(runId)
  const targetDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-playwright-artifact-target-'))

  fs.chmodSync(targetDirectory, 0o700)
  fs.mkdirSync(path.dirname(artifactDirectory), { recursive: true, mode: 0o700 })
  fs.symlinkSync(targetDirectory, artifactDirectory, 'dir')
  createdPaths.push(path.dirname(artifactDirectory), targetDirectory)

  assertRejected(loadConfig(artifactDirectory, runId))
})

test('rejects pre-existing artifact descendants with non-private permissions', () => {
  const runId = newRunId()
  const artifactDirectory = makeDurableArtifactDirectory(runId)
  const reportDirectory = path.join(artifactDirectory, 'playwright-report')

  fs.mkdirSync(reportDirectory, { mode: 0o755 })
  assertRejected(loadConfig(artifactDirectory, runId))
})

test('rejects a temporary-prefix path that is not the controlled static-check directory', () => {
  const runId = newRunId()
  const maliciousDirectory = '/tmp/terrapedia-user-auth-e2e.static-check-escape'

  assertRejected(loadConfig(maliciousDirectory, runId))
})

test('accepts a private durable directory and pre-creates private Playwright output directories', () => {
  const runId = newRunId()
  const artifactDirectory = makeDurableArtifactDirectory(runId)
  const result = loadConfig(
    artifactDirectory,
    runId,
    `import fs from 'node:fs'; import path from 'node:path'; fs.writeFileSync(path.join(process.env.E2E_ARTIFACT_DIR, 'playwright-report', 'index.html'), 'redacted');`,
  )

  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.statSync(artifactDirectory).mode & 0o777, 0o700)
  assert.equal(fs.statSync(path.join(artifactDirectory, 'test-results')).mode & 0o777, 0o700)
  assert.equal(fs.statSync(path.join(artifactDirectory, 'playwright-report')).mode & 0o777, 0o700)
  assert.equal(fs.statSync(path.join(artifactDirectory, 'playwright-report', 'index.html')).mode & 0o777, 0o600)
})

test('keeps the exact static-check artifact directory private', () => {
  if (!fs.existsSync(staticArtifactDirectory)) {
    createdStaticArtifactDirectory = true
  }

  const result = loadConfig(staticArtifactDirectory, newRunId())

  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.lstatSync(staticArtifactDirectory).isSymbolicLink(), false)
  assert.equal(fs.statSync(staticArtifactDirectory).uid, process.getuid())
  assert.equal(fs.statSync(staticArtifactDirectory).mode & 0o777, 0o700)
})
