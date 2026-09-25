// Times are shown in Taipei time regardless of the viewer's timezone, since
// they describe the Taiwan market. Inputs must be timezone-aware ISO strings
// (e.g. "...+00:00"); a string without an offset would be read as the
// viewer's local time.
const TAIPEI = 'Asia/Taipei'

export function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('zh-TW', { hour12: false, timeZone: TAIPEI })
}

export function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-TW', { hour12: false, timeZone: TAIPEI })
}
