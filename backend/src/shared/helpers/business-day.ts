/**
 * Business Day & Lagos Timezone Calculation Helpers (D1 / D3)
 *
 * Nigeria standard time is Africa/Lagos (UTC+1, permanent, no DST).
 * Settlement holds release on the start of the next business day (00:00 Lagos).
 * Weekends (Saturday, Sunday) are held until Monday 00:00 Lagos.
 */

export const LAGOS_OFFSET_HOURS = 1;
export const LAGOS_OFFSET_MS = LAGOS_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Returns the 00:00:00.000 Lagos instant of the day containing `now`.
 */
export function startOfLagosDay(now: Date): Date {
  const lagosD = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const year = lagosD.getUTCFullYear();
  const month = lagosD.getUTCMonth();
  const date = lagosD.getUTCDate();
  return new Date(Date.UTC(year, month, date, 0, 0, 0, 0) - LAGOS_OFFSET_MS);
}

/**
 * Returns the 00:00:00.000 Lagos instant of the next business day following `from`.
 * - Mon -> Tue 00:00 Lagos
 * - Tue -> Wed 00:00 Lagos
 * - Wed -> Thu 00:00 Lagos
 * - Thu -> Fri 00:00 Lagos
 * - Fri -> Mon 00:00 Lagos
 * - Sat -> Mon 00:00 Lagos
 * - Sun -> Mon 00:00 Lagos
 */
export function nextBusinessDayStart(from: Date): Date {
  const lagosD = new Date(from.getTime() + LAGOS_OFFSET_MS);
  const day = lagosD.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat

  let daysToAdd = 1;
  if (day === 5) {
    // Friday in Lagos -> Monday (3 days)
    daysToAdd = 3;
  } else if (day === 6) {
    // Saturday in Lagos -> Monday (2 days)
    daysToAdd = 2;
  } else if (day === 0) {
    // Sunday in Lagos -> Monday (1 day)
    daysToAdd = 1;
  }

  const year = lagosD.getUTCFullYear();
  const month = lagosD.getUTCMonth();
  const date = lagosD.getUTCDate();
  return new Date(Date.UTC(year, month, date + daysToAdd, 0, 0, 0, 0) - LAGOS_OFFSET_MS);
}
