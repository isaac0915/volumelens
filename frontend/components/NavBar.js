'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import StockSearch from './StockSearch'
import { ColorConventionToggle } from './ColorConvention'

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/radar', label: 'Unusual Volume' },
]

function Logo() {
  // Three rising volume bars inside a lens
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden="true">
      <rect width="28" height="28" rx="6" className="fill-gray-900" />
      <rect x="7" y="15" width="3" height="6" rx="1" className="fill-white/60" />
      <rect x="12.5" y="11" width="3" height="10" rx="1" className="fill-white/80" />
      <rect x="18" y="7" width="3" height="14" rx="1" className="fill-orange-400" />
    </svg>
  )
}

export default function NavBar() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-gray-900">
          <Logo />
          VolumeLens
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
        <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
          <div className="flex-1 sm:flex-none">
            <StockSearch />
          </div>
          <ColorConventionToggle />
        </div>
      </div>
    </header>
  )
}
