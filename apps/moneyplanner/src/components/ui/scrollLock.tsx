// Lets a child stop the screen from scrolling while a finger is on it (a chart being scrubbed): on a phone the
// native scroll view would otherwise take over the touch as soon as the finger moves up or down.
import { createContext, useContext } from 'react';

export interface ScrollLock {
  lock: () => void;
  unlock: () => void;
}

export const ScrollLockContext = createContext<ScrollLock | null>(null);

/** The scroll lock of the screen around this component, or null outside a scrolling Screen. */
export const useScrollLock = () => useContext(ScrollLockContext);
