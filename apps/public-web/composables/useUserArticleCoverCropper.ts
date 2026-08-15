const MAX_COVER_FILE_SIZE = 5 * 1024 * 1024
const CROP_VIEWPORT_WIDTH = 560
const CROP_VIEWPORT_HEIGHT = 315
const CROP_OUTPUT_WIDTH = 1280
const CROP_OUTPUT_HEIGHT = 720

export const useUserArticleCoverCropper = (options?: { canEdit?: Ref<boolean> | ComputedRef<boolean>; onError?: (message: string) => void; onApplied?: (message: string) => void }) => {
  const coverInputRef = ref<HTMLInputElement | null>(null)
  const pendingCoverFile = ref<File | null>(null)
  const coverPreviewUrl = ref('')
  const uploadingCover = ref(false)
  const cropVisible = ref(false)
  const cropSourceFile = ref<File | null>(null)
  const cropSourceUrl = ref('')
  const cropNaturalWidth = ref(0)
  const cropNaturalHeight = ref(0)
  const cropScale = ref(1)
  const cropOffsetX = ref(0)
  const cropOffsetY = ref(0)
  const cropDragActive = ref(false)
  const cropDragPointerId = ref<number | null>(null)
  const cropDragStartX = ref(0)
  const cropDragStartY = ref(0)
  const cropDragOriginOffsetX = ref(0)
  const cropDragOriginOffsetY = ref(0)

  const canEdit = computed(() => options?.canEdit?.value ?? true)

  const reportError = (message: string) => {
    options?.onError?.(message)
  }

  const reportApplied = (message: string) => {
    options?.onApplied?.(message)
  }

  const cropBaseScale = computed(() => {
    if (!cropNaturalWidth.value || !cropNaturalHeight.value) return 1
    return Math.max(
      CROP_VIEWPORT_WIDTH / cropNaturalWidth.value,
      CROP_VIEWPORT_HEIGHT / cropNaturalHeight.value,
    )
  })

  const cropRenderedWidth = computed(() => cropNaturalWidth.value * cropBaseScale.value * cropScale.value)
  const cropRenderedHeight = computed(() => cropNaturalHeight.value * cropBaseScale.value * cropScale.value)
  const cropImageStyle = computed(() => ({
    width: `${cropNaturalWidth.value * cropBaseScale.value}px`,
    height: `${cropNaturalHeight.value * cropBaseScale.value}px`,
    transform: `translate(-50%, -50%) translate(${cropOffsetX.value}px, ${cropOffsetY.value}px) scale(${cropScale.value})`,
  }))

  const validateCoverImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      reportError('请选择图片文件。')
      return false
    }
    if (file.size > MAX_COVER_FILE_SIZE) {
      reportError('封面图片不能超过 5MB。')
      return false
    }
    return true
  }

  const clearPendingCoverSelection = () => {
    pendingCoverFile.value = null
    if (coverPreviewUrl.value) {
      URL.revokeObjectURL(coverPreviewUrl.value)
    }
    coverPreviewUrl.value = ''
  }

  const clearCropSource = () => {
    cropSourceFile.value = null
    if (cropSourceUrl.value) {
      URL.revokeObjectURL(cropSourceUrl.value)
    }
    cropSourceUrl.value = ''
    cropNaturalWidth.value = 0
    cropNaturalHeight.value = 0
    cropScale.value = 1
    cropOffsetX.value = 0
    cropOffsetY.value = 0
    cropDragActive.value = false
    cropDragPointerId.value = null
  }

  const loadImageMeta = (fileUrl: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('封面读取失败。'))
    image.src = fileUrl
  })

  const clampCropOffsets = () => {
    const limitX = Math.max(0, (cropRenderedWidth.value - CROP_VIEWPORT_WIDTH) / 2)
    const limitY = Math.max(0, (cropRenderedHeight.value - CROP_VIEWPORT_HEIGHT) / 2)
    cropOffsetX.value = Math.min(limitX, Math.max(-limitX, cropOffsetX.value))
    cropOffsetY.value = Math.min(limitY, Math.max(-limitY, cropOffsetY.value))
  }

  const resetCropTransform = () => {
    cropScale.value = 1
    cropOffsetX.value = 0
    cropOffsetY.value = 0
  }

  const beginCropFromFile = async (file: File) => {
    if (!canEdit.value) return
    if (!validateCoverImage(file)) return
    uploadingCover.value = true
    const nextUrl = URL.createObjectURL(file)
    try {
      const meta = await loadImageMeta(nextUrl)
      clearCropSource()
      cropSourceFile.value = file
      cropSourceUrl.value = nextUrl
      cropNaturalWidth.value = meta.width
      cropNaturalHeight.value = meta.height
      resetCropTransform()
      cropVisible.value = true
    } catch (exception: unknown) {
      URL.revokeObjectURL(nextUrl)
      reportError(exception instanceof Error ? exception.message : '封面读取失败。')
    } finally {
      uploadingCover.value = false
    }
  }

  const openCoverPicker = () => {
    if (!canEdit.value) return
    coverInputRef.value?.click()
  }

  const handleCoverSelected = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) {
      await beginCropFromFile(file)
    }
    input.value = ''
  }

  const startCropDrag = (event: PointerEvent) => {
    if (cropDragActive.value) return
    cropDragActive.value = true
    cropDragPointerId.value = event.pointerId
    cropDragStartX.value = event.clientX
    cropDragStartY.value = event.clientY
    cropDragOriginOffsetX.value = cropOffsetX.value
    cropDragOriginOffsetY.value = cropOffsetY.value
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const handleCropDragMove = (event: PointerEvent) => {
    if (!cropDragActive.value || cropDragPointerId.value !== event.pointerId) return
    cropOffsetX.value = cropDragOriginOffsetX.value + (event.clientX - cropDragStartX.value)
    cropOffsetY.value = cropDragOriginOffsetY.value + (event.clientY - cropDragStartY.value)
    clampCropOffsets()
  }

  const endCropDrag = (event: PointerEvent) => {
    if (cropDragPointerId.value !== event.pointerId) return
    cropDragActive.value = false
    cropDragPointerId.value = null
  }

  const cancelCoverCrop = () => {
    cropVisible.value = false
    clearCropSource()
  }

  const renderCroppedCoverBlob = (sourceUrl: string) => new Promise<Blob>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = CROP_OUTPUT_WIDTH
      canvas.height = CROP_OUTPUT_HEIGHT
      const drawWidth = cropRenderedWidth.value
      const drawHeight = cropRenderedHeight.value
      const left = CROP_VIEWPORT_WIDTH / 2 + cropOffsetX.value - drawWidth / 2
      const top = CROP_VIEWPORT_HEIGHT / 2 + cropOffsetY.value - drawHeight / 2
      const sx = ((0 - left) / drawWidth) * image.naturalWidth
      const sy = ((0 - top) / drawHeight) * image.naturalHeight
      const sWidth = (CROP_VIEWPORT_WIDTH / drawWidth) * image.naturalWidth
      const sHeight = (CROP_VIEWPORT_HEIGHT / drawHeight) * image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('封面裁剪失败。'))
        return
      }
      context.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('封面裁剪失败。'))
          return
        }
        resolve(blob)
      }, 'image/jpeg', 0.92)
    }
    image.onerror = () => reject(new Error('封面裁剪失败。'))
    image.src = sourceUrl
  })

  const confirmCoverCrop = async () => {
    if (!cropSourceFile.value || !cropSourceUrl.value) {
      reportError('请先选择封面图片。')
      return
    }
    uploadingCover.value = true
    try {
      const blob = await renderCroppedCoverBlob(cropSourceUrl.value)
      const filenameBase = cropSourceFile.value.name.replace(/\.[^.]+$/, '') || 'cover'
      const croppedFile = new File([blob], `${filenameBase}-cropped.jpg`, { type: 'image/jpeg' })
      clearPendingCoverSelection()
      pendingCoverFile.value = croppedFile
      coverPreviewUrl.value = URL.createObjectURL(blob)
      cropVisible.value = false
      clearCropSource()
      reportApplied('封面裁剪已应用，保存草稿后上传生效。')
    } catch (exception: unknown) {
      reportError(exception instanceof Error ? exception.message : '封面裁剪失败。')
    } finally {
      uploadingCover.value = false
    }
  }

  watch(cropScale, clampCropOffsets)

  onUnmounted(() => {
    clearPendingCoverSelection()
    clearCropSource()
  })

  return {
    coverInputRef,
    pendingCoverFile,
    coverPreviewUrl,
    uploadingCover,
    cropVisible,
    cropSourceUrl,
    cropScale,
    cropImageStyle,
    openCoverPicker,
    handleCoverSelected,
    startCropDrag,
    handleCropDragMove,
    endCropDrag,
    resetCropTransform,
    cancelCoverCrop,
    confirmCoverCrop,
    clearPendingCoverSelection,
    beginCropFromFile,
    renderCroppedCoverBlob,
  }
}
