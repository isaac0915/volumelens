'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { formatTime, formatDateTime } from '@/lib/format'
import { ChartTheme, PriceLineChart, VolumeBarChart, CandlestickChart } from './Charts'

const RANGES = [
  { days: 30, label: '1 個月' },
  { days: 90, label: '3 個月' },
  { days: 180, label: '6 個月' },
]
// Same definition as the backend's /api/daily-spikes
const SPIKE_MULTIPLIER = 2
const SPIKE_MIN_LOTS = 500
const AVERAGE_DAYS = 20

// Taiwan convention: red = up, green = down
function toneOf(change) {
  if (change > 0) return { text: 'text-red-600', arrow: '▲' }
  if (change < 0) return { text: 'text-green-600', arrow: '▼' }
  return { text: 'text-gray-900', arrow: '–' }
}

function formatPct(pct) {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
}

// "2026-09-24" -> "9/24"
function formatShortDate(isoDate) {
  const [, m, d] = isoDate.split('-').map(Number)
  return `${m}/${d}`
}

// Each candle's volume vs the average of its previous 20 trading days
function withVolumeRatios(candles) {
  return candles.map((c, i) => {
    const prev = candles.slice(Math.max(0, i - AVERAGE_DAYS), i)
    const avg = prev.length ? prev.reduce((sum, p) => sum + p.volume, 0) / prev.length : null
    return { ...c, avgVolume: avg, ratio: avg && prev.length >= 10 ? c.volume / avg : null }
  })
}

function Stat({ label, value, className = '' }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-semibold tabular-nums ${className}`}>{value}</p>
    </div>
  )
}

function Card({ title, action, children }) {
  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

export default function StockDetailPage() {
  const { symbol } = useParams()
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [rangeDays, setRangeDays] = useState(90)

  useEffect(() => {
    let cancelled = false

    const fetchDetail = () => {
      fetch(`/api/stocks/${symbol}/detail?limit=200`)
        .then(res => {
          if (!res.ok) throw new Error(res.status === 404 ? '找不到這檔股票' : `Request failed: ${res.status}`)
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

  // The API returns candle volume in shares; the UI works in lots (張)
  const candles = useMemo(
    () => withVolumeRatios((detail?.daily_candles ?? []).map(c => ({
      time: c.date, open: c.open, high: c.high, low: c.low, close: c.close,
      change: c.change, volume: Math.round(c.volume / 1000),
    }))),
    [detail?.daily_candles],
  )
  const spikes = useMemo(
    () => candles.filter(c => c.ratio >= SPIKE_MULTIPLIER && c.volume >= SPIKE_MIN_LOTS),
    [candles],
  )
  const spikeDates = useMemo(() => new Set(spikes.map(c => c.time)), [spikes])

  const latest = candles[candles.length - 1]
  const live = detail?.current
  const points = detail
    ? [...detail.history].reverse().map(q => ({ time: q.recorded_at, price: q.price, volume: q.volume }))
    : []

  // Header price: the live quote when the poller tracks this symbol, else the latest close
  const price = live?.price ?? latest?.close
  const change = live?.change ?? latest?.change ?? 0
  const prevClose = price != null ? price - change : null
  const pct = prevClose ? (change / prevClose) * 100 : 0
  const tone = toneOf(change)
  const asOf = live
    ? `盤中即時 · ${formatTime(live.updated_at)}`
    : latest ? `${formatShortDate(latest.time)} 收盤` : null

  const cutoff = latest ? new Date(latest.time) : null
  cutoff?.setDate(cutoff.getDate() - rangeDays)
  const inRange = cutoff ? candles.filter(c => new Date(c.time) >= cutoff) : []
  const rangeHigh = inRange.length ? Math.max(...inRange.map(c => c.high)) : null
  const rangeLow = inRange.length ? Math.min(...inRange.map(c => c.low)) : null
  const recentSpikes = spikes.filter(c => cutoff && new Date(c.time) >= cutoff).reverse()

  const name = live?.name ?? detail?.name ?? symbol
  const exchange = detail?.exchange === 'TWSE' ? '上市' : detail?.exchange === 'TPEx' ? '上櫃' : null

  return (
    <div className="space-y-6">
      <ChartTheme />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-3xl font-bold text-gray-900">{name}</h1>
            <span className="text-lg text-gray-400">{symbol}</span>
            {exchange && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{exchange}</span>}
          </div>
          {asOf && <p className="mt-1 text-sm text-gray-400">{asOf}</p>}
        </div>
        {price != null && (
          <div className="text-right">
            <p className={`text-4xl font-semibold tabular-nums ${tone.text}`}>{price.toFixed(2)}</p>
            <p className={`mt-1 text-sm font-medium tabular-nums ${tone.text}`}>
              {tone.arrow} {Math.abs(change).toFixed(2)}（{formatPct(pct)}）
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          無法載入股票資料（{error}）。
        </div>
      )}

      {!error && !detail && <p className="text-sm text-gray-500">載入中…</p>}

      {detail && (
        <>
          {latest && (
            <div className="grid grid-cols-3 gap-x-4 gap-y-4 rounded-xl border border-gray-200 bg-white px-5 py-4 sm:grid-cols-6">
              <Stat label="開盤" value={latest.open.toFixed(2)} />
              <Stat label="最高" value={latest.high.toFixed(2)} className="text-red-600" />
              <Stat label="最低" value={latest.low.toFixed(2)} className="text-green-600" />
              <Stat label="成交量（張）" value={latest.volume.toLocaleString()} />
              <Stat label="20 日均量（張）" value={latest.avgVolume ? Math.round(latest.avgVolume).toLocaleString() : '–'} />
              <Stat
                label="量比"
                value={latest.ratio ? `${latest.ratio.toFixed(2)}×` : '–'}
                className={latest.ratio >= SPIKE_MULTIPLIER ? 'text-orange-600' : ''}
              />
            </div>
          )}

          <Card
            title="日 K 線"
            action={
              <div className="flex gap-1">
                {RANGES.map(r => (
                  <button
                    key={r.days}
                    onClick={() => setRangeDays(r.days)}
                    className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                      rangeDays === r.days ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            }
          >
            {candles.length > 0 ? (
              <>
                <CandlestickChart candles={candles} spikeDates={spikeDates} rangeDays={rangeDays} />
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
                  <span>區間最高 <span className="font-medium tabular-nums text-red-600">{rangeHigh?.toFixed(2)}</span></span>
                  <span>區間最低 <span className="font-medium tabular-nums text-green-600">{rangeLow?.toFixed(2)}</span></span>
                  <span>區間爆量 <span className="font-medium tabular-nums text-orange-600">{recentSpikes.length}</span> 天</span>
                  <span className="text-gray-400">▼爆量：成交量達前 20 日均量 {SPIKE_MULTIPLIER} 倍且至少 {SPIKE_MIN_LOTS} 張</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">尚無日 K 資料。</p>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="區間爆量日">
              {recentSpikes.length === 0 && <p className="text-sm text-gray-400">這段期間沒有爆量。</p>}
              {recentSpikes.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {recentSpikes.map(c => {
                    const t = toneOf(c.change)
                    const prev = c.close - c.change
                    return (
                      <li key={c.time} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="text-gray-600 tabular-nums">{c.time}</span>
                        <span className="text-gray-500 tabular-nums">{c.volume.toLocaleString()} 張</span>
                        <span className={`tabular-nums ${t.text}`}>{prev ? formatPct((c.change / prev) * 100) : ''}</span>
                        <span className="rounded-full bg-orange-50 px-2 py-0.5 font-semibold tabular-nums text-orange-700">
                          {c.ratio.toFixed(1)}×
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <Card title="盤中爆量紀錄">
              {detail.alerts.length === 0 && <p className="text-sm text-gray-400">雷達近期沒有在盤中偵測到爆量。</p>}
              {detail.alerts.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {detail.alerts.map((a, i) => (
                    <li key={i} className="flex justify-between py-2 text-sm text-gray-600">
                      <span className="tabular-nums">{formatDateTime(a.detected_at)}</span>
                      <span className="font-medium text-orange-600">{a.ratio.toFixed(1)} 倍均量</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {points.length > 0 && (
            <Card title="盤中走勢">
              <div className="space-y-6">
                <PriceLineChart points={points} />
                <VolumeBarChart points={points} />
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
