import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Star, VideoCamera, Phone, ChatText, Warning } from '@phosphor-icons/react';
import client from '../../api/client';

const FORMAT_ICONS = { video: VideoCamera, voice: Phone, text: ChatText };
const FORMAT_LABELS = { video: 'Video', voice: 'Voice', text: 'Text' };

const STATUS_COLORS = {
  pending: 'var(--color-warning, #E88B3F)',
  confirmed: 'var(--color-calm)',
  paid: 'var(--color-calm)',
  in_progress: '#27ae60',
  completed: 'var(--color-text-muted)',
  cancelled: 'var(--color-error, #c0392b)',
  member_no_show: 'var(--color-text-muted)',
  therapist_no_show: 'var(--color-error, #c0392b)',
};
const STATUS_LABELS = {
  pending: 'Pending', confirmed: 'Confirmed', paid: 'Confirmed',
  in_progress: 'In progress', completed: 'Completed',
  cancelled: 'Cancelled', member_no_show: 'You missed it', therapist_no_show: 'Therapist missed it',
};

function formatEAT(dateStr) {
  if (!dateStr) return '';
  const utc = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Date(utc).toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function getCancellationRefundNote(scheduledAt) {
  const now = Date.now();
  const sessionMs = new Date(scheduledAt.includes('Z') ? scheduledAt : scheduledAt.replace(' ', 'T') + 'Z').getTime();
  const hoursUntil = (sessionMs - now) / 3600000;
  if (hoursUntil > 24) return 'Full refund will be issued.';
  if (hoursUntil > 2) return '50% M-Pesa refund. Credit is non-refundable.';
  return 'No refund available (less than 2 hours before session). First cancellation may be waived.';
}

function CancelModal({ booking, onConfirm, onClose }) {
  const [confirming, setConfirming] = useState(false);
  const refundNote = getCancellationRefundNote(booking.scheduled_at);

  async function doCancel() {
    setConfirming(true);
    await onConfirm(booking.id);
    setConfirming(false);
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: 'var(--space-lg)', width: '100%' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <Warning size={24} color="var(--color-warning, #E88B3F)" weight="duotone" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h3 style={{ margin: '0 0 6px' }}>Cancel this booking?</h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>{refundNote}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn--muted" style={{ flex: 1 }} onClick={onClose} disabled={confirming}>Keep</button>
          <button
            style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-error, #c0392b)', color: '#fff', fontWeight: 700, cursor: confirming ? 'not-allowed' : 'pointer', opacity: confirming ? 0.7 : 1, fontSize: '0.9rem' }}
            onClick={doCancel}
            disabled={confirming}
          >
            {confirming ? 'Cancelling…' : 'Cancel Session'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RatingModal({ booking, onDone }) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    if (stars === 0) return;
    setSubmitting(true);
    try {
      await client.post('/api/therapy/ratings', { booking_id: booking.id, rating: stars, comment: comment.trim() || null });
      setSubmitted(true);
      setTimeout(onDone, 1500);
    } catch { setSubmitting(false); }
  }

  if (submitted) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
        <div style={{ position: 'relative', background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: 'var(--space-lg)', width: '100%', textAlign: 'center' }}>
          <Star size={40} weight="fill" color="#F5A623" style={{ marginBottom: 10 }} />
          <p style={{ fontWeight: 600 }}>Thank you for your feedback!</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} onClick={onDone} />
      <div style={{ position: 'relative', background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: 'var(--space-lg)', width: '100%' }}>
        <h3 style={{ marginBottom: 6 }}>Rate your session</h3>
        <p style={{ fontSize: '0.84rem', color: 'var(--color-text-muted)', marginBottom: 20 }}>How was your session with {booking.therapist_name}?</p>

        {/* Stars */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setStars(n)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              aria-label={`${n} star${n !== 1 ? 's' : ''}`}
            >
              <Star size={36} weight={n <= (hovered || stars) ? 'fill' : 'regular'} color={n <= (hovered || stars) ? '#F5A623' : 'var(--color-border)'} />
            </button>
          ))}
        </div>

        {/* Comment */}
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value.slice(0, 300))}
          placeholder="Share your experience (optional)"
          rows={3}
          style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', padding: '10px 12px', fontSize: '0.88rem', resize: 'none', fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text-primary)', boxSizing: 'border-box', marginBottom: 16 }}
        />
        <div style={{ textAlign: 'right', fontSize: '0.74rem', color: 'var(--color-text-muted)', marginTop: -12, marginBottom: 16 }}>{comment.length}/300</div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn--muted" style={{ flex: 1 }} onClick={onDone}>Skip</button>
          <button className="btn btn--primary" style={{ flex: 1 }} onClick={submit} disabled={stars === 0 || submitting}>
            {submitting ? 'Submitting…' : 'Submit Rating'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BookingCard({ booking, tab, onCancel, onRate, onJoin }) {
  const FormatIcon = FORMAT_ICONS[booking.session_format] ?? VideoCamera;
  const isUpcoming = tab === 'upcoming';
  const canJoin = booking.status === 'in_progress';
  const canCancel = isUpcoming && ['pending', 'confirmed', 'paid'].includes(booking.status);
  const needsRating = tab === 'past' && booking.status === 'completed' && !booking.has_rating;

  return (
    <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)', marginBottom: 12 }}>
      {/* Therapist + time */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 2 }}>{booking.therapist_name}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{formatEAT(booking.scheduled_at)}</div>
        </div>
        <span style={{
          fontSize: '0.74rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: `${STATUS_COLORS[booking.status] ?? 'var(--color-surface)'}22`,
          color: STATUS_COLORS[booking.status] ?? 'var(--color-text-muted)',
        }}>
          {STATUS_LABELS[booking.status] ?? booking.status}
        </span>
      </div>

      {/* Format badge */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 14, background: 'var(--color-surface)', padding: '4px 10px', borderRadius: 20 }}>
        <FormatIcon size={14} />
        {FORMAT_LABELS[booking.session_format]}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canJoin && (
          <button className="btn btn--primary" style={{ flex: 1, minWidth: 120, fontSize: '0.88rem' }} onClick={() => onJoin(booking)}>
            Join Session
          </button>
        )}
        {needsRating && (
          <button className="btn btn--primary" style={{ flex: 1, minWidth: 120, fontSize: '0.88rem' }} onClick={() => onRate(booking)}>
            Rate Session
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => onCancel(booking)}
            style={{ flex: 1, minWidth: 80, padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-error, #c0392b)', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default function MyTherapyScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('upcoming');
  const [cancelBooking, setCancelBooking] = useState(null);
  const [rateBooking, setRateBooking] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['therapy', 'my-bookings'],
    queryFn: () => client.get('/api/therapy/bookings').then(r => r.data),
  });

  const all = data?.bookings ?? [];
  const upcoming = all.filter(b => ['pending', 'confirmed', 'paid', 'in_progress'].includes(b.status));
  const past = all.filter(b => ['completed', 'cancelled', 'member_no_show', 'therapist_no_show'].includes(b.status));
  const shown = tab === 'upcoming' ? upcoming : past;

  async function handleCancel(id) {
    await client.patch(`/api/therapy/bookings/${id}/cancel`);
    qc.invalidateQueries(['therapy', 'my-bookings']);
  }

  function handleJoin(booking) {
    navigate(`/therapy/session/${booking.id}`);
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
        <span style={{ fontWeight: 700, fontSize: 17 }}>My Therapy</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        {['upcoming', 'past'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer',
              fontWeight: tab === t ? 700 : 400, fontSize: '0.9rem',
              color: tab === t ? 'var(--color-calm)' : 'var(--color-text-muted)',
              borderBottom: tab === t ? '2px solid var(--color-calm)' : '2px solid transparent',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: 'var(--space-md)' }}>
        {isLoading && (
          <>
            <div className="skeleton" style={{ height: 130, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 130, borderRadius: 'var(--radius-lg)' }} />
          </>
        )}

        {!isLoading && shown.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
            <p style={{ fontWeight: 600 }}>{tab === 'upcoming' ? 'No upcoming sessions' : 'No past sessions'}</p>
            {tab === 'upcoming' && (
              <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={() => navigate('/therapists')}>
                Browse Therapists
              </button>
            )}
          </div>
        )}

        {!isLoading && shown.map(b => (
          <BookingCard
            key={b.id}
            booking={b}
            tab={tab}
            onCancel={setCancelBooking}
            onRate={setRateBooking}
            onJoin={handleJoin}
          />
        ))}
      </div>

      {cancelBooking && (
        <CancelModal
          booking={cancelBooking}
          onConfirm={handleCancel}
          onClose={() => setCancelBooking(null)}
        />
      )}

      {rateBooking && (
        <RatingModal
          booking={rateBooking}
          onDone={() => { setRateBooking(null); qc.invalidateQueries(['therapy', 'my-bookings']); }}
        />
      )}
    </div>
  );
}
