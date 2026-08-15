// WP-12: freeze surviving @media width breakpoints after the ≤24px drift merge.
// Only (min|max)-width: Npx inside @media conditions are governed. Component
// layout max-width props, container queries, and non-width media features are
// out of scope.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Post-merge frozen max-width media boundaries (px).
const FROZEN_MAX = new Set([
  430, 520, 640, 720, 760, 780, 820, 860, 900, 980, 1024, 1080, 1180,
])

// Each frozen max N admits complement min N+1; 960 is an independent min-only boundary.
const ALLOWED_MIN = new Set([
  ...[...FROZEN_MAX].map((n) => n + 1),
  960,
])

const MEDIA_BLOCK = /@media([^{]+)\{/gi
const WIDTH = /(min-width|max-width)\s*:\s*(\d+)px/gi

const listFiles = (dir, acc = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.nuxt' || name === 'test-results' || name === '.output' || name === 'dist') {
      continue
    }
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      listFiles(full, acc)
    } else if (/\.(css|vue)$/.test(name)) {
      acc.push(full)
    }
  }
  return acc
}

const violations = []
let saw1024 = false
let saw1020 = false

for (const full of listFiles(join(root, 'assets/css')).concat(
  listFiles(join(root, 'pages')),
  listFiles(join(root, 'components')),
)) {
  const rel = relative(root, full).replaceAll('\\', '/')
  const text = readFileSync(full, 'utf8')
  for (const media of text.matchAll(MEDIA_BLOCK)) {
    const cond = media[1]
    const line = text.slice(0, media.index).split('\n').length
    for (const width of cond.matchAll(WIDTH)) {
      const prop = width[1].toLowerCase()
      const n = Number(width[2])
      if (prop === 'max-width' && n === 1024) {
        saw1024 = true
      }
      if (prop === 'max-width' && n === 1020) {
        saw1020 = true
      }
      if (prop === 'max-width' && !FROZEN_MAX.has(n)) {
        violations.push(`${rel}:${line} max-width:${n}px not in frozen whitelist`)
      }
      if (prop === 'min-width' && !ALLOWED_MIN.has(n)) {
        violations.push(`${rel}:${line} min-width:${n}px not in allowed complement/min set`)
      }
    }
  }
}

if (saw1020) {
  violations.push('residual @media (max-width: 1020px) must be merged into 1024px (WP-12 drift merge)')
}
if (!saw1024) {
  violations.push('expected at least one @media (max-width: 1024px) after the 1020→1024 merge')
}

if (violations.length > 0) {
  console.error(`Breakpoint whitelist contract failed:\n${violations.map((v) => `- ${v}`).join('\n')}`)
  process.exit(1)
}

console.log(
  `Breakpoint whitelist contract passed (${FROZEN_MAX.size} frozen max, ${ALLOWED_MIN.size} allowed min).`,
)
