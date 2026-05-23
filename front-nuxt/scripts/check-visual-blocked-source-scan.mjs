import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./check-visual-regression.mjs', import.meta.url), 'utf8')

const violations = []

if (!source.includes('const blockedImageSources =')) {
  violations.push('visual audit must return detailed blockedImageSources records')
}

if (!source.includes("kind: 'data-source-image'")) {
  violations.push('visual audit must scan data-source-image as an independent image source kind')
}

if (source.includes("getAttribute('src') || element.getAttribute('style') || element.getAttribute('data-source-image')")) {
  violations.push('visual audit must not let a safe src mask a blocked data-source-image')
}

if (!source.includes("category: 'image'")) {
  violations.push('blocked source failures must be recorded with image category metadata')
}

if (violations.length > 0) {
  console.error(violations.join('\n'))
  process.exit(1)
}
