import { useState, useEffect } from 'react';
import client from '../api/client';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

const HOURS = [];
for (let h = 6; h <= 22; h++) {
  HOURS.push(`${String(h).padStart(2, '0')}:00`);
}

function toHHMM(iso) {
  try {
    const d = new Date(iso);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return null;
  }
}

function getDayOfWeek(iso) {
  try {
    // 0=Sun,1=Mon,...6=Sat in getDay()
    return new Date(iso).getDay();
  } catch {
    return -1;
  }
}

export default function ScheduleTab() {
  const [availability, setAvailability] = useState([]);
  const [bookings, setBookings]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [empty, setEmpty]               = useState(false);

  useEffect(() => {
    client.get('/api/therapy/therapist/availability')
      .then((res) => {
        setAvailability(res.data?.availability || []);
        setBookings(res.data?.bookings || []);
        setEmpty(false);
      })
      .catch(() => {
        setAvailability([]);
        setBookings([]);
        setEmpty(true);
      })
      .finally(() => setLoading(false));
  }, []);

  function isAvailable(dayLabel, hour) {
    const dayNum = DAY_INDEX[dayLabel];
    return availability.some(
      (a) => a.day_of_week === dayNum && a.start_time <= hour && a.end_time > hour && a.is_active
    );
  }

  function hasBooking(dayLabel, hour) {
    const dayNum = DAY_INDEX[dayLabel];
    return bookings.some((b) => {
      const bDay = getDayOfWeek(b.scheduled_at);
      const bHour = toHHMM(b.scheduled_at);
      return (
        bDay === dayNum &&
        bHour === hour &&
        (b.status === 'confirmed' || b.status === 'upcoming' || b.status === 'in_progress')
      );
    });
  }

  async function toggleCell(dayLabel, hour) {
    const dayNum  = DAY_INDEX[dayLabel];
    const endHour = `${String(Number(hour.split(':')[0]) + 1).padStart(2, '0')}:00`;

    if (hasBooking(dayLabel, hour)) return; // read-only

    const existingIdx = availability.findIndex(
      (a) => a.day_of_week === dayNum && a.start_time === hour && a.end_time === endHour
    );

    let next;
    if (existingIdx >= 0) {
      next = availability.map((a, i) =>
        i === existingIdx ? { ...a, is_active: !a.is_active } : a
      );
    } else {
      next = [
        ...availability,
        { day_of_week: dayNum, start_time: hour, end_time: endHour, is_active: true },
      ];
    }
    setAvailability(next);

    setSaving(true);
    try {
      await client.patch('/api/therapy/therapist/availability', { slots: next });
    } catch {
      // revert
      setAvailability(availability);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading">Loading schedule…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Schedule</h1>
          <p className="page-subtitle">
            {saving ? 'Saving…' : 'Tap a cell to toggle your availability'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 16, height: 16, borderRadius: 3, background: 'rgba(143,175,154,0.35)', border: '1px solid #8FAF9A' }} />
            <span>Available</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 16, height: 16, borderRadius: 3, background: 'rgba(217,164,65,0.25)', border: '1px solid #D9A441' }} />
            <span>Booked</span>
          </div>
        </div>
      </div>

      {empty && (
        <div style={{
          background: 'var(--color-warning-bg)',
          border: '1px solid rgba(217,164,65,0.25)',
          borderRadius: 8,
          padding: '12px 16px',
          fontSize: 14,
          color: 'var(--color-status-pending)',
          marginBottom: 20,
        }}>
          Set your availability so members can book sessions
        </div>
      )}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 600, borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{
                padding: '10px 12px',
                textAlign: 'left',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                background: 'var(--color-main-bg)',
                borderBottom: '1px solid var(--color-card-border)',
                width: 64,
              }}>Time</th>
              {DAYS.map((d) => (
                <th key={d} style={{
                  padding: '10px 8px',
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  background: 'var(--color-main-bg)',
                  borderBottom: '1px solid var(--color-card-border)',
                }}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((hour) => (
              <tr key={hour} style={{ borderBottom: '1px solid rgba(194,164,138,0.08)' }}>
                <td style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {hour}
                </td>
                {DAYS.map((day) => {
                  const booked    = hasBooking(day, hour);
                  const avail     = isAvailable(day, hour);
                  let bg          = 'transparent';
                  let cursor      = 'pointer';
                  let borderColor = 'transparent';
                  if (booked) {
                    bg = 'rgba(217,164,65,0.20)';
                    borderColor = '#D9A441';
                    cursor = 'default';
                  } else if (avail) {
                    bg = 'rgba(143,175,154,0.25)';
                    borderColor = '#8FAF9A';
                  }
                  return (
                    <td
                      key={day}
                      style={{
                        padding: '4px',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        onClick={() => toggleCell(day, hour)}
                        title={booked ? 'Confirmed booking — cannot deactivate' : avail ? 'Click to remove availability' : 'Click to add availability'}
                        style={{
                          width: '100%',
                          height: 28,
                          borderRadius: 4,
                          background: bg,
                          border: `1px solid ${borderColor}`,
                          cursor,
                          transition: 'background 0.12s',
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
