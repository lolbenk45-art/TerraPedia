const TABLE_DATASETS = Object.freeze({
  relation_armor_sets: 'armor_sets_raw',
  relation_armor_set_images: 'armor_set_images_raw',
});

const MAINT_DATASETS = Object.freeze({
  maint_armor_sets: 'armor_sets_raw',
  maint_armor_set_images: 'armor_set_images_raw',
});

const positiveId = value => Number.isSafeInteger(value) && value > 0;

export function inspectArmorCanonicalLandingLineage({ relationCandidate, landingCurrentRows } = {}) {
  if (!Array.isArray(landingCurrentRows)) throw new Error('Armor frozen landing baseline is required for lineage validation');
  const maintInput = relationCandidate?.inputSnapshots?.maintInput;
  const landingInputs = maintInput?.landingRows ?? [];
  const currentMaint = maintInput?.currentRows ?? {};
  const landingsById = new Map();
  for (const landing of landingCurrentRows) {
    if (!positiveId(landing?.id)) continue;
    const rows = landingsById.get(landing.id) ?? [];
    rows.push(landing);
    landingsById.set(landing.id, rows);
  }
  const issues = [];
  for (const [table, datasetType] of Object.entries(TABLE_DATASETS)) {
    const changes = relationCandidate?.changes?.[table];
    if (!changes) continue;
    const rows = [
      ...(changes.inserts ?? []),
      ...(changes.updates ?? []).map(update => update.after),
      ...(changes.unchanged ?? []),
      ...(changes.preserved ?? []),
    ];
    for (const row of rows) {
      if (row?.landing_source_id == null) continue;
      const landingSourceId = row.landing_source_id;
      const ownerDataset = MAINT_DATASETS[row.source_maint_table] ?? null;
      const matches = positiveId(landingSourceId) ? landingsById.get(landingSourceId) ?? [] : [];
      let mismatch = null;
      if (!positiveId(landingSourceId)) mismatch = 'landing_source_id';
      else if (matches.length !== 1) mismatch = matches.length === 0 ? 'landing_id_not_found' : 'landing_id_ambiguous';
      else {
        const [landing] = matches;
        const sourceMaintRows = currentMaint[row.source_maint_table] ?? [];
        const sourceMaint = sourceMaintRows.find(owner => owner.id === row.source_maint_id
          || owner.record_key === row.source_maint_record_key);
        const sourceLandingInputs = landingInputs.filter(source => source.dataset_type === datasetType
          && source.provider === row.source_provider && source.source_key === row.landing_source_key
          && source.content_hash === row.landing_content_hash);
        const expectedPage = row.landing_source_page
          ?? sourceMaint?.landing_source_page
          ?? (sourceLandingInputs.length === 1 ? sourceLandingInputs[0].source_page : null);
        const comparisons = [
          ['dataset_type', datasetType, landing.dataset_type],
          ['source_maint_table', datasetType, ownerDataset],
          ['provider', row.source_provider, landing.provider],
          ['source_key', row.landing_source_key, landing.source_key],
          ['source_page', expectedPage, landing.source_page],
          ['content_hash', row.landing_content_hash, landing.content_hash],
        ];
        const difference = comparisons.find(([, expected, actual]) => expected == null || expected !== actual);
        mismatch = difference?.[0] ?? null;
        if (difference) {
          issues.push({
            table,
            recordKey: row.record_key ?? row.text_key ?? null,
            landingSourceId,
            mismatch,
            expected: difference[1] ?? null,
            actual: difference[2] ?? null,
          });
          continue;
        }
      }
      if (mismatch) issues.push({
        table,
        recordKey: row.record_key ?? row.text_key ?? null,
        landingSourceId,
        mismatch,
      });
    }
  }
  return issues;
}
