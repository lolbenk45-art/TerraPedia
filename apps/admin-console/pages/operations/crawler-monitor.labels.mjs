const NEXT_ACTION_LABELS = {
  resume: '继续任务',
  observe_or_terminate: '观察或终止',
  cancel_queued: '取消排队',
  inspect_blocker: '查看占用者',
  terminate_and_recrawl: '终止清理后重新提交',
  recrawl: '提交正式派发',
  none: '暂无异常',
  inspect: '查看证据',
}

export function nextActionLabel(token) {
  if (token === null || token === undefined || token === '') return '查看证据'
  return NEXT_ACTION_LABELS[token] || token
}
