export type NotificationLevel = 'info' | 'warning' | 'danger'

export interface NotificationEvent {
  id: string
  source: string
  level: NotificationLevel
  title: string
  detail?: string
  link: string
  createdAt: number
}

export interface NotificationSourceDiffResult<TState> {
  events: NotificationEvent[]
  nextState: TState
}

export interface NotificationSource<TState = unknown> {
  key: string
  intervalMs: number
  fetch: () => Promise<unknown>
  diff: (prevState: TState, rawData: unknown) => NotificationSourceDiffResult<TState>
}
