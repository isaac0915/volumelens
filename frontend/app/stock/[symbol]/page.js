'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { formatDate, formatDateTime, formatLots, formatPct, formatTime, rvolStyle, toneOf } from '@/lib/format'
import { ChartTheme, PriceLineChart, VolumeBarChart, CandlestickChart } from './Charts'
import WatchButton from '@/components/WatchButton'

const RANGES = [
  { days: 30, label: '1M' },
  { days: 90, label: '3M' },
  { days: 180, label: '6M' },
]
// Same definition as the backend's /api/daily-spikes
const SPIKE_MULTIPLIER = 2
const SPIKE_MIN_LOTS = 500
const AVERAGE_DAYS = 20

// Each candle's volume vs the average of its previous 20 trading days (relative volume)
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
      fetch(`/api/stocks/${symbol}/detail`)
        .then(res => {
          if (!res.ok) throw new Error(res.status === 404 ? 'stock not found' : `Request failed: ${res.status}`)
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

  // The API returns candle volume in shares; the page works in lots (1 lot = 1,000 shares)
  // like the rest of the API, and formatLots() renders shares
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
  // date -> RVOL, for chart markers
  const spikeRatios = useMemo(() => new Map(spikes.map(c => [c.time, c.ratio])), [spikes])

  const latest = candles[candles.length - 1]
  const live = detail?.current
  // Intraday quotes (one per minute) from the latest session the poller recorded
  const points = detail
    ? detail.history.map(q => ({ time: q.recorded_at, price: q.price, volume: q.volume }))
    : []
  // Only show intraday charts for the latest trading day, not a stale session
  const showIntraday = points.length > 0 && latest && detail.session_date >= latest.time

  // Header price: the live quote when the poller tracks this symbol, else the latest close
  const price = live?.price ?? latest?.close
  const change = live?.change ?? latest?.change ?? 0
  const prevClose = price != null ? price - change : null
  const pct = prevClose ? (change / prevClose) * 100 : 0
  const tone = toneOf(change)
  const asOf = live
    ? `Live · ${formatTime(live.updated_at)} Taipei`
    : latest ? `Close · ${formatDate(latest.time, { weekday: 'short', month: 'short', day: 'numeric' })}` : null

  const cutoff = latest ? new Date(latest.time) : null
  cutoff?.setDate(cutoff.getDate() - rangeDays)
  const inRange = cutoff ? candles.filter(c => new Date(c.time) >= cutoff) : []
  const rangeHigh = inRange.length ? Math.max(...inRange.map(c => c.high)) : null
  const rangeLow = inRange.length ? Math.min(...inRange.map(c => c.low)) : null
  const recentSpikes = spikes.filter(c => cutoff && new Date(c.time) >= cutoff).reverse()

  const name = live?.name ?? detail?.name ?? symbol

  return (
    <div className="space-y-6">
      <ChartTheme />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-3xl font-bold text-gray-900">{name}</h1>
            <span className="text-lg text-gray-400">{symbol}</span>
            {detail?.exchange && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{detail.exchange}</span>
            )}
          </div>
          {asOf && <p className="mt-1 text-sm text-gray-400">{asOf}</p>}
          <div className="mt-3">
            <WatchButton symbol={symbol} name={name} withLabel />
          </div>
        </div>
        {price != null && (
          <div className="text-right">
            <p className={`text-4xl font-semibold tabular-nums ${tone.text}`}>{price.toFixed(2)}</p>
            <p className={`mt-1 text-sm font-medium tabular-nums ${tone.text}`}>
              {tone.arrow} {Math.abs(change).toFixed(2)} ({formatPct(pct)})
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load this stock ({error}).
        </div>
      )}

      {!error && !detail && <p className="text-sm text-gray-500">Loading…</p>}

      {detail && (
        <>
          {latest && (
            <div className="grid grid-cols-3 gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 sm:grid-cols-6">
              <Stat label="Open" value={latest.open.toFixed(2)} />
              <Stat label="High" value={latest.high.toFixed(2)} />
              <Stat label="Low" value={latest.low.toFixed(2)} />
              <Stat label="Volume" value={formatLots(latest.volume)} />
              <Stat label="Avg Vol (20D)" value={latest.avgVolume ? formatLots(latest.avgVolume) : '–'} />
              <Stat
                label="Rel. Volume"
                value={latest.ratio ? `${latest.ratio.toFixed(2)}×` : '–'}
                className={latest.ratio >= SPIKE_MULTIPLIER ? 'text-orange-600' : ''}
              />
            </div>
          )}

          <Card
            title="Daily Price & Volume"
            action={
              <div className="flex gap-1">
                {RANGES.map(r => (
                  <button
                    key={r.days}
                    type="button"
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
                <CandlestickChart candles={candles} spikeRatios={spikeRatios} rangeDays={rangeDays} />
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
                  <span>Period high <span className="font-medium tabular-nums text-gray-900">{rangeHigh?.toFixed(2)}</span></span>
                  <span>Period low <span className="font-medium tabular-nums text-gray-900">{rangeLow?.toFixed(2)}</span></span>
                  <span>Unusual volume days <span className="font-medium tabular-nums text-orange-600">{recentSpikes.length}</span></span>
                  <span className="text-gray-400">
                    <span className="text-orange-600">▼</span> RVOL ≥ {SPIKE_MULTIPLIER}× the 20-day average and ≥ 500K shares
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">No daily data yet.</p>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Unusual Volume Days">
              {recentSpikes.length === 0 && <p className="text-sm text-gray-400">None in this period.</p>}
              {recentSpikes.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {recentSpikes.map(c => {
                    const t = toneOf(c.change)
                    const prev = c.close - c.change
                    return (
                      <li key={c.time} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 py-2 text-sm">
                        <span className="tabular-nums text-gray-600">
                          {formatDate(c.time, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="tabular-nums text-gray-500">{formatLots(c.volume)}</span>
                        <span className={`w-16 text-right tabular-nums ${t.text}`}>{prev ? formatPct((c.change / prev) * 100) : ''}</span>
                        <span className={`w-14 rounded-full px-2 py-0.5 text-center font-semibold tabular-nums ${rvolStyle(c.ratio)}`}>
                          {c.ratio.toFixed(1)}×
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <Card title="Intraday Scanner Alerts">
              {detail.alerts.length === 0 && (
                <p className="text-sm text-gray-400">The intraday scanner hasn&apos;t flagged this stock recently.</p>
              )}
              {detail.alerts.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {detail.alerts.map((a, i) => (
                    <li key={i} className="flex justify-between py-2 text-sm text-gray-600">
                      <span className="tabular-nums">{formatDateTime(a.detected_at)} Taipei</span>
                      <span className="font-medium text-orange-600">{a.ratio.toFixed(1)}× RVOL</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {showIntraday && (
            <Card title={`Intraday · ${formatDate(detail.session_date)}`}>
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
