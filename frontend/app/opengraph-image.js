import { ImageResponse } from 'next/og'

export const alt = 'VolumeLens: unusual volume scanner for Taiwan stocks'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Link preview for LinkedIn, Slack, etc. Static, so it's generated at build time.
export default function OpengraphImage() {
  // Decorative volume bars; the last one is the "unusual" spike
  const bars = [22, 30, 26, 34, 28, 24, 32, 27, 30, 25, 29, 96]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', background: '#111827', color: 'white',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 48 }}>
            <div style={{ width: 12, height: 22, background: 'rgba(255,255,255,0.6)', borderRadius: 3 }} />
            <div style={{ width: 12, height: 34, background: 'rgba(255,255,255,0.8)', borderRadius: 3 }} />
            <div style={{ width: 12, height: 48, background: '#fb923c', borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 44, fontWeight: 700 }}>VolumeLens</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 700 }}>
            <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
              Spot unusual trading volume in Taiwan stocks.
            </div>
            <div style={{ fontSize: 28, color: '#9ca3af', marginTop: 24 }}>
              Relative volume across ~2,300 TWSE and TPEx listings, end of day and intraday.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 240 }}>
            {bars.map((h, i) => (
              <div
                key={i}
                style={{
                  width: 18, height: h * 2.4, borderRadius: 4,
                  background: i === bars.length - 1 ? '#fb923c' : 'rgba(255,255,255,0.25)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  )
}
