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

test('persist config uses pick (persistedstate 4.x) not paths', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'stores/uiPreferences.ts'), 'utf8')
  assert.match(source, /persist:\s*\{[\s\S]*pick:\s*\[/)
  assert.doesNotMatch(source, /paths:/)
  assert.match(source, /pick:\s*\['desktopSidebarCollapsed'\]/)
  assert.doesNotMatch(source, /pick:\s*\[[^\]]*collapsedSectionLabels/)
})

test('initializeSections opens only the active section and replaces stale state', () => {
  const store = loadUiPreferencesStore()()

  assert.deepEqual(labels(store), [])

  store.initializeSections(['资料目录', '制作管理', '内容运营'], '资料目录')
  assert.deepEqual(labels(store), ['制作管理', '内容运营'])

  store.toggleSection('制作管理')
  assert.deepEqual(labels(store), ['内容运营'])

  store.initializeSections(['资料目录', '制作管理', '内容运营'], '内容运营')
  assert.deepEqual(labels(store), ['资料目录', '制作管理'])
})

test('initializeSections collapses every section when the route has no menu owner', () => {
  const store = loadUiPreferencesStore()()

  store.initializeSections(['资料目录', '制作管理'], null)
  assert.deepEqual(labels(store), ['资料目录', '制作管理'])
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

test('setDesktopCollapsed toggles the sidebar collapse flag', () => {
  const store = loadUiPreferencesStore()()

  assert.equal(store.desktopSidebarCollapsed.value, false)
  store.setDesktopCollapsed(true)
  assert.equal(store.desktopSidebarCollapsed.value, true)
  store.setDesktopCollapsed(false)
  assert.equal(store.desktopSidebarCollapsed.value, false)
})
