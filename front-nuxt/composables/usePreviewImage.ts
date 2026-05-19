export const resolvePreviewImageUrl = (value?: string | null): string => {
  const imageUrl = String(value ?? '').trim()

  if (!imageUrl) {
    return ''
  }

  if (imageUrl.startsWith('/preview-assets/')) {
    return imageUrl
  }

  if (imageUrl.includes('/terrapedia-images/')) {
    return `/preview-assets/terrapedia-images/${imageUrl.split('/terrapedia-images/')[1]}`
  }

  return imageUrl
}
