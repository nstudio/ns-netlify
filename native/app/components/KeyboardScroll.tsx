import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Application, Utils, type ScrollView } from '@nativescript/core';

/** True when Preview's IQKeyboardManager is linked and on; its Objective-C and Swift builds expose the singleton differently. */
function iqKeyboardManagerEnabled(): boolean {
  try {
    const iq = (globalThis as { IQKeyboardManager?: any }).IQKeyboardManager;
    const manager = typeof iq?.sharedManager === 'function' ? iq.sharedManager() : iq?.shared;
    return !!(manager?.enable ?? manager?.isEnabled);
  } catch {
    return false;
  }
}

/**
 * Keyboard height in dp over the bottom of the window. Android draws edge to
 * edge, so the window never resizes for the keyboard; this reads the IME
 * inset instead. On iOS, Preview's IQKeyboardManager already slides fields
 * clear of the keyboard, so this reports 0 there unless it is off.
 */
function watchKeyboard(onHeight: (dp: number) => void): () => void {
  if (__ANDROID__) {
    const decor = Utils.android.getCurrentActivity()?.getWindow()?.getDecorView();
    if (!decor) return () => {};
    const Type = androidx.core.view.WindowInsetsCompat.Type;
    let last = -1;
    const listener = new android.view.ViewTreeObserver.OnGlobalLayoutListener({
      onGlobalLayout() {
        const insets = androidx.core.view.ViewCompat.getRootWindowInsets(decor);
        const px = insets ? insets.getInsets(Type.ime()).bottom : 0;
        if (px === last) return;
        last = px;
        onHeight(Utils.layout.toDeviceIndependentPixels(px));
      },
    });
    const observer = decor.getViewTreeObserver();
    observer.addOnGlobalLayoutListener(listener);
    return () => {
      if (observer.isAlive()) observer.removeOnGlobalLayoutListener(listener);
      else decor.getViewTreeObserver().removeOnGlobalLayoutListener(listener);
    };
  }
  if (iqKeyboardManagerEnabled()) return () => {};
  const observer = Application.ios.addNotificationObserver(UIKeyboardWillChangeFrameNotification, (n: NSNotification) => {
    const frame = (n.userInfo.objectForKey(UIKeyboardFrameEndUserInfoKey) as NSValue).CGRectValue;
    onHeight(Math.max(0, UIScreen.mainScreen.bounds.size.height - frame.origin.y));
  });
  return () => Application.ios.removeNotificationObserver(observer, UIKeyboardWillChangeFrameNotification);
}

/** Scrolls so the focused text field sits above the keyboard (Android). */
function revealFocused(scroll: ScrollView, keyboardDp: number) {
  if (!__ANDROID__ || !keyboardDp) return;
  const focus = Utils.android.getCurrentActivity()?.getCurrentFocus();
  const host = scroll.nativeViewProtected as android.view.View;
  if (!focus || !host) return;
  const at = (Array as any).create('int', 2);
  const base = (Array as any).create('int', 2);
  focus.getLocationInWindow(at);
  host.getLocationInWindow(base);
  const decorHeight = focus.getRootView().getHeight();
  const keyboardTop = decorHeight - Utils.layout.toDevicePixels(keyboardDp);
  const margin = Utils.layout.toDevicePixels(96);
  const overlap = at[1] + focus.getHeight() + margin - keyboardTop;
  if (overlap > 0) scroll.scrollToVerticalOffset(scroll.verticalOffset + Utils.layout.toDeviceIndependentPixels(overlap), true);
}

/** A scroll view whose content clears the keyboard and keeps the focused field in sight. */
export function KeyboardScroll({ className, children }: { className?: string; children: ReactNode }) {
  const [keyboard, setKeyboard] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const height = useRef(0);
  height.current = keyboard;
  useEffect(() => watchKeyboard(setKeyboard), []);
  useEffect(() => {
    if (!__ANDROID__) return;
    const observer = Utils.android.getCurrentActivity()?.getWindow()?.getDecorView()?.getViewTreeObserver();
    if (!observer) return;
    const listener = new android.view.ViewTreeObserver.OnGlobalFocusChangeListener({
      onGlobalFocusChanged() {
        setTimeout(() => scroll.current && revealFocused(scroll.current, height.current), 30);
      },
    });
    observer.addOnGlobalFocusChangeListener(listener);
    return () => {
      if (observer.isAlive()) observer.removeOnGlobalFocusChangeListener(listener);
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => scroll.current && revealFocused(scroll.current, keyboard), 60);
    return () => clearTimeout(t);
  }, [keyboard]);
  return (
    <scrollview ref={scroll} className={className}>
      <stacklayout paddingBottom={keyboard}>{children}</stacklayout>
    </scrollview>
  );
}
