'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { formatTime } from '@/lib/format'

function StockCard({ stock, prevPrice }) {
  const delta = prevPrice != null ? stock.price - prevPrice : 0
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'

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
          {arrow[direction]} {Math.abs(delta).toFixed(2)}
        </span>
      </div>
      <p className={`text-3xl font-semibold mt-4 tabular-nums ${priceStyles[direction]}`}>
        {stock.price.toFixed(2)}
      </p>
      <p className="text-sm text-gray-600 mt-2">
        Volume: <span className="font-medium">{stock.volume.toLocaleString()}</span>
      </p>
      <p className="text-xs text-gray-400 mt-3">Updated {formatTime(stock.updated_at)}</p>
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
  const prevPricesRef = useRef({})

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
          setStocks(current => {
            const nextPrices = {}
            for (const symbol of Object.keys(current)) {
              nextPrices[symbol] = current[symbol].price
            }
            prevPricesRef.current = nextPrices
            return data.data
          })
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-3xl font-bold text-gray-900">台股監控</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className={`w-2 h-2 rounded-full ${error ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
          {error ? 'Connection issue' : lastFetched ? `Live · updated ${formatTime(lastFetched)}` : 'Connecting…'}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
          Couldn&apos;t reach the server ({error}). Showing last known data.
        </div>
      )}

      <div className="flex gap-4 flex-wrap">
        {loading && stockList.length === 0 &&
          Array.from({ length: 2 }).map((_, i) => <StockCardSkeleton key={i} />)}

        {!loading && stockList.length === 0 && !error && (
          <p className="text-gray-500">No stock data yet.</p>
        )}

        {stockList.map(stock => (
          <StockCard
            key={stock.symbol}
            stock={stock}
            prevPrice={prevPricesRef.current[stock.symbol]}
          />
        ))}
      </div>
    </div>
  )
}
