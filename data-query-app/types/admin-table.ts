export interface AdminTableColumn {
  key: string
  label: string
  class?: string
  headerClass?: string
}

export type AdminTableRowKey = string | ((row: unknown, index: number) => string | number)
export type AdminTableRowClass = (row: unknown, index: number) => string | string[] | Record<string, boolean> | undefined
