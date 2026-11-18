import { useRef, type ReactNode } from 'react';
import { CoreTypes, type EventData, type GridLayout, type ScrollView, type TouchGestureEventData } from '@nativescript/core';
import { tokens } from '../shared';
import { haptic } from '../platform/haptics';
import { Icon } from './ui';

const THRESHOLD = 72;

/**
 * A scroll view with pull to refresh: UIKit's own UIRefreshControl on iOS,
 * and on Android (where Preview ships no SwipeRefreshLayout) a Material-style
 * spinner that follows the finger over the system's stretch overscroll.
 */
export function RefreshScroll({ onRefresh, children }: { onRefresh: () => Promise<void>; children: ReactNode }) {
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const scroll = useRef<ScrollView>(null);
  const indicator = useRef<GridLayout>(null);
  const drag = useRef({ start: null as number | null, pull: 0, busy: false });

  const attachIOS = (args: EventData) => {
    const sv = args.object as ScrollView & { __refreshTarget?: unknown };
    const native = sv.nativeViewProtected as UIScrollView;
    if (!native || native.refreshControl) return;
    const control = UIRefreshControl.new();
    control.tintColor = UIColor.colorWithRedGreenBlueAlpha(5 / 255, 189 / 255, 186 / 255, 1);
    const Target = (NSObject as any).extend(
      {
        pulled() {
          haptic('light');
          void refresh.current().finally(() => control.endRefreshing());
        },
      },
      { exposedMethods: { pulled: { returns: interop.types.void, params: [] } } },
    );
    const target = Target.new();
    // UIControl holds its targets weakly.
    sv.__refreshTarget = target;
    control.addTargetActionForControlEvents(target, 'pulled', UIControlEvents.ValueChanged);
    native.refreshControl = control;
  };

  const place = (pull: number) => {
    const v = indicator.current;
    if (!v) return;
    v.translateY = Math.min(pull, 110) - 52;
    v.opacity = Math.min(1, pull / 48);
    v.rotate = pull * 3;
  };

  const settle = () => {
    const v = indicator.current;
    drag.current.pull = 0;
    v?.animate({ translate: { x: 0, y: -52 }, opacity: 0, duration: 220, curve: CoreTypes.AnimationCurve.easeOut }).catch(() => {});
  };

  const onTouch = (args: TouchGestureEventData) => {
    const sv = scroll.current;
    const d = drag.current;
    if (!sv || d.busy) return;
    const y = args.getY();
    if (args.action === 'down') {
      d.start = sv.verticalOffset <= 0 ? y : null;
      d.pull = 0;
    } else if (args.action === 'move') {
      if (d.start === null) {
        if (sv.verticalOffset <= 0) d.start = y;
        return;
      }
      const dy = y - d.start;
      const was = d.pull;
      d.pull = sv.verticalOffset > 0 || dy <= 0 ? 0 : dy * 0.55;
      if (was < THRESHOLD && d.pull >= THRESHOLD) haptic('light');
      place(d.pull);
    } else if (args.action === 'up' || args.action === 'cancel') {
      d.start = null;
      if (d.pull < THRESHOLD) return settle();
      d.busy = true;
      const v = indicator.current;
      void v
        ?.animate({ translate: { x: 0, y: 18 }, duration: 160 })
        .catch(() => {})
        .then(() => {
          v.animate({ rotate: 360 * 6, duration: 2400, curve: CoreTypes.AnimationCurve.linear }).catch(() => {});
          return refresh.current();
        })
        .finally(() => {
          d.busy = false;
          v.rotate = 0;
          settle();
        });
    }
  };

  if (__APPLE__) {
    return (
      <scrollview ref={scroll} onLoaded={attachIOS}>
        {children}
      </scrollview>
    );
  }

  return (
    <gridlayout>
      <scrollview ref={scroll} onTouch={onTouch}>
        {children}
      </scrollview>
      <gridlayout
        ref={indicator}
        width={40}
        height={40}
        borderRadius={20}
        backgroundColor="#ffffff"
        androidElevation={6}
        verticalAlignment="top"
        horizontalAlignment="center"
        opacity={0}
        translateY={-52}
        isUserInteractionEnabled={false}
      >
        <Icon name="refresh" size={22} style={{ tintColor: tokens.color.accent }} />
      </gridlayout>
    </gridlayout>
  );
}
