import { useEffect, useState } from 'react';

/** Drives every ticking timer on the board (elapsed-since-placed, waiting
 *  countdown) from one shared clock rather than one interval per card - a
 *  16-slot rail is at most ~16 cards, but one shared tick keeps them all in
 *  lockstep and is simpler to reason about than sixteen independent timers. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
