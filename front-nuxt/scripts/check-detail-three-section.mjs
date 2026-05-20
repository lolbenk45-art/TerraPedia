import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const detailPage = readFileSync(resolve(projectRoot, 'pages/items/[id].vue'), 'utf8')
const detailStyles = readFileSync(resolve(projectRoot, 'assets/css/hifi-preview.css'), 'utf8')
const loadedTemplateStart = detailPage.indexOf('<div v-else class="detail-layout">')
const loadedTemplate = loadedTemplateStart > -1 ? detailPage.slice(loadedTemplateStart) : ''

const checks = [
  {
    name: 'uses horizontal stat strip in hero',
    pass: loadedTemplate.includes('class="detail-stat-strip"')
      && !loadedTemplate.includes('v-if="statRows.length" class="detail-stat-strip"')
      && !detailPage.includes('<aside class="detail-side">'),
  },
  {
    name: 'always renders the five required stat slots with fallbacks',
    pass: (detailPage.match(/\{ label: '(?:伤害|击退|速度|暴击|售价)'/g) ?? []).length === 5
      && detailPage.includes("value: row.value || '—'")
      && loadedTemplate.includes('v-for="row in statRows"')
      && loadedTemplate.includes('<b>{{ row.value }}</b> {{ row.label }}'),
  },
  {
    name: 'removes decorative tabs',
    pass: !detailPage.includes('detail-tabs') && !detailPage.includes('detail-tab'),
  },
  {
    name: 'renders usage before recipe',
    pass: loadedTemplate.indexOf('class="detail-section detail-usage"') > 0
      && loadedTemplate.indexOf('class="detail-section detail-recipe"') > loadedTemplate.indexOf('class="detail-section detail-usage"'),
  },
  {
    name: 'renders collapsed extras with source information',
    pass: loadedTemplate.includes('<details class="detail-section detail-extras"')
      && loadedTemplate.includes('<summary>')
      && loadedTemplate.includes('detail-extras-arrow'),
  },
  {
    name: 'extras are closed by default',
    pass: !/<details[^>]+class="detail-section detail-extras"[^>]+\sopen(?:\s|>|=)/.test(loadedTemplate),
  },
  {
    name: 'keeps source rows inside details only',
    pass: loadedTemplate.indexOf('v-for="source in sourceEntries"') > loadedTemplate.indexOf('<details class="detail-section detail-extras"'),
  },
  {
    name: 'keeps recipe station inline',
    pass: detailPage.includes('class="recipe-station-inline"') && !detailPage.includes('制作站未标记</span>'),
  },
  {
    name: 'defines phase 2 detail styles',
    pass: detailStyles.includes('.detail-stat-strip') && detailStyles.includes('.detail-section') && detailStyles.includes('.detail-extras'),
  },
  {
    name: 'uses stable preferred stat strip fields',
    pass: detailPage.includes("label: '速度'")
      && detailPage.includes("label: '暴击'")
      && detailPage.includes("label: '售价'")
      && !detailPage.includes("detailUsageItem.value?.crit, 4")
      && !detailPage.includes('primaryStatRows = computed(() => statRows.value.slice(0, 5))'),
  },
  {
    name: 'prevents desktop stat strip scrolling',
    pass: !/\.detail-stat-strip\s*{[^}]*overflow-x:\s*auto/s.test(detailStyles),
  },
  {
    name: 'keeps recipe row compact',
    pass: detailPage.includes('visibleRecipeMaterialLimit = 5')
      && detailPage.includes('hiddenMaterialCount')
      && !detailPage.includes('directMaterials.slice(0, 6)'),
  },
  {
    name: 'allows long recipe rows to wrap instead of overflow',
    pass: /\.recipe-tree\s*{[^}]*flex-wrap:\s*wrap/s.test(detailStyles)
      && /\.recipe-station-inline\s*{[^}]*min-width:\s*0/s.test(detailStyles)
      && detailStyles.includes('text-overflow: ellipsis'),
  },
  {
    name: 'recipe variant switch has behavior',
    pass: detailPage.includes('showNextRecipeVariant')
      && detailPage.includes('@click="showNextRecipeVariant"'),
  },
  {
    name: 'details summary has arrow and reveal animation',
    pass: detailPage.includes('detail-extras-arrow')
      && detailStyles.includes('@keyframes detailExtrasReveal')
      && !detailStyles.includes('.detail-extras:not([open]) .detail-extras-body'),
  },
  {
    name: 'does not render empty companion links',
    pass: !detailPage.includes(':href="companion.href ||')
      && !detailPage.includes(':to="companion.href || \'#\'"')
      && !detailPage.includes(':to="companion.href || \\"#\\""'),
  },
  {
    name: 'hero icon remains large',
    pass: /\.detail-icon-stage\s+\.item-art\s*{\s*width:\s*1(?:5|6)\dpx;\s*height:\s*1(?:5|6)\dpx;/s.test(detailStyles),
  },
  {
    name: 'live stat strip is not skeleton styled',
    pass: !/\.detail-loading-row-value,\s*\n\.detail-stat-strip span/s.test(detailStyles)
      && detailStyles.includes('.detail-loading-skeleton .detail-stat-strip span'),
  },
  {
    name: 'hero image falls back to relation images',
    pass: detailPage.includes('primaryImageEntry')
      && detailPage.includes('primaryImageEntry.value?.previewImageUrl')
      && detailPage.includes('rawBundle.value.recipeTree?.item?.image'),
  },
  {
    name: 'package script exposes the detail section check',
    pass: readFileSync(resolve(projectRoot, 'package.json'), 'utf8').includes('"check:detail-three-section": "node scripts/check-detail-three-section.mjs"'),
  },
]

const failures = checks.filter((check) => !check.pass)

if (failures.length) {
  console.error('Detail three-section checks failed:')
  for (const failure of failures) {
    console.error(`- ${failure.name}`)
  }
  process.exit(1)
}

console.log(`Detail three-section checks passed (${checks.length}/${checks.length}).`)
