/**
 * Interop shim — MUST be imported before `@payload-config`.
 *
 * Payload's compiled `dist/bin/loadEnv.js` does
 * `__importDefault(require('@next/env')).default.loadEnvConfig`, but the
 * installed `@next/env` is a CJS module flagged `__esModule` with no
 * `.default`, so under tsx the destructure throws
 * "Cannot destructure property 'loadEnvConfig' of 'import_env.default'".
 *
 * pnpm gives payload its own nested `@next/env`, so patching the copy we
 * resolve isn't enough — we hook `Module._load` to give EVERY `@next/env`
 * a self-referencing `.default` as it's required. No-op in normal runtimes.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module = require('module') as { _load: (...a: unknown[]) => unknown }
const originalLoad = Module._load
Module._load = function (request: unknown, ...rest: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = originalLoad.call(this, request as any, ...(rest as any))
  if (
    request === '@next/env' &&
    mod &&
    typeof mod === 'object' &&
    !(mod as { default?: unknown }).default
  ) {
    ;(mod as { default: unknown }).default = mod
  }
  return mod
}

export {}
