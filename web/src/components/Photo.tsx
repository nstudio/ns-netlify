import { useState } from 'react';
import type { Photo as PhotoType } from '../../../shared';
import { api } from '../lib/session';

/**
 * A note's photo with its box reserved from the stored pixel size, so nothing
 * shifts as it loads. `minRatio` caps how tall a portrait may get (it's cropped).
 */
export function Photo({
  photo,
  alt,
  minRatio = 0,
  className = '',
  eager = false,
}: {
  photo: PhotoType;
  alt: string;
  minRatio?: number;
  className?: string;
  eager?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const ratio = Math.max(photo.width / Math.max(photo.height, 1), minRatio);
  return (
    <div className={`photo ${loaded ? 'is-loaded' : ''} ${className}`} style={{ aspectRatio: String(ratio) }}>
      <img
        src={api.photoUrl(photo)}
        alt={alt}
        width={photo.width}
        height={photo.height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        ref={(img) => {
          if (img?.complete && img.naturalWidth) setLoaded(true);
        }}
      />
    </div>
  );
}
