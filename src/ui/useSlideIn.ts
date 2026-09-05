import { useEffect, useState } from 'react';

/**
 * Slide-in that cannot strand an element off screen.
 *
 * The obvious way to animate a bottom sheet is a keyframe animation from
 * `translateY(100%)` with `fill-mode: both`. That has a nasty failure mode: if the
 * animation never actually advances — a throttled tab, a low-power WebView, a paused
 * timeline — the element stays parked at its `from` keyframe, a full screen height
 * below the fold. The sheet is open, focusable and completely invisible.
 *
 * A transition cannot fail that way. The element's resting style is the *visible* one,
 * so if the transition does not run it simply appears instantly, which is a perfectly
 * good outcome. Motion becomes an enhancement rather than a prerequisite.
 */
export function useSlideIn(): string {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // One frame at the closed position, then transition to open.
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return open ? 'is-open' : '';
}
