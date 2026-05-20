import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const allowedDirectWikiFiles = new Set([
  'scripts/data/lib/wiki-request-gate.mjs',
  'scripts/data/lib/wiki-image-fetch-server.mjs',
  'scripts/data/lib/wiki-user-agent.mjs',
  'scripts/data/lib/wiki-direct-request-boundary.test.mjs',
]);

test('wiki.gg network exits stay behind the shared request gate', () => {
  const offenders = listSourceFiles([
    'scripts/data',
    'back/src/main/java',
    'front-nuxt/server',
  ])
    .filter((filePath) => !filePath.includes('.test.'))
    .filter((filePath) => !allowedDirectWikiFiles.has(filePath))
    .filter((filePath) => hasDirectWikiNetworkExit(filePath));

  assert.deepEqual(offenders, []);
});

function hasDirectWikiNetworkExit(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (!source.includes('terraria.wiki.gg') && !(filePath.endsWith('.py') && source.match(/\brequests\.|\bhttpx\./))) {
    return false;
  }
  const directRequestPatterns = filePath.endsWith('.py')
    ? [
        /\brequests\.(get|post|request)\s*\(/,
        /\bhttpx\.(Client|get|post|request)\b/,
      ]
    : [
    /\$fetch\.raw[\s\S]{0,240}https:\/\/terraria\.wiki\.gg/,
    /\bfetch\s*\([\s\S]{0,240}https:\/\/terraria\.wiki\.gg/,
    /HttpRequest\.newBuilder\(\s*URI\.create\("https:\/\/terraria\.wiki\.gg/,
      ];

  return directRequestPatterns.some((pattern) => pattern.test(source))
    || containsDirectWikiConstantUsedByFetch(source);
}

function listSourceFiles(roots) {
  const files = [];
  for (const root of roots) {
    walk(root, files);
  }
  return files;
}

function walk(entryPath, files) {
  if (!fs.existsSync(entryPath)) {
    return;
  }
  const stat = fs.statSync(entryPath);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(entryPath)) {
      walk(path.join(entryPath, child), files);
    }
    return;
  }
  if (!stat.isFile()) {
    return;
  }
  if (!entryPath.match(/\.(java|js|mjs|py|ts)$/)) {
    return;
  }
  files.push(entryPath.split(path.sep).join('/'));
}

function containsDirectWikiConstantUsedByFetch(source) {
  const wikiConstants = new Set();
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"`]https:\/\/terraria\.wiki\.gg[^'"`]*['"`]/g)) {
    wikiConstants.add(match[1]);
  }
  if (wikiConstants.size === 0) {
    return false;
  }

  return [...wikiConstants].some((name) => {
    const escapedName = escapeRegExp(name);
    return new RegExp(`\\$fetch\\.raw\\s*\\(\\s*${escapedName}\\b`).test(source)
      || new RegExp(`\\bfetch\\s*\\(\\s*${escapedName}\\b`).test(source)
      || new RegExp(`HttpRequest\\.newBuilder\\s*\\(\\s*URI\\.create\\s*\\(\\s*${escapedName}\\b`).test(source);
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
