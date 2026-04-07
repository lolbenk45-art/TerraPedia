import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedDataPath } from '../lib/wiki-item-utils.mjs';

const reportDir = sharedDataPath('reports', 'validate');
fs.mkdirSync(reportDir, { recursive: true });

const requiredFields = ['name', 'categoryCode'];
const optionalNumericFields = [
  'rarityId',
  'damage',
  'defense',
  'knockback',
  'useTime',
  'width',
  'height',
  'buy',
  'sell',
  'stackSize',
  'status'
];
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateItem(item, index, duplicateKeys) {
  const errors = [];

  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`items[${index}] must be an object`];
  }

  for (const field of requiredFields) {
    if (typeof item[field] !== 'string' || item[field].trim() === '') {
      errors.push(`items[${index}].${field} is required`);
    }
  }

  if ('internalName' in item && typeof item.internalName !== 'string') {
    errors.push(`items[${index}].internalName must be a string when provided`);
  }

  for (const field of optionalNumericFields) {
    if (field in item && item[field] != null && typeof item[field] !== 'number') {
      errors.push(`items[${index}].${field} must be a number when provided`);
    }
  }

  if ('isStackable' in item && item.isStackable != null && typeof item.isStackable !== 'boolean') {
    errors.push(`items[${index}].isStackable must be a boolean when provided`);
  }

  const internalNameKey = typeof item.internalName === 'string' ? item.internalName.trim().toUpperCase() : '';
  if (internalNameKey) {
    trackDuplicate(duplicateKeys, `internalName:${internalNameKey}`, `items[${index}].internalName duplicate: ${item.internalName}`, errors);
  }

  return errors;
}

function trackDuplicate(duplicateKeys, key, message, errors) {
  const currentCount = duplicateKeys.get(key) ?? 0;
  duplicateKeys.set(key, currentCount + 1);
  if (currentCount >= 1) {
    errors.push(message);
  }
}

export function validateNormalizedItems(inputPath = sharedDataPath('normalized', 'items.sample.json')) {
  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const duplicateKeys = new Map();
  const payload = readJson(resolvedInput);

  if (typeof payload !== 'object' || payload == null || Array.isArray(payload)) {
    throw new Error(`Payload root must be an object: ${resolvedInput}`);
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  const errors = items.flatMap((item, index) => validateItem(item, index, duplicateKeys));
  const duplicateSummary = [...duplicateKeys.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));

  const report = {
    source: payload.source ?? null,
    file: resolvedInput,
    total: items.length,
    valid: errors.length === 0,
    duplicateKeys: duplicateSummary,
    errors
  };

  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const reportPath = path.join(reportDir, `validate-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return {
    report,
    reportPath,
    resolvedInput,
    items
  };
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectExecution()) {
  const inputPath = process.argv[2] ?? sharedDataPath('normalized', 'items.sample.json');
  const { report, reportPath, resolvedInput, items } = validateNormalizedItems(inputPath);

  console.log(`Validated file: ${resolvedInput}`);
  console.log(`Items: ${items.length}`);
  console.log(`Valid: ${report.valid}`);
  console.log(`Report: ${reportPath}`);

  if (!report.valid) {
    for (const error of report.errors) {
      console.error(error);
    }
    process.exitCode = 1;
  }
}
