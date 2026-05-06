import fs from 'node:fs';
import path from 'node:path';

import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();

export function checkCrawlerSourceLayout({
  root = repoRoot,
  existsSync = fs.existsSync,
} = {}) {
  const legacyPaths = [
    path.join(root, 'data', 'wiki-crawler', 'src'),
    path.join(root, 'data', 'wiki-crawler', 'tests'),
  ];
  const warnings = legacyPaths
    .filter((targetPath) => existsSync(targetPath))
    .map((targetPath) => `Legacy crawler source path still exists: ${normalizePath(path.relative(root, targetPath))}`);

  return {
    status: warnings.length > 0 ? 'warning' : 'pass',
    blocking: false,
    warnings,
  };
}

function normalizePath(value) {
  return String(value).replaceAll('\\', '/');
}
