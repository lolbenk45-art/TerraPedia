import { nextActionLabel } from './crawler-monitor.labels.mjs'

/**
 * 域状态只信后端权威 domain.state。
 * 缺失时明确暴露同步缺口，避免前端根据 queue/progress 猜错主状态。
 */
export function resolveDomainState(domain, fallbackInputs = {}) {
  if (domain && domain.state && domain.state.status) {
    return {
      status: domain.state.status,
      nextAction: domain.state.nextAction || null,
      nextActionLabel: nextActionLabel(domain.state.nextAction),
      blocker: domain.state.blocker || null,
      blockerLabel: domain.state.blockerLabel || null,
      evidence: domain.state.evidence || null,
      source: 'backend',
    }
  }
  return {
    status: 'state_missing',
    nextAction: 'inspect',
    nextActionLabel: '等待后端状态',
    blocker: null,
    blockerLabel: null,
    evidence: null,
    source: 'missing_backend_state',
  }
}
