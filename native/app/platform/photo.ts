import { ImageAsset, ImageSource } from '@nativescript/core';

export const MAX_EDGE = 1600;
const QUALITY = 0.82;

export interface PreparedPhoto {
  /** The JPEG to upload. A plain ArrayBuffer: NativeScript's fetch sends no body for typed-array views. */
  jpeg: ArrayBuffer;
  width: number;
  height: number;
  preview: ImageSource;
  /** The encoded JPEG as NSData, for on-device text recognition (iOS). */
  iosData?: NSData;
}

function fit(w: number, h: number): { width: number; height: number } {
  const k = Math.min(1, MAX_EDGE / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function prepareIOS(asset: ImageAsset): Promise<PreparedPhoto> {
  asset.options = { width: MAX_EDGE, height: MAX_EDGE, keepAspectRatio: true, autoScaleFactor: false };
  const source = await ImageSource.fromAsset(asset);
  const image = source.ios as UIImage;
  const size = fit(image.size.width * image.scale, image.size.height * image.scale);
  const format = UIGraphicsImageRendererFormat.preferredFormat();
  format.scale = 1;
  format.opaque = true;
  const renderer = UIGraphicsImageRenderer.alloc().initWithSizeFormat(CGSizeMake(size.width, size.height), format);
  // drawInRect applies the camera's orientation, so the JPEG comes out upright with no EXIF rotation.
  const data = renderer.JPEGDataWithCompressionQualityActions(QUALITY, () => image.drawInRect(CGRectMake(0, 0, size.width, size.height)));
  const jpeg = new Uint8Array(interop.bufferFromData(data)).slice().buffer;
  return { jpeg, ...size, preview: new ImageSource(UIImage.imageWithData(data)), iosData: data };
}

async function prepareAndroid(asset: ImageAsset): Promise<PreparedPhoto> {
  asset.options = { width: MAX_EDGE, height: MAX_EDGE, keepAspectRatio: true, autoScaleFactor: false };
  const source = await ImageSource.fromAsset(asset);
  let bitmap = source.android as android.graphics.Bitmap;
  const size = fit(bitmap.getWidth(), bitmap.getHeight());
  if (size.width !== bitmap.getWidth() || size.height !== bitmap.getHeight()) {
    bitmap = android.graphics.Bitmap.createScaledBitmap(bitmap, size.width, size.height, true);
  }
  const out = new java.io.ByteArrayOutputStream();
  bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, Math.round(QUALITY * 100), out);
  // One JNI call for the whole buffer; reading a Java byte[] element by element is far slower.
  const b64 = android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP);
  return { jpeg: base64ToBuffer(b64), ...size, preview: new ImageSource(bitmap) };
}

/** Downscales to at most 1600 px on the long edge and encodes a JPEG. */
export function preparePhoto(asset: ImageAsset): Promise<PreparedPhoto> {
  return __APPLE__ ? prepareIOS(asset) : prepareAndroid(asset);
}
