import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChartLine, ClockCounterClockwise } from '@phosphor-icons/react';
import client from '../api/client';
import MoodDotGrid from '../components/MoodDotGrid';
import PageHeader from '../components/PageHeader';

const SCORE_COLORS = [
  { min: -2,   max: -1.5, color: 'var(--color-danger)'  },
  { min: -1.5, max: -0.5, color: 'var(--color-warning)' },
  { min: -0.5, max:  0.5, color: 'var(--color-accent)'  },
  { min:  0.5, max:  1.5, color: 'var(--color-calm)'    },
  { min:  1.5, max:  2,   color: '#6BAF7A'               },
];

const MOOD_META = {
  very_low: { label: 'Very Low', color: 'var(--color-danger)',  emoji: '😔' },
  low:      { label: 'Low',      color: 'var(--color-warning)', emoji: '😕' },
  neutral:  { label: 'Neutral',  color: 'var(--color-accent)',  emoji: '😐' },
  good:     { label: 'Good',     color: 'var(--color-calm)',    emoji: '🙂' },
  great:    { label: 'Great',    color: '#6BAF7A',              emoji: '😊' },
};

function scoreColor(score) {
  if (score === null) return 'var(--color-border)';
  for (const band of SCORE_COLORS) {
    if (score >= band.min && score <= band.max) return band.color;
  }
  return score < 0 ? 'var(--color-warning)' : 'var(--color-calm)';
}

function AnalyticsSkeleton() {
  return (
    <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
        <div className="skeleton" style={{ height: 72, borderRadius: 'var(--radius-lg)' }} />
        <div className="skeleton" style={{ height: 72, borderRadius: 'var(--radius-lg)' }} />
      </div>
      <div className="skeleton" style={{ height: 60, borderRadius: 'var(--radius-lg)' }} />
      <div className="skeleton" style={{ height: 90, borderRadius: 'var(--radius-lg)' }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
        {[40, 60, 30, 80, 50, 70, 45].map((h, i) => (
          <div key={i} className="skeleton" style={{ flex: 1, height: h, borderRadius: '3px 3px 0 0' }} />
        ))}
      </div>
    </div>
  );
}

function BarChart({ data }) {
  if (!data?.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
      {data.map((d, i) => {
        const color  = scoreColor(d.avg_score);
        const height = d.avg_score !== null ? ((d.avg_score + 2) / 4) * 80 : 4;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ width: '100%', height: Math.max(4, height), background: color, borderRadius: '3px 3px 0 0', transition: 'height 300ms ease' }} />
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1 }}>
              {new Date(d.date).toLocaleDateString('en-KE', { weekday: 'narrow' })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const MOOD_SCORE = { very_low: 1, low: 2, neutral: 3, good: 4, great: 5 };

function TodayArc({ entries }) {
  if (!entries?.length) return null;
  return (
    <div className="card">
      <h3 style={{ marginBottom: 'var(--space-md)', fontSize: 16 }}>Today's arc</h3>
      {entries.length === 1 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Log more moods throughout the day to see your arc.
        </p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56 }}>
          {entries.map((e) => {
            const score = MOOD_SCORE[e.mood_level] ?? 3;
            const height = (score / 5) * 56;
            const meta   = MOOD_META[e.mood_level];
            return (
              <div key={e.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div
                  title={meta?.label}
                  style={{
                    width: '100%', height: Math.max(6, height),
                    background: meta?.color ?? 'var(--color-accent)',
                    borderRadius: '3px 3px 0 0', transition: 'height 300ms ease',
                  }}
                />
                <div style={{ fontSize: 9, color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1 }}>
                  {new Date(e.created_at.includes('Z') ? e.created_at : e.created_at + 'Z')
                    .toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
        <span>😔 Very Low</span><span>😊 Great</span>
      </div>
    </div>
  );
}

function toLocalYMD(dateStr) {
  const d = new Date(dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function AnalyticsScreen() {
  const navigate = useNavigate();

  const { data: analyticsData, isLoading: aLoading, error: aError } = useQuery({
    queryKey: ['moods', 'analytics'],
    queryFn:  () => client.get('/api/moods/analytics').then(r => r.data),
  });
  const { data: arcData } = useQuery({
    queryKey: ['moods', 'arc'],
    queryFn:  () => client.get('/api/moods/arc').then(r => r.data),
    retry: false,
  });
  const { data: histData } = useQuery({
    queryKey: ['moods', 'history', 91],
    queryFn:  () => client.get('/api/moods/history?limit=91').then(r => r.data),
  });

  const loading = aLoading;
  const error   = aError ? "We couldn't connect. Check your internet and try again." : '';

  const tooFew         = !analyticsData || (analyticsData.total_checkins ?? 0) < 3;
  const commonMoodMeta = analyticsData?.common_mood ? MOOD_META[analyticsData.common_mood] : null;
  const arcEntries     = arcData?.entries ?? [];
  const histEntries    = histData?.entries ?? [];

  const dotEntries = histEntries.map(e => ({
    date:       toLocalYMD(e.created_at),
    mood_level: e.mood_level,
  }));

  return (
    <div className="screen">
      <PageHeader title="My Insights" />

      <div style={{ padding: 'var(--space-sm) var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {error && <div className="error-msg">{error}</div>}

        {loading ? (
          <AnalyticsSkeleton />
        ) : tooFew ? (
          <div className="empty-state">
            <ChartLine size={48} weight="duotone" color="var(--color-text-muted)" aria-hidden="true" />
            <div className="empty-state__title">Keep checking in</div>
            <div className="empty-state__body">Your mood insights appear after a few days of check-ins.</div>
          </div>
        ) : (
          <>
            {/* Dot-matrix mood calendar */}
            {dotEntries.length > 0 && (
              <div className="card">
                <h3 style={{ marginBottom: 'var(--space-md)', fontSize: 16 }}>Mood calendar</h3>
                <MoodDotGrid entries={dotEntries} />
              </div>
            )}

            {arcEntries.length > 0 && <TodayArc entries={arcEntries} />}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
              {[
                { label: 'Current Streak',  value: `${analyticsData.current_streak ?? 0}🔥` },
                { label: 'Total Check-ins', value: `${analyticsData.total_checkins ?? 0}` },
              ].map((s) => (
                <div key={s.label} className="card" style={{ textAlign: 'center', padding: 'var(--space-md)' }}>
                  <div style={{ fontWeight: 600, fontSize: 24, color: 'var(--color-text-primary)' }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {commonMoodMeta && (
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                <span style={{ fontSize: 36 }} aria-hidden="true">{commonMoodMeta.emoji}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>Most common mood (30 days)</div>
                  <div style={{ color: commonMoodMeta.color, fontWeight: 600, marginTop: 2 }}>{commonMoodMeta.label}</div>
                </div>
              </div>
            )}

            {analyticsData.week_trend?.length > 0 && (
              <div className="card">
                <h3 style={{ marginBottom: 'var(--space-md)', fontSize: 16 }}>Last 7 days</h3>
                <BarChart data={analyticsData.week_trend} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
                  <span>😔 Very Low</span><span>😊 Great</span>
                </div>
              </div>
            )}

            {analyticsData.frequent_tags?.length > 0 && (
              <div className="card">
                <h3 style={{ marginBottom: 'var(--space-md)', fontSize: 16 }}>Most frequent feelings (30 days)</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                  {analyticsData.frequent_tags.map((t) => (
                    <span key={t.tag} className="pill" style={{ fontSize: 13 }}>
                      {t.tag} <strong style={{ color: 'var(--color-accent)', marginLeft: 4 }}>{t.count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              className="card"
              onClick={() => navigate('/sessions')}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none' }}
            >
              <ClockCounterClockwise size={28} weight="duotone" color="var(--color-accent)" aria-hidden="true" />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>Session history</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>Review past AI and peer sessions</div>
              </div>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
