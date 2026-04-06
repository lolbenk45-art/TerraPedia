import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const redesignRoot = path.resolve(__dirname, '..', '..');
const workspaceRoot = path.resolve(redesignRoot, '..');
const sharedDataRoot = path.join(workspaceRoot, 'data', 'terraPedia');
const inputDir = path.resolve(
  process.cwd(),
  process.env.TERRAPEDIA_STANDARDIZED_INPUT_DIR ?? path.join(sharedDataRoot, 'standardized')
);
const outputDir = path.resolve(
  process.cwd(),
  process.env.TERRAPEDIA_STANDARDIZED_VIEW_DIR ?? path.join(sharedDataRoot, 'standardized-view')
);
const chunkSize = Math.max(
  50,
  Number.parseInt(process.env.TERRAPEDIA_VIEW_CHUNK_SIZE ?? '200', 10) || 200
);

if (!fs.existsSync(inputDir)) {
  throw new Error(`Input directory not found: ${inputDir}`);
}

resetDirectory(outputDir);

const generatedAt = new Date().toISOString();
const files = fs
  .readdirSync(inputDir)
  .filter((name) => name.endsWith('.standardized.json') && !name.startsWith('_manifest'))
  .sort((left, right) => left.localeCompare(right));

const index = {
  generatedAt,
  inputDir: relativePath(inputDir),
  outputDir: relativePath(outputDir),
  chunkSize,
  datasets: []
};

for (const fileName of files) {
  const sourcePath = path.join(inputDir, fileName);
  const payload = readJson(sourcePath);
  const entity = String(payload.entity ?? fileName.replace('.standardized.json', ''));
  const entityDir = path.join(outputDir, entity);
  ensureDir(entityDir);

  const datasetMeta = {
    entity,
    sourceFile: relativePath(sourcePath),
    outputDir: relativePath(entityDir),
    totalRecords: resolveTotalRecords(payload),
    mode: '',
    parts: []
  };

  if (Array.isArray(payload.records)) {
    datasetMeta.mode = 'array';
    writeArrayDataset(entityDir, payload.records, datasetMeta);
  } else if (isObject(payload.records)) {
    datasetMeta.mode = 'object-arrays';
    writeObjectArrayDataset(entityDir, payload.records, datasetMeta);
  } else {
    datasetMeta.mode = 'passthrough';
    const passPath = path.join(entityDir, `${entity}.json`);
    writeJson(passPath, payload);
    datasetMeta.parts.push({
      name: path.basename(passPath),
      records: Number(payload.totalRecords ?? 0)
    });
  }

  const metaPath = path.join(entityDir, '_meta.json');
  writeJson(metaPath, {
    entity,
    generatedAt,
    chunkSize,
    sourceFile: relativePath(sourcePath),
    mode: datasetMeta.mode,
    totalRecords: datasetMeta.totalRecords,
    parts: datasetMeta.parts
  });

  index.datasets.push(datasetMeta);
}

writeJson(path.join(outputDir, '_index.json'), index);

console.log(`Split output directory: ${outputDir}`);
for (const dataset of index.datasets) {
  console.log(`- ${dataset.entity}: mode=${dataset.mode}, parts=${dataset.parts.length}`);
}
console.log(`- index: ${path.join(outputDir, '_index.json')}`);

function writeArrayDataset(entityDir, records, datasetMeta) {
  const parts = splitArray(records, chunkSize);
  parts.forEach((partRecords, i) => {
    const partNo = String(i + 1).padStart(4, '0');
    const name = `part-${partNo}.json`;
    const partPath = path.join(entityDir, name);
    writeJson(partPath, partRecords);
    datasetMeta.parts.push({ name, records: partRecords.length });
  });
}

function writeObjectArrayDataset(entityDir, recordsObject, datasetMeta) {
  const keys = Object.keys(recordsObject).sort((left, right) => left.localeCompare(right));
  for (const key of keys) {
    const value = recordsObject[key];
    if (!Array.isArray(value)) {
      const name = `${key}.json`;
      writeJson(path.join(entityDir, name), value);
      datasetMeta.parts.push({ name, records: 1 });
      continue;
    }

    const subDir = path.join(entityDir, key);
    ensureDir(subDir);
    const parts = splitArray(value, chunkSize);
    parts.forEach((partRecords, i) => {
      const partNo = String(i + 1).padStart(4, '0');
      const name = `${key}.part-${partNo}.json`;
      writeJson(path.join(subDir, name), partRecords);
      datasetMeta.parts.push({
        name: `${key}/${name}`,
        records: partRecords.length
      });
    });
  }
}

function splitArray(input, size) {
  const chunks = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function resetDirectory(target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function relativePath(absPath) {
  return path.relative(redesignRoot, absPath).replaceAll('\\', '/');
}

function resolveTotalRecords(payload) {
  const direct = Number(payload?.totalRecords);
  if (Number.isFinite(direct) && direct >= 0) {
    return direct;
  }

  if (Array.isArray(payload?.records)) {
    return payload.records.length;
  }

  if (isObject(payload?.records)) {
    return Object.values(payload.records).reduce((accumulator, value) => {
      if (Array.isArray(value)) {
        return accumulator + value.length;
      }
      return accumulator;
    }, 0);
  }

  return 0;
}
