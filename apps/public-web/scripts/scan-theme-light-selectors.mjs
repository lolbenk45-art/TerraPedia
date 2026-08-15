// WP-11.3 判别扫描:样式层的 [data-theme="light"] 只在"同一 rule block 内存在
// [data-theme="morning-paper"] 对应选择器(声明因此天然一致)"时才是可删的运行时别名。
// 规则外的一律进 review 清单并以非零退出;--apply 仅在 review 为空时执行删除,
// 且删除后就地复扫,残留任何 light 选择器则不落盘并报错。
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const apply = process.argv.includes('--apply')
const LIGHT = '[data-theme="light"]'
const MORNING = '[data-theme="morning-paper"]'

const listCssFiles = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const path = `${dir}/${entry.name}`
  if (entry.isDirectory()) {
    return listCssFiles(path)
  }
  return entry.name.endsWith('.css') ? [path] : []
})

// 注释体替换为等长空白,保持行号与索引稳定。
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))

// 每个 '{' 前、自上一个 '{'/'}'/';' 起的文本即 prelude;@ 块 prelude 不含
// 目标 token,天然被忽略,块内 rule 由同一游标继续覆盖。
const collectPreludes = (css) => {
  const preludes = []
  let anchor = 0
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index]
    if (character === '"' || character === "'") {
      const quote = character
      index += 1
      while (index < css.length && css[index] !== quote) {
        if (css[index] === '\\') {
          index += 1
        }
        index += 1
      }
      continue
    }
    if (character === '{') {
      preludes.push({ prelude: css.slice(anchor, index), start: anchor })
      anchor = index + 1
      continue
    }
    if (character === '}' || character === ';') {
      anchor = index + 1
    }
  }
  return preludes
}

const splitTopLevelCommas = (text) => {
  const parts = []
  let depth = 0
  let current = ''
  for (const character of text) {
    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth -= 1
    }
    if (character === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  parts.push(current)
  return parts
}

const countOccurrences = (text, token) => text.split(token).length - 1

const classifyPrelude = (prelude) => {
  let removable = 0
  const reviewSelectors = []
  const selectors = splitTopLevelCommas(prelude).map((selector) => selector.trim())
  for (const selector of selectors) {
    // :where(...) 组内:同组含 morning-paper 即为别名(:where 零特异性,删除不改级联)。
    for (const group of selector.match(/:where\(([^)]*)\)/g) ?? []) {
      const args = group.slice(':where('.length, -1)
      const count = countOccurrences(args, LIGHT)
      if (count === 0) {
        continue
      }
      if (args.includes(MORNING)) {
        removable += count
      } else {
        reviewSelectors.push(selector)
      }
    }
    // :where 之外:同一选择器列表存在 light→morning-paper 替换后的完全对应体即为别名。
    const outside = countOccurrences(selector.replace(/:where\([^)]*\)/g, ''), LIGHT)
    if (outside > 0) {
      const counterpart = selector.replaceAll(LIGHT, MORNING).trim()
      if (selectors.includes(counterpart)) {
        removable += outside
      } else {
        reviewSelectors.push(selector)
      }
    }
  }
  return { removable, reviewSelectors }
}

const scanFile = (path, css) => {
  const stripped = stripComments(css)
  const result = { path, occurrences: countOccurrences(stripped, LIGHT), removable: 0, reviewItems: [] }
  for (const { prelude, start } of collectPreludes(stripped)) {
    if (!prelude.includes(LIGHT)) {
      continue
    }
    const { removable, reviewSelectors } = classifyPrelude(prelude)
    result.removable += removable
    for (const selector of reviewSelectors) {
      result.reviewItems.push({ path, line: stripped.slice(0, start).split('\n').length, selector })
    }
  }
  return result
}

// 删除变换只作用于两种已分类形态;其余形态经由复扫兜底拒绝。
const applyRemoval = (css) => {
  const collapsed = css.replaceAll(`:where(${LIGHT}, `, ':where(')
  return collapsed.split('\n').filter((line) => {
    const trimmed = line.trim()
    return !(trimmed.startsWith(LIGHT) && trimmed.endsWith(',') && !trimmed.slice(0, -1).includes(','))
  }).join('\n')
}

const files = listCssFiles('assets/css')
const results = files.map((path) => scanFile(path, readFileSync(join(root, path), 'utf8')))
const totals = results.reduce((sum, result) => ({
  occurrences: sum.occurrences + result.occurrences,
  removable: sum.removable + result.removable,
  review: sum.review + result.reviewItems.length,
}), { occurrences: 0, removable: 0, review: 0 })

const outDir = join(root, 'test-results', 'wp11-theme-light-scan')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'report.json'), `${JSON.stringify({ totals, files: results }, null, 2)}\n`)

for (const result of results.filter((entry) => entry.occurrences > 0)) {
  console.log(`${result.path}: ${result.occurrences} occurrences, ${result.removable} removable, ${result.reviewItems.length} review`)
}
console.log(`total: ${totals.occurrences} occurrences, ${totals.removable} removable, ${totals.review} review`)

if (totals.review > 0) {
  for (const item of results.flatMap((result) => result.reviewItems)) {
    console.error(`[review] ${item.path}:${item.line} ${item.selector}`)
  }
  console.error('review list is not empty; manual adjudication required before removal')
  process.exit(1)
}

if (apply) {
  const rewrites = []
  for (const path of files) {
    const css = readFileSync(join(root, path), 'utf8')
    if (!css.includes(LIGHT)) {
      continue
    }
    const next = applyRemoval(css)
    const remaining = countOccurrences(stripComments(next), LIGHT)
    if (remaining > 0) {
      console.error(`[apply] ${path}: ${remaining} occurrences survive the transform; aborting without writing`)
      process.exit(1)
    }
    rewrites.push({ path, next, removedLines: css.split('\n').length - next.split('\n').length })
  }
  for (const { path, next, removedLines } of rewrites) {
    writeFileSync(join(root, path), next)
    console.log(`[apply] ${path}: rewritten, ${removedLines} selector lines removed`)
  }
}
