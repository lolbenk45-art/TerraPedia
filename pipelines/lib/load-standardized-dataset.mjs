import fs from 'node:fs';
import path from 'node:path';

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStandardizedViewDir(dataDir) {
  return fs.existsSync(path.join(dataDir, '_index.json'));
}

export function loadStandardizedDataset(dataDir, entity) {
  if (isStandardizedViewDir(dataDir)) {
    return loadDatasetFromView(dataDir, entity);
  }
  return loadJson(path.join(dataDir, `${entity}.standardized.json`));
}

function loadDatasetFromView(viewDir, entity) {
  const entityDir = path.join(viewDir, entity);
  const metaPath = path.join(entityDir, '_meta.json');
  if (!fs.existsSync(metaPath)) {
    throw new Error(`View meta not found for entity ${entity}: ${metaPath}`);
  }

  const meta = loadJson(metaPath);
  if (meta.mode === 'array') {
    return {
      entity,
      generatedAt: meta.generatedAt,
      totalRecords: meta.totalRecords ?? 0,
      records: meta.parts.flatMap((part) => {
        const payload = loadJson(path.join(entityDir, part.name));
        return Array.isArray(payload) ? payload : [];
      }),
    };
  }

  if (meta.mode === 'object-arrays') {
    const records = {};
    for (const part of meta.parts ?? []) {
      const normalizedName = String(part.name).replaceAll('\\', '/');
      const partPath = path.join(entityDir, normalizedName);
      const payload = loadJson(partPath);
      const key = normalizedName.includes('/')
        ? normalizedName.split('/')[0]
        : normalizedName.replace(/\.json$/i, '');

      if (Array.isArray(payload)) {
        records[key] = [...(records[key] ?? []), ...payload];
      } else if (isObject(payload)) {
        records[key] = { ...(records[key] ?? {}), ...payload };
      } else {
        records[key] = payload;
      }
    }

    return {
      entity,
      generatedAt: meta.generatedAt,
      totalRecords: meta.totalRecords ?? 0,
      records,
    };
  }

  if (meta.mode === 'passthrough') {
    const firstPart = meta.parts?.[0];
    if (!firstPart) {
      return {
        entity,
        generatedAt: meta.generatedAt,
        totalRecords: meta.totalRecords ?? 0,
        records: [],
      };
    }
    return loadJson(path.join(entityDir, firstPart.name));
  }

  throw new Error(`Unsupported standardized-view mode for entity ${entity}: ${meta.mode}`);
}
