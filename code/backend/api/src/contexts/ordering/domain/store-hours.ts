export interface StoreHour {
  weekday: number;
  opens: string;
  closes: string;
  crossesMidnight: boolean;
}

export interface StoreClosure {
  startsAt: Date;
  endsAt: Date;
}

export function nextStoreOpening(
  hours: readonly StoreHour[],
  closures: readonly StoreClosure[],
  now: Date,
  timezone: string,
): Date | null {
  // A weekly schedule always repeats. Searching a week also keeps a malformed
  // empty schedule from reporting a fictitious opening time.
  for (let offset = 1; offset <= 7 * 24 * 60; offset += 1) {
    const candidate = new Date(now.getTime() + offset * 60_000);
    if (isStoreOpen(hours, closures, candidate, timezone)) return candidate;
  }
  return null;
}

function minutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function tenantLocalWeekday(now: Date, timezone: string): number {
  const weekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
}

/** The tenant-local weekday row for `now`, if any — a café closed that day has none. */
function hoursForWeekday(hours: readonly StoreHour[], weekday: number): StoreHour | null {
  return hours.find((hour) => hour.weekday === weekday) ?? null;
}

/**
 * Today's and tomorrow's schedule rows, for the "Hours & Location" summary
 * (F1.1 browse-only mode) — `null` on a day the café carries no row for at all
 * (closed all day), distinct from a row that just isn't in effect right now.
 */
export function todayAndTomorrowHours(
  hours: readonly StoreHour[],
  now: Date,
  timezone: string,
): {
  today: { opens: string; closes: string } | null;
  tomorrow: { opens: string; closes: string } | null;
} {
  const weekday = tenantLocalWeekday(now, timezone);
  const today = hoursForWeekday(hours, weekday);
  const tomorrow = hoursForWeekday(hours, (weekday + 1) % 7);
  return {
    today: today ? { opens: today.opens, closes: today.closes } : null,
    tomorrow: tomorrow ? { opens: tomorrow.opens, closes: tomorrow.closes } : null,
  };
}

/** Evaluates the café-local schedule; closed time must gate placement as well as entry. */
export function isStoreOpen(
  hours: readonly StoreHour[],
  closures: readonly StoreClosure[],
  now: Date,
  timezone: string,
): boolean {
  if (closures.some((closure) => now >= closure.startsAt && now < closure.endsAt)) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    parts.find((part) => part.type === 'weekday')?.value ?? '',
  );
  const minute =
    Number(parts.find((part) => part.type === 'hour')?.value ?? 0) * 60 +
    Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hours.some((hour) => {
    if (!hour.crossesMidnight)
      return (
        hour.weekday === weekday && minute >= minutes(hour.opens) && minute < minutes(hour.closes)
      );
    const nextDay = (hour.weekday + 1) % 7;
    return (
      (hour.weekday === weekday && minute >= minutes(hour.opens)) ||
      (nextDay === weekday && minute < minutes(hour.closes))
    );
  });
}
