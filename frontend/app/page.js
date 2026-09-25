'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatTime } from '@/lib/format'

// "2026-09-24" -> "9/24"
function formatShortDate(isoDate) {
  const [, m, d] = isoDate.split('-').map(Number)
  return `${m}/${d}`
}

function StockCard({ stock }) {
  // change is vs the previous close, from the live quote or the daily candle
  const change = stock.change ?? 0
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'

  const badgeStyles = {
    up: 'bg-red-50 text-red-600',
    down: 'bg-green-50 text-green-600',
    flat: 'bg-gray-100 text-gray-500',
  }
  const priceStyles = {
    up: 'text-red-600',
    down: 'text-green-600',
    flat: 'text-gray-900',
  }
  const arrow = { up: '▲', down: '▼', flat: '–' }

  return (
    <Link
      href={`/stock/${stock.symbol}`}
      className="border border-gray-200 rounded-xl p-6 w-56 shadow-sm bg-white transition-shadow hover:shadow-md block focus:outline-none focus:ring-2 focus:ring-blue-400"
    >
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{stock.symbol}</h2>
          <p className="text-gray-500 mt-1 text-sm">{stock.name}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${badgeStyles[direction]}`}>
          {arrow[direction]} {Math.abs(change).toFixed(2)}
        </span>
      </div>
      <p className={`text-3xl font-semibold mt-4 tabular-nums ${priceStyles[direction]}`}>
        {stock.price.toFixed(2)}
      </p>
      <p className="text-sm text-gray-600 mt-2">
        成交量 <span className="font-medium">{stock.volume.toLocaleString()}</span> 張
      </p>
      <p className="text-xs text-gray-400 mt-3">
        {stock.source === 'close'
          ? `${formatShortDate(stock.updated_at)} 收盤`
          : `更新於 ${formatTime(stock.updated_at)}`}
      </p>
    </Link>
  )
}

function StockCardSkeleton() {
  return (
    <div className="border border-gray-200 rounded-xl p-6 w-56 shadow-sm bg-white animate-pulse">
      <div className="h-7 w-16 bg-gray-200 rounded" />
      <div className="h-4 w-24 bg-gray-100 rounded mt-2" />
      <div className="h-8 w-28 bg-gray-200 rounded mt-4" />
      <div className="h-4 w-32 bg-gray-100 rounded mt-3" />
    </div>
  )
}

export default function Home() {
  const [stocks, setStocks] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastFetched, setLastFetched] = useState(null)
  const [marketOpen, setMarketOpen] = useState(null)

  useEffect(() => {
    let cancelled = false

    const fetchStocks = () => {
      fetch('/api/stocks')
        .then(res => {
          if (!res.ok) throw new Error(`Request failed: ${res.status}`)
          return res.json()
        })
        .then(data => {
          if (cancelled) return
          setStocks(data.data)
          setMarketOpen(data.market_open)
          setError(null)
          setLastFetched(new Date().toISOString())
        })
        .catch(err => {
          if (!cancelled) setError(err.message)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }

    fetchStocks()
    const interval = setInterval(fetchStocks, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const stockList = Object.values(stocks)

  let status = { dot: 'bg-gray-300', text: '連線中…' }
  if (error) status = { dot: 'bg-red-500', text: '連線異常' }
  else if (marketOpen) status = { dot: 'bg-green-500 animate-pulse', text: `盤中即時 · ${formatTime(lastFetched)}` }
  else if (marketOpen === false) status = { dot: 'bg-gray-400', text: '已收盤 · 顯示最近收盤價' }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">自選股</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className={`w-2 h-2 rounded-full ${status.dot}`} />
          {status.text}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
          無法連線到伺服器（{error}），目前顯示最後取得的資料。
        </div>
      )}

      <div className="flex gap-4 flex-wrap">
        {loading && stockList.length === 0 &&
          Array.from({ length: 2 }).map((_, i) => <StockCardSkeleton key={i} />)}

        {!loading && stockList.length === 0 && !error && (
          <p className="text-gray-500">目前沒有資料。</p>
        )}

        {stockList.map(stock => (
          <StockCard key={stock.symbol} stock={stock} />
        ))}
      </div>
    </div>
  )
}
