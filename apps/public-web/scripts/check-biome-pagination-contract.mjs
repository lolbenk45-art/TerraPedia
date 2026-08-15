// WP-13: packer unit tests + long-page governance source markers.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = (path) => join(root, path)
const failures = []

const requireIncludes = (path, content, marker, message) => {
  if (!content.includes(marker)) {
    failures.push(`${path}: ${message} [missing ${JSON.stringify(marker)}]`)
  }
}

// Run packer tests in a child with --experimental-strip-types so .ts util loads.
const packerProbe = `
import {
  packBiomePages,
  clampBiomePage,
  groupBiomesByParent,
  BIOME_PAGE_ITEM_BUDGET,
} from ${JSON.stringify(pathToFileURL(file('utils/biomeGroupPagination.ts')).href)};
const fail = (m) => { console.error('PACKER_FAIL ' + m); process.exitCode = 1 };
if (BIOME_PAGE_ITEM_BUDGET !== 10) fail('budget');
const empty = packBiomePages([], 16);
if (!(empty.length === 1 && empty[0].segments.length === 0)) fail('empty');
const fit = packBiomePages([
  { key: 'a', title: 'A', items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
  { key: 'b', title: 'B', items: [{ id: 4 }, { id: 5 }] },
  { key: 'c', title: 'C', items: Array.from({ length: 12 }, (_, i) => ({ id: 10 + i })) },
], 16);
if (fit.length !== 2 || fit[0].cost !== 5 || fit[1].cost !== 12) fail('fit-pack ' + JSON.stringify(fit.map(p => p.cost)));
const big = packBiomePages([{ key: 'big', title: '大型', items: Array.from({ length: 20 }, (_, i) => ({ id: i + 1 })) }], 16);
if (big.length !== 2 || big[0].segments[0].items.length !== 16 || big[1].segments[0].items.length !== 4) fail('split-size');
if (!big[1].segments[0].continuationLabel) fail('continuation');
const two = packBiomePages([
  { key: 'a', title: 'A', items: Array.from({ length: 10 }, (_, i) => ({ id: i })) },
  { key: 'b', title: 'B', items: Array.from({ length: 10 }, (_, i) => ({ id: 100 + i })) },
], 16);
if (two.length !== 2 || two[0].cost !== 10 || two[1].cost !== 10) fail('whole-group-newpage');
if (clampBiomePage(0, 3) !== 1 || clampBiomePage(99, 3) !== 3 || clampBiomePage(2, 3) !== 2) fail('clamp');
const grouped = groupBiomesByParent([
  { id: 1, parentGroupLabel: '甲' },
  { id: 2, parentGroupLabel: '乙' },
  { id: 3, parentGroupLabel: '甲' },
]);
if (grouped.length !== 2 || grouped[0].items.length !== 2 || grouped[1].items.length !== 1) fail('group-order');
console.log('PACKER_OK');
`

const probe = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', packerProbe], {
  encoding: 'utf8',
  cwd: root,
})
if (probe.status !== 0 || !probe.stdout.includes('PACKER_OK')) {
  failures.push(`utils/biomeGroupPagination.ts: packer unit probe failed\n${probe.stdout}\n${probe.stderr}`)
}

const checks = [
  {
    path: 'pages/biomes/index.vue',
    markers: [
      ['packBiomePages', 'import/use packer'],
      ['groupBiomesByParent', 'group biomes by parent'],
      ['clampBiomePage', 'clamp page'],
      ['BIOME_PAGE_ITEM_BUDGET', 'budget constant'],
      ['biomePage', 'page state'],
      ['biome-page-pager', 'pager UI'],
      ['biome-group-segment', 'segment sections'],
      ['page:', 'serialize page into query'],
    ],
  },
  {
    path: 'pages/biomes/[id].vue',
    markers: [
      ['<details', 'details disclosures'],
      ['<summary', 'summary controls'],
      ['biome-source-group', 'source group class retained'],
    ],
  },
  {
    path: 'components/crafting/RecipeCraftingGraph.vue',
    markers: [
      ['deepExpanded', 'deep expansion state'],
      ['data-deep-expanded', 'deep expansion attribute'],
      ['展开更深层', 'mobile expand control label'],
    ],
  },
  {
    path: 'components/TerraFooter.vue',
    markers: [
      ['footerExpanded', 'footer expanded state'],
      ['aria-expanded', 'toggle a11y'],
      ['footer-main-panels', 'collapsible panels id'],
    ],
  },
]

for (const check of checks) {
  if (!existsSync(file(check.path))) {
    failures.push(`${check.path}: missing`)
    continue
  }
  const content = readFileSync(file(check.path), 'utf8')
  for (const [marker, message] of check.markers) {
    requireIncludes(check.path, content, marker, message)
  }
}

if (failures.length) {
  console.error(`Biome/long-page governance contract failed:\n${failures.map((f) => `- ${f}`).join('\n')}`)
  process.exit(1)
}

console.log('Biome/long-page governance contract passed.')
