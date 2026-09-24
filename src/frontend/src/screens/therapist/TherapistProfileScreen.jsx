import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Star, ShieldCheck, Clock, VideoCamera, Phone, ChatText, User, Globe, MapPin } from '@phosphor-icons/react';
import client from '../../api/client';

const FORMAT_META = {
  video: { Icon: VideoCamera, label: 'Video call' },
  voice: { Icon: Phone,       label: 'Voice call' },
  text:  { Icon: ChatText,    label: 'Text chat'  },
};
const GENDER_LABELS = { male: 'Male', female: 'Female', non_binary: 'Non-binary' };

function StarRating({ value, size = 14 }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1,2,3,4,5].map(n => (
        <Star key={n} size={size} weight={n <= rounded ? 'fill' : 'regular'} color={n <= rounded ? '#F5A623' : '#ddd'} />
      ))}
    </span>
  );
}

function Skeleton() {
  return (
    <div style={{ padding: 'var(--space-md)' }}>
      <div className="skeleton" style={{ height: 220, borderRadius: 0, margin: '-var(--space-md)' }} />
      <div style={{ marginTop: 20 }}>
        <div className="skeleton" style={{ width: '60%', height: 22, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: '40%', height: 14, marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 80, borderRadius: 12, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 12, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
      </div>
    </div>
  );
}

export default function TherapistProfileScreen() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['therapy', 'therapist', id],
    queryFn: () => client.get(`/api/therapy/therapists/${id}`).then(r => r.data),
  });

  const t = data?.therapist;
  const showRating = t && t.total_ratings_count >= 5;
  const competencies = Array.isArray(t?.cultural_competencies)
    ? t.cultural_competencies
    : t?.cultural_competencies ? [t.cultural_competencies] : [];

  if (isLoading) return <div className="screen" style={{ overflowY: 'auto' }}><Skeleton /></div>;

  if (error || !t) {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-lg)', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>Therapist not found.</p>
        <button className="btn btn--muted" onClick={() => navigate(-1)}>Go back</button>
      </div>
    );
  }

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <div style={{ flex: 1, overflowY: 'auto' }}>

      {/* ── Hero ── */}
      <div style={{ position: 'relative' }}>
        {/* Back button — floats over hero */}
        <button
          onClick={() => navigate(-1)}
          style={{
            position: 'absolute', top: 16, left: 16, zIndex: 10,
            width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
          aria-label="Back"
        >
          <ArrowLeft size={20} color="#fff" />
        </button>

        {/* Photo */}
        {t.photo_url ? (
          <img
            src={t.photo_url}
            alt={t.display_name}
            style={{ width: '100%', height: 240, objectFit: 'cover', objectPosition: 'top', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: 240, background: 'linear-gradient(135deg, var(--color-calm) 0%, #2980b9 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={80} color="rgba(255,255,255,0.6)" />
          </div>
        )}

        {/* Availability badge */}
        {t.availability_status === 'available' && (
          <div style={{
            position: 'absolute', bottom: 14, right: 14,
            background: '#27ae60', color: '#fff',
            fontSize: '0.72rem', fontWeight: 700,
            padding: '4px 10px', borderRadius: 20,
            letterSpacing: 0.3,
          }}>
            Available
          </div>
        )}
      </div>

      {/* ── Identity block ── */}
      <div style={{ padding: '20px 20px 0' }}>
        <h1 style={{ fontFamily: 'var(--font-editorial)', fontSize: '1.5rem', margin: '0 0 4px', color: 'var(--color-text-primary)' }}>
          {t.display_name}
        </h1>
        <p style={{ margin: '0 0 6px', fontSize: '0.88rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
          {t.credentials}
        </p>
        {t.kcpa_level && (
          <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            {t.kcpa_level}
          </p>
        )}

        {/* Demographic row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
          {t.age && (
            <Stat icon={null} label={`${t.age} years old`} />
          )}
          {t.gender && (
            <Stat icon={null} label={GENDER_LABELS[t.gender] ?? t.gender} />
          )}
          {t.years_experience && (
            <Stat icon={null} label={`${t.years_experience} yrs experience`} />
          )}
          {t.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
              <MapPin size={13} />
              {t.location}
            </div>
          )}
        </div>

        {/* Rating row */}
        {showRating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <StarRating value={t.average_rating} size={16} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
              {Number(t.average_rating).toFixed(1)}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              · {t.total_sessions} sessions
            </span>
          </div>
        )}

        {/* KCPA trust badge */}
        {t.registration_number && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: '#eaf7ee', borderRadius: 8,
            padding: '7px 12px', marginBottom: 20,
          }}>
            <ShieldCheck size={16} color="#27ae60" weight="fill" />
            <span style={{ fontSize: '0.78rem', color: '#27ae60', fontWeight: 600 }}>
              KCPA Registered · {t.registration_number}
            </span>
          </div>
        )}
      </div>

      {/* ── Stats strip ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)',
        margin: '0 0 24px',
      }}>
        <StatCell value={`KES ${(t.rate_per_session_kes ?? 0).toLocaleString()}`} label="Per session" />
        <StatCell value={`${t.total_sessions ?? 0}`} label="Sessions" border />
        <StatCell value={showRating ? Number(t.average_rating).toFixed(1) : 'New'} label="Rating" />
      </div>

      <div style={{ padding: '0 20px' }}>

        {/* ── Session formats ── */}
        <Section label="How we can meet">
          <div style={{ display: 'flex', gap: 10 }}>
            {(t.session_formats ?? []).map(f => {
              const meta = FORMAT_META[f] ?? { Icon: VideoCamera, label: f };
              return (
                <div key={f} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '14px 8px', borderRadius: 12,
                  background: 'var(--color-surface-card)', border: '1px solid var(--color-border)',
                }}>
                  <meta.Icon size={22} color="var(--color-calm)" weight="duotone" />
                  <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Session durations ── */}
        <Section label="Session length">
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { mins: 45, desc: 'Focus session', rate: Math.round((t.rate_per_session_kes ?? 0) * 0.75) },
              { mins: 60, desc: 'Full session',  rate: t.rate_per_session_kes ?? 0 },
            ].map(d => (
              <div key={d.mins} style={{
                flex: 1, padding: '14px 12px', borderRadius: 12,
                background: 'var(--color-surface-card)', border: '1px solid var(--color-border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Clock size={15} color="var(--color-calm)" weight="duotone" />
                  <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-text-primary)' }}>{d.mins} min</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>{d.desc}</p>
                <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-calm)' }}>
                  KES {d.rate.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', marginTop: 8 }}>
            + 20% platform fee · 1 credit deducted on booking
          </p>
        </Section>

        {/* ── Languages ── */}
        {(t.languages ?? []).length > 0 && (
          <Section label="Languages">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {t.languages.map(l => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--color-surface)', borderRadius: 20, padding: '5px 12px', border: '1px solid var(--color-border)' }}>
                  <Globe size={13} color="var(--color-text-muted)" />
                  <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>{l}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── About ── */}
        {t.plain_language_intro && (
          <Section label="About me">
            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.7, color: 'var(--color-text-primary)' }}>
              {t.plain_language_intro}
            </p>
          </Section>
        )}

        {/* ── Approach ── */}
        {t.approach_plain && (
          <Section label="My approach">
            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.7, color: 'var(--color-text-primary)' }}>
              {t.approach_plain}
            </p>
          </Section>
        )}

        {/* ── Cultural context ── */}
        {competencies.length > 0 && (
          <Section label="Cultural context">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {competencies.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-calm)', marginTop: 7, flexShrink: 0 }} />
                  <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--color-text-primary)' }}>{c}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── What to expect ── */}
        <Section label="What to expect">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ExpectRow text="Your therapist will see your session notes — nothing shared beyond that." />
            <ExpectRow text="Sessions are not recorded. What you say stays between you." />
            <ExpectRow text="You can cancel for free more than 24 hours before your session." />
            <ExpectRow text="If a crisis is detected before a session, we will pause and connect you with support." />
          </div>
        </Section>

      </div>
    </div>

      {/* ── Pinned CTA — flex sibling, not fixed ── */}
      <div style={{
        flexShrink: 0,
        padding: '12px 20px 24px',
        background: 'var(--color-bg-primary)',
        borderTop: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>From </span>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)' }}>
              KES {Math.round((t.rate_per_session_kes ?? 0) * 0.75).toLocaleString()}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}> / 45 min</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>
            1 credit on booking
          </div>
        </div>
        <button
          className="btn btn--primary"
          style={{ width: '100%', fontSize: '1rem', padding: '14px', borderRadius: 14 }}
          onClick={() => navigate(`/therapists/book/${t.id}`)}
        >
          Book a Session
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{
        fontSize: '0.72rem', fontWeight: 800, letterSpacing: 0.8,
        textTransform: 'uppercase', color: 'var(--color-text-muted)',
        margin: '0 0 12px',
      }}>
        {label}
      </h3>
      {children}
    </div>
  );
}

function StatCell({ value, label, border }) {
  return (
    <div style={{
      padding: '14px 8px', textAlign: 'center',
      borderLeft: border ? '1px solid var(--color-border)' : 'none',
      borderRight: border ? '1px solid var(--color-border)' : 'none',
    }}>
      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--color-text-primary)', marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
    </div>
  );
}

function Stat({ label }) {
  return (
    <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>{label}</span>
  );
}

function ExpectRow({ text }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <ShieldCheck size={16} color="var(--color-calm)" weight="fill" style={{ flexShrink: 0, marginTop: 2 }} />
      <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{text}</p>
    </div>
  );
}
