const padDate = (value: number): string => String(value).padStart(2, '0')

export const formatZhDate = (value?: string | null): string => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const year = date.getFullYear()
  const month = padDate(date.getMonth() + 1)
  const day = padDate(date.getDate())
  return `${year}-${month}-${day}`
}

export const formatZhDateTime = (value?: string | null): string => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const year = date.getFullYear()
  const month = padDate(date.getMonth() + 1)
  const day = padDate(date.getDate())
  const hours = padDate(date.getHours())
  const minutes = padDate(date.getMinutes())

  return `${year}-${month}-${day} ${hours}:${minutes}`
}
