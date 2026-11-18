import { Utils } from '@nativescript/core';

/**
 * Android system bar insets in dp. The app's page draws under both bars
 * (edge to edge), so the ink header and the tab bar pad themselves. iOS needs
 * none of this: layouts there keep their content inside the safe area and
 * let their backgrounds run under the bars.
 */
export function systemBars(): { top: number; bottom: number } {
  if (!__ANDROID__) return { top: 0, bottom: 0 };
  try {
    const activity = Utils.android.getCurrentActivity();
    if (activity && android.os.Build.VERSION.SDK_INT >= 30) {
      const insets = activity.getWindowManager().getCurrentWindowMetrics().getWindowInsets();
      const status = insets.getInsets(android.view.WindowInsets.Type.statusBars());
      const nav = insets.getInsets(android.view.WindowInsets.Type.navigationBars());
      return { top: Utils.layout.toDeviceIndependentPixels(status.top), bottom: Utils.layout.toDeviceIndependentPixels(nav.bottom) };
    }
    const res = Utils.android.getApplicationContext().getResources();
    const id = res.getIdentifier('status_bar_height', 'dimen', 'android');
    return { top: id > 0 ? Utils.layout.toDeviceIndependentPixels(res.getDimensionPixelSize(id)) : 24, bottom: 0 };
  } catch {
    return { top: 24, bottom: 0 };
  }
}
