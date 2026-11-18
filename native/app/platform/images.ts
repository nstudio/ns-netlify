import { ImageSource, Screen } from '@nativescript/core';

/** Photo URLs are immutable, so one download per URL serves every view that shows it. */
const cache = new Map<string, Promise<ImageSource | null>>();
const LIMIT = 80;

export function loadImage(url: string): Promise<ImageSource | null> {
  const hit = cache.get(url);
  if (hit) {
    cache.delete(url);
    cache.set(url, hit);
    return hit;
  }
  const p = ImageSource.fromUrl(url).catch(() => {
    cache.delete(url);
    return null;
  });
  cache.set(url, p);
  if (cache.size > LIMIT) cache.delete(cache.keys().next().value);
  return p;
}

/** Seeds the cache with a photo the app already has in memory, so a just-saved note shows it instantly. */
export function primeImage(url: string, source: ImageSource): void {
  cache.set(url, Promise.resolve(source));
}

/** A round photo marker with a white rim and a soft shadow, `size` dp across. */
export function photoMarker(photo: ImageSource, size = 52, ring = '#ffffff'): ImageSource | null {
  try {
    return __APPLE__ ? markerIOS(photo, size, ring) : markerAndroid(photo, size, ring);
  } catch (e) {
    console.warn('Field Notes: marker icon failed', e);
    return null;
  }
}

function markerIOS(photo: ImageSource, size: number, ring: string): ImageSource {
  const image = photo.ios as UIImage;
  const pad = 4;
  const full = size + pad * 2;
  const renderer = UIGraphicsImageRenderer.alloc().initWithSize(CGSizeMake(full, full));
  const out = renderer.imageWithActions((rc) => {
    const ctx = rc.CGContext;
    const circle = CGRectMake(pad, pad, size, size);
    CGContextSaveGState(ctx);
    CGContextSetShadowWithColor(ctx, CGSizeMake(0, 1.5), 3, UIColor.colorWithWhiteAlpha(0, 0.35).CGColor);
    UIColor.colorWithRedGreenBlueAlpha(...rgb(ring), 1).setFill();
    UIBezierPath.bezierPathWithOvalInRect(circle).fill();
    CGContextRestoreGState(ctx);
    const inner = CGRectInset(circle, 3, 3);
    UIBezierPath.bezierPathWithOvalInRect(inner).addClip();
    const w = image.size.width;
    const h = image.size.height;
    const k = Math.max(inner.size.width / w, inner.size.height / h);
    image.drawInRect(CGRectMake(inner.origin.x + (inner.size.width - w * k) / 2, inner.origin.y + (inner.size.height - h * k) / 2, w * k, h * k));
  });
  return new ImageSource(out);
}

function markerAndroid(photo: ImageSource, size: number, ring: string): ImageSource {
  const G = android.graphics;
  const scale = Screen.mainScreen.scale;
  const pad = 4 * scale;
  const d = size * scale;
  const full = Math.round(d + pad * 2);
  const bitmap = G.Bitmap.createBitmap(full, full, G.Bitmap.Config.ARGB_8888);
  const canvas = new G.Canvas(bitmap);
  const c = full / 2;
  const rim = new G.Paint(G.Paint.ANTI_ALIAS_FLAG);
  rim.setColor(G.Color.parseColor(ring));
  rim.setShadowLayer(3 * scale, 0, 1.5 * scale, G.Color.argb(90, 0, 0, 0));
  canvas.drawCircle(c, c, d / 2, rim);
  const src = photo.android as android.graphics.Bitmap;
  const r = d / 2 - 3 * scale;
  const k = Math.max((2 * r) / src.getWidth(), (2 * r) / src.getHeight());
  const shader = new G.BitmapShader(src, G.Shader.TileMode.CLAMP, G.Shader.TileMode.CLAMP);
  const m = new G.Matrix();
  m.setScale(k, k);
  m.postTranslate(c - (src.getWidth() * k) / 2, c - (src.getHeight() * k) / 2);
  shader.setLocalMatrix(m);
  const fill = new G.Paint(G.Paint.ANTI_ALIAS_FLAG);
  fill.setShader(shader);
  canvas.drawCircle(c, c, r, fill);
  return new ImageSource(bitmap);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
