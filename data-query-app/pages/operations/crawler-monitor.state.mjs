import { buildCrawlerUnifiedStatus } from '../../utils/crawlerMonitorUnifiedStatus.mjs'

/**
 * 双读：优先用后端权威 domain.state；缺失时回落旧前端调解器（P3 删）。
 */
export function resolveDomainState(domain, fallbackInputs = {}) {
  if (domain && domain.state && domain.state.status) {
    return {
      status: domain.state.status,
      nextAction: domain.state.nextAction || null,
      blocker: domain.state.blocker || null,
      blockerLabel: domain.state.blockerLabel || null,
      evidence: domain.state.evidence || null,
      source: 'backend',
    }
  }
  const unified = buildCrawlerUnifiedStatus({ domain, ...fallbackInputs })
  return {
    status: unified.effectiveStatus,
    nextAction: unified.nextActionLabel || null,
    blocker: unified.conflictLabel || null,
    blockerLabel: null,
    evidence: unified.reason || null,
    source: 'fallback',
  }
}
