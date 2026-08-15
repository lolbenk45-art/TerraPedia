const PROJECTILE_NAME_REFERENCE_PATTERN = /^\{\$ProjectileName\.([A-Za-z0-9_]+)\}$/;

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

export function resolveProjectileNameReference(value) {
  const text = toText(value);
  if (!text) return null;
  const match = text.match(PROJECTILE_NAME_REFERENCE_PATTERN);
  return match ? match[1] : null;
}

export function isProjectileNamePlaceholder(value) {
  return resolveProjectileNameReference(value) != null;
}

export function resolveProjectileZhName(value, lookup, seen = new Set()) {
  const text = toText(value);
  if (!text) return null;

  const reference = resolveProjectileNameReference(text);
  if (!reference) {
    return text;
  }
  if (seen.has(reference)) {
    return null;
  }

  seen.add(reference);
  const next = typeof lookup === 'function' ? lookup(reference) : null;
  return resolveProjectileZhName(next, lookup, seen);
}

export function buildResolvedProjectileZhEntries(entries) {
  const resolved = new Map();
  const lookup = (key) => entries.get(key)?.nameZh ?? null;

  for (const [internalName, entry] of entries.entries()) {
    resolved.set(internalName, {
      ...entry,
      nameZh: resolveProjectileZhName(entry?.nameZh, lookup),
    });
  }

  return resolved;
}

export function resolveProjectileZhFromRecord(record, lookup) {
  return resolveProjectileZhName(
    record?.localized?.zh?.name ?? record?.nameZh,
    lookup
  );
}
