declare module 'qrcode' {
  export function toString(text: string, options?: Record<string, unknown>): Promise<string>;
  const QRCode: { toString: typeof toString };
  export default QRCode;
}
