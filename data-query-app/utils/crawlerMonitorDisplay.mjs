const DOMAIN_NAME_MAP = {
  items: '物品',
  npcs: 'NPC',
  projectiles: '射弹',
  buffs: 'Buff',
  armor_sets: '盔甲套装',
  recipes: '配方',
  biomes: '群系',
  bosses: 'Boss',
  shimmer: '微光',
  town_npcs: '城镇 NPC',
}

const STATUS_LABEL_MAP = {
  running: '运行中',
  queued: '队列中',
  pending: '等待确认',
  paused: '已暂停',
  stalled: '心跳过期',
  failed: '失败',
  error: '错误',
  blocked: '已阻断',
  completed: '已完成',
  cancelled: '已取消',
  missing: '缺失',
  ready: '可执行',
  unknown: '未知',
}

export function wikiDomainChineseName(domain) {
  const key = String(domain?.domain || '').trim()
  const label = String(domain?.label || '').trim()
  return DOMAIN_NAME_MAP[key] || key || label || '未知域'
}

export function crawlerStatusChineseLabel(status) {
  const normalized = String(status || '').toLowerCase()
  return STATUS_LABEL_MAP[normalized] || normalized || '未知'
}

export function formatDurationFromMs(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value < 0) return ''
  const minutes = Math.max(1, Math.round(value / 60000))
  if (minutes < 60) return `约 ${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `约 ${hours} 小时 ${rest} 分钟前` : `约 ${hours} 小时前`
}

export function wikiCooldownExplanation(domain, now = new Date()) {
  const minutes = Number(domain?.cooldownMinutes || 0)
  if (!minutes) return ''

  const suffix = '保护 Wiki，避免短时间重复请求。'
  const lastAutoRunAt = String(domain?.lastAutoRunAt || '').trim()
  if (!lastAutoRunAt) return ''

  const lastMs = Date.parse(lastAutoRunAt)
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now))
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs)) return ''

  const nextMs = lastMs + minutes * 60000
  const remainingMs = nextMs - nowMs
  if (remainingMs > 0) {
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000))
    return `Wiki 保护冷却：${minutes} 分钟。上次自动执行：${lastAutoRunAt}，约 ${remainingMinutes} 分钟后可再次自动执行。${suffix}`
  }

  return ''
}

export function wikiHeartbeatSummary(row) {
  if (!row) {
    return {
      state: '暂无运行心跳',
      time: '',
      age: '',
      message: '暂无运行心跳',
    }
  }

  const payload = row.progressPayload || {}
  const time = row.progressHeartbeatAt
    || row.action?.lastHeartbeatAt
    || payload.lastHeartbeatAt
    || payload.generatedAt
    || row.progressUpdatedAt
    || row.updatedAt
    || ''
  const age = formatDurationFromMs(row.progressHeartbeatAgeMs)
  const status = String(row.status || row.action?.status || '').toLowerCase()
  const stale = Boolean(row.progressStale) || status === 'stalled'
  const state = stale ? '过期' : time ? '正常' : '暂无运行心跳'
  const message = time ? `最后心跳：${time}${age ? `（${age}）` : ''}` : '暂无运行心跳'

  return {
    state,
    time,
    age,
    message,
  }
}
