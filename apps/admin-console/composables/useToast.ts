const toast = ref<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

// 失败提示 3 秒即逝会让用户误以为任务已成功（爬虫监控实测反馈）。
// error 常驻直到手动关闭；warning 给足阅读时间；success 保持轻量。
const AUTO_DISMISS_MS: Record<'success' | 'error' | 'warning', number | null> = {
  success: 3000,
  warning: 6000,
  error: null,
}

export function showToast(message: string, type: 'success' | 'error' | 'warning' = 'success') {
  if (typeof clearTimeout !== 'undefined' && timer) {
    clearTimeout(timer)
    timer = null
  }
  toast.value = { message, type }
  const dismissAfter = AUTO_DISMISS_MS[type]
  if (dismissAfter === null || typeof setTimeout === 'undefined') return
  timer = setTimeout(() => {
    toast.value = null
    timer = null
  }, dismissAfter)
}

export function dismissToast() {
  if (typeof clearTimeout !== 'undefined' && timer) {
    clearTimeout(timer)
    timer = null
  }
  toast.value = null
}

export function useToast() {
  return { toast, show: showToast, dismiss: dismissToast }
}
