import { useState, useEffect, useRef } from 'react';
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
    // availability slots use Nairobi local time; match with local hours
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
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
  const [popover, setPopover]           = useState(null); // { booking, x, y }
  const popoverRef                      = useRef(null);

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

  function getBooking(dayLabel, hour) {
    const dayNum = DAY_INDEX[dayLabel];
    return bookings.find((b) => {
      const bDay = getDayOfWeek(b.scheduled_at);
      const bHour = toHHMM(b.scheduled_at);
      return bDay === dayNum && bHour === hour;
    }) || null;
  }

  function hasBooking(dayLabel, hour) {
    return !!getBooking(dayLabel, hour);
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
    <div onClick={(e) => { if (popoverRef.current && !popoverRef.current.contains(e.target)) setPopover(null); }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Schedule</h1>
          <p className="page-subtitle">
            {saving ? 'Saving…' : 'Tap a cell to toggle your availability'}
          </p>
        </div>
        <div className="flex gap-16 items-center text-sm">
          <div className="flex items-center gap-6">
            <div style={{ width: 16, height: 16, borderRadius: 3, background: 'rgba(143,175,154,0.35)', border: '1px solid #8FAF9A' }} />
            <span>Available</span>
          </div>
          <div className="flex items-center gap-6">
            <div style={{ width: 16, height: 16, borderRadius: 3, background: 'rgba(217,164,65,0.25)', border: '1px solid #D9A441' }} />
            <span>Booked</span>
          </div>
        </div>
      </div>

      {empty && (
        <div className="warning-notice mb-20">
          Set your availability so members can book sessions
        </div>
      )}

      {popover && (
        <div ref={popoverRef} style={{
          position: 'fixed',
          top: popover.y + 8,
          left: popover.x + 8,
          zIndex: 200,
          background: 'var(--color-card-bg)',
          border: '1px solid var(--color-card-border)',
          borderRadius: 8,
          boxShadow: 'var(--shadow-modal)',
          padding: '12px 16px',
          minWidth: 180,
          fontSize: 13,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{popover.booking.member_alias || 'Member'}</div>
          {popover.booking.prior_sessions_count > 0 && (
            <div style={{ marginBottom: 4 }}>
              <span className="badge badge--session-n">Session {popover.booking.prior_sessions_count + 1}</span>
            </div>
          )}
          <div style={{ color: 'var(--color-text-muted)', marginBottom: 2 }}>{popover.booking.session_format || '—'}</div>
          <div style={{ color: 'var(--color-text-muted)' }}>{popover.booking.duration_minutes ? `${popover.booking.duration_minutes} min` : ''}</div>
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
                  const booking   = getBooking(day, hour);
                  const booked    = !!booking;
                  const avail     = isAvailable(day, hour);
                  let bg          = 'transparent';
                  let cursor      = 'pointer';
                  let borderColor = 'transparent';
                  if (booked) {
                    bg = 'rgba(217,164,65,0.20)';
                    borderColor = '#D9A441';
                    cursor = 'pointer';
                  } else if (avail) {
                    bg = 'rgba(143,175,154,0.25)';
                    borderColor = '#8FAF9A';
                  }
                  return (
                    <td key={day} style={{ padding: '4px', textAlign: 'center', position: 'relative' }}>
                      <div
                        onClick={(e) => {
                          if (booked) {
                            e.stopPropagation();
                            setPopover((prev) => prev?.booking?.id === booking.id ? null : { booking, x: e.clientX, y: e.clientY });
                          } else {
                            toggleCell(day, hour);
                          }
                        }}
                        title={booked ? booking.member_alias : avail ? 'Click to remove availability' : 'Click to add availability'}
                        style={{
                          width: '100%',
                          height: 28,
                          borderRadius: 4,
                          background: bg,
                          border: `1px solid ${borderColor}`,
                          cursor,
                          transition: 'background 0.12s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {booked && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#8B6B4F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '90%', padding: '0 2px' }}>
                            {booking.member_alias || 'Booked'}
                          </span>
                        )}
                      </div>
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
