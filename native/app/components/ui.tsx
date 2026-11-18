import { useEffect, useRef, useState } from 'react';
import { CoreTypes, type EventData, type ImageSource, type View } from '@nativescript/core';
import { icon, type IconName } from '../platform/icons';
import { loadImage } from '../platform/images';

export function Icon({ name, size = 22, className, ...rest }: { name: IconName; size?: number; className?: string; [prop: string]: unknown }) {
  return <image src={icon(name, size)} className={className} width={size} height={size} stretch="aspectFit" {...rest} />;
}

/** Plays once per view: React may re-fire `loaded` when a tab is hidden and shown again. */
export function popIn(args: EventData) {
  const view = args.object as View & { __shown?: boolean };
  if (view.__shown) return;
  view.__shown = true;
  view.opacity = 0;
  view.scaleX = view.scaleY = 0.6;
  view.translateY = 6;
  view.animate({ opacity: 1, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 }, duration: 420, curve: CoreTypes.AnimationCurve.spring }).catch(() => {});
}

export function slideIn(args: EventData) {
  const view = args.object as View & { __shown?: boolean };
  if (view.__shown) return;
  view.__shown = true;
  view.opacity = 0;
  view.translateY = -16;
  view.scaleX = view.scaleY = 0.97;
  view.animate({ opacity: 1, translate: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, duration: 520, curve: CoreTypes.AnimationCurve.spring }).catch(() => {});
}

export type ChipTone = 'plain' | 'accent' | 'native' | 'pending' | 'danger';

export function Chip({
  name,
  text,
  tone = 'plain',
  busy,
  rotate,
  animate,
  onTap,
}: {
  name?: IconName;
  text: string;
  tone?: ChipTone;
  busy?: boolean;
  rotate?: number;
  animate?: boolean;
  onTap?: () => void;
}) {
  return (
    <stacklayout orientation="horizontal" className={`chip ${tone}`} onLoaded={animate ? popIn : undefined} onTap={onTap}>
      {busy ? <activityindicator busy className="chip-spinner" /> : name ? <Icon name={name} size={14} className="chip-icon" rotate={rotate ?? 0} /> : null}
      <label text={text} className="chip-text" />
    </stacklayout>
  );
}

/** An image from a URL, downloaded once per URL and faded in when it arrives. */
export function RemoteImage({ url, className, height, width, stretch = 'aspectFill' }: { url: string; className?: string; height?: number; width?: number; stretch?: string }) {
  const [source, setSource] = useState<ImageSource | null>(null);
  const ref = useRef<View>(null);
  useEffect(() => {
    let live = true;
    const started = Date.now();
    void loadImage(url).then((s) => {
      if (!live || !s) return;
      setSource(s);
      const view = ref.current;
      // A cache hit shows at once; a download fades in.
      if (view && Date.now() - started > 60) {
        view.opacity = 0;
        view.animate({ opacity: 1, duration: 260 }).catch(() => {});
      }
    });
    return () => {
      live = false;
    };
  }, [url]);
  return <image ref={ref} src={source} className={className} height={height} width={width} stretch={stretch} />;
}

export function EmptyState({ name, title, text, children }: { name: IconName; title: string; text: string; children?: unknown }) {
  return (
    <stacklayout className="empty">
      <gridlayout className="empty-badge">
        <Icon name={name} size={34} className="empty-icon" />
      </gridlayout>
      <label text={title} className="empty-title" textWrap />
      <label text={text} className="empty-text" textWrap />
      {children}
    </stacklayout>
  );
}

export function Banner({ text, onTap }: { text: string; onTap?: () => void }) {
  return (
    <gridlayout columns="auto, *" className="banner" onTap={onTap}>
      <Icon name="warning" size={18} className="banner-icon" />
      <label col={1} text={text} className="banner-text" textWrap />
    </gridlayout>
  );
}
