import React from 'react'

/**
 * Branded intro shown above the Payload admin login form. Swarg-styled to
 * match the custom Next.js admin panel (replaces Payload's stock boilerplate).
 */
const BeforeLogin: React.FC = () => {
  return (
    <div className="swarg-before-login">
      <p className="swarg-before-login__title">Content &amp; Catalog Admin</p>
      <p className="swarg-before-login__subtitle">
        Sign in to manage website content, products, and the storefront.
      </p>
    </div>
  )
}

export default BeforeLogin
