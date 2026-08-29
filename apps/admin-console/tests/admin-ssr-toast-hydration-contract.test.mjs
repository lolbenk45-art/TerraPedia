import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('server-side toast notifications are ignored without mutating client toast state', () => {
  const source = read('apps/admin-console/composables/useToast.ts')

  assert.match(source, /type Toast = \{ message: string; type: ToastType \}/)
  assert.match(source, /const toast = ref<Toast \| null>\(null\)/)
  assert.match(source, /export function showToast[\s\S]*?if \(import\.meta\.server\) return[\s\S]*?toast\.value = \{ message, type \}/)
  assert.match(source, /export function dismissToast[\s\S]*?if \(import\.meta\.server\) return[\s\S]*?toast\.value = null/)
})

test('generic entity list loading does not call the API during SSR', () => {
  const source = read('apps/admin-console/pages/entities/[type].vue')
  const watcherStart = source.indexOf('watch(() => entityType.value')
  const watcherEnd = source.indexOf('function getDisplayValue', watcherStart)

  assert.ok(watcherStart >= 0, 'entity type watcher must exist')
  assert.ok(watcherEnd > watcherStart, 'entity type watcher must have a bounded body')

  const watcher = source.slice(watcherStart, watcherEnd)
  const mountGuardIndex = watcher.indexOf('if (import.meta.server || !entityPageMounted.value) return')
  assert.ok(mountGuardIndex >= 0, 'entity type watcher must defer data loading until mount')
  assert.match(source, /const entityPageMounted = ref\(false\)/)
  assert.match(source, /onMounted\(async \(\) => \{[\s\S]*?entityPageMounted\.value = true[\s\S]*?loadCurrentEntityData\(\)[\s\S]*?\}\)/)
})
