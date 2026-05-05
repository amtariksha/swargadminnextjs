/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* (Lightly modified to log Server Component errors thrown from
 *  RootLayout/handleServerFunctions before React masks them in
 *  production. Remove once the /admin render issue is fixed.) */
import config from '@payload-config'
import '@payloadcms/next/css'
import type { ServerFunctionClient } from 'payload'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import React from 'react'

import { importMap } from './admin/importMap.js'
import './custom.scss'

type Args = {
  children: React.ReactNode
}

const logError = (where: string, err: unknown) => {
  const e = err as Error & { digest?: string; cause?: unknown }
  console.error(`[payload-admin] ${where} threw:`, {
    name: e?.name,
    message: e?.message,
    digest: e?.digest,
    cause: e?.cause,
    stack: e?.stack,
  })
}

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  try {
    return await handleServerFunctions({
      ...args,
      config,
      importMap,
    })
  } catch (err) {
    logError('handleServerFunctions', err)
    throw err
  }
}

const Layout = ({ children }: Args) => {
  try {
    return RootLayout({ config, importMap, serverFunction, children })
  } catch (err) {
    logError('RootLayout', err)
    throw err
  }
}

export default Layout
