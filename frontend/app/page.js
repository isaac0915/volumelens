'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDate, formatLots, formatPct, formatTime, rvolStyle, toneOf } from '@/lib/format'
import { useWatchlist } from '@/lib/watchlist'
import WatchButton from '@/components/WatchButton'

const INDEX_NAMES = { TAIEX: 'TAIEX', TPEX: 'TPEx Index' }
const REPO_URL = 'https://github.com/isaac0915/volumelens'

const STOCKS_POLL_MS = 5000 // live quotes are cached ~10s server-side
const MARKET_POLL_MS = 15000
const SPIKES_POLL_MS = 10 * 60 * 1000

// Poll a JSON endpoint; returns [data, error]. The previous data is kept on error.
// A null url pauses polling.
function usePolling(url, intervalMs) {
  const [state, setState] = useState({ data: null, error: null })

  useEffect(() => {
    if (!url) return
    let cancelled = false
    const load = () => {
      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`Request failed: ${res.status}`)
          return res.json()
        })
        .then(json => {
          if (!cancelled) setState({ data: json, error: null })
        })
        .catch(err => {
          if (!cancelled) setState(s => ({ ...s, error: err.message }))
        })
    }
    load()
    const timer = setInterval(load, intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [url, intervalMs])

  return [state.data, state.error]
}

function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-xl border border-gray-200 bg-white ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-gray-100 px-5 py-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="font-semibold text-gray-900">{title}</h2>
            {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

function HeroStat({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-white sm:text-3xl">{value ?? '–'}</dd>
    </div>
  )
}

// Explains the product at a glance for first-time visitors
function Hero({ status, market, spikes }) {
  const session = market?.latest_session ? formatDate(market.latest_session) : null
  return (
    <section className="overflow-hidden rounded-2xl bg-gray-900 px-6 py-8 sm:px-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            <span className={`h-2 w-2 rounded-full ${status.dot}`} />
            {status.text}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Spot unusual trading volume across Taiwan&apos;s stock market.
          </h1>
          <p className="mt-3 text-gray-300">
            VolumeLens compares each TWSE and TPEx stock&apos;s volume with its 20-day average (relative volume), at
            the close and live during market hours, so the stocks drawing unusual interest stand out.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/radar"
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-400"
            >
              View unusual volume
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Source on GitHub
            </a>
          </div>
        </div>
        <dl className="grid shrink-0 grid-cols-3 gap-6 lg:gap-10">
          <HeroStat label="Stocks tracked" value={market?.tracked_symbols?.toLocaleString('en-US')} />
          <HeroStat label={session ? `Unusual on ${session}` : 'Unusual volume'} value={spikes?.total} />
          <HeroStat label="Latest session" value={session} />
        </dl>
      </div>
    </section>
  )
}

function IndexCard({ index, marketOpen }) {
  const tone = toneOf(index.change)
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-gray-500">{INDEX_NAMES[index.key] ?? index.key}</p>
        <p className="text-xs text-gray-400">
          {marketOpen ? `As of ${index.time.slice(0, 5)} Taipei` : `Close · ${formatDate(index.date)}`}
        </p>
      </div>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone.text}`}>
        {index.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      <p className={`mt-1 text-sm font-medium tabular-nums ${tone.text}`}>
        {tone.arrow} {Math.abs(index.change).toFixed(2)} ({formatPct(index.change_pct)})
      </p>
    </div>
  )
}

function IndexCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white px-5 py-4">
      <div className="h-4 w-20 rounded bg-gray-200" />
      <div className="mt-3 h-8 w-40 rounded bg-gray-200" />
      <div className="mt-2 h-4 w-28 rounded bg-gray-100" />
    </div>
  )
}

function WatchlistRow({ stock }) {
  // change is vs the previous close, from the live quote or the daily candle
  const change = stock.change ?? 0
  const prevClose = stock.price - change
  const pct = prevClose ? (change / prevClose) * 100 : 0
  const tone = toneOf(change)

  // The star sits beside the link, not inside it: a button nested in a link is invalid HTML
  return (
    <div className="flex items-center transition-colors hover:bg-gray-50">
      <Link href={`/stock/${stock.symbol}`} className="flex min-w-0 flex-1 items-center gap-4 py-4 pl-5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900">
            {stock.name} <span className="ml-1 text-sm font-normal text-gray-400">{stock.symbol}</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            Vol {formatLots(stock.volume)} ·{' '}
            {stock.source === 'close' ? `Close · ${formatDate(stock.updated_at)}` : `${formatTime(stock.updated_at)} Taipei`}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-xl font-semibold tabular-nums ${tone.text}`}>{stock.price.toFixed(2)}</p>
          <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${tone.badge}`}>
            {tone.arrow} {Math.abs(change).toFixed(2)} ({formatPct(pct)})
          </span>
        </div>
      </Link>
      <div className="pl-2 pr-3">
        <WatchButton symbol={stock.symbol} name={stock.name} />
      </div>
    </div>
  )
}

function SpikeRow({ rank, stock }) {
  const tone = toneOf(stock.change)
  return (
    <div className="flex items-center transition-colors hover:bg-gray-50">
      <Link
        href={`/stock/${stock.symbol}`}
        className="grid min-w-0 flex-1 grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 py-3 pl-4 sm:pl-5"
      >
        <span className="text-sm font-semibold tabular-nums text-gray-400">{rank}</span>
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">
            {stock.name} <span className="ml-1 text-sm font-normal text-gray-400">{stock.symbol}</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-400 tabular-nums">
            Vol {formatLots(stock.volume)} · 20D avg {formatLots(stock.average_volume)}
          </p>
        </div>
        <div className="text-right tabular-nums">
          <p className={`text-sm font-medium ${tone.text}`}>{stock.close.toFixed(2)}</p>
          <p className={`text-xs ${tone.text}`}>{formatPct(stock.change_pct)}</p>
        </div>
        <span className={`w-16 rounded-full px-2 py-0.5 text-center text-sm font-semibold tabular-nums ${rvolStyle(stock.ratio)}`}>
          {stock.ratio.toFixed(1)}×
        </span>
      </Link>
      <div className="w-12 pl-2 pr-3">
        <WatchButton symbol={stock.symbol} name={stock.name} />
      </div>
    </div>
  )
}

function RowSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-4 px-5 py-4">
      <div className="flex-1">
        <div className="h-4 w-32 rounded bg-gray-200" />
        <div className="mt-2 h-3 w-40 rounded bg-gray-100" />
      </div>
      <div className="h-6 w-16 rounded bg-gray-200" />
    </div>
  )
}

export default function Home() {
  const { symbols } = useWatchlist()
  const quotesUrl = symbols.length ? `/api/quotes?symbols=${symbols.map(encodeURIComponent).join(',')}` : null
  const [stocksRes, stocksError] = usePolling(quotesUrl, STOCKS_POLL_MS)
  const [marketRes] = usePolling('/api/market', MARKET_POLL_MS)
  const [spikesRes, spikesError] = usePolling('/api/daily-spikes?limit=8', SPIKES_POLL_MS)

  const marketOpen = stocksRes?.market_open ?? marketRes?.market_open ?? null
  // Filter by the current list so a removed stock disappears before the next fetch
  const stockList = symbols.length === 0 ? [] : stocksRes ? stocksRes.data.filter(s => symbols.includes(s.symbol)) : null
  const market = marketRes?.data
  const indices = market?.indices
  const spikes = spikesRes?.data

  let status = { dot: 'bg-gray-300', text: 'Connecting…' }
  if (stocksError) status = { dot: 'bg-red-500', text: 'Connection issue' }
  else if (marketOpen) status = { dot: 'bg-green-500 animate-pulse', text: 'Market open · live' }
  else if (marketOpen === false) status = { dot: 'bg-gray-400', text: 'Market closed · showing last close' }

  return (
    <div className="space-y-6">
      <Hero status={status} market={market} spikes={spikes} />

      {stocksError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Can&apos;t reach the server ({stocksError}). Showing the last data received.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {indices
          ? indices.map(index => <IndexCard key={index.key} index={index} marketOpen={marketOpen} />)
          : [0, 1].map(i => <IndexCardSkeleton key={i} />)}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card title="Watchlist" subtitle="Saved in this browser" className="lg:col-span-2 self-start">
          <div className="divide-y divide-gray-100">
            {!stockList && [0, 1].map(i => <RowSkeleton key={i} />)}
            {stockList?.length === 0 && <p className="px-5 py-6 text-sm text-gray-400">Star ☆ any stock to add it to your watchlist.</p>}
            {stockList?.map(stock => <WatchlistRow key={stock.symbol} stock={stock} />)}
          </div>
        </Card>

        <Card
          title="Unusual Volume · End of Day"
          subtitle={spikes?.date ? `${formatDate(spikes.date)} · ${spikes.total} stocks at ≥2× 20-day avg volume` : null}
          action={<Link href="/radar" className="text-sm font-medium text-blue-600 hover:underline">Intraday scanner →</Link>}
          className="lg:col-span-3"
        >
          <div className="flex border-b border-gray-100 text-xs text-gray-400">
            <div className="grid flex-1 grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] gap-3 py-2 pl-4 sm:pl-5">
              <span>#</span>
              <span>Stock</span>
              <span className="text-right">Close</span>
              <span className="w-16 text-center">RVOL</span>
            </div>
            <span className="w-12" />
          </div>
          <div className="divide-y divide-gray-100">
            {!spikes && !spikesError && [0, 1, 2, 3, 4].map(i => <RowSkeleton key={i} />)}
            {spikesError && !spikes && <p className="px-5 py-4 text-sm text-red-600">Couldn&apos;t load rankings ({spikesError}).</p>}
            {spikes?.stocks.length === 0 && <p className="px-5 py-4 text-sm text-gray-400">No unusual volume on the latest trading day.</p>}
            {spikes?.stocks.map((stock, i) => <SpikeRow key={stock.symbol} rank={i + 1} stock={stock} />)}
          </div>
        </Card>
      </div>
    </div>
  )
}
