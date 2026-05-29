import fs from 'node:fs';
import path from 'node:path';

export const STANDARDIZED_INFERENCE_MODE = 'standardized_inference';

export function inferCategoryFromStandardizedRecord({
  item,
  itemPage = null,
  mountAllowlist = new Set(),
} = {}) {
  if (!item || !itemPage) {
    return null;
  }

  const internalName = getRecordValue(item, 'internalName');
  const currentCategoryCode =
    getRecordValue(item, 'currentCategoryCode') ?? getRecordValue(item, 'categoryCode');
  const stackSize = getRecordValue(item, 'stackSize') ?? getRecordValue(item?.stack, 'stackSize');
  const damage = getRecordValue(item, 'damage') ?? getRecordValue(item?.stats, 'damage');
  const defense = getRecordValue(item, 'defense') ?? getRecordValue(item?.stats, 'defense');
  const entityType = getRecordValue(itemPage, 'entityType');
  const itemInternalName = getRecordValue(itemPage, 'itemInternalName');

  const itemPageMatch =
    entityType === 'item' &&
    typeof internalName === 'string' &&
    itemInternalName === internalName;

  if (
    !itemPageMatch ||
    currentCategoryCode !== 'MATERIAL' ||
    stackSize !== 1 ||
    damage !== 0 ||
    defense !== 0
  ) {
    return null;
  }

  const rule = resolveMountRule(internalName, mountAllowlist);
  if (!rule) {
    return null;
  }

  return {
    categoryCode: 'MOUNT',
    reason: `standardized_inference:${rule}`,
    confidence: 'high',
    source: STANDARDIZED_INFERENCE_MODE,
    evidence: {
      internalName,
      itemPageMatch: true,
      currentCategoryCode,
      stackSize,
      damage,
      defense,
      rule,
    },
    reportOnly: false,
  };
}

export function loadMountAllowlist({ configPath, repoRoot } = {}) {
  const resolvedConfigPath = configPath
    ? path.resolve(configPath)
    : path.join(path.resolve(repoRoot ?? process.cwd()), 'data', 'config', 'mount-allowlist.json');

  if (!fs.existsSync(resolvedConfigPath)) {
    throw new Error(`Mount allowlist config not found: ${resolvedConfigPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedConfigPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid mount allowlist JSON at ${resolvedConfigPath}: ${error.message}`);
  }

  if (!Array.isArray(parsed?.items)) {
    throw new Error(`Mount allowlist config must include an items array: ${resolvedConfigPath}`);
  }

  for (const [index, item] of parsed.items.entries()) {
    if (typeof item !== 'string') {
      throw new Error(
        `Mount allowlist item at index ${index} must be a string: ${resolvedConfigPath}`
      );
    }
  }

  return new Set(parsed.items);
}

function resolveMountRule(internalName, mountAllowlist) {
  if (typeof internalName !== 'string') {
    return null;
  }

  if (internalName.endsWith('MountItem')) {
    return 'mount_internal_suffix';
  }

  if (internalName.endsWith('MountSaddle')) {
    return 'mount_internal_suffix';
  }

  if (mountAllowlist instanceof Set && mountAllowlist.has(internalName)) {
    return 'mount_allowlist';
  }

  return null;
}

function getRecordValue(record, camelName) {
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  if (Object.hasOwn(record, camelName)) {
    return record[camelName];
  }

  return record[toSnakeCase(camelName)];
}

function toSnakeCase(value) {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}
