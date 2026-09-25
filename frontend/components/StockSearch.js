'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const DEBOUNCE_MS = 200

export default function StockSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const containerRef = useRef(null)

  // Debounced lookup so typing "2330" sends one request, not four
  useEffect(() => {
    const q = query.trim()
    if (!q) return

    let cancelled = false
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then(res => (res.ok ? res.json() : { data: [] }))
        .then(data => {
          if (!cancelled) {
            setResults(data.data)
            setActive(0)
          }
        })
        .catch(() => {})
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  // Close the dropdown when clicking elsewhere
  useEffect(() => {
    const onClick = e => {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const visible = open && query.trim() !== ''

  const go = stock => {
    setQuery('')
    setResults([])
    setOpen(false)
    router.push(`/stock/${encodeURIComponent(stock.symbol)}`)
  }

  const onKeyDown = e => {
    if (!visible || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full sm:w-72">
      <input
        type="search"
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
          if (!e.target.value.trim()) setResults([])
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search symbol or name, e.g. 2330"
        aria-label="Search stocks"
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {visible && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No matching stocks</li>}
          {results.map((stock, i) => (
            <li key={stock.symbol}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => go(stock)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${i === active ? 'bg-blue-50' : ''}`}
              >
                <span className="w-14 font-semibold tabular-nums text-gray-900">{stock.symbol}</span>
                <span className="flex-1 truncate text-gray-700">{stock.name}</span>
                <span className="text-xs text-gray-400">{stock.exchange}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
