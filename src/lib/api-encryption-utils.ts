/**
 * Server-side helpers for Next.js API routes that need to accept encrypted
 * request bodies and return encrypted responses. Drop-in replacements for
 * `request.json()` and `NextResponse.json()`.
 *
 * Use these in any route under `src/app/api/...` that Flutter apps call
 * directly. (Most Flutter traffic goes to the Node.js backend at
 * node.desicowmilk.com — those routes don't need this; the backend's
 * encryptionMiddleware handles them.)
 *
 * Plain JSON requests pass through unchanged (header isn't set) — preserves
 * backward compatibility with older clients.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  encryptPayload,
  decryptPayload,
  isEncryptionEnabled,
  ENCRYPTED_REQUEST_HEADER,
  ENCRYPTED_RESPONSE_HEADER,
} from './encryption';

/**
 * Parse the incoming request body, auto-decrypting if encrypted.
 * Drop-in replacement for `request.json()`.
 *
 * Throws if the body is tagged encrypted but decryption fails AND
 * the text isn't valid plain JSON either. Caller should catch and
 * return a 400.
 */
export async function parseRequestBody<T = unknown>(
  request: NextRequest,
): Promise<T> {
  const isEncrypted = request.headers.get(ENCRYPTED_REQUEST_HEADER) === 'true';
  const text = await request.text();
  if (!text) return null as T;

  if (isEncrypted && isEncryptionEnabled()) {
    try {
      return await decryptPayload<T>(text);
    } catch (decryptErr) {
      // Rolling-rollout tolerance: client tagged it encrypted but actually
      // sent plain JSON. Try parsing as JSON.
      try {
        return JSON.parse(text) as T;
      } catch {
        throw decryptErr;
      }
    }
  }

  return JSON.parse(text) as T;
}

/**
 * Create a JSON response, encrypting the body when encryption is enabled
 * server-side. Drop-in replacement for `NextResponse.json(data, { status })`.
 *
 * The response signals encryption via `X-Encryption-Enabled: true` header
 * so the client interceptor knows to decrypt.
 */
export async function jsonResponse<T>(
  data: T,
  options: { status?: number; headers?: Record<string, string> } = {},
): Promise<NextResponse> {
  const { status = 200, headers = {} } = options;

  if (isEncryptionEnabled()) {
    try {
      const encrypted = await encryptPayload(data);
      return new NextResponse(encrypted, {
        status,
        headers: {
          'Content-Type': 'text/plain',
          [ENCRYPTED_RESPONSE_HEADER]: 'true',
          ...headers,
        },
      });
    } catch (encryptErr) {
      // Fall back to plain JSON so the client at least gets a usable response
      console.warn('[api-encryption] response encrypt failed, sending plain JSON:', encryptErr);
    }
  }

  return NextResponse.json(data, { status, headers });
}
