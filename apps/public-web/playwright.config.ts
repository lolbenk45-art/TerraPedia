import { defineConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const unsafeEnvironment = (message: string): never => {
  throw new Error(`Playwright E2E configuration: ${message}`)
}

const requireEnvironment = (name: string, secret = false): string => {
  const value = process.env[name]?.trim()
  if (!value) {
    return unsafeEnvironment(secret ? 'the run secret is required' : `${name} is required`)
  }
  return value
}

const requireLoopbackUrl = (name: string): string => {
  const value = requireEnvironment(name)
  const parsed = (() => {
    try {
      return new URL(value)
    } catch {
      return unsafeEnvironment(`${name} must be a valid loopback URL`)
    }
  })()

  if (
    parsed.protocol !== 'http:'
    || parsed.hostname !== '127.0.0.1'
    || !parsed.port
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    unsafeEnvironment(`${name} must be an HTTP loopback origin`)
  }

  return parsed.origin
}

const requireRunId = (): string => {
  const runId = requireEnvironment('E2E_RUN_ID')
  if (!/^[a-f0-9]{32}$/.test(runId)) {
    unsafeEnvironment('E2E_RUN_ID is unsafe')
  }
  return runId
}

const requireRunSecret = (): string => {
  const runSecret = requireEnvironment('E2E_RUN_SECRET', true)
  if (!/^[a-f0-9]{64}$/.test(runSecret)) {
    unsafeEnvironment('the run secret is unsafe')
  }
  return runSecret
}

const staticArtifactDirectory = '/tmp/terrapedia-user-auth-e2e.static-check'

const requirePrivateArtifactTree = (artifactDirectory: string): void => {
  const currentUid = process.getuid?.()
  if (currentUid === undefined) {
    unsafeEnvironment('E2E_ARTIFACT_DIR requires a Unix user identity')
  }

  const inspectEntry = (entryPath: string): void => {
    const entry = fs.lstatSync(entryPath)
    if (entry.isSymbolicLink() || entry.uid !== currentUid || (entry.mode & 0o077) !== 0) {
      unsafeEnvironment('E2E_ARTIFACT_DIR must contain only private, current-user entries')
    }
    if (entry.isDirectory()) {
      if ((entry.mode & 0o777) !== 0o700) {
        unsafeEnvironment('E2E_ARTIFACT_DIR directories must use mode 0700')
      }
      for (const childName of fs.readdirSync(entryPath)) {
        inspectEntry(path.join(entryPath, childName))
      }
      return
    }
    if (!entry.isFile() || (entry.mode & 0o777) !== 0o600) {
      unsafeEnvironment('E2E_ARTIFACT_DIR files must use mode 0600')
    }
  }

  try {
    const directoryEntry = fs.lstatSync(artifactDirectory)
    if (!directoryEntry.isDirectory() || directoryEntry.isSymbolicLink()) {
      unsafeEnvironment('E2E_ARTIFACT_DIR must be a private directory')
    }
    if (fs.realpathSync(artifactDirectory) !== artifactDirectory) {
      unsafeEnvironment('E2E_ARTIFACT_DIR must use its canonical path')
    }
    inspectEntry(artifactDirectory)
  } catch {
    unsafeEnvironment('E2E_ARTIFACT_DIR must be a pre-created private artifact directory')
  }
}

const requireArtifactDirectory = (runId: string): string => {
  const rawDirectory = requireEnvironment('E2E_ARTIFACT_DIR')
  const artifactDirectory = path.resolve(rawDirectory)
  const durableArtifactDirectory = path.resolve(
    import.meta.dirname,
    '..',
    'reports',
    'e2e',
    runId,
    'artifacts',
  )
  if (!path.isAbsolute(rawDirectory) || rawDirectory !== artifactDirectory) {
    unsafeEnvironment('E2E_ARTIFACT_DIR must be an isolated runner artifact directory')
  }
  if (artifactDirectory === staticArtifactDirectory) {
    try {
      fs.lstatSync(artifactDirectory)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        unsafeEnvironment('E2E_ARTIFACT_DIR must be an isolated runner artifact directory')
      }
      try {
        fs.mkdirSync(artifactDirectory, { mode: 0o700 })
      } catch {
        unsafeEnvironment('E2E_ARTIFACT_DIR must be an isolated runner artifact directory')
      }
    }
  } else if (artifactDirectory !== durableArtifactDirectory) {
    unsafeEnvironment('E2E_ARTIFACT_DIR must be an isolated runner artifact directory')
  }

  requirePrivateArtifactTree(artifactDirectory)
  process.umask(0o077)
  for (const outputDirectory of ['test-results', 'playwright-report']) {
    const outputPath = path.join(artifactDirectory, outputDirectory)
    fs.mkdirSync(outputPath, { recursive: true, mode: 0o700 })
    fs.chmodSync(outputPath, 0o700)
  }
  return artifactDirectory
}

const baseURL = requireLoopbackUrl('E2E_BASE_URL')
requireLoopbackUrl('E2E_BACKEND_BASE_URL')
const runId = requireRunId()
requireRunSecret()
const artifactDirectory = requireArtifactDirectory(runId)
const chromiumExecutable = process.env.E2E_CHROMIUM_EXECUTABLE?.trim() || undefined

if (chromiumExecutable && !path.isAbsolute(chromiumExecutable)) {
  unsafeEnvironment('E2E_CHROMIUM_EXECUTABLE must be an absolute path')
}

export default defineConfig({
  testDir: './e2e',
  outputDir: path.join(artifactDirectory, 'test-results'),
  workers: 1,
  retries: 0,
  reporter: [
    ['line'],
    ['html', { outputFolder: path.join(artifactDirectory, 'playwright-report'), open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        channel: 'chromium',
        launchOptions: chromiumExecutable ? { executablePath: chromiumExecutable } : undefined,
      },
    },
  ],
})
