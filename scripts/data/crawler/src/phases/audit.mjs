export function auditNpcRichClosure(normalized) {
  const source = normalized ?? {};
  const reasons = [];

  const hasSummary = Boolean(source.summary?.leadText);
  const hasStructuredSignal =
    Boolean(source.profile?.environment?.length) ||
    Boolean(source.shop?.items?.length) ||
    Boolean(source.contentBlocks?.dialogue) ||
    Boolean(source.contentBlocks?.history);
  const hasRecoverableSourceSignal =
    Boolean(source.sourceSignals?.infoboxPresent) ||
    Boolean(source.sourceSignals?.shopTemplatePresent) ||
    Boolean(source.happiness?.sourceTemplatePresent);

  if (!hasSummary) {
    return {
      status: 'fail',
      reasons: ['missing summary.leadText']
    };
  }

  if (!hasStructuredSignal && !hasRecoverableSourceSignal) {
    return {
      status: 'fail',
      reasons: ['missing structured profile/shop/contentBlocks signal']
    };
  }

  if (source.sourceSignals?.infoboxPresent && !(source.profile?.kind || source.profile?.environment?.length)) {
    reasons.push('infobox present but no profile fields extracted');
  }

  if (source.sourceSignals?.shopTemplatePresent && !(source.shop?.items?.length)) {
    reasons.push('shop template present but shop items empty');
  }

  if (source.happiness?.sourceTemplatePresent && !(source.happiness?.notes?.length)) {
    reasons.push('happiness template present but no happiness notes captured');
  }

  return {
    status: reasons.length ? 'warn' : 'pass',
    reasons
  };
}
