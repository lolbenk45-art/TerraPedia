// 审计截图取证:全公开路由 × 双视口(桌面 1440/移动 375),记录状态码、
// 页高与横向溢出。R2 审查(2026-07-17)的验收基线工具,自 tmp/ 入库。
// 用法:AUDIT_BASE=http://localhost:15177 AUDIT_OUT=tmp/audit-shots node scripts/audit-shoot.mjs
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE = process.env.AUDIT_BASE || 'http://localhost:15177'
const OUT = path.resolve(process.env.AUDIT_OUT || 'tmp/audit-shots')
mkdirSync(OUT, { recursive: true })

const parseJsonEnv = (name, fallback) => {
  const value = process.env[name]
  if (!value) return fallback

  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${name} must be valid JSON`)
  }
}

const DEFAULT_ROUTES = [
  ['home', '/'],
  ['items-index', '/items'],
  ['items-detail', '/items/1'],
  ['npcs-index', '/npcs'],
  ['npcs-detail', '/npcs/17'],
  ['bosses-index', '/bosses'],
  ['bosses-detail', '/bosses/34'],
  ['buffs-index', '/buffs'],
  ['buffs-detail', '/buffs/1'],
  ['biomes-index', '/biomes'],
  ['biomes-detail', '/biomes/1'],
  ['armor-sets-index', '/armor-sets'],
  ['armor-sets-detail', '/armor-sets/109150045'],
  ['projectiles-index', '/projectiles'],
  ['categories-index', '/categories'],
  ['categories-detail', '/categories/weapons'],
  ['crafting', '/crafting'],
  ['search', '/search?q=剑'],
  ['search-tool', '/search-tool'],
  ['articles-index', '/articles'],
  ['articles-detail', '/articles/guide-true-nights-edge-demo'],
  ['about', '/about'],
  ['user-login', '/user/login'],
  ['user-register', '/user/register'],
  ['user-forgot-password', '/user/forgot-password'],
  ['not-found-item', '/items/99999999'],
]

const DEFAULT_VIEWPORTS = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 375, height: 812 }],
]

const ROUTES = parseJsonEnv('AUDIT_ROUTES', DEFAULT_ROUTES)
const VIEWPORTS = parseJsonEnv('AUDIT_VIEWPORTS', DEFAULT_VIEWPORTS)

const executablePath = process.env.PLAYWRIGHT_CHROMIUM
  || process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'
const browser = await chromium.launch({ executablePath })
const results = []

for (const [vpName, viewport] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  for (const [name, route] of ROUTES) {
    const url = BASE + route
    const errors = []
    const onConsole = (message) => {
      if (message.type() === 'error') errors.push(`console:${message.text()}`)
    }
    const onRequestFailed = (request) => errors.push(`requestfailed:${request.url()}`)
    page.on('console', onConsole)
    page.on('requestfailed', onRequestFailed)
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() =>
        page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }))
      await page.waitForTimeout(1200)
      const status = resp ? resp.status() : 0
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      // 视口首屏
      await page.screenshot({ path: `${OUT}/${name}--${vpName}.png` })
      // 全页(限高 20000 防超大)
      if (height < 20000) {
        await page.screenshot({ path: `${OUT}/${name}--${vpName}-full.png`, fullPage: true })
      }
      const result = { name, vp: vpName, status, height, hasHScroll }
      if (errors.length) result.errors = errors
      results.push(result)
      console.log(`${name} ${vpName} status=${status} h=${height}${hasHScroll ? ' HSCROLL!' : ''}`)
    } catch (e) {
      const result = { name, vp: vpName, error: String(e).slice(0, 120) }
      if (errors.length) result.errors = errors
      results.push(result)
      console.log(`${name} ${vpName} ERROR ${String(e).slice(0, 120)}`)
    }
    page.off('console', onConsole)
    page.off('requestfailed', onRequestFailed)
  }
  await ctx.close()
}
await browser.close()
console.log('\nJSON:' + JSON.stringify(results))
