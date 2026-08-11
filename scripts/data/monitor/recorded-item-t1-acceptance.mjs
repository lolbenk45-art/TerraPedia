export function buildItemT1AcceptanceReport({ identity, progress, itemIngestion, itemDbReadback, cleanup } = {}) {
  if (!identity || !progress || !itemIngestion || !itemDbReadback || !cleanup) throw new Error('Item T1 report requires complete evidence');
  if (progress.status !== 'completed' || progress.actionId !== 'crawler-queue-v2-fixture') throw new Error('Item T1 progress is not terminal');
  if (Number(itemIngestion.itemCount) < 1 || Number(itemIngestion.maintCount) !== Number(itemIngestion.itemCount) || Number(itemIngestion.relationCount) !== Number(itemIngestion.itemCount) || Number(itemIngestion.unresolvedIdentities) !== 0) throw new Error('Item T1 ingestion counts are incomplete');
  if (Number(itemDbReadback.itemRows) !== Number(itemIngestion.itemCount) || Number(itemDbReadback.maintRows) !== Number(itemIngestion.maintCount) || Number(itemDbReadback.relationRows) !== Number(itemIngestion.relationCount) || Number(itemDbReadback.unresolvedIdentities) !== 0) throw new Error('Item T1 database readback is incomplete');
  if (Object.values(cleanup).some((value) => Number(value) !== 0)) throw new Error('Item T1 cleanup is not zero');
  return Object.freeze({ schemaVersion: 1, reportKind: 'canonical_crawler_v2_items_t1_acceptance', operationId: 'canonical-crawler-v2-items-t1-acceptance', status: 'passed', networkAccess: false, identity, progress, itemIngestion, itemDbReadback, cleanup, generatedAt: new Date().toISOString() });
}
