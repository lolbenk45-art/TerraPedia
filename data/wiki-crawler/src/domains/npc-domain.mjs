import {
  extractNpcHappiness,
  extractNpcInfobox,
  extractNpcLeadSummary,
  extractNpcSectionBlocks,
  extractNpcShop,
  extractNpcSpecialForms
} from './npc-parser.mjs';

export function buildNpcNormalizedLight(raw) {
  const source = raw ?? {};
  const revisionText = String(source.revisionText ?? '');
  const leadText = extractNpcLeadSummary({
    pageDescription: source.pageDescription ?? '',
    revisionText
  });
  const infobox = extractNpcInfobox(revisionText);
  const specialForms = extractNpcSpecialForms(revisionText);
  const sections = extractNpcSectionBlocks(revisionText);
  const shop = extractNpcShop(revisionText);
  const happiness = extractNpcHappiness(revisionText);
  const inferredKind = inferNpcKind({
    infoboxKind: infobox.kind,
    leadText,
    pageDescription: source.pageDescription ?? ''
  });
  const inferredCombat = inferNpcCombatHints({
    infobox,
    revisionText,
    leadText,
    pageDescription: source.pageDescription ?? ''
  });

  return {
    entityId: source.entityId ?? '',
    source: {
      pageTitle: source.pageTitle ?? '',
      pageDescription: source.pageDescription ?? ''
    },
    display: {
      name: source.pageTitle ?? ''
    },
    summary: {
      leadText,
      sourceDescription: source.pageDescription ?? ''
    },
    profile: {
      kind: inferredKind,
      subtypes: infobox.subtypes,
      environment: infobox.environment,
      boundVariantName: specialForms.boundVariantName ?? '',
      shimmerForm: specialForms.shimmerForm
    },
    combat: {
      baseDamageText: inferredCombat.baseDamageText,
      extraDamageText: inferredCombat.extraDamageText,
      projectileId: inferredCombat.projectileId
    },
    shop,
    happiness,
    relationships: {
      relatedNpcs: source.relations?.relatedNpcs ?? [],
      relatedItems: source.relations?.relatedItems ?? [],
      relatedBiomes: source.relations?.relatedBiomes ?? []
    },
    contentBlocks: {
      dialogue: sections.dialogue ?? '',
      tips: sections.tips ?? '',
      history: sections.history ?? ''
    }
  };
}

function inferNpcKind({
  infoboxKind,
  leadText,
  pageDescription
}) {
  if (infoboxKind) {
    return infoboxKind;
  }

  const combined = `${leadText} ${pageDescription}`.toLowerCase();
  if (combined.includes('[[enemies|enemy]]') || combined.includes(' enemy ')) {
    return 'enemy';
  }
  if (combined.includes(' vendor ') || combined.includes(' npc vendor ')) {
    return 'vendor';
  }
  if (combined.includes(' critter ')) {
    return 'critter';
  }
  return '';
}

function inferNpcCombatHints({
  infobox,
  revisionText,
  leadText,
  pageDescription
}) {
  const baseDamageText = inferBaseDamageText({
    currentValue: infobox.baseDamageText,
    revisionText,
    leadText,
    pageDescription
  });

  return {
    baseDamageText,
    extraDamageText: infobox.extraDamageText,
    projectileId: infobox.projectileId
  };
}

function inferBaseDamageText({
  currentValue,
  revisionText,
  leadText,
  pageDescription
}) {
  if (currentValue) {
    return currentValue;
  }

  const candidates = [
    String(revisionText ?? ''),
    String(leadText ?? ''),
    String(pageDescription ?? '')
  ];

  for (const candidate of candidates) {
    const match = candidate.match(/\bdeals\s+([\s\S]*?)\s+damage\b/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return '';
}
