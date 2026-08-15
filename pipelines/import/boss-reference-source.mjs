const REFERENCE_ONLY_BOSS_SOURCES = new Map([
  ['Mechdusa', ['THE_TWINS', 'THE_DESTROYER', 'SKELETRON_PRIME']],
]);

export function resolveReferenceOnlyBossSource(titleEn) {
  const key = String(titleEn ?? '').trim();
  const referenceBossCodes = REFERENCE_ONLY_BOSS_SOURCES.get(key);
  if (!referenceBossCodes) {
    return null;
  }
  return {
    sourceMode: 'reference',
    referenceBossCodes: [...referenceBossCodes],
  };
}
