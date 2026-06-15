'use client'

import { useState, useEffect } from 'react'

function StockCard({ stock }) {
  return (
    <div className="border border-gray-200 rounded-xl p-6 w-52 shadow-sm">
      <h2 className="text-2xl font-bold text-gray-900">{stock.symbol}</h2>
      <p className="text-gray-500 mt-1">{stock.name}</p>
      <p className="text-lg font-semibold mt-4">Price: {stock.price}</p>
      <p className="text-sm text-gray-600 mt-1">Volume: {stock.volume.toLocaleString()}</p>
    </div>
  )
}

export default function Home() {
  const [stocks, setStocks] = useState({})

  useEffect(() => {
    const fetchStocks = () => {
      fetch('/api/stocks')
        .then(res => res.json())
        .then(data => setStocks(data.data))
    }

    fetchStocks()
    const interval = setInterval(fetchStocks, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">台股監控</h1>
      <div className="flex gap-4">
        {Object.values(stocks).map(stock => (
          <StockCard key={stock.symbol} stock={stock} />
        ))}
      </div>
    </div>
  )
}
