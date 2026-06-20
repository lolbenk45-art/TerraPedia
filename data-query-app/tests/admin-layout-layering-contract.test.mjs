import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

const variables = read('assets/css/variables.css')
const layout = read('layouts/default.vue')
const lookupInput = read('components/AdminItemLookupInput.vue')
const articleEditorWorkspace = read('components/article/ArticleEditorWorkspace.vue')
const articleReviewWorkspace = read('components/article/ArticleReviewWorkspace.vue')
const appModal = read('components/AppModal.vue')
const appToast = read('components/AppToast.vue')
const armorAttributesPage = read('pages/operations/armor-attributes.vue')
const crawlerMonitorPage = read('pages/operations/crawler-monitor.vue')

test('admin shell owns the shared z-index scale', () => {
  assert.match(variables, /--z-page-popover:\s*70;/)
  assert.match(variables, /--z-header:\s*90;/)
  assert.match(variables, /--z-mobile-scrim:\s*110;/)
  assert.match(variables, /--z-sidebar:\s*120;/)
  assert.match(variables, /--z-modal:\s*2000;/)
  assert.match(variables, /--z-toast:\s*3000;/)
  assert.match(variables, /--admin-sticky-top:\s*calc\(var\(--header-height\) \+ 12px\);/)

  assert.match(layout, /\.sidebar\s*\{[\s\S]*z-index:\s*var\(--z-sidebar\)/)
  assert.match(layout, /\.header\s*\{[\s\S]*z-index:\s*var\(--z-header\)/)
  assert.match(layout, /\.overlay\s*\{[\s\S]*z-index:\s*var\(--z-mobile-scrim\)/)
})

test('ordinary teleported lookup menus stay below admin navigation', () => {
  assert.match(lookupInput, /\.lookup__menu\s*\{[\s\S]*z-index:\s*var\(--z-page-popover\)/)
  assert.doesNotMatch(lookupInput, /\.lookup__menu\s*\{[\s\S]*z-index:\s*1200/)
})

test('article editor sticky workspace stops below the global header', () => {
  assert.match(articleEditorWorkspace, /\.editor-workbar\s*\{[\s\S]*top:\s*var\(--admin-sticky-top\)/)
  assert.match(articleEditorWorkspace, /\.editor-workbar\s*\{[\s\S]*z-index:\s*var\(--z-page-sticky\)/)
  assert.match(articleEditorWorkspace, /\.inspector-panel\s*\{[\s\S]*top:\s*calc\(var\(--admin-sticky-top\) \+ 74px\)/)

  assert.match(articleReviewWorkspace, /\.review-workbar\s*\{[\s\S]*top:\s*var\(--admin-sticky-top\)/)
  assert.match(articleReviewWorkspace, /\.review-workbar\s*\{[\s\S]*z-index:\s*var\(--z-page-sticky\)/)
  assert.match(articleReviewWorkspace, /\.review-panel\s*\{[\s\S]*top:\s*calc\(var\(--admin-sticky-top\) \+ 74px\)/)
})

test('intentional global overlays remain above the admin shell', () => {
  assert.match(appModal, /\.app-modal-backdrop\s*\{[\s\S]*z-index:\s*var\(--z-modal\)/)
  assert.match(appToast, /\.app-toast\s*\{[\s\S]*z-index:\s*var\(--z-toast\)/)
})

test('page-owned fixed drawers stay below admin navigation and reserve shell space', () => {
  assert.match(armorAttributesPage, /\.detail-drawer\s*\{[\s\S]*inset:\s*var\(--header-height\) 0 0 var\(--sidebar-width\)/)
  assert.match(armorAttributesPage, /\.detail-drawer\s*\{[\s\S]*z-index:\s*var\(--z-page-popover\)/)
  assert.doesNotMatch(armorAttributesPage, /\.detail-drawer\s*\{[\s\S]*inset:\s*0;[\s\S]*z-index:\s*60/)

  assert.match(crawlerMonitorPage, /\.report-preview-shell\s*\{[\s\S]*inset:\s*var\(--header-height\) 0 0 var\(--sidebar-width\)/)
  assert.match(crawlerMonitorPage, /\.report-preview-shell\s*\{[\s\S]*z-index:\s*var\(--z-page-popover\)/)
  assert.doesNotMatch(crawlerMonitorPage, /\.report-preview-shell\s*\{[\s\S]*inset:\s*0;[\s\S]*z-index:\s*80/)
})

test('active sidebar navigation scrolls the selected menu item into view', () => {
  assert.match(layout, /ref="sidebarNavRef"/)
  assert.match(layout, /:ref="\(\(el\) => setMenuLinkRef\(item\.path, el\)\)"/)
  assert.match(layout, /function findActiveMenuEntry\(\)/)
  assert.match(layout, /function revealActiveMenuItem\(\)/)
  assert.match(layout, /next\.delete\(activeEntry\.section\.label\)/)
  assert.match(layout, /function scrollSidebarLinkIntoView\(activeLink: HTMLElement\)/)
  assert.match(layout, /sidebarNav\.scrollTop = nextScrollTop/)
  assert.doesNotMatch(layout, /behavior:\s*'smooth'/)
  assert.doesNotMatch(layout, /scrollIntoView\(/)
  assert.match(layout, /watch\(\s*\(\) => route\.fullPath,[\s\S]*revealActiveMenuItem\(\)/)
})
