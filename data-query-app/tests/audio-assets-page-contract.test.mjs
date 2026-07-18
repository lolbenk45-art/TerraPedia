import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

const page = read('pages/operations/audio-assets.vue')
const useApi = read('composables/useApi.ts')

function extractAudioTags(source) {
  return source.match(/<audio\b[\s\S]*?(?:\/>|<\/audio>)/g) || []
}

function functionBody(name) {
  const start = page.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `missing function ${name}`)
  const bodyStart = page.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < page.length; index += 1) {
    const char = page[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return page.slice(bodyStart + 1, index)
    }
  }
  throw new Error(`unterminated function ${name}`)
}

test('audio assets page exposes a current-player workbench instead of row audio controls', () => {
  assert.match(page, /class="page-wrap page-workspace audio-assets-admin"/)
  assert.match(page, /<th[^>]*class="playback-column-header"[^>]*>播放<\/th>/)
  assert.match(page, /class="playback-cell"/)
  assert.match(page, /@click="loadAudio\(row\)"/)
  assert.match(page, /audio-player-panel/)
  assert.match(page, /audio-player-panel--empty/)
  assert.match(page, /aria-labelledby="audio-player-title"/)
  assert.match(page, /selectedAudioRow/)
  assert.match(page, /selectedAudioBlobUrl/)
  assert.match(page, /<audio[\s\S]*controls[\s\S]*:src="selectedAudioBlobUrl"/)
  assert.match(page, /audio-asset-row--selected/)
  assert.match(page, /playback-state-button/)
  assert.match(page, /:aria-label="`加载音频/)
  assert.match(page, /:aria-busy="audioLoadingRows\[row\.id\]/)
  assert.match(page, /audioPlaybackErrors\[row\.id\]/)
  assert.match(page, /audio-asset-table\s*\{[\s\S]*min-width:\s*1320px/)

  const audioOpenTags = page.match(/<audio\b/g) || []
  assert.equal(audioOpenTags.length, 1)

  const audioTags = extractAudioTags(page)
  assert.equal(audioTags.length, 1)
  assert.match(audioTags[0], /\s:src="selectedAudioBlobUrl"/)
  assert.doesNotMatch(audioTags[0], /\ssrc=/)
  assert.doesNotMatch(audioTags[0], /v-for|row\.|\/api\/admin\/audio-assets|\/admin\/audio-assets|getAudioStreamUrl|localPath|sourceUrl|wikiFileUrl/)
})

test('audio assets page uses entity-style profile layout for the selected asset', () => {
  assert.match(page, /class="[^"]*\baudio-profile\b[^"]*\baudio-profile--active\b[^"]*"/)
  assert.match(page, /class="audio-profile__hero"/)
  assert.match(page, /class="audio-profile__media"/)
  assert.match(page, /class="audio-profile__body"/)
  assert.match(page, /class="preview-pills"/)
  assert.match(page, /<span class="preview-pill preview-pill--accent">音频档案<\/span>/)
  assert.doesNotMatch(page, /<span class="preview-pill preview-pill--accent">AUDIO PROFILE<\/span>/)
  assert.match(page, /class="audio-profile__fact-grid"/)
  assert.match(page, /class="audio-profile__fact-card"/)
  assert.match(page, /class="preview-stats"/)
  assert.match(page, /class="preview-stat"/)
  assert.match(page, /class="audio-profile__player"/)
  assert.match(page, /class="audio-profile__path"/)
  assert.match(page, /class="cell-primary"/)
  assert.match(page, /\.audio-profile\s*\{/)
  assert.match(page, /\.audio-profile__player\s*\{/)
  assert.match(page, /\.preview-pills\s*\{/)
  assert.match(page, /\.preview-pill--accent\s*\{/)
  assert.match(page, /\.cell-primary\s*\{/)
  assert.doesNotMatch(page, /CURRENT AUDIO|audio-player-pills|audio-player-meta|audio-player-path/)
})

test('audio assets table reuses the NPC entity table visual pattern', () => {
  assert.match(page, /<table class="data-table audio-asset-table">/)
  assert.match(page, /class="cell-primary"/)
  assert.match(page, /class="cell-badges"/)
  assert.match(page, /class="cell-badge cell-badge--accent"/)
  assert.match(page, /class="cell-primary__atomic"/)
  assert.match(page, /displayNameZh/)
  assert.match(page, /audioDisplayTitle\(row\)/)
  assert.match(page, /audioDisplaySubtitle\(row\)/)
  assert.match(functionBody('audioDisplayTitle'), /cleanText\(row\.displayNameZh\)[\s\S]*cleanText\(row\.displayNameEn\)[\s\S]*cleanText\(row\.fileTitle\)[\s\S]*cleanText\(row\.assetId\)/)
  assert.match(functionBody('audioDisplaySubtitle'), /cleanText\(row\.displayNameZh\)[\s\S]*cleanText\(row\.displayNameEn\)[\s\S]*return cleanText\(row\.displayNameEn\)/)
  assert.match(page, /\.table-scroll\s*\{[\s\S]*border:\s*1px solid var\(--color-border\)[\s\S]*border-radius:\s*calc\(var\(--radius-lg\) - 2px\)/)
  assert.match(page, /\.data-table\s*\{[\s\S]*border-collapse:\s*collapse/)
  assert.match(page, /\.data-table\s+th,\s*\n\.data-table\s+td\s*\{[\s\S]*vertical-align:\s*middle/)
  assert.match(page, /\.cell-badges\s*\{[\s\S]*display:\s*flex[\s\S]*flex-wrap:\s*wrap/)
  assert.doesNotMatch(page, /audio-asset-table--grid|<colgroup>|audio-col-|border-right:/)
})

test('audio assets page reuses the shared token cookie and API URL resolver for stream fetches', () => {
  assert.match(useApi, /export\s+const\s+TOKEN_COOKIE_KEY\s*=\s*['"]tp_admin_token['"]/)
  assert.match(page, /import\s+\{[^}]*\bTOKEN_COOKIE_KEY\b[^}]*\bresolveApiUrl\b[^}]*\}\s+from\s+['"]~\/composables\/useApi['"]|import\s+\{[^}]*\bresolveApiUrl\b[^}]*\bTOKEN_COOKIE_KEY\b[^}]*\}\s+from\s+['"]~\/composables\/useApi['"]/)
  assert.doesNotMatch(page, /useRuntimeConfig\(\)|runtimeConfig\.public\.apiBase/)
  assert.doesNotMatch(page, /function\s+joinApiUrl\(|\bjoinApiUrl\(/)
  assert.match(page, /function\s+getAudioStreamUrl\(row:\s*AudioAssetRow\)/)
  assert.match(page, /return\s+resolveApiUrl\(`\/admin\/audio-assets\/\$\{row\.id\}\/stream`\)/)
  assert.match(page, /fetch\(getAudioStreamUrl\(row\),\s*\{[\s\S]*signal:\s*controller\.signal[\s\S]*headers:\s*\{[\s\S]*Authorization:\s*`Bearer \$\{token\.value\}`/)
  assert.match(page, /const\s+token\s*=\s*useCookie<string \| null>\(TOKEN_COOKIE_KEY\)/)
  assert.doesNotMatch(page, /['"]tp_admin_token['"]/)
  assert.match(page, /URL\.createObjectURL\(blob\)/)
  assert.match(page, /audioBlobUrls\[row\.id\]\s*=\s*blobUrl/)
  assert.match(page, /selectedAudioRowId\.value\s*=\s*row\.id/)
  assert.match(page, /handleApiError\(\{\s*statusCode:\s*401,\s*response\s*\}\)/)

  const loadBody = functionBody('loadAudio')
  assert(loadBody.indexOf('fetch(getAudioStreamUrl(row)') < loadBody.indexOf('const blob = await response.blob()'))
  assert(loadBody.indexOf('const blobUrl = URL.createObjectURL(blob)') < loadBody.indexOf('if (controller.signal.aborted || generation !== audioRequestGeneration)'))
  assert(loadBody.indexOf('if (controller.signal.aborted || generation !== audioRequestGeneration)') < loadBody.indexOf('audioBlobUrls[row.id] = blobUrl'))
  assert(loadBody.indexOf('audioBlobUrls[row.id] = blobUrl') < loadBody.indexOf('selectedAudioRowId.value = row.id'))
  assert(loadBody.indexOf('if (!response.ok)') < loadBody.indexOf('const blob = await response.blob()'))
  assert(loadBody.indexOf('selectedAudioRowId.value = row.id') > loadBody.indexOf('if (controller.signal.aborted || generation !== audioRequestGeneration)'))
})

test('audio asset match status helpers use exact delimited tokens with unmatched precedence', () => {
  const toneBody = functionBody('matchStatusTone')
  const labelBody = functionBody('matchStatusLabel')
  const tone = new Function('status', toneBody)
  const label = new Function('status', labelBody)

  assert.doesNotMatch(toneBody, /\.includes\(/)
  assert.doesNotMatch(labelBody, /\.includes\(/)
  assert.match(toneBody, /const\s+normalized\s*=\s*String\(status \|\| ''\)\.toLowerCase\(\)/)
  assert.match(labelBody, /const\s+normalized\s*=\s*String\(status \|\| ''\)\.toLowerCase\(\)/)
  assert.ok(toneBody.includes('new Set(normalized.split(/[\\s,|/]+/).filter(Boolean))'))
  assert.ok(labelBody.includes('new Set(normalized.split(/[\\s,|/]+/).filter(Boolean))'))

  assert.equal(tone('matched'), 'success')
  assert.equal(label('matched'), '已匹配 matched')
  assert.equal(tone('unmatched'), 'warning')
  assert.equal(label('unmatched'), '未匹配 unmatched')
  assert.equal(tone('matched / downloaded|active,ready'), 'success')
  assert.equal(label('matched / downloaded|active,ready'), '已匹配 matched')
  assert.equal(tone('matched|unmatched'), 'warning')
  assert.equal(label('matched|unmatched'), '未匹配 unmatched')

  for (const status of ['notmatched', 'matched_extra', 'almost-unmatched']) {
    assert.equal(tone(status), 'muted')
    assert.equal(label(status), status)
  }
})

test('audio assets page cleans up playback state before refresh and on unmount', () => {
  const fetchRowsBody = functionBody('fetchRows')
  const resetBody = functionBody('resetAudioPlaybackState')

  assert.match(page, /function\s+revokeAudioBlobUrl\(rowId:\s*number\)/)
  assert.match(page, /URL\.revokeObjectURL\(existingUrl\)/)
  assert.match(page, /function\s+resetAudioPlaybackState\(\)/)
  assert.match(resetBody, /audioAbortControllers\.forEach\(\(controller\)\s*=>\s*\{[\s\S]*controller\.abort\(\)/)
  assert.match(resetBody, /audioAbortControllers\.clear\(\)/)
  assert.match(resetBody, /selectedAudioRowId\.value\s*=\s*null/)
  assert.match(resetBody, /audioRequestGeneration\s*\+=\s*1/)
  assert.match(resetBody, /Object\.keys\(audioBlobUrls\)\.forEach[\s\S]*URL\.revokeObjectURL\(existingUrl\)[\s\S]*delete audioBlobUrls/)
  assert.match(resetBody, /Object\.keys\(audioPlaybackErrors\)\.forEach/)
  assert.match(resetBody, /Object\.keys\(audioLoadingRows\)\.forEach/)
  assert(fetchRowsBody.indexOf('resetAudioPlaybackState()') < fetchRowsBody.indexOf("get<AudioAssetListResponse>('/admin/audio-assets'"))
  assert.match(page, /async function goPage\(page:\s*number\)\s*\{[\s\S]*fetchRows\(Math\.max\(1,\s*page\)\)/)
  assert.match(page, /async function refreshAll\(\)\s*\{[\s\S]*fetchRows\(pagination\.page\)/)
  assert.match(page, /onBeforeUnmount\(\(\)\s*=>\s*\{[\s\S]*resetAudioPlaybackState\(\)/)
})

test('audio assets page guards late playback responses after refresh or unmount', () => {
  assert.match(page, /let\s+audioRequestGeneration\s*=\s*0/)
  assert.match(page, /const\s+generation\s*=\s*audioRequestGeneration/)
  assert.match(page, /audioRequestGeneration\s*\+=\s*1/)
  assert.match(page, /if\s*\(controller\.signal\.aborted\s*\|\|\s*generation\s*!==\s*audioRequestGeneration\)\s*\{[\s\S]*URL\.revokeObjectURL\(blobUrl\)/)
})

test('audio assets page exposes audit filters and status-oriented table polish', () => {
  assert.match(page, /class="filter-toolbar"/)
  assert.match(page, /class="filter-chip-list"/)
  assert.match(page, /function\s+applyQuickFilter\(key:\s*string\)/)
  assert.match(page, /filters\.matchStatus\s*=\s*'unmatched'/)
  assert.match(page, /function\s+removeFilterChip\(key:\s*string\)/)
  assert.match(page, /class="status-badge/)
  assert.match(page, /class="path-token"/)
  assert.match(page, /class="wiki-link-group"/)
  assert.match(page, /statusTone\(/)
  assert.match(page, />已下载 downloaded</)
  assert.match(page, />未匹配 unmatched</)
  assert.match(page, /return '已下载 downloaded'/)
  assert.match(page, /return '未匹配 unmatched'/)
  assert.match(page, /rowPlaybackStateLabel\(/)
})

test('audio assets page locks responsive sizing and accessibility-critical styles', () => {
  assert.match(page, /@media\s*\(max-width:\s*760px\)/)
  assert.match(page, /\.audio-player-panel\s+audio\s*\{[\s\S]*width:\s*100%[\s\S]*min-height:\s*40px/)
  assert.match(page, /\.playback-state-button\s*\{[\s\S]*min-height:\s*44px/)
  assert.match(page, /\.filter-chip-list\s*\{[\s\S]*display:\s*flex[\s\S]*flex-wrap:\s*wrap[\s\S]*min-width:\s*0/)
  assert.match(page, /\.filter-chip[\s\S]*overflow-wrap:\s*anywhere/)
  assert.match(page, /\.data-table\s+th\s*\{[\s\S]*white-space:\s*nowrap/)
  assert.doesNotMatch(page, /\.audio-asset-table\s+th\s*\{/)
  assert.match(page, /\.table-scroll\s*\{[\s\S]*overflow-x:\s*auto/)
})

test('audio assets page stays read-only and does not expose absolute local paths', () => {
  assert.match(page, /import\s+\{[^}]*\bget\b[^}]*\bhandleApiError\b[^}]*\bresolveApiUrl\b[^}]*\bTOKEN_COOKIE_KEY\b[^}]*\}\s+from '~\/composables\/useApi'/)
  assert.doesNotMatch(page, /\b(post|put|patch|del)\s*\(/)
  assert.doesNotMatch(page, /\$fetch\s*\([^)]*method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/)
  assert.doesNotMatch(page, /fetch\([^)]*\{[\s\S]*method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/)
  assert.doesNotMatch(page, /<form[^>]*method=/)
  assert.doesNotMatch(page, /absolute(Local)?Path|absolute_local_path|localAbsolutePath/)
  assert.doesNotMatch(page, /\/home\/|\/Users\/|[A-Za-z]:\\\\|\\\\\\\\/)
  assert.match(page, /本地相对路径/)
  assert.doesNotMatch(page, /当前只展示元数据，不提供播放/)
})
