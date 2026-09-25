'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatTime } from '@/lib/format'

const STOCKS_POLL_MS = 3000
const MARKET_POLL_MS = 15000
const SPIKES_POLL_MS = 10 * 60 * 1000

// Taiwan convention: red = up, green = down
const TONE = {
  up: { text: 'text-red-600', badge: 'bg-red-50 text-red-600', arrow: '▲' },
  down: { text: 'text-green-600', badge: 'bg-green-50 text-green-600', arrow: '▼' },
  flat: { text: 'text-gray-900', badge: 'bg-gray-100 text-gray-500', arrow: '–' },
}

function toneOf(change) {
  return TONE[change > 0 ? 'up' : change < 0 ? 'down' : 'flat']
}

// "2026-09-24" -> "9/24"
function formatShortDate(isoDate) {
  const [, m, d] = isoDate.split('-').map(Number)
  return `${m}/${d}`
}

function formatPct(pct) {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
}

// Poll a JSON endpoint; returns [data, error]. The previous data is kept on error.
function usePolling(url, intervalMs) {
  const [state, setState] = useState({ data: null, error: null })

  useEffect(() => {
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

function IndexCard({ index, marketOpen }) {
  const tone = toneOf(index.change)
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-gray-500">{index.name}</p>
        <p className="text-xs text-gray-400">
          {marketOpen ? `${index.time.slice(0, 5)} 更新` : `${formatShortDate(index.date)} 收盤`}
        </p>
      </div>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone.text}`}>
        {index.value.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      <p className={`mt-1 text-sm font-medium tabular-nums ${tone.text}`}>
        {tone.arrow} {Math.abs(index.change).toFixed(2)}（{formatPct(index.change_pct)}）
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

  return (
    <Link
      href={`/stock/${stock.symbol}`}
      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-900">
          {stock.name} <span className="ml-1 text-sm font-normal text-gray-400">{stock.symbol}</span>
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          成交量 {stock.volume.toLocaleString()} 張 ·{' '}
          {stock.source === 'close' ? `${formatShortDate(stock.updated_at)} 收盤` : `更新於 ${formatTime(stock.updated_at)}`}
        </p>
      </div>
      <div className="text-right">
        <p className={`text-xl font-semibold tabular-nums ${tone.text}`}>{stock.price.toFixed(2)}</p>
        <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${tone.badge}`}>
          {tone.arrow} {Math.abs(change).toFixed(2)}（{formatPct(pct)}）
        </span>
      </div>
    </Link>
  )
}

function ratioStyle(ratio) {
  if (ratio >= 5) return 'bg-red-600 text-white'
  if (ratio >= 3) return 'bg-red-100 text-red-700'
  return 'bg-orange-50 text-orange-700'
}

function SpikeRow({ rank, stock }) {
  const tone = toneOf(stock.change)
  return (
    <Link
      href={`/stock/${stock.symbol}`}
      className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 sm:px-5 transition-colors hover:bg-gray-50"
    >
      <span className="text-sm font-semibold tabular-nums text-gray-400">{rank}</span>
      <div className="min-w-0">
        <p className="truncate font-medium text-gray-900">
          {stock.name} <span className="ml-1 text-sm font-normal text-gray-400">{stock.symbol}</span>
        </p>
        <p className="mt-0.5 text-xs text-gray-400 tabular-nums">
          {stock.volume.toLocaleString()} 張 · 均量 {stock.average_volume.toLocaleString()} 張
        </p>
      </div>
      <div className="text-right tabular-nums">
        <p className={`text-sm font-medium ${tone.text}`}>{stock.close.toFixed(2)}</p>
        <p className={`text-xs ${tone.text}`}>{formatPct(stock.change_pct)}</p>
      </div>
      <span className={`w-16 rounded-full px-2 py-0.5 text-center text-sm font-semibold tabular-nums ${ratioStyle(stock.ratio)}`}>
        {stock.ratio.toFixed(1)}×
      </span>
    </Link>
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
  const [stocksRes, stocksError] = usePolling('/api/stocks', STOCKS_POLL_MS)
  const [marketRes] = usePolling('/api/market', MARKET_POLL_MS)
  const [spikesRes, spikesError] = usePolling('/api/daily-spikes?limit=8', SPIKES_POLL_MS)

  const marketOpen = stocksRes?.market_open ?? marketRes?.market_open ?? null
  const stockList = stocksRes ? Object.values(stocksRes.data) : null
  const indices = marketRes?.data.indices
  const spikes = spikesRes?.data

  let status = { dot: 'bg-gray-300', text: '連線中…' }
  if (stocksError) status = { dot: 'bg-red-500', text: '連線異常' }
  else if (marketOpen) status = { dot: 'bg-green-500 animate-pulse', text: '盤中即時更新' }
  else if (marketOpen === false) status = { dot: 'bg-gray-400', text: '已收盤 · 顯示最近收盤資料' }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">市場總覽</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className={`h-2 w-2 rounded-full ${status.dot}`} />
          {status.text}
        </div>
      </div>

      {stocksError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          無法連線到伺服器（{stocksError}），目前顯示最後取得的資料。
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {indices
          ? indices.map(index => <IndexCard key={index.key} index={index} marketOpen={marketOpen} />)
          : [0, 1].map(i => <IndexCardSkeleton key={i} />)}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card title="自選股" className="lg:col-span-2 self-start">
          <div className="divide-y divide-gray-100">
            {!stockList && [0, 1].map(i => <RowSkeleton key={i} />)}
            {stockList?.length === 0 && <p className="px-5 py-4 text-sm text-gray-400">目前沒有資料。</p>}
            {stockList?.map(stock => <WatchlistRow key={stock.symbol} stock={stock} />)}
          </div>
        </Card>

        <Card
          title="收盤爆量排行"
          subtitle={spikes?.date ? `${formatShortDate(spikes.date)} · 共 ${spikes.total} 檔成交量達 20 日均量 2 倍` : null}
          action={<Link href="/radar" className="text-sm font-medium text-blue-600 hover:underline">盤中爆量雷達 →</Link>}
          className="lg:col-span-3"
        >
          <div className="divide-y divide-gray-100">
            {!spikes && !spikesError && [0, 1, 2, 3, 4].map(i => <RowSkeleton key={i} />)}
            {spikesError && !spikes && <p className="px-5 py-4 text-sm text-red-600">無法載入爆量排行（{spikesError}）。</p>}
            {spikes?.stocks.length === 0 && <p className="px-5 py-4 text-sm text-gray-400">最近一個交易日沒有爆量股票。</p>}
            {spikes?.stocks.map((stock, i) => <SpikeRow key={stock.symbol} rank={i + 1} stock={stock} />)}
          </div>
        </Card>
      </div>
    </div>
  )
}
