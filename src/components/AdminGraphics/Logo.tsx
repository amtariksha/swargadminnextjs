import React from 'react'

/**
 * Payload admin Logo — the full brand lockup shown on the login screen.
 * Swarg-branded (gradient mark + wordmark) to match the custom Next.js admin
 * panel. Server component (no hooks). Replaces Payload's default wordmark.
 */
const Logo: React.FC = () => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 56,
          height: 56,
          borderRadius: 16,
          background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
          color: '#fff',
          fontWeight: 800,
          fontSize: 27,
          letterSpacing: '-0.04em',
          boxShadow: '0 10px 28px rgba(168, 85, 247, 0.35)',
        }}
      >
        S
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--theme-text, #f5f5f5)',
          }}
        >
          Swarg <span style={{ color: '#ec4899' }}>Desi Cow Milk</span>
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            color: 'var(--theme-elevation-500, #9ca3af)',
          }}
        >
          Content Admin
        </span>
      </span>
    </div>
  )
}

export default Logo
