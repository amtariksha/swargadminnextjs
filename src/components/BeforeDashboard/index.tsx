import React from 'react'

import './index.scss'

const baseClass = 'before-dashboard'

/**
 * Branded dashboard welcome for the Payload admin. Replaces Payload's stock
 * "Seed your database / Getting Started docs" boilerplate with a Swarg-styled
 * hero that bridges to the operations dashboard and the live storefront.
 */
const BeforeDashboard: React.FC = () => {
  return (
    <div className={baseClass}>
      <div className={`${baseClass}__hero`}>
        <h4 className={`${baseClass}__title`}>Welcome to the Swarg content admin</h4>
        <p className={`${baseClass}__subtitle`}>
          Manage website content, the product catalog, and storefront settings here.
          For daily operations — orders, deliveries, drivers — use the operations dashboard.
        </p>
        <div className={`${baseClass}__links`}>
          <a className={`${baseClass}__link`} href="/dashboard">
            Operations dashboard →
          </a>
          <a
            className={`${baseClass}__link ${baseClass}__link--ghost`}
            href="https://new.swargfood.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            View storefront →
          </a>
        </div>
      </div>
    </div>
  )
}

export default BeforeDashboard
