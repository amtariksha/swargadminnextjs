'use client';

import { useEffect, useState } from 'react';
import { GET } from '@/lib/api';

/**
 * Resolve a short-lived presigned GET URL for a PRIVATE R2 object (POD photo,
 * signature, return/collection proof). The stored `refValue` is a private
 * object key (new records) or a legacy public URL (old records); either way the
 * backend extracts the key and signs it against the private bucket. The raw
 * value can no longer be used as an <img src> / <a href> because the bucket is
 * no longer public.
 */
function usePodSignedUrl(refValue?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!refValue) return;
    let active = true;
    setUrl(null);
    setError(false);
    GET<{ url: string }>(`/uploads/signed-view?ref=${encodeURIComponent(refValue)}`)
      .then((r) => { if (active) setUrl(r?.data?.url ?? null); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [refValue]);

  return { url, error };
}

/** Thumbnail render of a private proof image (click opens the full signed URL). */
export function PodImage({
  refValue,
  alt = 'Proof of delivery',
  className,
}: {
  refValue?: string | null;
  alt?: string;
  className?: string;
}) {
  const { url, error } = usePodSignedUrl(refValue);

  if (!refValue) return null;
  if (error) return <span className="text-xs text-gray-400">photo unavailable</span>;
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
  const { url, error } = usePodSignedUrl(refValue);

  if (!refValue) return null;
  if (error) return <span className={className}>unavailable</span>;
  if (!url) return <span className={className}>loading…</span>;

  return (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}
