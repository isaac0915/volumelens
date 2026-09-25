'use client'

import { useEffect, useRef, useState } from 'react'
import { formatLots, formatTime } from '@/lib/format'
import { useColorConvention } from '@/components/ColorConvention'
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries } from 'lightweight-charts'

const CHART_THEME_CSS = `
.viz-root {
  --surface-1: #fcfcfb;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --text-muted: #898781;
  --gridline: #e1e0d9;
  --baseline: #c3c2b7;
  --series-price: #2a78d6;
  --series-volume: #1baf7a;
}
@media (prefers-color-scheme: dark) {
  .viz-root {
    --surface-1: #1a1a19;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --gridline: #2c2c2a;
    --baseline: #383835;
    --series-price: #3987e5;
    --series-volume: #199e70;
  }
}
`

export function ChartTheme() {
  return <style>{CHART_THEME_CSS}</style>
}

function useContainerWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(entries => {
      setWidth(entries[0].contentRect.width)
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

function niceTicks(min, max, count) {
  if (min === max) return [min]
  const step = (max - min) / (count - 1)
  return Array.from({ length: count }, (_, i) => min + step * i)
}

const MARGIN = { top: 16, right: 12, bottom: 24, left: 64 }

export function PriceLineChart({ points }) {
  const [containerRef, width] = useContainerWidth()
  const [hoverIndex, setHoverIndex] = useState(null)
  const height = 260

  if (points.length === 0) {
    return <p className="text-sm text-gray-400">No intraday prices yet.</p>
  }

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 0)
  const plotHeight = height - MARGIN.top - MARGIN.bottom

  const prices = points.map(p => p.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const pad = (maxPrice - minPrice) * 0.1 || 1
  const yMin = minPrice - pad
  const yMax = maxPrice + pad

  const x = i => MARGIN.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * plotWidth)
  const y = price => MARGIN.top + (1 - (price - yMin) / (yMax - yMin)) * plotHeight

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.price)}`).join(' ')
  const areaPath = `${linePath} L ${x(points.length - 1)} ${MARGIN.top + plotHeight} L ${x(0)} ${MARGIN.top + plotHeight} Z`

  const yTicks = niceTicks(yMin, yMax, 4)
  const tickIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1]

  const last = points[points.length - 1]
  const hovered = hoverIndex != null ? points[hoverIndex] : null

  const handleMove = e => {
    if (!width) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const ratio = plotWidth === 0 ? 0 : (px - MARGIN.left) / plotWidth
    const idx = Math.round(ratio * (points.length - 1))
    setHoverIndex(Math.min(Math.max(idx, 0), points.length - 1))
  }

  return (
    <div className="viz-root">
      <div ref={containerRef} className="relative" style={{ background: 'var(--surface-1)' }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            onPointerMove={handleMove}
            onPointerLeave={() => setHoverIndex(null)}
          >
            {yTicks.map((t, i) => (
              <g key={i}>
                <line
                  x1={MARGIN.left}
                  x2={width - MARGIN.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--gridline)"
                  strokeWidth={1}
                />
                <text x={MARGIN.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--text-muted)">
                  {t.toFixed(2)}
                </text>
              </g>
            ))}

            {tickIdx.map((i, k) => (
              <text key={k} x={x(i)} y={height - 6} textAnchor={k === 0 ? 'start' : k === tickIdx.length - 1 ? 'end' : 'middle'} fontSize={11} fill="var(--text-muted)">
                {formatTime(points[i].time)}
              </text>
            ))}

            <path d={areaPath} fill="var(--series-price)" opacity={0.1} stroke="none" />
            <path d={linePath} fill="none" stroke="var(--series-price)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            <circle cx={x(points.length - 1)} cy={y(last.price)} r={4} fill="var(--series-price)" stroke="var(--surface-1)" strokeWidth={2} />
            <text x={x(points.length - 1) - 8} y={y(last.price) - 10} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--text-primary)">
              {last.price.toFixed(2)}
            </text>

            {hovered && (
              <>
                <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="var(--baseline)" strokeWidth={1} />
                <circle cx={x(hoverIndex)} cy={y(hovered.price)} r={4} fill="var(--series-price)" stroke="var(--surface-1)" strokeWidth={2} />
              </>
            )}
          </svg>
        )}

        {hovered && (
          <div
            className="absolute pointer-events-none rounded-lg shadow-md px-3 py-2 text-xs"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--gridline)',
              left: Math.min(x(hoverIndex) + 8, Math.max(width - 120, 0)),
              top: 8,
            }}
          >
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{hovered.price.toFixed(2)}</p>
            <p style={{ color: 'var(--text-secondary)' }}>{formatTime(hovered.time)}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function roundedTopBarPath(cx, baseY, topY, barWidth, radius) {
  const halfW = barWidth / 2
  const left = cx - halfW
  const right = cx + halfW
  const r = Math.min(radius, halfW, Math.max(baseY - topY, 0))
  if (baseY - topY <= 0) return ''
  return `
    M ${left} ${baseY}
    L ${left} ${topY + r}
    Q ${left} ${topY} ${left + r} ${topY}
    L ${right - r} ${topY}
    Q ${right} ${topY} ${right} ${topY + r}
    L ${right} ${baseY}
    Z
  `
}

export function VolumeBarChart({ points }) {
  const [containerRef, width] = useContainerWidth()
  const [hoverIndex, setHoverIndex] = useState(null)
  const height = 140

  if (points.length === 0) {
    return <p className="text-sm text-gray-400">No intraday volume yet.</p>
  }

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 0)
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  const maxVolume = Math.max(...points.map(p => p.volume), 1)

  const x = i => MARGIN.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * plotWidth)
  const barWidth = Math.min(24, (plotWidth / points.length) * 0.7)
  const baseY = MARGIN.top + plotHeight

  const handleMove = e => {
    if (!width) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const ratio = plotWidth === 0 ? 0 : (px - MARGIN.left) / plotWidth
    const idx = Math.round(ratio * (points.length - 1))
    setHoverIndex(Math.min(Math.max(idx, 0), points.length - 1))
  }

  const hovered = hoverIndex != null ? points[hoverIndex] : null

  return (
    <div className="viz-root">
      <div ref={containerRef} className="relative" style={{ background: 'var(--surface-1)' }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            onPointerMove={handleMove}
            onPointerLeave={() => setHoverIndex(null)}
          >
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={baseY} y2={baseY} stroke="var(--baseline)" strokeWidth={1} />
            <text x={MARGIN.left - 8} y={MARGIN.top} textAnchor="end" dominantBaseline="hanging" fontSize={11} fill="var(--text-muted)">
              {formatLots(maxVolume)}
            </text>

            {points.map((p, i) => {
              const topY = MARGIN.top + (1 - p.volume / maxVolume) * plotHeight
              return (
                <path
                  key={i}
                  d={roundedTopBarPath(x(i), baseY, topY, barWidth, 4)}
                  fill="var(--series-volume)"
                  opacity={hoverIndex === i ? 1 : 0.85}
                />
              )
            })}
          </svg>
        )}

        {hovered && (
          <div
            className="absolute pointer-events-none rounded-lg shadow-md px-3 py-2 text-xs"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--gridline)',
              left: Math.min(x(hoverIndex) + 8, Math.max(width - 140, 0)),
              top: 8,
            }}
          >
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{formatLots(hovered.volume)}</p>
            <p style={{ color: 'var(--text-secondary)' }}>{formatTime(hovered.time)}</p>
          </div>
        )}
      </div>
    </div>
  )
}


// candles: [{ time, open, high, low, close, volume }] ascending by time (volume in lots)
// spikeRatios: Map of date -> relative volume for days to mark as unusual volume
// rangeDays: how many calendar days to show, counted back from the latest candle
export function CandlestickChart({ candles, spikeRatios, rangeDays }) {
  const { up, down } = useColorConvention()
  const containerRef = useRef()
  const chartRef = useRef(null)
  const priceSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const markersRef = useRef(null)
  const appliedRangeRef = useRef(null)

  // Create the chart once; data updates are handled by the effects below.
  useEffect(() => {
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: '#6b7280',
        panes: { separatorColor: '#e5e7eb' },
      },
      grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      localization: { locale: 'en-US' },
      width: containerRef.current.clientWidth,
      height: 420,
    })

    const priceSeries = chart.addSeries(CandlestickSeries, { borderVisible: false })
    // Volume lives in its own pane below the candles, sharing the time axis
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false },
      1,
    )
    chart.panes()[0].setStretchFactor(3)
    chart.panes()[1].setStretchFactor(1)

    chartRef.current = chart
    priceSeriesRef.current = priceSeries
    volumeSeriesRef.current = volumeSeries
    markersRef.current = createSeriesMarkers(priceSeries, [])

    const handleResize = () => chart.applyOptions({ width: containerRef.current.clientWidth })
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
      priceSeriesRef.current = null
      volumeSeriesRef.current = null
      markersRef.current = null
      appliedRangeRef.current = null
    }
  }, [])

  // Up/down colors follow the US/Taiwan toggle
  useEffect(() => {
    priceSeriesRef.current?.applyOptions({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down })
  }, [up, down])

  useEffect(() => {
    if (!priceSeriesRef.current) return
    priceSeriesRef.current.setData(
      candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
    )
    volumeSeriesRef.current.setData(
      candles.map(c => ({
        time: c.time,
        value: c.volume * 1000, // lots -> shares, to match the rest of the UI
        color: `${c.close >= c.open ? up : down}73`, // ~45% opacity
      }))
    )
    markersRef.current.setMarkers(
      candles
        .filter(c => spikeRatios?.has(c.time))
        .map(c => ({
          time: c.time, position: 'aboveBar', shape: 'arrowDown', color: '#ea580c',
          text: `${spikeRatios.get(c.time).toFixed(1)}×`,
        }))
    )
  }, [candles, spikeRatios, up, down])

  // Apply the range only when it changes (or data first arrives), so polling
  // doesn't reset the user's zoom and scroll
  useEffect(() => {
    if (!chartRef.current || candles.length === 0 || appliedRangeRef.current === rangeDays) return
    const last = candles[candles.length - 1].time
    const from = new Date(last)
    from.setDate(from.getDate() - rangeDays)
    chartRef.current.timeScale().setVisibleRange({ from: from.toISOString().slice(0, 10), to: last })
    appliedRangeRef.current = rangeDays
  }, [candles, rangeDays])

  return <div ref={containerRef} />
}
