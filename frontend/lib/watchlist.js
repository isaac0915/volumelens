'use client'

import { useSyncExternalStore } from 'react'

// Each visitor's watchlist lives in their browser (no accounts), with an
// in-memory fallback if storage is blocked. Exposed via useSyncExternalStore.
const STORAGE_KEY = 'watchlist'
const DEFAULT_SYMBOLS = ['2330', '2317']
const MAX_SYMBOLS = 50 // matches the /api/quotes limit

const listeners = new Set()
let memory = DEFAULT_SYMBOLS
let cachedRaw
let cachedList = DEFAULT_SYMBOLS

function read() {
  let raw
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return memory
  }
  if (raw === null) return memory
  // Return the same array for the same stored value, as useSyncExternalStore requires
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      const parsed = JSON.parse(raw)
      cachedList = Array.isArray(parsed) ? parsed.filter(s => typeof s === 'string') : DEFAULT_SYMBOLS
    } catch {
      cachedList = DEFAULT_SYMBOLS
    }
  }
  return cachedList
}

function write(symbols) {
  memory = symbols
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols))
  } catch {}
  listeners.forEach(notify => notify())
}

function subscribe(notify) {
  listeners.add(notify)
  window.addEventListener('storage', notify) // other tabs
  return () => {
    listeners.delete(notify)
    window.removeEventListener('storage', notify)
  }
}

export function useWatchlist() {
  const symbols = useSyncExternalStore(subscribe, read, () => DEFAULT_SYMBOLS)
  const has = symbol => symbols.includes(symbol)
  const toggle = symbol => {
    const current = read()
    if (current.includes(symbol)) write(current.filter(s => s !== symbol))
    else if (current.length < MAX_SYMBOLS) write([...current, symbol])
  }
  return { symbols, has, toggle, full: symbols.length >= MAX_SYMBOLS }
}
