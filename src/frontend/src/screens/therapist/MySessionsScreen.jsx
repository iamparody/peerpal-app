import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, VideoCamera, Phone, ChatText, Clock, Warning, CheckCircle, XCircle } from '@phosphor-icons/react';
import client from '../../api/client';

const FORMAT_ICONS = { video: VideoCamera, voice: Phone, text: ChatText };

function formatEAT(dateStr) {
  if (!dateStr) return '';
  const utc = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Date(utc).toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function Stars({ rating }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1,2,3,4,5].map(n => (
        <Star key={n} size={13} weight={n <= rating ? 'fill' : 'regular'} color={n <= rating ? '#f39c12' : '#ccc'} />
      ))}
    </span>
  );
}

function CancelModal({ booking, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const hoursUntil = (new Date(booking.scheduled_at) - Date.now()) / 3600000;
  const refundNote = hoursUntil > 24
    ? 'You will receive a full credit refund.'
    : hoursUntil > 2
    ? '50% M-Pesa refund may apply. Credit is non-refundable.'
    : 'No refund — less than 2 hours before session.';

  async function doCancel() {
    setBusy(true);
    await onConfirm(booking.id);
    setBusy(false);
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: 'var(--space-lg)', width: '100%' }}>
        <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>Cancel session?</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 20 }}>{refundNote}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn--secondary" style={{ flex: 1 }} onClick={onClose}>Keep it</button>
          <button className="btn btn--danger" style={{ flex: 1 }} onClick={doCancel} disabled={busy}>
            {busy ? 'Cancelling…' : 'Cancel session'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BookingCard({ booking, onCancel, onRate }) {
  const Icon = FORMAT_ICONS[booking.session_format] || VideoCamera;
  const isPast      = booking.status === 'completed';
  const isUpcoming  = booking.status === 'confirmed';
  const isCancelled = ['cancelled', 'therapist_no_show', 'member_no_show'].includes(booking.status);
  const billed = booking.duration_billed_minutes;

  const cancellationLabel = {
    cancelled:        'Cancelled',
    therapist_no_show:'Therapist no-show',
    member_no_show:   'You missed it',
  }[booking.status] || booking.status;

  return (
    <div style={{
      background: 'var(--color-bg-primary)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)',
      padding: '14px var(--space-md)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{booking.therapist_display_name}</span>
        <Icon size={15} color="var(--color-text-muted)" />
      </div>

      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{formatEAT(booking.scheduled_at)}</span>

      {isPast && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {billed != null && (
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={12} /> {billed} min billed
            </span>
          )}
          {booking.rating ? (
            <Stars rating={booking.rating} />
          ) : (
            <button
              onClick={() => onRate(booking)}
              style={{ fontSize: '0.75rem', color: 'var(--color-calm)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Rate this session
            </button>
          )}
        </div>
      )}

      {isCancelled && (
        <span style={{ fontSize: '0.78rem', color: 'var(--color-error, #c0392b)' }}>
          {cancellationLabel}
          {booking.escrow_status === 'refunded' ? ' · Refunded' : booking.escrow_status === 'released' ? ' · Released to therapist' : ''}
        </span>
      )}

      {isUpcoming && (
        <button
          className="btn btn--danger btn--sm"
          style={{ alignSelf: 'flex-start', marginTop: 4 }}
          onClick={() => onCancel(booking)}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

function RateModal({ booking, onDone, onClose }) {
  const [stars, setStars]   = useState(0);
  const [hovered, setHov]   = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy]     = useState(false);

  async function submit() {
    if (!stars) return;
    setBusy(true);
    try {
      await client.post('/api/therapy/ratings', { booking_id: booking.id, rating: stars, comment: comment.trim() || undefined });
      onDone(booking.id, stars);
    } catch { /* ignore dup */ }
    setBusy(false);
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: 'var(--space-lg)', width: '100%' }}>
        <p style={{ fontWeight: 700, marginBottom: 4 }}>Rate your session</p>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>with {booking.therapist_display_name}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
          {[1,2,3,4,5].map(n => (
            <Star
              key={n} size={36} weight={(hovered || stars) >= n ? 'fill' : 'regular'}
              color={(hovered || stars) >= n ? '#f39c12' : '#ccc'}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHov(n)} onMouseLeave={() => setHov(0)}
              onClick={() => setStars(n)}
            />
          ))}
        </div>
        <textarea
          placeholder="Leave a comment (optional)"
          value={comment} onChange={e => setComment(e.target.value)} maxLength={300}
          style={{ width: '100%', borderRadius: 8, border: '1px solid var(--color-border)', padding: 10, fontSize: '0.85rem', resize: 'none', height: 72, boxSizing: 'border-box', marginBottom: 12 }}
        />
        <button className="btn btn--primary" style={{ width: '100%' }} onClick={submit} disabled={!stars || busy}>
          {busy ? 'Submitting…' : 'Submit rating'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, count, children, emptyMsg }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px var(--space-md)', color: 'var(--color-text-primary)' }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title} {count > 0 && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({count})</span>}
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 var(--space-md) var(--space-md)' }}>
          {count === 0 ? <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: 0 }}>{emptyMsg}</p> : children}
        </div>
      )}
    </div>
  );
}

export default function MySessionsScreen() {
  const navigate = useNavigate();
  const [bookings, setBookings]     = useState([]);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [cancelModal, setCancelModal] = useState(null);
  const [rateModal, setRateModal]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, sRes] = await Promise.all([
        client.get('/api/therapy/bookings'),
        client.get('/api/therapy/bookings/stats'),
      ]);
      setBookings(bRes.data.bookings || []);
      setStats(sRes.data);
    } catch { /* show empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCancel(bookingId) {
    await client.post(`/api/therapy/bookings/${bookingId}/cancel`).catch(() => {});
    setBookings(bs => bs.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b));
  }

  function handleRated(bookingId, rating) {
    setBookings(bs => bs.map(b => b.id === bookingId ? { ...b, rating } : b));
  }

  const upcoming   = bookings.filter(b => b.status === 'confirmed');
  const past       = bookings.filter(b => b.status === 'completed');
  const cancelled  = bookings.filter(b => ['cancelled', 'therapist_no_show', 'member_no_show'].includes(b.status));

  return (
    <div className="screen" style={{ overflowY: 'auto', background: 'var(--color-bg-secondary, #f5f5f5)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        height: 'var(--top-bar-height)', padding: '0 var(--space-md)',
        background: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={22} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 17 }}>My Sessions</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--color-calm)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          {/* Stats strip */}
          {stats && (
            <div style={{ display: 'flex', gap: 0, background: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)', marginBottom: 12 }}>
              {[
                { label: 'Sessions', value: stats.total_sessions },
                { label: 'Hours', value: stats.total_hours_billed },
                { label: 'Therapists', value: stats.therapists_seen },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', padding: '16px 0', borderRight: i < 2 ? '1px solid var(--color-border)' : 'none' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--color-calm)' }}>{s.value}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <Section title="Upcoming" count={upcoming.length} emptyMsg="No upcoming sessions.">
            {upcoming.map(b => (
              <BookingCard key={b.id} booking={b} onCancel={setCancelModal} onRate={setRateModal} />
            ))}
          </Section>

          <Section title="Past" count={past.length} emptyMsg="No completed sessions yet.">
            {past.map(b => (
              <BookingCard key={b.id} booking={b} onCancel={setCancelModal} onRate={setRateModal} />
            ))}
          </Section>

          <Section title="Cancelled" count={cancelled.length} emptyMsg="No cancelled sessions.">
            {cancelled.map(b => (
              <BookingCard key={b.id} booking={b} onCancel={setCancelModal} onRate={setRateModal} />
            ))}
          </Section>
        </>
      )}

      {cancelModal && (
        <CancelModal
          booking={cancelModal}
          onConfirm={handleCancel}
          onClose={() => setCancelModal(null)}
        />
      )}
      {rateModal && (
        <RateModal
          booking={rateModal}
          onDone={handleRated}
          onClose={() => setRateModal(null)}
        />
      )}
    </div>
  );
}
