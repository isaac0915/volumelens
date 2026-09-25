import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// Same mark as app/icon.svg, rendered as PNG for iOS home screens
export default function AppleIcon() {
  const bar = (height, color) => (
    <div style={{ width: 22, height, background: color, borderRadius: 6 }} />
  )
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', background: '#111827',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 18, paddingBottom: 45,
        }}
      >
        {bar(40, 'rgba(255,255,255,0.6)')}
        {bar(64, 'rgba(255,255,255,0.8)')}
        {bar(90, '#fb923c')}
      </div>
    ),
    size,
  )
}
