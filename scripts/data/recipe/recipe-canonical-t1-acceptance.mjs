import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_INPUT_PATH = 'scripts/data/recipe/fixtures/recipe-t1.sample.json';

export function runRecipeCanonicalT1Acceptance({
  profile,
  runId,
  repoRoot,
  databases,
  mysql,
  inputPath = DEFAULT_INPUT_PATH,
  spawnSyncImpl = spawnSync,
} = {}) {
  if (profile !== 't1') throw new Error('recipe T1 acceptance requires the T1 profile');
  if (!/^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_local$/.test(databases?.local ?? '')) {
    throw new Error('recipe T1 acceptance requires a run-derived isolated local database');
  }
  const resolvedInput = path.resolve(repoRoot, inputPath);
  if (!fs.existsSync(resolvedInput)) throw new Error(`recipe input is missing: ${resolvedInput}`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `terrapedia-recipe-t1-${runId}-`));
  try {
    const pipelinePath = path.join(tempRoot, 'pipeline.json');
    const args = [path.join(repoRoot, 'scripts/data/pipeline/run-wiki-zh-recipe-sync-pipeline.mjs'), '--apply=true', `--input=${resolvedInput}`, '--offline=true', `--host=${mysql.host}`, `--port=${mysql.port}`, `--user=${mysql.username}`, `--password=${mysql.password}`, `--database=${databases.local}`, '--allow-non-primary-db=true', `--import-report=${path.join(tempRoot, 'import.json')}`, `--consolidation-report=${path.join(tempRoot, 'consolidation.json')}`, `--output=${pipelinePath}`];
    const result = spawnSyncImpl(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`recipe pipeline failed: ${String(result.stderr).trim()}`);
    return { status: 'passed', inputPath, database: databases.local, summary: JSON.parse(fs.readFileSync(pipelinePath, 'utf8')) };
  } finally { fs.rmSync(tempRoot, { recursive: true, force: true }); }
}
