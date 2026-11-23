import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, type GestureResponderEvent } from 'react-native';

import { nearestIndex, speakPoint, type SeriesPoint } from './chartMath';

const THROTTLE_MS = 50;

/**
 * Stock-market style scrubbing for a chart: press and drag (or tap) to put a cursor on a point; a tap pins the cursor
 * (a second tap on it clears it); a drag clears it on release. Also the screen-reader "adjustable" actions to step
 * through the points. `onScrub` is throttled and gets `null` when the cursor goes away. Spread `responder` and
 * `accessibility` on the chart's root View; `active` is the index under the cursor.
 */
export function useScrub({
  points,
  plotW,
  currency,
  onScrub,
  speak = speakPoint,
}: {
  points: SeriesPoint[];
  /** Width of the plot area in pixels (the x scale used to find the nearest point). */
  plotW: number;
  currency: string;
  onScrub?: (p: SeriesPoint | null) => void;
  /** What the screen reader says for a point (default: the balance wording; charts of other units pass their own). */
  speak?: (p: SeriesPoint, currency: string) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const grab = useRef({ left: 0, startX: 0, moved: false, wasPinnedAt: -1 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmit = useRef(0);
  const activeRef = useRef<number | null>(null);

  const emit = (p: SeriesPoint | null) => {
    if (!onScrub) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (p === null) {
      lastEmit.current = 0;
      onScrub(null);
      return;
    }
    const wait = THROTTLE_MS - (Date.now() - lastEmit.current);
    if (wait <= 0) {
      lastEmit.current = Date.now();
      onScrub(p);
    } else {
      timer.current = setTimeout(() => {
        lastEmit.current = Date.now();
        onScrub(p);
      }, wait);
    }
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const select = (i: number | null) => {
    activeRef.current = i;
    setActive(i);
    emit(i === null ? null : points[i]);
  };
  const indexAt = (e: GestureResponderEvent) => nearestIndex(e.nativeEvent.pageX - grab.current.left, points.length, plotW);
  const onGrant = (e: GestureResponderEvent) => {
    const { pageX, locationX } = e.nativeEvent;
    grab.current.left = pageX - locationX;
    grab.current.startX = pageX;
    grab.current.moved = false;
    const i = indexAt(e);
    grab.current.wasPinnedAt = pinned ? (activeRef.current ?? -1) : -1;
    select(i);
  };
  const onMove = (e: GestureResponderEvent) => {
    if (Math.abs(e.nativeEvent.pageX - grab.current.startX) > 6) grab.current.moved = true;
    select(indexAt(e));
  };
  const onEnd = () => {
    const g = grab.current;
    if (g.moved) {
      setPinned(false);
      select(null);
    } else if (g.wasPinnedAt >= 0 && Math.abs((activeRef.current ?? -99) - g.wasPinnedAt) <= 1) {
      // A second tap on the pinned point clears it.
      setPinned(false);
      select(null);
    } else {
      setPinned(true); // a tap leaves the cursor and tooltip in place
    }
  };
  const onCancel = () => {
    setPinned(false);
    select(null);
  };

  const step = (dir: 1 | -1) => {
    if (points.length === 0) return;
    const at = activeRef.current;
    const i = at === null ? (dir === 1 ? 0 : points.length - 1) : Math.min(points.length - 1, Math.max(0, at + dir));
    setPinned(true);
    select(i);
    AccessibilityInfo.announceForAccessibility?.(speak(points[i], currency));
  };

  const cur = active !== null ? points[active] : null;
  return {
    active,
    cur,
    responder: {
      onStartShouldSetResponder: () => true,
      onMoveShouldSetResponder: () => true,
      onResponderTerminationRequest: () => false,
      onResponderGrant: onGrant,
      onResponderMove: onMove,
      onResponderRelease: onEnd,
      onResponderTerminate: onCancel,
    },
    accessibility: {
      accessible: true as const,
      accessibilityRole: 'adjustable' as const,
      accessibilityValue: cur ? { text: speak(cur, currency) } : undefined,
      accessibilityActions: [
        { name: 'increment', label: 'Next point' },
        { name: 'decrement', label: 'Previous point' },
      ],
      onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1),
    },
  };
}
