import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_BACKEND_ORIGIN = 'http://localhost:18088'
const DEFAULT_IMAGE_ORIGIN = 'http://localhost:19000'
const DEFAULT_WIKI_GATE_URL = 'http://127.0.0.1:18099/fetch-image'

const trimTrailingSlash = (value) => String(value ?? '').replace(/\/$/, '')

const envValue = (env, name) => {
  const value = env?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

const readJsonFile = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

const resolveConfigPath = (env, cwd) => {
  const explicitPath = envValue(env, 'TERRAPEDIA_LOCAL_STACK_CONFIG')
  if (explicitPath) {
    return path.isAbsolute(explicitPath) ? explicitPath : path.resolve(cwd, explicitPath)
  }

  const candidates = [
    path.resolve(cwd, 'scripts/dev/config/local-stack.config.json'),
    path.resolve(cwd, '../scripts/dev/config/local-stack.config.json'),
  ]

  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

const readLocalStackConfig = (env, cwd) => {
  const configPath = resolveConfigPath(env, cwd)
  if (!configPath) {
    return { configPath: '', config: null }
  }

  return { configPath, config: readJsonFile(configPath) }
}

const pickPort = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export const resolveFrontRuntimeConfig = ({ env = process.env, cwd = process.cwd(), nodeEnv = env.NODE_ENV } = {}) => {
  const { configPath, config } = readLocalStackConfig(env, cwd)
  const backendPort = pickPort(config?.backend?.port, 18088)
  const minioPublicEndpointFromConfig = trimTrailingSlash(config?.minio?.publicEndpoint)
  const minioEndpointFromConfig = trimTrailingSlash(config?.minio?.endpoint)

  const backendOrigin = trimTrailingSlash(
    envValue(env, 'TERRAPEDIA_BACKEND_ORIGIN')
    || (config ? `http://localhost:${backendPort}` : DEFAULT_BACKEND_ORIGIN),
  )

  const minioPublicEndpoint = trimTrailingSlash(
    envValue(env, 'TERRAPEDIA_MINIO_PUBLIC_ENDPOINT')
    || minioPublicEndpointFromConfig
    || (nodeEnv === 'development' ? DEFAULT_IMAGE_ORIGIN : ''),
  )

  const imageOrigin = trimTrailingSlash(
    envValue(env, 'TERRAPEDIA_IMAGE_ORIGIN')
    || minioPublicEndpoint
    || minioEndpointFromConfig
    || (nodeEnv === 'development' ? DEFAULT_IMAGE_ORIGIN : ''),
  )

  const wikiImageGateUrl = trimTrailingSlash(
    envValue(env, 'TERRAPEDIA_IMAGE_FETCH_GATE_URL') || DEFAULT_WIKI_GATE_URL,
  )

  return {
    configPath,
    backendOrigin,
    minioPublicEndpoint,
    imageOrigin,
    wikiImageGateUrl,
    backendApiBase: `${backendOrigin}/api`,
  }
}
