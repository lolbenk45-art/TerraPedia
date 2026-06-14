import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveFrontRuntimeConfig } from '../utils/runtimeConfig.mjs'

const writeStackConfig = (root, config) => {
  const configDir = join(root, 'scripts', 'dev', 'config')
  mkdirSync(configDir, { recursive: true })
  const configPath = join(configDir, 'local-stack.config.json')
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  return configPath
}

{
  const root = mkdtempSync(join(tmpdir(), 'tp-front-runtime-config-'))
  const configPath = writeStackConfig(root, {
    backend: { port: 18882 },
    minio: {
      publicEndpoint: 'http://localhost:19000',
    },
  })

  const resolved = resolveFrontRuntimeConfig({
    env: {
      TERRAPEDIA_LOCAL_STACK_CONFIG: configPath,
    },
    cwd: root,
    nodeEnv: 'development',
  })

  assert.equal(resolved.backendOrigin, 'http://localhost:18882')
  assert.equal(resolved.imageOrigin, 'http://localhost:19000')
  assert.equal(resolved.minioPublicEndpoint, 'http://localhost:19000')
}

{
  const root = mkdtempSync(join(tmpdir(), 'tp-front-runtime-config-env-'))
  writeStackConfig(root, {
    backend: { port: 18882 },
    minio: {
      publicEndpoint: 'http://localhost:19000',
    },
  })

  const resolved = resolveFrontRuntimeConfig({
    env: {
      TERRAPEDIA_BACKEND_ORIGIN: 'http://localhost:19999',
      TERRAPEDIA_IMAGE_ORIGIN: 'http://localhost:19998',
      TERRAPEDIA_MINIO_PUBLIC_ENDPOINT: 'http://localhost:19997',
    },
    cwd: root,
    nodeEnv: 'development',
  })

  assert.equal(resolved.backendOrigin, 'http://localhost:19999')
  assert.equal(resolved.imageOrigin, 'http://localhost:19998')
  assert.equal(resolved.minioPublicEndpoint, 'http://localhost:19997')
}

{
  const resolved = resolveFrontRuntimeConfig({
    env: {},
    cwd: mkdtempSync(join(tmpdir(), 'tp-front-runtime-config-default-')),
    nodeEnv: 'development',
  })

  assert.equal(resolved.backendOrigin, 'http://localhost:18088')
  assert.equal(resolved.imageOrigin, 'http://localhost:9000')
}
