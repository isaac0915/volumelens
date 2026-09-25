'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { formatTime, formatDateTime } from '@/lib/format'
import { ChartTheme, PriceLineChart, VolumeBarChart, CandlestickChart } from './Charts'

export default function StockDetailPage() {
  const { symbol } = useParams()
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const fetchDetail = () => {
      fetch(`/api/stocks/${symbol}/detail?limit=200`)
        .then(res => {
          if (!res.ok) throw new Error(`Request failed: ${res.status}`)
          return res.json()
        })
        .then(data => {
          if (!cancelled) {
            setDetail(data.data)
            setError(null)
          }
        })
        .catch(err => {
          if (!cancelled) setError(err.message)
        })
    }

    fetchDetail()
    const interval = setInterval(fetchDetail, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [symbol])

  const points = detail
    ? [...detail.history].reverse().map(q => ({ time: q.recorded_at, price: q.price, volume: q.volume }))
    : []
  const candles = detail
    ? detail.daily_candles.map(c => ({
      time: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))
    : []

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <ChartTheme />

      <Link href="/" className="text-sm text-blue-600 hover:underline">← 台股監控</Link>

      <div className="flex items-baseline gap-3 mt-4 mb-6 flex-wrap">
        <h1 className="text-3xl font-bold text-gray-900">{detail?.current?.name ?? symbol}</h1>
        <span className="text-lg text-gray-400">{symbol}</span>
        {detail?.current && (
          <span className="text-2xl font-semibold text-gray-900 ml-auto tabular-nums">
            {detail.current.price.toFixed(2)}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
          Couldn&apos;t load stock data ({error}).
        </div>
      )}

      {!error && !detail && <p className="text-gray-500 text-sm">Loading…</p>}

      {detail && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500">Current volume</p>
              <p className="text-xl font-semibold tabular-nums">{detail.current?.volume?.toLocaleString() ?? '–'}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500">5-day avg volume</p>
              <p className="text-xl font-semibold tabular-nums">{Math.round(detail.average_volume_5d).toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500">Data points</p>
              <p className="text-xl font-semibold tabular-nums">{points.length}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500">Last updated</p>
              <p className="text-xl font-semibold">{formatTime(detail.current?.updated_at)}</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Price</h2>
            <PriceLineChart points={points} />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">日 K 線</h2>
            <CandlestickChart data={candles} />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Volume</h2>
            <VolumeBarChart points={points} />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent volume alerts</h2>
            {detail.alerts.length === 0 && <p className="text-sm text-gray-400">No spikes detected recently.</p>}
            {detail.alerts.length > 0 && (
              <ul className="space-y-1">
                {detail.alerts.map((a, i) => (
                  <li key={i} className="text-sm flex justify-between text-gray-600">
                    <span>{formatDateTime(a.detected_at)}</span>
                    <span className="font-medium text-orange-600">{a.ratio.toFixed(1)}× avg</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent quotes</h2>
            {detail.history.length === 0 && <p className="text-sm text-gray-400">No history yet.</p>}
            {detail.history.length > 0 && (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400">
                      <th className="font-normal pb-1">Time</th>
                      <th className="font-normal pb-1 text-right">Price</th>
                      <th className="font-normal pb-1 text-right">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.history.slice(0, 30).map((q, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1 text-gray-500">{formatTime(q.recorded_at)}</td>
                        <td className="py-1 text-right tabular-nums">{q.price.toFixed(2)}</td>
                        <td className="py-1 text-right tabular-nums">{q.volume.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
