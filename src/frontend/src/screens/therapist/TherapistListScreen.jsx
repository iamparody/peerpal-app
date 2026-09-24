import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Star, SlidersHorizontal, User, ArrowLeft, X } from '@phosphor-icons/react';
import client from '../../api/client';

const FORMAT_LABELS = { video: 'Video', voice: 'Voice', text: 'Text' };
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GENDER_LABELS = { male: 'Male', female: 'Female', non_binary: 'Non-binary' };

function StarRating({ value, size = 14 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={size} weight={n <= Math.round(value) ? 'fill' : 'regular'} color={n <= Math.round(value) ? '#F5A623' : 'var(--color-border)'} />
      ))}
    </span>
  );
}

function TherapistCardSkeleton() {
  return (
    <div className="skeleton" style={{ height: 160, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
  );
}

function TherapistCard({ therapist, onViewProfile, index }) {
  const formats = therapist.session_formats ?? [];
  return (
    <div
      style={{
        background: 'var(--color-surface-card)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)',
        animation: `cardFadeIn 300ms ease ${index * 60}ms both`,
      }}
    >
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        {therapist.photo_url ? (
          <img src={therapist.photo_url} alt={therapist.display_name} style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--color-calm-light, #e8f4f8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={30} color="var(--color-calm)" />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)', marginBottom: 1 }}>
            {therapist.display_name}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 3 }}>
            {therapist.credentials}
          </div>
          {/* Age · Gender */}
          {(therapist.age || therapist.gender) && (
            <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>
              {[
                therapist.age ? `${therapist.age} yrs` : null,
                therapist.gender ? (GENDER_LABELS[therapist.gender] ?? therapist.gender) : null,
              ].filter(Boolean).join(' · ')}
            </div>
          )}
          {therapist.show_rating && therapist.bayesian_average != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StarRating value={therapist.bayesian_average} />
              <span style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>
                {Number(therapist.bayesian_average).toFixed(1)} ({therapist.total_sessions} sessions)
              </span>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-calm)' }}>
            KES {therapist.rate_per_session_kes?.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>/ session</div>
        </div>
      </div>

      {/* Languages + formats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {(therapist.languages ?? []).map(lang => (
          <span key={lang} style={{ fontSize: '0.72rem', background: 'var(--color-calm-light, #e8f4f8)', color: 'var(--color-calm)', padding: '2px 8px', borderRadius: 20 }}>{lang}</span>
        ))}
        {formats.map(f => (
          <span key={f} style={{ fontSize: '0.72rem', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', padding: '2px 8px', borderRadius: 20, border: '1px solid var(--color-border)' }}>{FORMAT_LABELS[f] ?? f}</span>
        ))}
      </div>

      <button
        className="btn btn--primary"
        style={{ width: '100%', fontSize: '0.88rem', padding: '10px' }}
        onClick={() => onViewProfile(therapist.id)}
      >
        View Profile
      </button>
    </div>
  );
}

function ProfileSheet({ therapist, onClose, onBook }) {
  const formats = therapist.session_formats ?? [];
  const showRating = therapist.show_rating && therapist.bayesian_average != null;
  const comments = therapist.recent_comments ?? [];
  const competencies = Array.isArray(therapist.cultural_competencies)
    ? therapist.cultural_competencies.join(' · ')
    : therapist.cultural_competencies;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />

      {/* Sheet — max 82vh, flex column so CTA stays pinned at bottom */}
      <div
        style={{
          position: 'relative', background: 'var(--color-bg-primary)',
          borderRadius: '20px 20px 0 0',
          maxHeight: '82vh',
          display: 'flex', flexDirection: 'column',
          animation: 'sheetSlideUp 280ms ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle + close row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 16px 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>
        <button onClick={onClose} style={{ position: 'absolute', right: 14, top: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 6 }} aria-label="Close">
          <X size={20} />
        </button>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px 8px' }}>

          {/* Header row — photo left, info right */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
            {therapist.photo_url ? (
              <img src={therapist.photo_url} alt={therapist.display_name}
                style={{ width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--color-calm-light,#e8f4f8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User size={36} color="var(--color-calm)" />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontFamily: 'var(--font-editorial)', fontSize: '1.05rem', margin: '0 0 2px' }}>{therapist.display_name}</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 4px', lineHeight: 1.3 }}>{therapist.credentials}</p>
              {/* Age · Gender · Experience */}
              <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: '0 0 6px' }}>
                {[
                  therapist.age ? `${therapist.age} yrs` : null,
                  therapist.gender ? GENDER_LABELS[therapist.gender] ?? therapist.gender : null,
                  therapist.years_experience ? `${therapist.years_experience} yrs exp.` : null,
                ].filter(Boolean).join(' · ')}
              </p>
              {showRating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StarRating value={therapist.bayesian_average} size={13} />
                  <span style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                    {Number(therapist.bayesian_average).toFixed(1)} ({therapist.total_ratings_count})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* KCPA trust badge */}
          {therapist.registration_number && (
            <div style={{ background: 'var(--color-surface)', borderRadius: 8, padding: '7px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>KCPA</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-calm)' }}>{therapist.registration_number}</span>
            </div>
          )}

          {/* Quick-fact chips row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {formats.map(f => (
              <span key={f} style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 20, background: 'var(--color-calm-light,#e8f4f8)', color: 'var(--color-calm)', fontWeight: 600 }}>
                {FORMAT_LABELS[f] ?? f}
              </span>
            ))}
            {/* Session durations */}
            <span style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 20, background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              45 min
            </span>
            <span style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 20, background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              60 min
            </span>
            {(therapist.languages ?? []).map(l => (
              <span key={l} style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 20, background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                {l}
              </span>
            ))}
            <span style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 20, background: 'var(--color-surface)', color: 'var(--color-calm)', fontWeight: 600, border: '1px solid var(--color-border)' }}>
              KES {therapist.rate_per_session_kes?.toLocaleString()}
            </span>
          </div>

          {/* About */}
          {therapist.plain_language_intro && (
            <ProfileSection label="About">
              <p style={{ fontSize: '0.86rem', lineHeight: 1.65, color: 'var(--color-text-primary)', margin: 0 }}>{therapist.plain_language_intro}</p>
            </ProfileSection>
          )}

          {/* Approach */}
          {therapist.approach_plain && (
            <ProfileSection label="My Approach">
              <p style={{ fontSize: '0.86rem', lineHeight: 1.65, color: 'var(--color-text-primary)', margin: 0 }}>{therapist.approach_plain}</p>
            </ProfileSection>
          )}

          {/* Cultural context */}
          {competencies && (
            <ProfileSection label="Cultural Context">
              <p style={{ fontSize: '0.86rem', lineHeight: 1.65, color: 'var(--color-text-primary)', margin: 0 }}>{competencies}</p>
            </ProfileSection>
          )}

          {/* Reviews */}
          {comments.length > 0 && (
            <ProfileSection label="Recent Reviews">
              {comments.map((c, i) => (
                <div key={i} style={{ background: 'var(--color-surface)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <StarRating value={c.rating} size={12} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{c.month_year}</span>
                  </div>
                  {c.comment && <p style={{ fontSize: '0.83rem', color: 'var(--color-text-primary)', lineHeight: 1.5, margin: 0 }}>{c.comment}</p>}
                </div>
              ))}
            </ProfileSection>
          )}
        </div>

        {/* Pinned CTA */}
        <div style={{ padding: '10px 16px 20px', borderTop: '1px solid var(--color-border)', flexShrink: 0, background: 'var(--color-bg-primary)' }}>
          <button
            className="btn btn--primary"
            style={{ width: '100%', fontSize: '0.95rem', padding: '13px' }}
            onClick={() => onBook(therapist.id)}
          >
            Book a Session
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</p>
      {children}
    </div>
  );
}

function DetailCell({ label, value }) {
  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: '0.84rem', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>{value}</div>
    </div>
  );
}

function FilterSheet({ filters, setFilters, rateRange, onClose }) {
  const [local, setLocal] = useState(filters);

  function toggleArray(field, val) {
    setLocal(prev => {
      const arr = prev[field] ?? [];
      return { ...prev, [field]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  }

  function apply() {
    setFilters(local);
    onClose();
  }

  function clear() {
    const empty = { languages: [], genders: [], formats: [], days: [], maxRate: rateRange.max };
    setLocal(empty);
    setFilters(empty);
    onClose();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--color-bg-primary)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          animation: 'sheetSlideUp 280ms ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px 0', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Filter</h3>
          <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-calm)', fontWeight: 600 }}>Clear all</button>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px 8px' }}>
          <FilterSection label="Session format">
            {['video', 'voice', 'text'].map(f => (
              <Chip key={f} label={FORMAT_LABELS[f]} active={(local.formats ?? []).includes(f)} onToggle={() => toggleArray('formats', f)} />
            ))}
          </FilterSection>

          <FilterSection label="Available day">
            {DAY_LABELS.map((d, i) => (
              <Chip key={i} label={d} active={(local.days ?? []).includes(i)} onToggle={() => toggleArray('days', i)} />
            ))}
          </FilterSection>

          <FilterSection label="Gender">
            {['male', 'female', 'non_binary'].map(g => (
              <Chip key={g} label={g === 'non_binary' ? 'Non-binary' : g.charAt(0).toUpperCase() + g.slice(1)} active={(local.genders ?? []).includes(g)} onToggle={() => toggleArray('genders', g)} />
            ))}
          </FilterSection>

          {rateRange.max > rateRange.min && (
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
                Max rate: KES {(local.maxRate ?? rateRange.max).toLocaleString()}
              </div>
              <input
                type="range"
                min={rateRange.min}
                max={rateRange.max}
                step={500}
                value={local.maxRate ?? rateRange.max}
                onChange={e => setLocal(prev => ({ ...prev, maxRate: Number(e.target.value) }))}
                style={{ width: '100%', accentColor: 'var(--color-calm)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                <span>KES {rateRange.min.toLocaleString()}</span>
                <span>KES {rateRange.max.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Pinned CTA */}
        <div style={{ padding: '12px 20px 32px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={apply}>Apply Filters</button>
        </div>
      </div>
    </div>
  );
}

function FilterSection({ label, children }) {
  return (
    <div style={{ marginBottom: 'var(--space-md)' }}>
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
    </div>
  );
}

function Chip({ label, active, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        padding: '6px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer',
        border: active ? 'none' : '1px solid var(--color-border)',
        background: active ? 'var(--color-calm)' : 'var(--color-surface)',
        color: active ? '#fff' : 'var(--color-text-primary)',
        transition: 'all 120ms ease',
      }}
    >
      {label}
    </button>
  );
}

export default function TherapistListScreen() {
  const { id: categoryId } = useParams();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [allTherapists, setAllTherapists] = useState([]);
  const [filters, setFilters] = useState({ languages: [], genders: [], formats: [], days: [], maxRate: null });
  const [showFilter, setShowFilter] = useState(false);
  const [rateRange, setRateRange] = useState({ min: 0, max: 10000 });
  const [hasMore, setHasMore] = useState(false);
  const prevKeyRef = useRef('');

  // Build query params
  const params = new URLSearchParams({ category_id: categoryId, page, limit: 20 });
  if (filters.formats?.length) params.set('session_format', filters.formats.join(','));
  if (filters.genders?.length) params.set('gender', filters.genders.join(','));
  if (filters.languages?.length) params.set('language', filters.languages.join(','));
  if (filters.days?.length) params.set('day_of_week', filters.days.join(','));
  if (filters.maxRate) params.set('max_rate', filters.maxRate);
  const queryKey = params.toString();

  const { data, isLoading } = useQuery({
    queryKey: ['therapy', 'therapists', queryKey],
    queryFn: () => client.get(`/api/therapy/therapists?${params.toString()}`).then(r => r.data),
  });

  useEffect(() => {
    if (!data) return;
    const list = data.therapists ?? [];
    if (queryKey !== prevKeyRef.current) {
      setAllTherapists(list);
    } else {
      setAllTherapists(prev => [...prev, ...list]);
    }
    prevKeyRef.current = queryKey;
    setHasMore((data.page ?? 1) < (data.total_pages ?? 1));
    if (data.rate_min != null) setRateRange({ min: data.rate_min, max: data.rate_max });
  }, [data]);

  const filterActive = filters.formats?.length || filters.genders?.length || filters.languages?.length || filters.days?.length || filters.maxRate;

  function handleSetFilters(f) {
    setFilters(f);
    setPage(1);
    prevKeyRef.current = '';
    setAllTherapists([]);
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
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-primary)', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 17, flex: 1 }}>
          {data?.category_name ?? 'Therapists'}
        </span>
        <button
          onClick={() => setShowFilter(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: filterActive ? 'var(--color-calm)' : 'var(--color-surface)',
            color: filterActive ? '#fff' : 'var(--color-text-primary)',
            border: `1px solid ${filterActive ? 'var(--color-calm)' : 'var(--color-border)'}`,
            borderRadius: 20, padding: '6px 14px', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600,
          }}
        >
          <SlidersHorizontal size={16} />
          Filter{filterActive ? ' ·' : ''}
        </button>
      </div>

      <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isLoading && allTherapists.length === 0 && (
          <>
            <TherapistCardSkeleton />
            <TherapistCardSkeleton />
            <TherapistCardSkeleton />
          </>
        )}

        {!isLoading && allTherapists.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
            <p style={{ fontWeight: 600 }}>No therapists found</p>
            <p style={{ fontSize: '0.84rem', marginTop: 4 }}>Try adjusting your filters.</p>
          </div>
        )}

        {allTherapists.map((t, i) => (
          <TherapistCard key={t.id} therapist={t} index={i} onViewProfile={id => navigate(`/therapists/profile/${id}`)} />
        ))}

        {hasMore && (
          <button
            className="btn btn--muted"
            style={{ width: '100%' }}
            onClick={() => setPage(p => p + 1)}
            disabled={isLoading}
          >
            {isLoading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>

      {showFilter && (
        <FilterSheet filters={filters} setFilters={handleSetFilters} rateRange={rateRange} onClose={() => setShowFilter(false)} />
      )}

      <style>{`
        @keyframes cardFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sheetSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}
