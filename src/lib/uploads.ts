import { POST } from './api';

export interface PresignUpload {
  filename: string; // bare name to persist (catalog read path serves it)
  publicUrl: string; // full R2 URL
  key: string; // object key in the bucket
}

function contentTypeFor(file: File): string {
  if (file.type && file.type.startsWith('image/')) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    default:
      return 'image/jpeg';
  }
}

/**
 * Direct-to-R2 upload (Track B.2): ask the backend for a presigned PUT URL, then
 * PUT the bytes STRAIGHT to Cloudflare R2 (the backend never sees the file).
 *
 * Returns the result, or `null` to tell the caller to FALL BACK to the legacy
 * multipart endpoint — when R2 is unconfigured (`{fallback:true}`), presign
 * fails, or the PUT fails (incl. the CORS rule not yet being in place). Never
 * throws, so it can't break an existing upload flow.
 */
export async function uploadViaPresign(file: File, kind: string): Promise<PresignUpload | null> {
  try {
    const contentType = contentTypeFor(file);
    const res = await POST<{ uploadUrl: string; filename: string; publicUrl: string; key: string }>(
      '/uploads/presign',
      { kind, contentType, size: file.size },
    );
    const d = res?.data;
    if (!d?.uploadUrl) return null; // {fallback:true} / no R2 → legacy multipart

    // CLEAN fetch (NOT the api client) — a presigned PUT must carry no auth
    // header and an un-encrypted raw body. The signed URL self-authenticates.
    const put = await fetch(d.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!put.ok) return null;

    return { filename: d.filename, publicUrl: d.publicUrl, key: d.key };
  } catch {
    return null; // any error → fall back to legacy multipart
  }
}
