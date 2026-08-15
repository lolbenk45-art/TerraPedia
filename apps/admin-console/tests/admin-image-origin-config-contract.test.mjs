import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const nuxtConfig = fs.readFileSync(path.join(repoRoot, 'nuxt.config.ts'), 'utf8')

test('admin dev proxy resolves managed image origin from TERRAPEDIA_IMAGE_ORIGIN first', () => {
  assert.match(nuxtConfig, /const terrapediaImageOrigin = \(process\.env\.TERRAPEDIA_IMAGE_ORIGIN\s*\|\|\s*process\.env\.TERRAPEDIA_MINIO_PUBLIC_ENDPOINT\s*\|\|\s*'http:\/\/localhost:19000'\)\.replace\(\/\\\/\$\/,\s*''\)/)
  assert.match(nuxtConfig, /imageOrigin:\s*terrapediaImageOrigin/)
  assert.match(nuxtConfig, /'\/terrapedia-images':\s*\{[\s\S]*target:\s*`\$\{terrapediaImageOrigin\}\/terrapedia-images`/)
  assert.doesNotMatch(nuxtConfig, /terrapediaMinioPublicOrigin/)
  assert.doesNotMatch(nuxtConfig, /localhost:9000/)
})
