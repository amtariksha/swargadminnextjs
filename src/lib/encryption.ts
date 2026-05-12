/**
 * AES-256-GCM end-to-end encryption for backend API calls.
 *
 * Canonical spec: `docs/api-encryption.md` in swargnodejsbackend. Wire
 * format identical across delivery app, customer app, this admin, and
 * the backend Express middleware:
 *
 *     Base64( IV[12] + ciphertext + AuthTag[16] )
 *
 * Headers:
 *   - Request:  X-Encrypted-Payload: true   + Content-Type: text/plain
 *   - Response: X-Encryption-Enabled: true  + Content-Type: text/plain
 *
 * Backward compatibility: when the feature flag is off OR decryption
 * fails, plain JSON is the fallback. Server middleware does the symmetric
 * fallback, so a misconfigured key only degrades to plain — never breaks
 * the request.
 *
 * Uses the Web Crypto API (no extra deps). Works in browser AND in
 * Node.js (Next.js API routes) — Node 18+ exposes the same `crypto`
 * global as the browser.
 */

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MIN_PAYLOAD_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH; // 28 bytes

// Header constants — exported so axios interceptors + API route helpers stay in sync.
export const ENCRYPTED_REQUEST_HEADER = 'X-Encrypted-Payload';
export const ENCRYPTED_RESPONSE_HEADER = 'X-Encryption-Enabled';

/**
 * Master switch. False unless both env vars are set.
 * - Client side: NEXT_PUBLIC_ENABLE_API_ENCRYPTION + NEXT_PUBLIC_API_ENCRYPTION_KEY
 * - Server side (API routes): ENABLE_API_ENCRYPTION + API_ENCRYPTION_KEY
 */
export function isEncryptionEnabled(): boolean {
  const flag =
    process.env.ENABLE_API_ENCRYPTION ||
    process.env.NEXT_PUBLIC_ENABLE_API_ENCRYPTION;
  const key =
    process.env.API_ENCRYPTION_KEY ||
    process.env.NEXT_PUBLIC_API_ENCRYPTION_KEY;
  return flag === 'true' && Boolean(key);
}

/**
 * Normalise the key to exactly 32 chars (AES-256). Same rule as backend
 * middleware + Flutter clients — all four sides MUST agree or decrypts
 * silently produce garbage.
 */
function padKey(rawKey: string): string {
  if (rawKey.length >= 32) return rawKey.slice(0, 32);
  return rawKey.padEnd(32, '0');
}

function getKeyString(): string {
  const key =
    process.env.API_ENCRYPTION_KEY ||
    process.env.NEXT_PUBLIC_API_ENCRYPTION_KEY ||
    '';
  return padKey(key);
}

let cachedKey: CryptoKey | null = null;
let cachedKeyString: string | null = null;

async function getCryptoKey(): Promise<CryptoKey> {
  const keyString = getKeyString();
  if (cachedKey && cachedKeyString === keyString) return cachedKey;

  const keyBytes = new TextEncoder().encode(keyString);
  // Web Crypto wants a fresh ArrayBuffer (not a view of node's Buffer)
  const keyBuffer = new ArrayBuffer(keyBytes.length);
  new Uint8Array(keyBuffer).set(keyBytes);

  cachedKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
  cachedKeyString = keyString;
  return cachedKey;
}

/** Encrypt JSON-serialisable data → Base64 wire string. */
export async function encryptPayload(data: unknown): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );
  const encryptedBytes = new Uint8Array(encryptedBuffer);

  // Wire format: IV[12] + ciphertext + authTag[16]
  // Web Crypto AES-GCM appends the auth tag to the ciphertext automatically.
  const combined = new Uint8Array(iv.length + encryptedBytes.length);
  combined.set(iv, 0);
  combined.set(encryptedBytes, iv.length);

  // Convert to Base64 in a way that works in both browser + Node.
  return base64Encode(combined);
}

/** Decrypt a Base64 wire string → parsed JSON. Throws on any failure. */
export async function decryptPayload<T = unknown>(b64: string): Promise<T> {
  const combined = base64Decode(b64);
  if (combined.length < MIN_PAYLOAD_LENGTH) {
    throw new Error(
      `encrypted payload too short (${combined.length} bytes, need ≥${MIN_PAYLOAD_LENGTH})`,
    );
  }

  const iv = combined.slice(0, IV_LENGTH);
  // ciphertext-and-authTag together — Web Crypto AES-GCM expects the tag appended
  const ciphertextAndTag = combined.slice(IV_LENGTH);

  const key = await getCryptoKey();
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertextAndTag,
  );

  const plaintext = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(plaintext) as T;
}

/** Base64 encode that works on both browser and Node. */
function base64Encode(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  // Node 18+ Buffer fallback
  return Buffer.from(bytes).toString('base64');
}

/** Base64 decode that works on both browser and Node. Returns Uint8Array. */
function base64Decode(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
