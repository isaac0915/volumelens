export function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('zh-TW', { hour12: false })
}

export function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-TW', { hour12: false })
}
