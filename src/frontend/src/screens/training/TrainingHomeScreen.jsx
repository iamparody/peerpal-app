import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

const SKILL_ICONS = {
  ear: '👂', heart: '💛', lock: '🔒', shield: '🛡️', lifebuoy: '🛟',
  clover: '🍀', candle: '🕯️', prism: '🌈', lantern: '🏮', bridge: '🌁',
  umbrella: '☂️', mountain: '⛰️', compass: '🧭', sapling: '🌱',
  anchor: '⚓', lighthouse: '🗼', 'door-open': '🚪', globe: '🌍',
};

function ProgressRing({ earned, total }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const fill = total > 0 ? (earned / total) * circ : 0;
  return (
    <svg width={84} height={84} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={42} cy={42} r={r} fill="none" stroke="var(--color-border)" strokeWidth={7} />
      <circle
        cx={42} cy={42} r={r} fill="none" stroke="#8FAF9A" strokeWidth={7}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
    </svg>
  );
}

function SkillBadge({ skill, navigate }) {
  const earned = skill.status === 'earned';
  const inProgress = skill.status === 'in_progress';
  const locked = skill.status === 'locked';
  const lapsed = skill.status === 'lapsed';
  const activeAttempt = skill.active_attempt_id;

  const earnedColor = skill.skill_group === 'baseline' ? '#8FAF9A' : '#C8943A';
  const borderColor = earned ? earnedColor : inProgress ? '#6B8CC7' : 'var(--color-border)';
  const labelColor = earned ? earnedColor : inProgress ? '#6B8CC7' : '#9E9E9E';

  function handlePress() {
    if (inProgress && activeAttempt) {
      navigate(`/training/scenario/${activeAttempt}`);
    } else {
      navigate(`/training/${skill.slug}`);
    }
  }

  return (
    <button
      onClick={handlePress}
      style={{
        background: 'var(--color-surface-card)',
        border: `2px solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        padding: '12px 8px',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        opacity: locked ? 0.55 : lapsed ? 0.45 : 1,
        position: 'relative',
        minHeight: 90,
      }}
    >
      <span style={{ fontSize: 28, filter: locked ? 'grayscale(1)' : 'none', lineHeight: 1 }}>
        {SKILL_ICONS[skill.icon_name] || '✦'}
      </span>
      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: labelColor, textAlign: 'center', lineHeight: 1.3 }}>
        {skill.name}
      </span>
      {inProgress && (
        <span style={{ position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: '50%', background: '#6B8CC7' }} />
      )}
      {lapsed && (
        <span style={{ position: 'absolute', bottom: 5, right: 5, fontSize: 10 }}>🕐</span>
      )}
    </button>
  );
}

export default function TrainingHomeScreen() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/api/training/skills')
      .then(r => setSkills(r.data.skills ?? []))
      .catch(() => setError('Could not load training data.'))
      .finally(() => setLoading(false));
  }, []);

  const baseline = skills.filter(s => s.skill_group === 'baseline');
  const specialty = skills.filter(s => s.skill_group === 'specialty');
  const earnedBaseline = baseline.filter(s => s.status === 'earned').length;
  const earnedSpecialty = specialty.filter(s => s.status === 'earned').length;

  if (loading) return (
    <div className="screen">
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate(-1)}>‹</button>
        <h2 className="page-header__title">Peer Training</h2>
      </div>
      <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 'var(--radius-md)' }} />)}
      </div>
    </div>
  );

  return (
    <div className="screen">
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <h2 className="page-header__title">Peer Training</h2>
        <button
          onClick={() => navigate('/training/permissions')}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', padding: '4px 0', whiteSpace: 'nowrap' }}
        >
          My Permissions
        </button>
      </div>

      {error && <div className="error-msg" style={{ margin: 'var(--space-md)' }}>{error}</div>}

      <div style={{ padding: '0 var(--space-md) var(--space-xl)' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 'var(--space-lg)' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <ProgressRing earned={earnedBaseline} total={baseline.length} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 18, lineHeight: 1 }}>{earnedBaseline}</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>/{baseline.length}</span>
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Foundation Skills</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4 }}>
              {earnedBaseline === baseline.length && baseline.length > 0
                ? 'All foundation complete — you can now specialize!'
                : `${baseline.length - earnedBaseline} skill${baseline.length - earnedBaseline !== 1 ? 's' : ''} remaining before specialty access`}
            </div>
            {earnedSpecialty > 0 && (
              <div style={{ fontSize: '0.78rem', color: '#C8943A', marginTop: 4, fontWeight: 500 }}>
                +{earnedSpecialty} specialty {earnedSpecialty !== 1 ? 'skills' : 'skill'} earned
              </div>
            )}
          </div>
        </div>

        <h3 style={{ marginBottom: 12 }}>Foundation Skills</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 'var(--space-lg)' }}>
          {baseline.map(s => <SkillBadge key={s.slug} skill={s} navigate={navigate} />)}
        </div>

        <h3 style={{ marginBottom: 8 }}>Specialty Skills</h3>
        {earnedBaseline < baseline.length && baseline.length > 0 && (
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 10, lineHeight: 1.4 }}>
            Complete all foundation skills to unlock specializations.
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {specialty.map(s => <SkillBadge key={s.slug} skill={s} navigate={navigate} />)}
        </div>
      </div>
    </div>
  );
}
