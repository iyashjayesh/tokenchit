import { formatTokens, quantise, RAMP, scaleOf } from "@tokenchit/core";

import styles from "./contribution-graph.module.css";

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Local `YYYY-MM-DD`, matching how the CLI buckets days. */
const key = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * A year of days, one column per week, coloured by rank.
 *
 * Server-rendered on purpose: it is a static grid of a few hundred squares with no
 * interaction beyond a native tooltip, so shipping React for it would be paying for nothing.
 *
 * Cells are coloured by `quantise` and `scaleOf` from the core package — the same functions
 * the `recap` SVG uses — so a day that reads hot in the terminal reads hot here. Ranking
 * rather than scaling matters because token counts are violently skewed: one long session can
 * outweigh a quiet week, and a linear scale paints a single square hot and flattens the rest.
 */
export function ContributionGraph({
  days,
  windowDays = 365,
}: {
  days: { day: string; tokens: number }[];
  windowDays?: number;
}) {
  const byDay = new Map(days.map((d) => [d.day, d.tokens]));
  const levels = new Map<string, number>();

  const scale = scaleOf([...byDay.values()]);
  for (const [day, tokens] of byDay) {
    levels.set(day, quantise([tokens], scale)[0] ?? 0);
  }

  // Start on the Monday on or before the window's first day, so every column is a full week
  // and the weekday rows line up with their labels.
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (windowDays - 1));
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const weeks: { date: Date; day: string }[][] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week: { date: Date; day: string }[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: new Date(cursor), day: key(cursor) });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  // A month label sits above the first week that contains that month's opening days, which is
  // how the eye expects to read it — the label marks where the month starts, not its middle.
  const monthLabels = weeks.map((week, i) => {
    const first = week[0]!.date;
    const previous = i > 0 ? weeks[i - 1]![0]!.date : null;
    return !previous || previous.getMonth() !== first.getMonth() ? MONTHS[first.getMonth()]! : "";
  });

  const total = days.reduce((a, d) => a + d.tokens, 0);

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll}>
        <div className={styles.grid}>
          <div className={styles.weekdays}>
            {WEEKDAY_LABELS.map((label, i) => (
              <span key={i} className={styles.weekday}>
                {label}
              </span>
            ))}
          </div>

          <div className={styles.columns}>
            <div className={styles.months}>
              {monthLabels.map((label, i) => (
                <span key={i} className={styles.month}>
                  {label}
                </span>
              ))}
            </div>

            <div className={styles.weeks}>
              {weeks.map((week, wi) => (
                <div key={wi} className={styles.week}>
                  {week.map(({ date, day }) => {
                    const future = date > end;
                    const tokens = byDay.get(day) ?? 0;
                    const level = levels.get(day) ?? 0;
                    return (
                      <span
                        key={day}
                        className={future ? styles.future : styles.cell}
                        style={future ? undefined : { background: RAMP[level] }}
                        title={
                          future
                            ? ""
                            : `${day} · ${tokens > 0 ? formatTokens(tokens) : "no"} tokens`
                        }
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendText}>
          {formatTokens(total)} tokens across {days.length} active{" "}
          {days.length === 1 ? "day" : "days"}
        </span>
        <span className={styles.scaleRow}>
          <span className={styles.legendText}>less</span>
          {RAMP.map((colour) => (
            <span key={colour} className={styles.swatch} style={{ background: colour }} />
          ))}
          <span className={styles.legendText}>more</span>
        </span>
      </div>
    </div>
  );
}
