import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, VideoCamera, Phone, ChatText } from '@phosphor-icons/react';
import client from '../../api/client';

const FORMAT_ICONS = { video: VideoCamera, voice: Phone, text: ChatText };
const FORMAT_LABELS = { video: 'Video', voice: 'Voice', text: 'Text' };

function formatEAT(dateStr) {
  if (!dateStr) return '';
  const utc = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Date(utc).toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default function BookingConfirmScreen() {
  const { id: bookingId } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['therapy', 'booking', bookingId],
    queryFn: () => client.get(`/api/therapy/bookings/${bookingId}`).then(r => r.data),
  });

  const booking = data?.booking;
  const FormatIcon = booking ? (FORMAT_ICONS[booking.session_format] ?? VideoCamera) : null;

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-lg)', textAlign: 'center' }}>
      {isLoading ? (
        <div>
          <div className="skeleton" style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto 20px' }} />
          <div className="skeleton" style={{ width: 200, height: 24, margin: '0 auto 12px' }} />
          <div className="skeleton" style={{ width: 160, height: 16, margin: '0 auto' }} />
        </div>
      ) : (
        <>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--color-calm-light, #e8f4f8)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <CheckCircle size={44} color="var(--color-calm)" weight="duotone" />
          </div>

          <h2 style={{ fontFamily: 'var(--font-editorial)', marginBottom: 8 }}>Booking Received</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', lineHeight: 1.6, maxWidth: 300, marginBottom: 28 }}>
            Your booking is pending therapist confirmation. You'll be notified once it's confirmed.
          </p>

          {booking && (
            <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)', width: '100%', maxWidth: 340, marginBottom: 28, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                {booking.therapist_photo_url ? (
                  <img src={booking.therapist_photo_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                ) : null}
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{booking.therapist_display_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{booking.therapist_credentials}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <BookingDetail label="Date & Time" value={formatEAT(booking.scheduled_at)} />
                <BookingDetail label="Format" value={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {FormatIcon && <FormatIcon size={14} />}
                    {FORMAT_LABELS[booking.session_format] ?? booking.session_format}
                  </span>
                } />
                <BookingDetail label="Status" value={
                  <span style={{ fontWeight: 600, color: 'var(--color-calm)' }}>Pending confirmation</span>
                } />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 340 }}>
            <button className="btn btn--primary" onClick={() => navigate('/therapy/my')}>
              View my bookings
            </button>
            <button className="btn btn--muted" onClick={() => navigate('/dashboard')}>
              Back to home
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function BookingDetail({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.88rem', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>{value}</div>
    </div>
  );
}
