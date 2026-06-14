'use client';

import { useEffect, useState } from 'react';
import { GET } from '@/lib/api';

/**
 * Resolve a short-lived presigned GET URL for a PRIVATE R2 object (POD photo,
 * signature, return/collection proof). The stored `refValue` is a private
 * object key (new records) or a legacy public URL (old records); either way the
 * backend extracts the key and signs it against the private bucket.
 *
 * Transitional fallback: if signed-view is unavailable (e.g. the backend that
 * exposes the endpoint isn't deployed yet, or a transient error) AND the stored
 * value is still an absolute public URL, render that URL directly. This is
 * security-neutral — the object is only reachable via that public URL while it
 * is still in the public bucket, i.e. exactly the pre-migration window — and it
 * decouples the admin deploy from the backend deploy / object-migration order.
 * Once the backend is live and objects are migrated, signed-view succeeds and
 * this fallback is never hit.
 */
function usePodSignedUrl(refValue?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!refValue) return;
    let active = true;
    setUrl(null);
    setFailed(false);
    GET<{ url: string }>(`/uploads/signed-view?ref=${encodeURIComponent(refValue)}`)
      .then((r) => {
        if (!active) return;
        if (r?.data?.url) setUrl(r.data.url);
        else setFailed(true);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [refValue]);

  const isAbsoluteUrl = !!refValue && /^https?:\/\//i.test(refValue);
  // Effective URL: the signed one when we have it; otherwise the legacy public
  // URL while signed-view is unavailable. A bare key has no usable fallback.
  const effectiveUrl = url ?? (failed && isAbsoluteUrl ? refValue! : null);
  // Unrecoverable only when signed-view failed and there is no public fallback.
  const unavailable = failed && !url && !isAbsoluteUrl;

  return { url: effectiveUrl, unavailable };
}

/** Thumbnail render of a private proof image (click opens the full URL). */
export function PodImage({
  refValue,
  alt = 'Proof of delivery',
  className,
}: {
  refValue?: string | null;
  alt?: string;
  className?: string;
}) {
  const { url, unavailable } = usePodSignedUrl(refValue);

  if (!refValue) return null;
  if (unavailable) return <span className="text-xs text-gray-400">photo unavailable</span>;
  if (!url) return <span className="text-xs text-gray-400">loading…</span>;

  return (
    <a href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className={className} />
    </a>
  );
}

/** Text-link render of a private proof object (e.g. "Photo 1"). */
export function PodLink({
  refValue,
  children,
  className,
}: {
  refValue?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const { url, unavailable } = usePodSignedUrl(refValue);

  if (!refValue) return null;
  if (unavailable) return <span className={className}>unavailable</span>;
  if (!url) return <span className={className}>loading…</span>;

  return (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}
