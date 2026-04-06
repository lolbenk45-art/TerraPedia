const toast = ref<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

export function showToast(message: string, type: 'success' | 'error' | 'warning' = 'success') {
  if (typeof clearTimeout !== 'undefined' && timer) clearTimeout(timer)
  toast.value = { message, type }
  timer = (typeof setTimeout !== 'undefined' &&
    setTimeout(() => {
      toast.value = null
      timer = null
    }, 3000)) as ReturnType<typeof setTimeout> | null
}

export function useToast() {
  return { toast, show: showToast }
}
