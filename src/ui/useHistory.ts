/**
 * Undo/redo for the circuit.
 *
 * Experimenting freely is the whole point of the builder, and people do not experiment
 * when a mistake is expensive. Without undo, deleting the wrong gate means rebuilding by
 * hand, so learners stop trying things — which is exactly the behaviour the app is
 * supposed to encourage.
 *
 * Two details that decide whether this feels right:
 *
 *   - **Coalescing.** Dragging a gate fires many state updates. Pushing each one would
 *     make undo step back through a single drag one pixel at a time, so edits landing
 *     within a short window replace the previous entry rather than stacking.
 *   - **The IR stays the source of truth.** History holds snapshots of the same Circuit
 *     object the rest of the app reads; it is not a parallel model of the circuit, and
 *     undoing writes back through the ordinary setter so every consumer updates.
 */

import { useCallback, useRef, useState } from 'react';
import type { Circuit } from '../core/ir';

/** Edits closer together than this are treated as one action. */
const COALESCE_MS = 400;
const LIMIT = 60;

export interface History {
  push: (c: Circuit) => void;
  undo: () => Circuit | null;
  redo: () => Circuit | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Replace the whole history, e.g. when a lesson loads a fresh circuit. */
  reset: (c: Circuit) => void;
}

export function useHistory(initial: Circuit): History {
  const past = useRef<Circuit[]>([]);
  const future = useRef<Circuit[]>([]);
  const current = useRef<Circuit>(initial);
  const lastPush = useRef(0);
  // Only used to re-render the buttons; the stacks themselves live in refs so that a
  // rapid sequence of edits does not queue a render per keystroke.
  const [, bump] = useState(0);

  const push = useCallback((c: Circuit) => {
    const now = Date.now();
    const coalesce = now - lastPush.current < COALESCE_MS && past.current.length > 0;
    if (!coalesce) {
      past.current = [...past.current, current.current].slice(-LIMIT);
    }
    lastPush.current = now;
    current.current = c;
    future.current = [];
    bump(n => n + 1);
  }, []);

  const undo = useCallback((): Circuit | null => {
    const previous = past.current[past.current.length - 1];
    if (!previous) return null;
    past.current = past.current.slice(0, -1);
    future.current = [current.current, ...future.current].slice(0, LIMIT);
    current.current = previous;
    lastPush.current = 0;             // never coalesce across an undo
    bump(n => n + 1);
    return previous;
  }, []);

  const redo = useCallback((): Circuit | null => {
    const next = future.current[0];
    if (!next) return null;
    future.current = future.current.slice(1);
    past.current = [...past.current, current.current].slice(-LIMIT);
    current.current = next;
    lastPush.current = 0;
    bump(n => n + 1);
    return next;
  }, []);

  const reset = useCallback((c: Circuit) => {
    past.current = [];
    future.current = [];
    current.current = c;
    lastPush.current = 0;
    bump(n => n + 1);
  }, []);

  return {
    push, undo, redo, reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
