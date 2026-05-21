/**
 * Dot-matrix mood calendar — GitHub contribution graph style.
 * Columns = weeks (scroll horizontally for older weeks).
 * Rows = days of the week (Mon top, Sun bottom).
 *
 * Props:
 *   entries  — [{ date: 'YYYY-MM-DD', mood_level: string }]
 *   compact  — if true, shows only last 4 weeks (28 dots); hides legend
 */

const DOT_COLORS = {
  very_low: '#B35C5C',
  low:      '#C2874F',
  neutral:  '#C2A48A',
  good:     '#8FAF9A',
  great:    '#6BAF7A',
};

const MOOD_LABELS = {
  very_low: 'Very Low',
  low:      'Low',
  neutral:  'Neutral',
  good:     'Good',
  great:    'Great',
};

// Day labels: alternate visibility to avoid crowding
const DAY_LETTERS = ['M', '', 'W', '', 'F', '', 'S'];

function toLocalYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function MoodDotGrid({ entries = [], compact = false }) {
  // Build date → mood_level lookup (last entry per date wins)
  const lookup = {};
  entries.forEach(({ date, mood_level }) => { lookup[date] = mood_level; });

  const numWeeks = compact ? 4 : 13;
  const today = new Date();

  // Align start to the Monday of the earliest week
  const todayMon = (today.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const start = new Date(today);
  start.setDate(today.getDate() - todayMon - (numWeeks - 1) * 7);
  start.setHours(0, 0, 0, 0);

  // Build grid: weeks × 7 days
  const weeks = Array.from({ length: numWeeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const dt = new Date(start);
      dt.setDate(start.getDate() + w * 7 + d);
      const dateStr  = toLocalYMD(dt);
      const isFuture = dt > today;
      const mood     = isFuture ? null : (lookup[dateStr] ?? null);
      return { dateStr, mood, isFuture };
    })
  );

  // Month labels above columns: show month name when week crosses month boundary
  const monthLabels = weeks.map((week) => {
    const first = week[0];
    const dt = new Date(first.dateStr);
    // Show label only on the week containing the 1st of the month
    return dt.getDate() <= 7
      ? dt.toLocaleDateString('en-KE', { month: 'short' })
      : null;
  });

  return (
    <div>
      {/* Month labels row */}
      {!compact && (
        <div style={{ display: 'flex', gap: 4, marginLeft: 18, marginBottom: 3 }}>
          {monthLabels.map((label, wi) => (
            <div
              key={wi}
              style={{
                width: 10, flexShrink: 0,
                fontSize: 9,
                color: label ? 'var(--color-text-secondary)' : 'transparent',
                textAlign: 'left',
                whiteSpace: 'nowrap',
              }}
            >
              {label ?? ''}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
        {/* Day-of-week labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, paddingTop: 1 }}>
          {DAY_LETTERS.map((letter, i) => (
            <div
              key={i}
              style={{
                width: 10, height: 10,
                fontSize: 8,
                color: 'var(--color-text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {letter}
            </div>
          ))}
        </div>

        {/* Dot columns */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              {week.map(({ dateStr, mood, isFuture }) => (
                <div
                  key={dateStr}
                  title={
                    isFuture ? undefined
                    : mood    ? `${dateStr} · ${MOOD_LABELS[mood] ?? mood}`
                    :           `${dateStr} · No entry`
                  }
                  style={{
                    width: 10, height: 10,
                    borderRadius: 3,
                    background: isFuture
                      ? 'transparent'
                      : mood
                        ? (DOT_COLORS[mood] ?? 'var(--color-accent)')
                        : 'var(--color-border)',
                    flexShrink: 0,
                    transition: 'background 200ms ease',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      {!compact && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10 }}>
          {Object.entries(DOT_COLORS).map(([key, color]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                {MOOD_LABELS[key]}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-border)', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>No entry</span>
          </div>
        </div>
      )}
    </div>
  );
}
