import { Utils } from '@nativescript/core';

export type HapticKind = 'light' | 'medium' | 'selection' | 'success' | 'warning' | 'error';

// The decor view's haptic constants need no VIBRATE permission and follow the system's touch-feedback setting.
function onAndroid(kind: HapticKind) {
  const view = Utils.android.getCurrentActivity()?.getWindow()?.getDecorView();
  if (!view) return;
  const C = android.view.HapticFeedbackConstants;
  const sdk = android.os.Build.VERSION.SDK_INT;
  const constant =
    kind === 'success'
      ? sdk >= 30
        ? C.CONFIRM
        : C.VIRTUAL_KEY
      : kind === 'error' || kind === 'warning'
        ? sdk >= 30
          ? C.REJECT
          : C.LONG_PRESS
        : kind === 'selection'
          ? sdk >= 27
            ? C.TEXT_HANDLE_MOVE
            : C.CLOCK_TICK
          : kind === 'medium'
            ? C.VIRTUAL_KEY
            : C.CLOCK_TICK;
  view.performHapticFeedback(constant);
}

function onIOS(kind: HapticKind) {
  if (kind === 'success' || kind === 'warning' || kind === 'error') {
    const type = kind === 'success' ? UINotificationFeedbackType.Success : kind === 'warning' ? UINotificationFeedbackType.Warning : UINotificationFeedbackType.Error;
    UINotificationFeedbackGenerator.new().notificationOccurred(type);
  } else if (kind === 'selection') {
    UISelectionFeedbackGenerator.new().selectionChanged();
  } else {
    UIImpactFeedbackGenerator.alloc()
      .initWithStyle(kind === 'medium' ? UIImpactFeedbackStyle.Medium : UIImpactFeedbackStyle.Light)
      .impactOccurred();
  }
}

export function haptic(kind: HapticKind) {
  try {
    if (__APPLE__) onIOS(kind);
    else onAndroid(kind);
  } catch {
    // Haptics are a flourish: a device without them stays quiet.
  }
}
