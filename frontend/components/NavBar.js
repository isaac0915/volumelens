'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import StockSearch from './StockSearch'

const LINKS = [
  { href: '/', label: '首頁' },
  { href: '/radar', label: '爆量雷達' },
]

export default function NavBar() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-red-600 text-sm text-white">量</span>
          台股爆量雷達
        </Link>
        <nav className="flex gap-1">
          {LINKS.map(link => {
            const current = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  current ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="w-full sm:ml-auto sm:w-auto">
          <StockSearch />
        </div>
      </div>
    </header>
  )
}
