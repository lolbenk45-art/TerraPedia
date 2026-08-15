function normalizeValue(value, column, options = {}) {
  if (value == null) return null;

  if (hasColumn(options.jsonColumns, column)) {
    return normalizeJsonValue(value);
  }

  if (hasColumn(options.numericColumns, column)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }

  return value;
}

function normalizeJsonValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return value;
    try {
      return stableJsonValue(JSON.parse(text));
    } catch {
      return value;
    }
  }
  return stableJsonValue(value);
}

function stableJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => stableJsonValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableJsonValue(value[key])])
    );
  }
  return value;
}

function hasColumn(columns, column) {
  return Array.isArray(columns) && columns.includes(column);
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildKey(row, keyColumns, options = {}) {
  return JSON.stringify(buildRowSnapshot(row, keyColumns, options));
}

export function buildRowSnapshot(row = {}, columns = [], options = {}) {
  return Object.fromEntries(
    columns.map((column) => [
      column,
      normalizeValue(Object.hasOwn(row, column) ? row[column] : null, column, options),
    ])
  );
}

export function rowsEqual(left = {}, right = {}, options = {}) {
  const columns = options.columns
    ?? [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])];
  return valuesEqual(
    buildRowSnapshot(left, columns, options),
    buildRowSnapshot(right, columns, options)
  );
}

export function reconcileChildRows({
  existingRows = [],
  targetRows = [],
  keyColumns = [],
  compareColumns = [],
  ...options
} = {}) {
  if (!Array.isArray(keyColumns) || keyColumns.length === 0) {
    throw new Error('reconcileChildRows requires at least one key column');
  }

  const existingByKey = new Map();
  for (const existing of Array.isArray(existingRows) ? existingRows : []) {
    existingByKey.set(buildKey(existing, keyColumns, options), existing);
  }

  const add = [];
  const update = [];
  const noop = [];
  const matchedKeys = new Set();
  const columns = compareColumns.length > 0 ? compareColumns : keyColumns;

  for (const target of Array.isArray(targetRows) ? targetRows : []) {
    const key = buildKey(target, keyColumns, options);
    const existing = existingByKey.get(key);
    if (!existing) {
      add.push({ target, key });
      continue;
    }

    matchedKeys.add(key);
    if (rowsEqual(existing, target, { ...options, columns })) {
      noop.push({ existing, target, key });
    } else {
      update.push({ existing, target, key });
    }
  }

  const remove = [];
  for (const [key, existing] of existingByKey.entries()) {
    if (!matchedKeys.has(key)) {
      remove.push({ existing, key });
    }
  }

  return { add, update, remove, noop };
}
