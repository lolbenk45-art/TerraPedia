import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const homePage = readFileSync(resolve(projectRoot, 'pages/index.vue'), 'utf8')
const homeData = readFileSync(resolve(projectRoot, 'composables/useHomeData.ts'), 'utf8')
const globalSearchShortcut = readFileSync(resolve(projectRoot, 'composables/useGlobalSearchShortcut.ts'), 'utf8')
const app = readFileSync(resolve(projectRoot, 'app.vue'), 'utf8')
const styles = readFileSync(resolve(projectRoot, 'assets/css/hifi-preview.css'), 'utf8')
const packageJson = readFileSync(resolve(projectRoot, 'package.json'), 'utf8')

const checks = [
  {
    name: 'removes old narrative homepage components',
    pass: !homePage.includes('<HomeHero')
      && !homePage.includes('<HomeExplorationMap')
      && !homePage.includes('<HomeFeaturedRoute')
      && !homePage.includes('<HomeBossProgression')
      && !homePage.includes('<HomeCodexBand')
      && !homePage.includes('home-lower'),
  },
  {
    name: 'renders compact search hero',
    pass: homePage.includes('class="home-tool-hero"')
      && homePage.includes('class="home-tool-search"')
      && homePage.includes('type="search"')
      && homePage.includes('placeholder="搜索物品、Boss、NPC、配方..."')
      && homePage.includes('⌘K / Ctrl K'),
  },
  {
    name: 'implements global cmd ctrl k focus safely',
    pass: app.includes('useGlobalSearchShortcut()')
      && globalSearchShortcut.includes("event.key.toLowerCase() !== 'k'")
      && globalSearchShortcut.includes('event.metaKey || event.ctrlKey')
      && globalSearchShortcut.includes("document.querySelector<HTMLInputElement>(globalSearchInputSelector)")
      && globalSearchShortcut.includes("await navigateTo('/search')")
      && globalSearchShortcut.includes("window.addEventListener('keydown', focusSearchFromShortcut)")
      && globalSearchShortcut.includes("window.removeEventListener('keydown', focusSearchFromShortcut)"),
  },
  {
    name: 'renders five search suggestions',
    pass: homePage.includes('homeSearchSuggestions')
      && homePage.includes('fetchPublicItemSuggestions')
      && homePage.includes('home-suggestion-list')
      && homePage.includes('.slice(0, 5)')
      && homePage.includes('v-for="suggestion in homeSearchSuggestions"'),
  },
  {
    name: 'renders six quick entries in a strip',
    pass: homePage.includes('class="home-quick-entry"')
      && homePage.includes('v-for="entry in quickEntries"')
      && homeData.includes("label: '物品'")
      && homeData.includes("label: 'Boss'")
      && homeData.includes("label: 'NPC'")
      && homeData.includes("label: 'Buff'")
      && homeData.includes("label: '配方'")
      && homeData.includes("label: '文章'"),
  },
  {
    name: 'renders three dense content columns with fallback rows',
    pass: homePage.includes('class="home-tool-columns"')
      && homePage.includes('recentUpdates')
      && homePage.includes('hotSearches')
      && homePage.includes('starterGuides')
      && (homeData.match(/recentUpdates: \[/g) ?? []).length === 1
      && (homeData.match(/hotSearches: \[/g) ?? []).length === 1
      && (homeData.match(/starterGuides: \[/g) ?? []).length === 1
      && (homeData.match(/title: '/g) ?? []).length >= 15,
  },
  {
    name: 'homepage css defines phase 3 layout and responsive behavior',
    pass: styles.includes('.home-tool-hero')
      && styles.includes('min-height: 260px')
      && styles.includes('.home-quick-entry')
      && styles.includes('grid-template-columns: repeat(6, minmax(0, 1fr))')
      && styles.includes('.home-tool-columns')
      && styles.includes('grid-template-columns: repeat(3, minmax(0, 1fr))')
      && styles.includes('@media (max-width: 720px)')
      && styles.includes('.home-tool-columns')
      && styles.includes('grid-template-columns: 1fr'),
  },
  {
    name: 'caps homepage height and repeated item total usage',
    pass: styles.includes('.home-main {')
      && styles.includes('min-height: calc(100dvh - 70px)')
      && (homePage.match(/itemTotalLabel/g) ?? []).length <= 2,
  },
  {
    name: 'package script exposes the phase 3 check',
    pass: packageJson.includes('"check:home-tool-portal": "node scripts/check-home-tool-portal.mjs"'),
  },
]

const failures = checks.filter((check) => !check.pass)

if (failures.length) {
  console.error('Home tool portal checks failed:')
  for (const failure of failures) {
    console.error(`- ${failure.name}`)
  }
  process.exit(1)
}

console.log(`Home tool portal checks passed (${checks.length}/${checks.length}).`)
