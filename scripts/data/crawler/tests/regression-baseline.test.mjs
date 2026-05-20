import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const standardizedRoot = process.env.TERRAPEDIA_STANDARDIZED_ROOT
  ? path.resolve(process.env.TERRAPEDIA_STANDARDIZED_ROOT)
  : path.join(repoRoot, 'data', 'standardized');

const BASELINE_FILES = [
  {
    relativePath: 'items.standardized.json',
    sha256: 'e36629af0637b0af18f9da0ca280fe9cd3379951590febbca6a2865c5db7b63f'
  },
  {
    relativePath: 'npcs.standardized.json',
    sha256: 'b6cb15d97193a21817ba39de9b37405279307435d93cb9e2471ad414e65fe44f'
  },
  {
    relativePath: 'projectiles.standardized.json',
    sha256: 'b8b3122a80dc1ed3d7d7901b512c62858345c054285ac1bec17a527b526071b9'
  }
];

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

for (const { relativePath, sha256 } of BASELINE_FILES) {
  test(`${relativePath} matches the Phase 0 regression baseline`, () => {
    const filePath = path.join(standardizedRoot, relativePath);

    assert.ok(fs.existsSync(filePath), `Missing standardized baseline file: ${filePath}`);
    assert.equal(sha256File(filePath), sha256);
  });
}
