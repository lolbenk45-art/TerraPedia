const resetPreviewImageVisibleCenter = (root: HTMLElement | null) => {
  root?.style.setProperty('--tp-preview-visible-shift-x', '0px')
  root?.style.setProperty('--tp-preview-visible-shift-y', '0px')
}

const syncPreviewImageVisibleCenter = (
  image: HTMLImageElement | null,
  root: HTMLElement | null,
  enabled = true,
) => {
  if (!enabled || !image || !root || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    resetPreviewImageVisibleCenter(root)
    return
  }

  const naturalPixels = image.naturalWidth * image.naturalHeight
  if (naturalPixels > 1_500_000) {
    resetPreviewImageVisibleCenter(root)
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    resetPreviewImageVisibleCenter(root)
    return
  }

  try {
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const sampleStride = Math.max(1, Math.ceil(Math.sqrt(naturalPixels / 120_000)))
    let minX = canvas.width
    let minY = canvas.height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < canvas.height; y += sampleStride) {
      for (let x = 0; x < canvas.width; x += sampleStride) {
        const alpha = data[(y * canvas.width + x) * 4 + 3] ?? 0

        if (alpha > 8) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      resetPreviewImageVisibleCenter(root)
      return
    }

    const imageRect = image.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    const style = getComputedStyle(root)
    const currentShiftX = Number.parseFloat(style.getPropertyValue('--tp-preview-visible-shift-x')) || 0
    const currentShiftY = Number.parseFloat(style.getPropertyValue('--tp-preview-visible-shift-y')) || 0
    const renderedScale = Math.min(
      imageRect.width / image.naturalWidth,
      imageRect.height / image.naturalHeight,
    )
    const renderedWidth = image.naturalWidth * renderedScale
    const renderedHeight = image.naturalHeight * renderedScale
    const renderedLeft = imageRect.left + (imageRect.width - renderedWidth) / 2
    const renderedTop = imageRect.top + (imageRect.height - renderedHeight) / 2
    const visibleCenterX = renderedLeft - currentShiftX + ((minX + maxX + 1) / 2) * renderedScale
    const visibleCenterY = renderedTop - currentShiftY + ((minY + maxY + 1) / 2) * renderedScale
    const rootCenterX = rootRect.left + rootRect.width / 2
    const rootCenterY = rootRect.top + rootRect.height / 2
    const shiftX = Math.round((rootCenterX - visibleCenterX) * 100) / 100
    const shiftY = Math.round((rootCenterY - visibleCenterY) * 100) / 100

    root.style.setProperty('--tp-preview-visible-shift-x', `${shiftX}px`)
    root.style.setProperty('--tp-preview-visible-shift-y', `${shiftY}px`)
  } catch {
    resetPreviewImageVisibleCenter(root)
  }
}

export { resetPreviewImageVisibleCenter, syncPreviewImageVisibleCenter }
