'use client'

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'

// US markets show gains in green; Taiwan (and most of East Asia) shows gains in red.
export const CONVENTIONS = {
  us: { up: '#16a34a', down: '#dc2626', label: 'US colors', hint: 'Green = up, red = down' },
  tw: { up: '#dc2626', down: '#16a34a', label: 'Taiwan colors', hint: 'Red = up, green = down (Taiwan convention)' },
}
const STORAGE_KEY = 'color-convention'

// The choice lives in localStorage (with an in-memory fallback if storage is
// blocked), exposed to React through useSyncExternalStore
const listeners = new Set()
let memoryValue = 'us'

function readConvention() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved in CONVENTIONS ? saved : memoryValue
  } catch {
    return memoryValue
  }
}

function writeConvention(value) {
  memoryValue = value
  try {
    localStorage.setItem(STORAGE_KEY, value)
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

const ColorConventionContext = createContext({ convention: 'us', ...CONVENTIONS.us, setConvention: () => {} })

export function ColorConventionProvider({ children }) {
  // The server always renders US colors; the saved choice applies after hydration
  const convention = useSyncExternalStore(subscribe, readConvention, () => 'us')

  // Drives the CSS variables behind text-up / text-down in globals.css
  useEffect(() => {
    document.documentElement.dataset.colors = convention
  }, [convention])

  return (
    <ColorConventionContext.Provider value={{ convention, ...CONVENTIONS[convention], setConvention: writeConvention }}>
      {children}
    </ColorConventionContext.Provider>
  )
}

export function useColorConvention() {
  return useContext(ColorConventionContext)
}

export function ColorConventionToggle() {
  const { convention, setConvention } = useColorConvention()
  return (
    <div className="flex rounded-md border border-gray-200 p-0.5 text-xs" role="group" aria-label="Price color convention">
      {Object.entries(CONVENTIONS).map(([key, c]) => (
        <button
          key={key}
          type="button"
          title={c.hint}
          aria-pressed={convention === key}
          onClick={() => setConvention(key)}
          className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
            convention === key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <span style={{ color: c.up }}>▲</span>
          {key.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
