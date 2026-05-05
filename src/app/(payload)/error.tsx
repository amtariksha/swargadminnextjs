'use client'

import { useEffect } from 'react'

export default function PayloadAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[payload-admin] Server Component render failed:', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#f1f5f9',
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
      }}
    >
      <div style={{ maxWidth: '720px', width: '100%' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
          Payload admin failed to render
        </h1>
        <p style={{ color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.6 }}>
          The error details below help diagnose the issue. The full stack and
          original message live in Vercel runtime logs (filter by the digest).
        </p>
        <div
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '0.875rem',
            wordBreak: 'break-word',
          }}
        >
          <div style={{ marginBottom: '0.5rem' }}>
            <strong style={{ color: '#fbbf24' }}>Message:</strong>{' '}
            <span>{error.message || '(no message exposed by React in production)'}</span>
          </div>
          {error.digest && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ color: '#fbbf24' }}>Digest:</strong>{' '}
              <code>{error.digest}</code>
            </div>
          )}
          {error.name && error.name !== 'Error' && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ color: '#fbbf24' }}>Name:</strong>{' '}
              <code>{error.name}</code>
            </div>
          )}
          {error.stack && (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer', color: '#94a3b8' }}>
                Stack trace
              </summary>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  color: '#cbd5e1',
                }}
              >
                {error.stack}
              </pre>
            </details>
          )}
        </div>
        <button
          onClick={() => reset()}
          style={{
            background: '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '0.5rem 1rem',
            fontSize: '1rem',
            cursor: 'pointer',
            marginRight: '0.5rem',
          }}
        >
          Try again
        </button>
        <a
          href="/dashboard"
          style={{
            display: 'inline-block',
            background: '#334155',
            color: '#fff',
            borderRadius: '6px',
            padding: '0.5rem 1rem',
            fontSize: '1rem',
            textDecoration: 'none',
          }}
        >
          Back to admin dashboard
        </a>
      </div>
    </div>
  )
}
