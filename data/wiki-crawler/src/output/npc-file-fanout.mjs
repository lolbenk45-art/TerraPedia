import path from 'node:path';

import { ensureDir, writeJson } from '../../../../scripts/data/lib/wiki-item-utils.mjs';

export async function writeNpcFanoutFiles({
  entityId,
  outputRoot,
  normalized,
  canonical,
  audit
} = {}) {
  const resolvedEntityId = String(entityId ?? '').trim();
  if (!resolvedEntityId) {
    throw new Error('entityId is required');
  }

  const resolvedOutputRoot = path.resolve(outputRoot ?? path.join(process.cwd(), 'data', 'wiki-crawler'));
  const normalizedPath = path.join(resolvedOutputRoot, 'normalized-light', 'npc', `${resolvedEntityId}.latest.json`);
  const canonicalPath = path.join(resolvedOutputRoot, 'canonical', 'npc', `${resolvedEntityId}.latest.json`);
  const auditPath = path.join(resolvedOutputRoot, 'audit', 'npc', `${resolvedEntityId}.latest.json`);

  ensureDir(path.dirname(normalizedPath));
  ensureDir(path.dirname(canonicalPath));
  ensureDir(path.dirname(auditPath));

  writeJson(normalizedPath, normalized ?? {});
  writeJson(canonicalPath, canonical ?? {});
  writeJson(auditPath, audit ?? {});

  return {
    normalizedPath,
    canonicalPath,
    auditPath
  };
}
