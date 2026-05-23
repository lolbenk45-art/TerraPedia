import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

const files = [
  'pages/crafting/index.vue',
  'components/crafting/RecipeTreeNode.vue',
]

const violations = []

for (const path of files) {
  const source = read(path)

  if (!source.includes('recipeSummaryParts')) {
    violations.push(`${path}: alternative recipe labels must compose material/station/output differences together`)
  }

  if (!/recipeSummaryParts[\s\S]*\.filter\(Boolean\)[\s\S]*\.join\('；'\)/.test(source)) {
    violations.push(`${path}: alternative recipe labels must join available difference fields instead of choosing the first one`)
  }

  if (/recipe(?:Alternative|Difference)Summary\s*=\s*\([^)]*\)\s*=>\s*displayText\(/.test(source)) {
    violations.push(`${path}: alternative recipe summary must not use displayText(...) because it hides station/output differences when materials exist`)
  }
}

if (violations.length > 0) {
  console.error(`Crafting alternative summary contract failed:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Crafting alternative summary contract passed.')
