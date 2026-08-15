export function formatCurrency(copper?: number | null): string {
  if (copper == null || !Number.isFinite(copper)) return '--'

  const total = Math.max(0, Math.trunc(copper))
  if (total === 0) return '0 铜'

  const platinum = Math.floor(total / 1000000)
  const gold = Math.floor((total % 1000000) / 10000)
  const silver = Math.floor((total % 10000) / 100)
  const copperPart = total % 100

  const parts = [
    platinum > 0 ? `${platinum} 铂` : '',
    gold > 0 ? `${gold} 金` : '',
    silver > 0 ? `${silver} 银` : '',
    copperPart > 0 ? `${copperPart} 铜` : '',
  ].filter(Boolean)

  return parts.join(' ')
}

export function formatCurrencyWithRaw(copper?: number | null): string {
  if (copper == null || !Number.isFinite(copper)) return '--'
  return `${formatCurrency(copper)} (${Math.max(0, Math.trunc(copper)).toLocaleString()} 铜)`
}
