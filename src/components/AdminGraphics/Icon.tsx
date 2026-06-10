import React from 'react'

/**
 * Payload admin Icon — the small brand mark shown in the admin nav header.
 * Swarg-branded (purple→pink gradient square) to match the custom Next.js
 * admin panel. Server component (no hooks) so it can render in the Payload RSC
 * import map. Replaces Payload's default logomark.
 */
const Icon: React.FC = () => {
  return (
    <span
      aria-label="Swarg"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 9,
        background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
        color: '#fff',
        fontWeight: 800,
        fontSize: 17,
        letterSpacing: '-0.04em',
        boxShadow: '0 4px 12px rgba(168, 85, 247, 0.35)',
      }}
    >
      S
    </span>
  )
}

export default Icon
