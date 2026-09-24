import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, VideoCamera, Phone, ChatText } from '@phosphor-icons/react';
import client from '../../api/client';

const FORMAT_ICONS = { video: VideoCamera, voice: Phone, text: ChatText };
const FORMAT_LABELS = { video: 'Video', voice: 'Voice', text: 'Text' };

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(d) {
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}
function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function TherapistBookingScreen() {
  const { therapistId } = useParams();
  const navigate = useNavigate();

  const [selectedFormat, setSelectedFormat] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [notes, setNotes] = useState('');
  const [slotLockId, setSlotLockId] = useState(null);
  const [lockCountdown, setLockCountdown] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [waitingMpesa, setWaitingMpesa] = useState(false);
  const countdownRef = useRef(null);
  const pollRef = useRef(null);

  const { data: therapistData } = useQuery({
    queryKey: ['therapy', 'therapist', therapistId],
    queryFn: () => client.get(`/api/therapy/therapists/${therapistId}`).then(r => r.data),
  });

  const { data: availData } = useQuery({
    queryKey: ['therapy', 'availability', therapistId],
    queryFn: () => client.get(`/api/therapy/therapists/${therapistId}/availability`).then(r => r.data),
    enabled: !!therapistId,
  });

  const therapist = therapistData?.therapist;
  const formats = therapist?.session_formats ?? [];
  const baseRate = therapist?.rate_per_session_kes ?? 0;
  // 45-min session is 75% of the 60-min rate
  const rate = selectedDuration === 45 ? Math.round(baseRate * 0.75) : baseRate;
  const platformFee = Math.round(rate * 0.2);
  const total = rate + platformFee;

  // Group slots by date
  const slotsByDate = {};
  for (const slot of (availData?.slots ?? [])) {
    const key = slot.date;
    if (!slotsByDate[key]) slotsByDate[key] = [];
    slotsByDate[key].push(slot);
  }
  const dates = Object.keys(slotsByDate).sort();

  // Auto-select format when only one available
  useEffect(() => {
    if (formats.length === 1 && !selectedFormat) setSelectedFormat(formats[0]);
  }, [formats]);

  // Countdown timer for slot lock
  useEffect(() => {
    if (lockCountdown == null) return;
    if (lockCountdown <= 0) {
      setSlotLockId(null);
      setLockCountdown(null);
      return;
    }
    countdownRef.current = setTimeout(() => setLockCountdown(c => c - 1), 1000);
    return () => clearTimeout(countdownRef.current);
  }, [lockCountdown]);

  // Cleanup on unmount
  useEffect(() => () => {
    clearTimeout(countdownRef.current);
    clearInterval(pollRef.current);
  }, []);

  async function acquireLock() {
    if (!selectedSlot) return;
    try {
      const { data } = await client.post('/api/therapy/slot-lock', {
        therapist_id: therapistId,
        slot_date: selectedSlot.date,
        slot_time: selectedSlot.start_time,
      });
      setSlotLockId(data.lock_id);
      setLockCountdown(300); // 5 min
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'SLOT_TAKEN') {
        setError('This slot was just taken. Please choose another time.');
      } else {
        setError('Could not hold this slot. Please try again.');
      }
    }
  }

  async function handleConfirm() {
    if (!selectedFormat || !selectedSlot || !slotLockId) return;
    setSubmitting(true);
    setError('');
    try {
      // category_id comes from therapist's first category
      const categoryId = (therapist.category_ids ?? [])[0] ?? null;

      // phone — fetch from user profile if not cached
      let phone;
      try {
        const { data: profileData } = await client.get('/api/profile');
        phone = profileData?.user?.phone ?? profileData?.phone ?? null;
      } catch { /* will fall through to prompt */ }

      if (!phone) {
        phone = window.prompt('Enter your M-Pesa phone number (e.g. 0712345678):');
        if (!phone) { setSubmitting(false); return; }
      }

      const { data } = await client.post('/api/therapy/bookings', {
        therapist_id: therapistId,
        category_id: categoryId,
        lock_id: slotLockId,
        session_format: selectedFormat,
        scheduled_at: `${selectedSlot.date}T${selectedSlot.start_time}:00`,
        duration_minutes: selectedDuration,
        phone,
        notes: notes.trim() || null,
      });
      const bookingId = data.booking_id;
      // Poll for payment confirmation (max 3 min = 36 × 5s)
      setWaitingMpesa(true);
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const { data: bData } = await client.get(`/api/therapy/bookings/${bookingId}`);
          if (bData.booking?.payment_status === 'paid') {
            clearInterval(pollRef.current);
            navigate(`/therapists/booking/${bookingId}/confirm`, { replace: true });
          }
        } catch { /* non-fatal */ }
        if (attempts >= 36) {
          clearInterval(pollRef.current);
          setWaitingMpesa(false);
          setError('M-Pesa confirmation is taking longer than expected. Check your bookings for status.');
        }
      }, 5000);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Booking failed. Please try again.');
      setSubmitting(false);
    }
  }

  async function cancelWait() {
    clearInterval(pollRef.current);
    setWaitingMpesa(false);
    setSubmitting(false);
    navigate('/therapy/my', { replace: true });
  }

  if (!therapist) {
    return (
      <div className="screen">
        <div style={{ padding: 'var(--space-md)' }}>
          <div className="skeleton" style={{ height: 40, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 200, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 160 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        height: 'var(--top-bar-height)', padding: '0 var(--space-md)',
        background: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 17 }}>Book — {therapist.display_name}</span>
      </div>

      {waitingMpesa ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 'var(--space-lg)', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-calm-light, #e8f4f8)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Clock size={32} color="var(--color-calm)" />
          </div>
          <h2 style={{ fontFamily: 'var(--font-editorial)', marginBottom: 8 }}>Waiting for M-Pesa</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', lineHeight: 1.6, maxWidth: 280, marginBottom: 24 }}>
            An M-Pesa STK Push has been sent to your phone. Enter your PIN to complete payment. This may take a moment.
          </p>
          <button onClick={cancelWait} className="btn btn--muted" style={{ minWidth: 180 }}>
            Cancel — check my bookings
          </button>
        </div>
      ) : (
        <div style={{ padding: 'var(--space-md)' }}>
          {/* Format selector */}
          <Section label="Session Format">
            <div style={{ display: 'flex', gap: 10 }}>
              {formats.map(f => {
                const Icon = FORMAT_ICONS[f] ?? VideoCamera;
                return (
                  <button
                    key={f}
                    onClick={() => setSelectedFormat(f)}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      padding: '12px 8px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      border: selectedFormat === f ? '2px solid var(--color-calm)' : '1px solid var(--color-border)',
                      background: selectedFormat === f ? 'var(--color-calm-light, #e8f4f8)' : 'var(--color-surface)',
                      transition: 'all 120ms ease',
                    }}
                  >
                    <Icon size={24} color={selectedFormat === f ? 'var(--color-calm)' : 'var(--color-text-muted)'} weight="duotone" />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: selectedFormat === f ? 'var(--color-calm)' : 'var(--color-text-primary)' }}>
                      {FORMAT_LABELS[f]}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Duration selector */}
          <Section label="Session Duration">
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { value: 45, label: '45 min', desc: 'Focus session' },
                { value: 60, label: '60 min', desc: 'Full session' },
              ].map(d => (
                <button
                  key={d.value}
                  onClick={() => setSelectedDuration(d.value)}
                  style={{
                    flex: 1, padding: '12px 8px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    border: selectedDuration === d.value ? '2px solid var(--color-calm)' : '1px solid var(--color-border)',
                    background: selectedDuration === d.value ? 'var(--color-calm-light, #e8f4f8)' : 'var(--color-surface)',
                    transition: 'all 120ms ease',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: selectedDuration === d.value ? 'var(--color-calm)' : 'var(--color-text-primary)' }}>{d.label}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{d.desc}</div>
                </button>
              ))}
            </div>
          </Section>

          {/* Date picker */}
          <Section label="Date">
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {dates.length === 0 && <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>No available dates</p>}
              {dates.map(d => {
                const dateObj = new Date(d + 'T12:00:00');
                return (
                  <button
                    key={d}
                    onClick={() => { setSelectedDate(d); setSelectedSlot(null); setSlotLockId(null); setLockCountdown(null); }}
                    style={{
                      flexShrink: 0, padding: '8px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      border: selectedDate === d ? '2px solid var(--color-calm)' : '1px solid var(--color-border)',
                      background: selectedDate === d ? 'var(--color-calm)' : 'var(--color-surface)',
                      color: selectedDate === d ? '#fff' : 'var(--color-text-primary)',
                      transition: 'all 120ms ease', fontSize: '0.82rem', fontWeight: 500,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{dateObj.getDate()}</div>
                    <div style={{ fontSize: '0.72rem' }}>{MONTH_NAMES[dateObj.getMonth()]}</div>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Time slots */}
          {selectedDate && (
            <Section label="Time">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(slotsByDate[selectedDate] ?? []).map(slot => (
                  <button
                    key={slot.start_time}
                    onClick={() => { setSelectedSlot(slot); setSlotLockId(null); setLockCountdown(null); setError(''); }}
                    style={{
                      padding: '8px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.84rem', fontWeight: 500,
                      border: selectedSlot?.start_time === slot.start_time ? '2px solid var(--color-calm)' : '1px solid var(--color-border)',
                      background: selectedSlot?.start_time === slot.start_time ? 'var(--color-calm)' : 'var(--color-surface)',
                      color: selectedSlot?.start_time === slot.start_time ? '#fff' : 'var(--color-text-primary)',
                      transition: 'all 120ms ease',
                    }}
                  >
                    {formatTime(slot.start_time)}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* Notes */}
          <Section label="Notes for therapist (optional)">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, 200))}
              placeholder="Anything you'd like your therapist to know beforehand…"
              rows={3}
              style={{
                width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                padding: '10px 12px', fontSize: '0.88rem', resize: 'vertical', fontFamily: 'inherit',
                background: 'var(--color-surface)', color: 'var(--color-text-primary)', boxSizing: 'border-box',
              }}
            />
            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              {notes.length}/200
            </div>
          </Section>

          {/* Cost summary */}
          {selectedFormat && (
            <div style={{ background: 'var(--color-surface-card)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
              <h4 style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.88rem' }}>Cost Summary</h4>
              <CostRow label="Session rate" value={`KES ${rate.toLocaleString()}`} />
              <CostRow label="Platform fee (20%)" value={`KES ${platformFee.toLocaleString()}`} />
              <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 8, paddingTop: 8 }}>
                <CostRow label="Total" value={`KES ${total.toLocaleString()}`} bold />
              </div>
              <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 6 }}>1 credit will also be deducted from your balance.</p>
            </div>
          )}

          {error && <p style={{ color: 'var(--color-error, #c0392b)', fontSize: '0.84rem', marginBottom: 12, textAlign: 'center' }}>{error}</p>}

          {/* Slot lock + confirm buttons */}
          {selectedSlot && !slotLockId && (
            <button className="btn btn--primary" style={{ width: '100%' }} onClick={acquireLock}>
              Hold this slot
            </button>
          )}

          {slotLockId && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, fontSize: '0.84rem', color: 'var(--color-text-muted)' }}>
                <Clock size={16} />
                Slot held for {Math.floor(lockCountdown / 60)}:{String(lockCountdown % 60).padStart(2, '0')}
              </div>
              <button
                className="btn btn--primary"
                style={{ width: '100%' }}
                onClick={handleConfirm}
                disabled={submitting || !selectedFormat}
              >
                {submitting ? 'Confirming…' : `Confirm — KES ${total.toLocaleString()}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 'var(--space-md)' }}>
      <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>{label}</h4>
      {children}
    </div>
  );
}

function CostRow({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? '0.92rem' : '0.86rem', fontWeight: bold ? 700 : 400, marginBottom: 6, color: bold ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
