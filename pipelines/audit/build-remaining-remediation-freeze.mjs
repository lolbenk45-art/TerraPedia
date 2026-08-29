#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

function sha256File(filePath) {
  return fs.readFile(filePath).then((bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

export async function buildRemainingRemediationFreeze({
  runRoot,
  reportPaths,
  localCoreCompat,
  databaseHost = '127.0.0.1',
  outputPath,
}) {
  if (databaseHost !== '127.0.0.1' && databaseHost !== 'localhost') throw new Error('freeze requires loopback database host');
  const required = ['crossDb', 'itemSourceCandidates', 'itemSourceDryRun', 'localCoreCompat', 'imageLineage'];
  for (const key of required) if (!reportPaths?.[key]) throw new Error(`missing report path: ${key}`);
  const hashes = Object.fromEntries(await Promise.all(required.map(async (key) => [key, await sha256File(reportPaths[key])])))
  const [crossDb, candidates, dryRun, imageLineage] = await Promise.all([
    fs.readFile(reportPaths.crossDb, 'utf8').then(JSON.parse),
    fs.readFile(reportPaths.itemSourceCandidates, 'utf8').then(JSON.parse),
    fs.readFile(reportPaths.itemSourceDryRun, 'utf8').then(JSON.parse),
    fs.readFile(reportPaths.imageLineage, 'utf8').then(JSON.parse),
  ]);
  requireObject(localCoreCompat, 'localCoreCompat');
  const parityResults = localCoreCompat.domainResults ?? localCoreCompat;
  if (dryRun.apply === true) throw new Error('item source dry-run must have apply=false');
  for (const domain of ['items', 'npcs', 'bosses']) if (!(domain in parityResults)) throw new Error(`missing parity domain: ${domain}`);
  if (crossDb.summary?.blockingCount > 0) throw new Error('cross-db baseline has blocking checks');
  if (imageLineage.summary?.notReadyEntityTypes > 0) throw new Error('image lineage baseline is not ready');
  const freeze = {
    schemaVersion: 'remaining-remediation-freeze-v1',
    readOnly: true,
    databaseWrites: false,
    reportHashes: hashes,
    itemSource: {
      plannedRows: candidates.summary?.plannedSourceRows ?? 0,
      duplicates: dryRun.summary?.duplicates ?? 0,
      toInsert: dryRun.summary?.toInsert ?? 0,
      blockedCandidates: candidates.summary?.blockedCandidates ?? 0,
    },
    parity: {
      items: parityResults.items,
      npcs: parityResults.npcs,
      bosses: parityResults.bosses,
    },
  };
  const canonical = JSON.stringify(freeze, Object.keys(freeze).sort());
  freeze.scopeHash = `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(freeze, null, 2)}\n`);
  }
  return freeze;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  }));
  const runRoot = args['run-root'];
  if (!runRoot) throw new Error('--run-root is required');
  const localCoreCompat = JSON.parse(await fs.readFile(path.join(runRoot, 'local-core-compat.json'), 'utf8'));
  await buildRemainingRemediationFreeze({
    runRoot,
    localCoreCompat,
    databaseHost: args['database-host'] || '127.0.0.1',
    outputPath: args.output || path.join(runRoot, 'freeze.json'),
    reportPaths: {
      crossDb: path.join(runRoot, 'cross-db.json'),
      itemSourceCandidates: path.join(runRoot, 'item-source-candidates.json'),
      itemSourceDryRun: path.join(runRoot, 'item-source-dry-run.json'),
      localCoreCompat: path.join(runRoot, 'local-core-compat.json'),
      imageLineage: path.join(runRoot, 'image-lineage.json'),
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
