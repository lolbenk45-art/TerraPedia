export function resolveArmorSetDetailPath(rows) {
  const first = Array.isArray(rows) ? rows[0] : null;
  const id = Number(first?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }
  return `/admin/armor-sets/${id}`;
}
