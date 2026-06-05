export const resolvePreviewImageUrl = (value?: string | null): string => {
  const imageUrl = String(value ?? '').trim()

  if (!imageUrl) {
    return ''
  }

  const objectProxyPrefix = '/api/files/objects/'
  const previewImagePrefix = '/preview-assets/terrapedia-images/'

  if (imageUrl.startsWith('/preview-assets/')) {
    return imageUrl
  }

  if (imageUrl.includes(objectProxyPrefix)) {
    return `${previewImagePrefix}${imageUrl.split(objectProxyPrefix)[1]}`
  }

  if (imageUrl.includes('/terrapedia-images/')) {
    return `${previewImagePrefix}${imageUrl.split('/terrapedia-images/')[1]}`
  }

  return imageUrl
}
