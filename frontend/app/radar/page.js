'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatTime } from '@/lib/format'

const RANGE_OPTIONS = [
  { days: 1, label: '今天' },
  { days: 3, label: '近 3 天' },
  { days: 7, label: '近 7 天' },
]

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function formatDay(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()]
  return `${m}/${d}（${weekday}）`
}

function ratioStyle(ratio) {
  if (ratio >= 5) return 'bg-red-600 text-white'
  if (ratio >= 3) return 'bg-red-100 text-red-700'
  return 'bg-orange-50 text-orange-700'
}

function AlertRow({ stock, spikeDays }) {
  return (
    <Link
      href={`/stock/${stock.symbol}`}
      className="grid grid-cols-[4rem_1fr_auto] sm:grid-cols-[4rem_1fr_7rem_7rem_5rem_4rem] items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
    >
      <span className="font-semibold text-gray-900 tabular-nums">{stock.symbol}</span>
      <span className="text-gray-700 truncate">
        {stock.name}
        {spikeDays > 1 && (
          <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">
            連續 {spikeDays} 天
          </span>
        )}
      </span>
      <span className="hidden sm:block text-right text-sm text-gray-600 tabular-nums">
        {stock.max_volume.toLocaleString()}
      </span>
      <span className="hidden sm:block text-right text-sm text-gray-400 tabular-nums">
        {Math.round(stock.average_volume).toLocaleString()}
      </span>
      <span className="hidden sm:block text-right text-xs text-gray-400 tabular-nums">
        {formatTime(stock.last_detected_at)}
      </span>
      <span className={`justify-self-end text-sm font-semibold px-2 py-0.5 rounded-full tabular-nums ${ratioStyle(stock.ratio)}`}>
        {stock.ratio.toFixed(1)}×
      </span>
    </Link>
  )
}

export default function RadarPage() {
  const [days, setDays] = useState(7)
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const fetchAlerts = () => {
      fetch(`/api/alerts?days=${days}`)
        .then(res => {
          if (!res.ok) throw new Error(`Request failed: ${res.status}`)
          return res.json()
        })
        .then(data => {
          if (!cancelled) {
            setGroups(data.data)
            setError(null)
          }
        })
        .catch(err => {
          if (!cancelled) setError(err.message)
        })
    }

    fetchAlerts()
    // The radar scans the market every 60 seconds
    const interval = setInterval(fetchAlerts, 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [days])

  // How many days in the selected range each symbol spiked
  const spikeDaysBySymbol = {}
  for (const group of groups ?? []) {
    for (const stock of group.stocks) {
      spikeDaysBySymbol[stock.symbol] = (spikeDaysBySymbol[stock.symbol] ?? 0) + 1
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">爆量雷達</h1>
        <p className="text-sm text-gray-500 mt-2">
          每 60 秒掃描全市場股票，成交量達 20 日均量 2 倍以上即列入。每檔股票每天只顯示當日最高倍數。
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        {RANGE_OPTIONS.map(opt => (
          <button
            key={opt.days}
            onClick={() => setDays(opt.days)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
              days === opt.days
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
          無法載入爆量資料（{error}）。
        </div>
      )}

      {!error && !groups && <p className="text-gray-500 text-sm">載入中…</p>}

      {groups && groups.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-700 font-medium">這段期間沒有偵測到爆量股票</p>
          <p className="text-sm text-gray-400 mt-2">雷達只在交易時段（09:00–13:30）掃描，可以切換到較長的時間範圍看看。</p>
        </div>
      )}

      <div className="space-y-6">
        {groups?.map(group => (
          <section key={group.date} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-baseline justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{formatDay(group.date)}</h2>
              <span className="text-sm text-gray-400">{group.stocks.length} 檔</span>
            </div>
            <div className="hidden sm:grid grid-cols-[4rem_1fr_7rem_7rem_5rem_4rem] gap-3 px-4 py-2 text-xs text-gray-400 border-b border-gray-100">
              <span>代號</span>
              <span>名稱</span>
              <span className="text-right">最高成交量</span>
              <span className="text-right">20 日均量</span>
              <span className="text-right">最後偵測</span>
              <span className="text-right">倍數</span>
            </div>
            <div className="divide-y divide-gray-100">
              {group.stocks.map(stock => (
                <AlertRow key={stock.symbol} stock={stock} spikeDays={spikeDaysBySymbol[stock.symbol]} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
