import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const productionRoots = [
  path.join(repoRoot, 'scripts', 'data'),
  path.join(repoRoot, 'scripts', 'tooling')
];
const forbiddenDeveloperPaths = [
  /\/home\/lolben\/data\/terraPedia/i,
  /(?:G:|C:)\\+ClaudeCode(?:\\|\/)/i,
  /\\Users\\[^\\/]+\\(?:TerraPedia|data\\terraPedia)/i
];

test('production data/tooling scripts do not embed developer-specific roots', () => {
  const violations = [];
  for (const root of productionRoots) {
    for (const filePath of walk(root)) {
      if (!/\.(?:mjs|js|ts|sh|ps1)$/.test(filePath)
        || /\.test\./.test(filePath)
        || filePath.includes(`${path.sep}legacy${path.sep}`)
        || filePath.endsWith(`${path.sep}render-item-source-closure-review-html.mjs`)) {
        continue;
      }
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of forbiddenDeveloperPaths) {
        if (pattern.test(content)) {
          violations.push(path.relative(repoRoot, filePath));
          break;
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

function walk(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}
