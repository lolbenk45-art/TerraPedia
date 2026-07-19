import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const mode = process.env.DEFAULT_LAYOUT_RUNTIME_MODE
const baseUrl = String(process.env.DEFAULT_LAYOUT_RUNTIME_BASE || '').replace(/\/+$/, '')
const outputDir = resolve(process.env.DEFAULT_LAYOUT_RUNTIME_OUT || 'test-results/wp11-default-layout-runtime')
const executablePath = process.env.PLAYWRIGHT_CHROMIUM
const routes = [
  '/', '/search', '/search-tool', '/crafting', '/categories', '/categories/weapons',
  '/biomes', '/biomes/1', '/articles/guide-true-nights-edge-demo', '/npcs', '/npcs/17',
  '/bosses', '/bosses/34', '/buffs', '/buffs/1', '/projectiles', '/armor-sets',
  '/armor-sets/109150045', '/user', '/user/login', '/user/register',
  '/user/articles', '/user/articles/new', '/user/favorites', '/user/settings',
  '/__missing-terrapedia-page',
]
const viewports = [
  { name: 'mobile', width: 390, height: 900 },
  { name: 'desktop', width: 1440, height: 1000 },
]

if (!['capture', 'compare'].includes(mode)) throw new Error('DEFAULT_LAYOUT_RUNTIME_MODE must be capture or compare')
if (!executablePath) throw new Error('PLAYWRIGHT_CHROMIUM is required')
const parsedBase = new URL(baseUrl)
if (parsedBase.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsedBase.hostname)) {
  throw new Error('DEFAULT_LAYOUT_RUNTIME_BASE must be an HTTP loopback URL')
}

const baselinePath = resolve(outputDir, 'baseline.json')
const candidatePath = resolve(outputDir, 'candidate.json')
const manifestPath = mode === 'capture' ? baselinePath : candidatePath
const browser = await chromium.launch({ executablePath })
const records = []

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    for (const route of routes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 45000 })
        .catch(() => page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }))
      await page.waitForTimeout(300)
      const evidence = await page.evaluate(() => {
        const rect = (selector) => {
          const value = document.querySelector(selector)?.getBoundingClientRect()
          return value ? {
            left: Math.round(value.left), top: Math.round(value.top),
            width: Math.round(value.width), height: Math.round(value.height),
          } : null
        }
        return {
          screenCount: document.querySelectorAll('.screen').length,
          navCount: document.querySelectorAll('.site-nav').length,
          footerCount: document.querySelectorAll('.camp-footer').length,
          hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          hasErrorScreen: Boolean(document.querySelector('.error-screen')),
          homeContentRect: rect('.home-lower-inner'),
          footerRect: rect('.camp-footer'),
        }
      })
      records.push({ key: `${route}|${viewport.name}`, route, viewport: viewport.name, ...evidence })
    }
    await context.close()
  }
} finally {
  await browser.close()
}

const manifest = { baseUrl, generatedAt: new Date().toISOString(), routes, viewports, records }
mkdirSync(outputDir, { recursive: true })
const temporaryPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`
writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`)
renameSync(temporaryPath, manifestPath)

const failures = []
if (records.length !== 52) failures.push(`expected 52 records, received ${records.length}`)
for (const record of records) {
  if (record.screenCount !== 1 || record.navCount !== 1 || record.footerCount !== 1) failures.push(`${record.key}: shell counts ${record.screenCount}/${record.navCount}/${record.footerCount}`)
  if (record.hasHorizontalOverflow) failures.push(`${record.key}: horizontal overflow`)
  if (record.route === '/__missing-terrapedia-page' && !record.hasErrorScreen) failures.push(`${record.key}: missing error screen`)
}

if (mode === 'compare') {
  if (!existsSync(baselinePath)) failures.push(`missing baseline ${baselinePath}`)
  else {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
    const indexed = new Map(baseline.records.map((record) => [record.key, record]))
    if (indexed.size !== records.length) failures.push(`baseline key count ${indexed.size} differs from ${records.length}`)
    const difference = (actual, expected, label, key) => {
      if (Math.abs(Number(actual) - Number(expected)) > 1) failures.push(`${key}: ${label} changed ${expected} -> ${actual}`)
    }
    for (const record of records.filter((entry) => entry.route === '/')) {
      const expected = indexed.get(record.key)
      if (!expected?.homeContentRect || !expected?.footerRect || !record.homeContentRect || !record.footerRect) {
        failures.push(`${record.key}: missing home geometry`)
        continue
      }
      for (const field of ['left', 'width', 'height']) difference(record.footerRect[field], expected.footerRect[field], `footer.${field}`, record.key)
      for (const field of ['left', 'top', 'width', 'height']) difference(record.homeContentRect[field], expected.homeContentRect[field], `homeContent.${field}`, record.key)
      const gap = record.footerRect.top - record.homeContentRect.top - record.homeContentRect.height
      const expectedGap = expected.footerRect.top - expected.homeContentRect.top - expected.homeContentRect.height
      difference(gap, expectedGap, 'footer gap', record.key)
    }
  }
}

if (failures.length) {
  console.error(`Default layout runtime checks failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`)
  process.exit(1)
}
console.log(`Default layout runtime ${mode} passed: ${records.length} records`)
