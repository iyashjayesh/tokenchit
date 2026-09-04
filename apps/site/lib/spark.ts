/**
 * A local `YYYY-MM-DD` key, from either a string or a Date.
 *
 * node-pg hands back a `date` column as a JS Date at local midnight, not as a string. The
 * first version of this assumed strings and did `String(value).slice(0, 10)`, which turns a
 * Date into "Thu Sep 03" — a key that matches nothing, so every day looked idle and every
 * sparkline rendered empty.
 *
 * Built from local parts rather than toISOString(), which would shift the day backwards for
 * anyone west of UTC and quietly move activity onto the wrong date.
 */
export function dayKey(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * One value per day for the sparkline window, oldest first, zeros included.
 *
 * The query returns only days with activity, because a row per idle day would be a great deal
 * of nothing stored. The gaps have to come back here: without them a fortnight off looks like
 * the bars simply moving closer together, which reads as steady work.
 *
 * Takes its length as an argument and imports nothing, so it can be tested by plain node
 * without the bundler that resolves the "@/" alias.
 */
export function densify(
  dates: (string | Date)[] | null,
  values: (string | number)[] | null,
  days: number,
  today = new Date(),
): number[] {
  const out = new Array<number>(days).fill(0);
  if (!dates || !values) return out;

  const byDay = new Map<string, number>();
  dates.forEach((d, i) => byDay.set(dayKey(d), Number(values[i] ?? 0)));

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    out[i] = byDay.get(dayKey(d)) ?? 0;
  }
  return out;
}
