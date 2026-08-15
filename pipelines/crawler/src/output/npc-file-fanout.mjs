import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ENTITY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function writeNpcFanoutFiles({
  entityId,
  outputRoot = path.join(process.cwd(), 'data', 'wiki-crawler'),
  normalized,
  canonical,
  audit,
} = {}) {
  const safeEntityId = String(entityId ?? '').trim();
  if (!ENTITY_ID_PATTERN.test(safeEntityId)) {
    throw new Error('NPC fanout entityId must be a lowercase kebab-case identifier');
  }
  const root = path.resolve(outputRoot);
  const paths = {
    normalizedPath: path.join(root, 'normalized-light', 'npc', `${safeEntityId}.latest.json`),
    canonicalPath: path.join(root, 'canonical', 'npc', `${safeEntityId}.latest.json`),
    auditPath: path.join(root, 'audit', 'npc', `${safeEntityId}.latest.json`),
  };
  await Promise.all([
    writeJsonAtomic(paths.normalizedPath, normalized),
    writeJsonAtomic(paths.canonicalPath, canonical),
    writeJsonAtomic(paths.auditPath, audit),
  ]);
  return paths;
}

async function writeJsonAtomic(filePath, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`NPC fanout payload must be an object: ${filePath}`);
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
