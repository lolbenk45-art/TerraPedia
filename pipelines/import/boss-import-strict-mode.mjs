export function shouldFailBossImportStrictMode(summary) {
  const dryRun = Boolean(summary?.dryRun);
  return Boolean(summary?.unresolvedBosses?.length > 0)
    || (!dryRun && Number(summary?.remainingWikiBossImages ?? 0) > 0)
    || Number(summary?.remainingWikiBossMemberImages ?? 0) > 0
    || Number(summary?.bossMemberImageMissingSource ?? 0) > 0
    || Number(summary?.failedBossImages ?? 0) > 0
    || Number(summary?.failedBossMemberImages ?? 0) > 0;
}
