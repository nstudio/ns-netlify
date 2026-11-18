import { Utils } from '@nativescript/core';
import type { Platform } from '../shared';

export const platform: Platform = __APPLE__ ? 'ios' : 'android';

/** "iPhone", "iPad", or "Google Pixel 9" on Android. */
export function deviceName(): string {
  if (__APPLE__) return UIDevice.currentDevice.model;
  const maker = android.os.Build.MANUFACTURER ?? '';
  const model = android.os.Build.MODEL ?? '';
  if (!maker || model.toLowerCase().startsWith(maker.toLowerCase())) return model;
  return `${maker.charAt(0).toUpperCase()}${maker.slice(1)} ${model}`;
}

function topViewController(): UIViewController | null {
  const app = UIApplication.sharedApplication;
  let window: UIWindow | null = null;
  const scenes = app.connectedScenes?.allObjects;
  for (let i = 0; i < (scenes?.count ?? 0) && !window; i++) {
    const scene = scenes.objectAtIndex(i);
    if (scene instanceof UIWindowScene && scene.activationState === UISceneActivationState.ForegroundActive) {
      for (let j = 0; j < scene.windows.count; j++) {
        const w = scene.windows.objectAtIndex(j);
        if (w.keyWindow) window = w;
      }
      window ??= scene.windows.firstObject;
    }
  }
  let vc = (window ?? app.windows.firstObject)?.rootViewController ?? null;
  while (vc?.presentedViewController) vc = vc.presentedViewController;
  return vc;
}

/** The system share sheet for a link. */
export function shareLink(url: string, title: string): void {
  if (__APPLE__) {
    const vc = UIActivityViewController.alloc().initWithActivityItemsApplicationActivities([NSURL.URLWithString(url)], null);
    const presenter = topViewController();
    if (!presenter) return;
    const popover = vc.popoverPresentationController;
    if (popover) {
      popover.sourceView = presenter.view;
      const b = presenter.view.bounds;
      popover.sourceRect = CGRectMake(b.size.width / 2, b.size.height - 80, 1, 1);
    }
    presenter.presentViewControllerAnimatedCompletion(vc, true, null);
    return;
  }
  const Intent = android.content.Intent;
  const send = new Intent(Intent.ACTION_SEND);
  send.setType('text/plain');
  send.putExtra(Intent.EXTRA_TEXT, url);
  send.putExtra(Intent.EXTRA_TITLE, title);
  const chooser = Intent.createChooser(send, null);
  const activity = Utils.android.getCurrentActivity();
  if (activity) activity.startActivity(chooser);
  else {
    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    Utils.android.getApplicationContext().startActivity(chooser);
  }
}

/** Opens the spot in the platform's maps app. */
export function openInMaps(lat: number, lng: number, label: string): void {
  const q = encodeURIComponent(label);
  if (__APPLE__) Utils.openUrl(`https://maps.apple.com/?ll=${lat},${lng}&q=${q}`);
  else Utils.openUrl(`geo:${lat},${lng}?q=${lat},${lng}(${q})`);
}
