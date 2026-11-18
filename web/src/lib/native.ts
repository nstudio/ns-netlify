import { useEffect, useState } from 'react';

/** Written into the publish dir by the nativescript-edge build plugin. */
export interface NativeInfo {
  deviceLink: string;
  pairUrl: string;
  qrSvg: string;
  context: 'production' | 'deploy-preview' | 'branch-deploy';
  commit: string;
}

export const STORE_LINKS = {
  ios: 'https://apps.apple.com/app/nativescript-preview/id1264484702',
  android: 'https://play.google.com/store/apps/details?id=org.nativescript.preview.android',
};

let pending: Promise<NativeInfo | null> | null = null;

function load(): Promise<NativeInfo | null> {
  pending ??= fetch('/native.json', { headers: { accept: 'application/json' } })
    .then(async (res) => {
      // A dev server answers unknown paths with index.html, so the type is checked too.
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
      const info = (await res.json()) as Partial<NativeInfo>;
      return typeof info.qrSvg === 'string' && typeof info.deviceLink === 'string' ? (info as NativeInfo) : null;
    })
    .catch(() => null);
  return pending;
}

/** undefined while loading, null when this deploy has no phone app. */
export function useNativeInfo(): NativeInfo | null | undefined {
  const [info, setInfo] = useState<NativeInfo | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void load().then((i) => alive && setInfo(i));
    return () => {
      alive = false;
    };
  }, []);
  return info;
}
