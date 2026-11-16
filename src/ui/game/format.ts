import { fromDay, MONTHS } from '@/sim/calendar';

/** Axis label for a day index: years for long spans, "Mon 'YY" for short ones. */
export function dayAxis(spanDays: number): (d: number) => string {
  return (d: number) => {
    const c = fromDay(d);
    return spanDays > 365 * 3 ? String(c.year) : `${MONTHS[c.month - 1]} '${String(c.year).slice(2)}`;
  };
}
