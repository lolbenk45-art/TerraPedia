import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const repoRoot = path.resolve(import.meta.dirname, '..')

function makeFakeRef(initialValue) {
  return { value: initialValue }
}

// The store runs inside a vm realm, so arrays it creates have a different Array
// prototype than this module's literals. Copy through the realm boundary before
// deep-equal so we compare values, not cross-realm identity.
function labels(store) {
  return [...store.collapsedSectionLabels.value]
}

function loadUiPreferencesStore() {
  const source = fs.readFileSync(path.join(repoRoot, 'stores/uiPreferences.ts'), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const module = { exports: {} }
  const sandbox = {
    module,
    exports: module.exports,
    console,
    ref: (value) => makeFakeRef(value),
    require: (id) => {
      if (id === 'pinia') {
        return { defineStore: (_id, setup) => () => setup() }
      }
      throw new Error(`Unexpected module ${id}`)
    },
  }

  vm.runInNewContext(code, sandbox, { filename: 'stores/uiPreferences.ts' })
  return module.exports.useUiPreferencesStore
}

test('persist config uses paths (3.x plugin) not pick', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'stores/uiPreferences.ts'), 'utf8')
  assert.match(source, /persist:\s*\{[\s\S]*paths:\s*\[/)
  assert.doesNotMatch(source, /pick:/)
})

test('applySectionDefaults seeds collapsed labels once and is idempotent', () => {
  const store = loadUiPreferencesStore()()

  assert.deepEqual(labels(store), [])
  assert.equal(store.sectionDefaultsApplied.value, false)

  store.applySectionDefaults(['数据运维', '资产工具'])
  assert.deepEqual(labels(store), ['数据运维', '资产工具'])
  assert.equal(store.sectionDefaultsApplied.value, true)

  // Second call must be a no-op even with different defaults (user prefs win).
  store.toggleSection('数据运维')
  store.applySectionDefaults(['内容运营'])
  assert.deepEqual(labels(store), ['资产工具'])
})

test('toggleSection adds and removes symmetrically', () => {
  const store = loadUiPreferencesStore()()

  assert.equal(store.isSectionCollapsed('数据运维'), false)
  store.toggleSection('数据运维')
  assert.equal(store.isSectionCollapsed('数据运维'), true)
  assert.deepEqual(labels(store), ['数据运维'])
  store.toggleSection('数据运维')
  assert.equal(store.isSectionCollapsed('数据运维'), false)
  assert.deepEqual(labels(store), [])
})

test('expandSection removes a collapsed label and no-ops when already expanded', () => {
  const store = loadUiPreferencesStore()()

  store.applySectionDefaults(['数据运维'])
  store.expandSection('数据运维')
  assert.equal(store.isSectionCollapsed('数据运维'), false)

  // No-op path: expanding an already-expanded section keeps state stable.
  store.expandSection('资产工具')
  assert.deepEqual(labels(store), [])
})

test('setDesktopCollapsed toggles the sidebar collapse flag', () => {
  const store = loadUiPreferencesStore()()

  assert.equal(store.desktopSidebarCollapsed.value, false)
  store.setDesktopCollapsed(true)
  assert.equal(store.desktopSidebarCollapsed.value, true)
  store.setDesktopCollapsed(false)
  assert.equal(store.desktopSidebarCollapsed.value, false)
})
