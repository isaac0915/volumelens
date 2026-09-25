'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDate, formatLots, formatPct, formatTime, marketHoursLocal, rvolStyle, toneOf } from '@/lib/format'

const INTRADAY_RANGES = [
  { days: 1, label: 'Today' },
  { days: 3, label: '3 days' },
  { days: 7, label: '7 days' },
]
const POLL_MS = 60000 // the scanner completes a full pass about once a minute

function useJson(url) {
  const [state, setState] = useState({ data: null, error: null, url: null })

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`Request failed: ${res.status}`)
          return res.json()
        })
        .then(json => {
          if (!cancelled) setState({ data: json.data, error: null, url })
        })
        .catch(err => {
          if (!cancelled) setState(s => ({ ...s, error: err.message, url }))
        })
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [url])

  // Don't show the previous URL's data while a new range loads
  return state.url === url ? [state.data, state.error] : [null, null]
}

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
      }`}
    >
      {children}
    </button>
  )
}

function RvolBadge({ ratio }) {
  return (
    <span className={`justify-self-end rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums ${rvolStyle(ratio)}`}>
      {ratio.toFixed(1)}×
    </span>
  )
}

const EOD_COLUMNS = 'grid-cols-[4rem_minmax(0,1fr)_auto] sm:grid-cols-[4rem_minmax(0,1fr)_6rem_6rem_6rem_5rem]'
const INTRADAY_COLUMNS = 'grid-cols-[4rem_minmax(0,1fr)_auto] sm:grid-cols-[4rem_minmax(0,1fr)_6rem_6rem_5rem_5rem]'

function EndOfDay() {
  const [data, error] = useJson('/api/daily-spikes?limit=100')

  if (error) return <ErrorBox>Couldn&apos;t load end-of-day data ({error}).</ErrorBox>
  if (!data) return <p className="text-sm text-gray-500">Loading…</p>
  if (data.stocks.length === 0) return <Empty title="No unusual volume on the latest trading day." />

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <h2 className="font-semibold text-gray-900">
          {formatDate(data.date, { weekday: 'short', month: 'short', day: 'numeric' })}
        </h2>
        <span className="text-sm text-gray-400">
          {data.total} stocks{data.total > data.stocks.length ? ` · top ${data.stocks.length} shown` : ''}
        </span>
      </div>
      <div className={`hidden gap-3 border-b border-gray-100 px-4 py-2 text-xs text-gray-400 sm:grid ${EOD_COLUMNS}`}>
        <span>Symbol</span>
        <span>Name</span>
        <span className="text-right">Close</span>
        <span className="text-right">Volume</span>
        <span className="text-right">20D Avg</span>
        <span className="text-right">RVOL</span>
      </div>
      <div className="divide-y divide-gray-100">
        {data.stocks.map(stock => {
          const tone = toneOf(stock.change)
          return (
            <Link
              key={stock.symbol}
              href={`/stock/${stock.symbol}`}
              className={`grid items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${EOD_COLUMNS}`}
            >
              <span className="font-semibold tabular-nums text-gray-900">{stock.symbol}</span>
              <span className="truncate text-gray-700">{stock.name}</span>
              <span className={`hidden text-right text-sm tabular-nums sm:block ${tone.text}`}>
                {stock.close.toFixed(2)} <span className="text-xs">{formatPct(stock.change_pct)}</span>
              </span>
              <span className="hidden text-right text-sm tabular-nums text-gray-600 sm:block">{formatLots(stock.volume)}</span>
              <span className="hidden text-right text-sm tabular-nums text-gray-400 sm:block">{formatLots(stock.average_volume)}</span>
              <RvolBadge ratio={stock.ratio} />
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function Intraday() {
  const [days, setDays] = useState(7)
  const [groups, error] = useJson(`/api/alerts?days=${days}`)

  // How many days in the selected range each symbol was flagged
  const flaggedDays = {}
  for (const group of groups ?? []) {
    for (const stock of group.stocks) flaggedDays[stock.symbol] = (flaggedDays[stock.symbol] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {INTRADAY_RANGES.map(r => (
          <Pill key={r.days} active={days === r.days} onClick={() => setDays(r.days)}>{r.label}</Pill>
        ))}
      </div>

      {error && <ErrorBox>Couldn&apos;t load scanner alerts ({error}).</ErrorBox>}
      {!error && !groups && <p className="text-sm text-gray-500">Loading…</p>}
      {groups?.length === 0 && (
        <Empty title="No intraday alerts in this period.">
          The scanner only runs while the market is open,{' '}
          <span suppressHydrationWarning>{marketHoursLocal()}</span> your time.
          The End of Day tab shows the latest session.
        </Empty>
      )}

      {groups?.map(group => (
        <section key={group.date} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-baseline justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="font-semibold text-gray-900">
              {formatDate(group.date, { weekday: 'short', month: 'short', day: 'numeric' })}
            </h2>
            <span className="text-sm text-gray-400">{group.stocks.length} stocks</span>
          </div>
          <div className={`hidden gap-3 border-b border-gray-100 px-4 py-2 text-xs text-gray-400 sm:grid ${INTRADAY_COLUMNS}`}>
            <span>Symbol</span>
            <span>Name</span>
            <span className="text-right">Peak Volume</span>
            <span className="text-right">20D Avg</span>
            <span className="text-right">Last Seen</span>
            <span className="text-right">RVOL</span>
          </div>
          <div className="divide-y divide-gray-100">
            {group.stocks.map(stock => (
              <Link
                key={stock.symbol}
                href={`/stock/${stock.symbol}`}
                className={`grid items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${INTRADAY_COLUMNS}`}
              >
                <span className="font-semibold tabular-nums text-gray-900">{stock.symbol}</span>
                <span className="truncate text-gray-700">
                  {stock.name}
                  {flaggedDays[stock.symbol] > 1 && (
                    <span className="ml-2 rounded bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                      {flaggedDays[stock.symbol]}-day streak
                    </span>
                  )}
                </span>
                <span className="hidden text-right text-sm tabular-nums text-gray-600 sm:block">{formatLots(stock.max_volume)}</span>
                <span className="hidden text-right text-sm tabular-nums text-gray-400 sm:block">{formatLots(stock.average_volume)}</span>
                <span className="hidden text-right text-xs tabular-nums text-gray-400 sm:block">{formatTime(stock.last_detected_at)}</span>
                <RvolBadge ratio={stock.ratio} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ErrorBox({ children }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{children}</div>
}

function Empty({ title, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
      <p className="font-medium text-gray-700">{title}</p>
      {children && <p className="mt-2 text-sm text-gray-400">{children}</p>}
    </div>
  )
}

export default function UnusualVolumePage() {
  const [tab, setTab] = useState('eod')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Unusual Volume</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-500">
          Stocks trading at 2× or more of their 20-day average daily volume (relative volume, RVOL), with at least
          500K shares traded, across ~2,300 TWSE and TPEx listings. End of Day ranks the latest session&apos;s close;
          Intraday lists what the scanner flagged during market hours, once per stock per day at its peak RVOL.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'eod', label: 'End of Day' },
          { key: 'intraday', label: 'Intraday' },
        ].map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'eod' ? <EndOfDay /> : <Intraday />}
    </div>
  )
}
