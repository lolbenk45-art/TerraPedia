export function canonicalizeNpc(normalized) {
  const source = normalized ?? {};

  return {
    name: source.display?.name ?? '',
    summary: source.summary?.leadText ?? source.summary?.sourceDescription ?? '',
    profile: source.profile ?? {
      kind: '',
      subtypes: [],
      environment: [],
      boundVariantName: '',
      shimmerForm: {
        present: false,
        args: []
      }
    },
    shop: {
      items: source.shop?.items ?? []
    },
    happiness: source.happiness ?? {
      sourceTemplatePresent: false,
      notes: []
    },
    relationships: source.relationships ?? {
      relatedNpcs: [],
      relatedItems: [],
      relatedBiomes: []
    }
  };
}
