export const MAX_EVENTS = 100

export function mergeNotificationEvents(existingEvents, incomingEvents, maxEvents = MAX_EVENTS) {
  const byId = new Map(existingEvents.map((event) => [event.id, event]))
  for (const event of incomingEvents) {
    byId.set(event.id, event)
  }
  return Array.from(byId.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, maxEvents)
}

export function computeUnreadCount(events, readIds) {
  const read = new Set(readIds)
  return events.filter((event) => !read.has(event.id)).length
}

export function markEventRead(readIds, eventId) {
  if (readIds.includes(eventId)) return readIds
  return [...readIds, eventId]
}

export function markAllRead(events) {
  return events.map((event) => event.id)
}

export function relativeTimeLabel(createdAt, now) {
  const diffMs = Math.max(0, now - createdAt)
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

export function shouldResetForUser(storedOwnerUsername, currentUsername) {
  return Boolean(storedOwnerUsername) && Boolean(currentUsername) && storedOwnerUsername !== currentUsername
}
