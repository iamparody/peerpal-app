import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Star, SlidersHorizontal, X, User, ArrowLeft } from '@phosphor-icons/react';
import client from '../../api/client';

const FORMAT_LABELS = { video: 'Video', voice: 'Voice', text: 'Text' };
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        {therapist.photo_url ? (
          <img src={therapist.photo_url} alt={therapist.display_name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-calm-light, #e8f4f8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={28} color="var(--color-calm)" />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)', marginBottom: 2 }}>
            {therapist.display_name}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>
            {therapist.credentials}
          </div>
          {therapist.show_rating && therapist.bayesian_average != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StarRating value={therapist.bayesian_average} />
              <span style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                ({therapist.total_sessions} sessions)
              </span>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-calm)' }}>
            KES {therapist.rate_per_session_kes?.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>/ session</div>
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
        onClick={() => onViewProfile(therapist)}
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

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div
        style={{
          position: 'relative', background: 'var(--color-bg-primary)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          maxHeight: '92vh', overflowY: 'auto',
          animation: 'sheetSlideUp 280ms ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>

        {/* Close */}
        <button onClick={onClose} style={{ position: 'absolute', right: 16, top: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }} aria-label="Close">
          <X size={24} />
        </button>

        <div style={{ padding: '16px var(--space-md) var(--space-lg)' }}>
          {/* Photo + name */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            {therapist.photo_url ? (
              <img src={therapist.photo_url} alt={therapist.display_name} style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', marginBottom: 12 }} />
            ) : (
              <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'var(--color-calm-light, #e8f4f8)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <User size={44} color="var(--color-calm)" />
              </div>
            )}
            <h2 style={{ fontFamily: 'var(--font-editorial)', marginBottom: 4, textAlign: 'center' }}>{therapist.display_name}</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>{therapist.credentials}</p>
            {therapist.years_experience && (
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{therapist.years_experience} years experience</p>
            )}
          </div>

          {/* Rating */}
          {showRating && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 'var(--space-md)' }}>
              <StarRating value={therapist.bayesian_average} size={18} />
              <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{Number(therapist.bayesian_average).toFixed(1)}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>({therapist.total_ratings_count} reviews)</span>
            </div>
          )}

          {/* Trust signal */}
          {therapist.registration_number && (
            <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: '8px 14px', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>KCPA Reg.</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, fontFamily: 'monospace' }}>{therapist.registration_number}</span>
            </div>
          )}

          {/* Bio */}
          {therapist.plain_language_intro && (
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>About</h4>
              <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--color-text-primary)' }}>{therapist.plain_language_intro}</p>
            </div>
          )}

          {/* Approach */}
          {therapist.approach_plain && (
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>My Approach</h4>
              <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--color-text-primary)' }}>{therapist.approach_plain}</p>
            </div>
          )}

          {/* Cultural competencies */}
          {therapist.cultural_competencies && (
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Cultural Context</h4>
              <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--color-text-primary)' }}>{therapist.cultural_competencies}</p>
            </div>
          )}

          {/* Details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 'var(--space-md)' }}>
            <DetailCell label="Rate" value={`KES ${therapist.rate_per_session_kes?.toLocaleString()} / session`} />
            <DetailCell label="Session formats" value={formats.map(f => FORMAT_LABELS[f] ?? f).join(', ') || '—'} />
            <DetailCell label="Languages" value={(therapist.languages ?? []).join(', ') || '—'} />
            <DetailCell label="Available" value={(therapist.availability_days ?? []).map(d => DAY_LABELS[d] ?? d).join(', ') || '—'} />
          </div>

          {/* Anonymous comments */}
          {comments.length > 0 && (
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Recent Reviews</h4>
              {comments.map((c, i) => (
                <div key={i} style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <StarRating value={c.rating} size={13} />
                    <span style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>{c.month_year}</span>
                  </div>
                  {c.comment && <p style={{ fontSize: '0.84rem', color: 'var(--color-text-primary)', lineHeight: 1.5, margin: 0 }}>{c.comment}</p>}
                </div>
              ))}
            </div>
          )}

          <button
            className="btn btn--primary"
            style={{ width: '100%', fontSize: '1rem', padding: '14px' }}
            onClick={() => onBook(therapist.id)}
          >
            Book a Session
          </button>
        </div>
      </div>
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', maxHeight: '80vh', overflowY: 'auto', animation: 'sheetSlideUp 280ms ease' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>
        <div style={{ padding: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <h3 style={{ margin: 0 }}>Filter</h3>
            <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-calm)', fontWeight: 600 }}>Clear all</button>
          </div>

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
  const [selectedTherapist, setSelectedTherapist] = useState(null);
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
          <TherapistCard key={t.id} therapist={t} index={i} onViewProfile={setSelectedTherapist} />
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

      {selectedTherapist && (
        <ProfileSheet
          therapist={selectedTherapist}
          onClose={() => setSelectedTherapist(null)}
          onBook={id => { setSelectedTherapist(null); navigate(`/therapists/book/${id}`); }}
        />
      )}

      <style>{`
        @keyframes cardFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sheetSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}
