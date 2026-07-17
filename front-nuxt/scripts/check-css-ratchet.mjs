// CSS 补丁层行数棘轮:只减不增。
// 背景:设计系统分层(tokens/primitives/domains)骨架已立,但新业务样式
// 仍默认流入 hifi-preview.css 单体(R2 审查:一周 +199 行)。此断言把
// 2026-07-17 的 wc -l 实测行数固化为预算上限——新样式请写入 domains/ 层;
// 文件减肥后请把预算同步下调,让棘轮持续收紧。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const BUDGETS = {
  'assets/css/hifi-preview.css': 10282,
  'assets/css/catalog-image-fixes.css': 1878,
  'assets/css/light-theme-contrast-fixes.css': 910,
  'assets/css/mobile-typography-fixes.css': 616,
  'assets/css/discovery-page-fixes.css': 482,
}

let failed = false
for (const [file, budget] of Object.entries(BUDGETS)) {
  const content = readFileSync(join(root, file), 'utf8')
  // 统计换行数:尾换行文件下与 wc -l 一致(split('\n').length 会多 1)
  const lines = content.split('\n').length - (content.endsWith('\n') ? 1 : 0)
  if (lines > budget) {
    console.error(`[css-ratchet] ${file}: ${lines} 行 > 预算 ${budget}。新样式请写入 domains/ 层,或先偿还等量旧行。`)
    failed = true
  } else if (lines < budget) {
    console.log(`[css-ratchet] ${file}: ${lines}/${budget} — 可下调预算`)
  }
}

if (failed) {
  process.exit(1)
}
console.log('CSS patch-layer ratchet passed.')
