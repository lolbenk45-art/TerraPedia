export function assertPrimaryDb(database, shouldApply, allowNonPrimaryDb = false) {
  if (String(database || '').trim() === 'terria_v1_local') return;
  if (!shouldApply) return;
  if (allowNonPrimaryDb) return;
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}
