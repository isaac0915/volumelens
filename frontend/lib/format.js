// Market times are shown in Taipei time regardless of the viewer's timezone.
// Inputs must be timezone-aware ISO strings (e.g. "...+00:00"); a string
// without an offset would be read as the viewer's local time.
const TAIPEI = 'Asia/Taipei'

export function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: TAIPEI })
}

export function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TAIPEI,
  })
}

// Calendar dates ("2026-09-24") are already Taipei trading days; format them
// in UTC so the viewer's timezone can't shift the day.
export function formatDate(isoDate, options = { month: 'short', day: 'numeric' }) {
  if (!isoDate) return ''
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' })
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })

// The backend reports Taiwan volume in lots (張, 1 lot = 1,000 shares);
// the UI shows shares, e.g. 7,952 lots -> "7.95M"
export function formatLots(lots) {
  if (lots == null) return '–'
  return compact.format(lots * 1000)
}

export function formatPct(pct) {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
}

// Tailwind classes for a price change; text-up/text-down follow the color toggle
export function toneOf(change) {
  if (change > 0) return { text: 'text-up', badge: 'bg-up-soft text-up', arrow: '▲' }
  if (change < 0) return { text: 'text-down', badge: 'bg-down-soft text-down', arrow: '▼' }
  return { text: 'text-gray-900', badge: 'bg-gray-100 text-gray-500', arrow: '–' }
}

// Relative-volume severity; amber/orange so it doesn't read as up or down
export function rvolStyle(ratio) {
  if (ratio >= 5) return 'bg-orange-600 text-white'
  if (ratio >= 3) return 'bg-orange-100 text-orange-800'
  return 'bg-amber-50 text-amber-800'
}

// Taiwan market hours (09:00-13:30 Taipei = 01:00-05:30 UTC) in the viewer's timezone
export function marketHoursLocal() {
  const fmt = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const now = new Date()
  const open = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 1, 0))
  const close = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 30))
  const tz = close.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop()
  return `${fmt(open)}–${fmt(close)} ${tz}`
}
