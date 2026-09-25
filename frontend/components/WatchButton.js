'use client'

import { useWatchlist } from '@/lib/watchlist'

// Star toggle for adding/removing a stock from the viewer's watchlist.
// Keep it outside <Link> elements: a button nested in a link is invalid HTML.
export default function WatchButton({ symbol, name, withLabel = false }) {
  const { has, toggle, full } = useWatchlist()
  const watched = has(symbol)
  const label = watched ? `Remove ${name ?? symbol} from watchlist` : `Add ${name ?? symbol} to watchlist`
  const disabled = !watched && full

  return (
    <button
      type="button"
      onClick={() => toggle(symbol)}
      disabled={disabled}
      aria-pressed={watched}
      aria-label={label}
      title={disabled ? 'Watchlist is full (50 stocks)' : label}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md transition-colors disabled:opacity-40 ${
        withLabel ? 'border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50' : 'p-1.5 hover:bg-gray-100'
      } ${watched ? 'text-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
        <path
          d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z"
          fill={watched ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      {withLabel && <span className="text-gray-700">{watched ? 'Watching' : 'Watchlist'}</span>}
    </button>
  )
}
