import path from 'node:path';
import { createRequire } from 'node:module';

import { resolveProjectPath } from './project-root.mjs';

/**
 * mysql2 is declared only in data-query-app/package.json and there is no root node_modules,
 * so it must be resolved relative to that package. Resolving relative to the calling module
 * (createRequire(import.meta.url)) walks up from scripts/data/... and never reaches
 * data-query-app/node_modules, which is why every script that did so failed at startup with a
 * raw MODULE_NOT_FOUND before doing any work.
 */
function anchorFor(repoRoot) {
  const root = repoRoot ?? resolveProjectPath();
  return path.join(root, 'data-query-app', 'package.json');
}

export function resolveMysqlModulePath({ repoRoot } = {}) {
  const anchor = anchorFor(repoRoot);
  try {
    return createRequire(anchor).resolve('mysql2/promise');
  } catch (cause) {
    throw new Error(
      `mysql2/promise could not be resolved from ${anchor}. `
      + 'Install the data-query-app dependencies (mysql2 is declared there, and this repository '
      + 'has no root node_modules) before running database scripts.',
      { cause },
    );
  }
}

export function loadMysqlModule({ repoRoot, mysqlModule } = {}) {
  if (mysqlModule) {
    return mysqlModule;
  }
  const anchor = anchorFor(repoRoot);
  try {
    return createRequire(anchor)('mysql2/promise');
  } catch (cause) {
    throw new Error(
      `mysql2/promise could not be resolved from ${anchor}. `
      + 'Install the data-query-app dependencies (mysql2 is declared there, and this repository '
      + 'has no root node_modules) before running database scripts.',
      { cause },
    );
  }
}
