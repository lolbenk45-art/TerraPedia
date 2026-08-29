import { isManagedImagePath } from './managed-image-url-policy.mjs';

export const DOMAIN_IMAGE_PROJECTION_CONFIG = Object.freeze({
  npcs: Object.freeze({
    table: 'projection_npcs',
    projectionColumn: 'image_url',
    relationTable: 'relation_npc_images',
    relationKey: 'npc_internal_name',
    projectionKey: 'internal_name',
  }),
  projectiles: Object.freeze({
    table: 'projection_projectiles',
    projectionColumn: 'image_url',
    relationTable: 'relation_projectile_images',
    relationKey: 'projectile_internal_name',
    projectionKey: 'internal_name',
  }),
  armor: Object.freeze({
    table: 'projection_armor_sets',
    projectionColumn: 'male_images',
    relationTable: 'relation_armor_set_images',
    relationKey: 'text_key',
    projectionKey: 'text_key',
  }),
});

export function buildDomainImageProjectionChanges({
  domain,
  relationRows = [],
  projectionRows = [],
  managedPrefixes = [],
  quarantinedIdentities = [],
} = {}) {
  const config = requireConfig(domain);
  const quarantined = new Set(quarantinedIdentities.map((value) => String(value)));
  const relationByKey = new Map();
  for (const row of relationRows) {
    const key = String(row?.internalName ?? row?.[config.relationKey] ?? row?.textKey ?? '').trim();
    const cachedUrl = row?.cachedUrl ?? row?.cached_url ?? null;
    if (key && cachedUrl && !relationByKey.has(key)) relationByKey.set(key, String(cachedUrl));
  }
  const rows = [];
  let excludedCount = 0;
  for (const projection of projectionRows) {
    const key = String(projection?.internalName ?? projection?.[config.projectionKey] ?? projection?.textKey ?? '').trim();
    if (!key || quarantined.has(key)) {
      if (key && quarantined.has(key)) excludedCount += 1;
      continue;
    }
    const after = relationByKey.get(key);
    if (!after || !isManagedImagePath(after, managedPrefixes)) continue;
    const before = projection?.imageUrl ?? projection?.image_url ?? projection?.[config.projectionColumn] ?? null;
    if (String(before ?? '') !== after) rows.push({ internalName: key, before, after });
  }
  return { domain, rows, changedRowCount: rows.length, excludedCount };
}

export function buildDomainImageProjectionUpdateSql(domain) {
  const config = requireConfig(domain);
  return `UPDATE \`${config.table}\` SET \`${config.projectionColumn}\` = ? WHERE \`${config.projectionKey}\` = ? AND \`status\` = 1 AND \`deleted\` = 0`;
}

function requireConfig(domain) {
  const config = DOMAIN_IMAGE_PROJECTION_CONFIG[domain];
  if (!config) throw new Error(`unsupported domain image projection: ${domain}`);
  return config;
}
