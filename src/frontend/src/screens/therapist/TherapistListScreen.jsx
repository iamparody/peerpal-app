import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import client from '../../api/client';

const AVAILABILITY_COLORS = {
  available:   { bg: 'var(--color-calm-bg)',    text: 'var(--color-calm)',    label: 'Available' },
  limited:     { bg: 'var(--color-warning-bg)', text: 'var(--color-warning)', label: 'Limited availability' },
  unavailable: { bg: 'var(--color-danger-bg)',  text: 'var(--color-danger)',  label: 'Not available' },
};

export default function TherapistListScreen() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const intake    = location.state || {};

  const [therapists,   setTherapists]   = useState([]);
  const [selected,     setSelected]     = useState([]);
  const [profile,      setProfile]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [intro,        setIntro]        = useState(true);   // brief intro moment before list
  const [cardsVisible, setCardsVisible] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState('');
  const introTimer = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const params = {};
        if (intake.language && intake.language !== 'Other') {
          params.language = intake.language;
        }
        const qs = Object.keys(params).length
          ? '?' + new URLSearchParams(params).toString()
          : '';
        const { data } = await client.get(`/api/therapists${qs}`);
        setTherapists(data.therapists || []);
      } catch { /* show empty state */ }
      finally { setLoading(false); }
    }
    load();

    // Brief intro moment — 1.8s, then reveal cards
    introTimer.current = setTimeout(() => {
      setIntro(false);
      setTimeout(() => setCardsVisible(true), 200);
    }, 1800);
    return () => clearTimeout(introTimer.current);
  }, [intake.language]);

  function toggleSelect(id) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function handleConfirm() {
    if (selected.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      await client.post(`/api/referrals/${intake.referralId}/interests`, {
        therapist_ids: selected,
      });
      navigate('/therapists/confirm', {
        state: {
          referralId:  intake.referralId,
          selected:    therapists.filter((t) => selected.includes(t.id)),
          struggles:   intake.struggles,
          supportStyle: intake.supportStyle,
        },
        replace: true,
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  // Compute fit highlights for a therapist based on intake answers
  function getFitHighlights(therapist) {
    const highlights = [];
    if (intake.language && intake.language !== 'Other') {
      const speaks = therapist.languages?.some(
        (l) => l.toLowerCase().includes(intake.language.toLowerCase())
      );
      if (speaks) highlights.push(`Speaks ${intake.language}`);
    }
    if (intake.preferredTime) {
      const hasTime = therapist.session_formats?.length > 0;
      if (hasTime) highlights.push(`${capitalize(intake.preferredTime)} sessions`);
    }
    if (intake.sessionFormat && intake.sessionFormat !== 'flexible') {
      const hasFormat = therapist.session_formats?.some(
        (f) => f.toLowerCase().includes(intake.sessionFormat.toLowerCase().replace('_', ' '))
      );
      if (hasFormat) highlights.push(formatLabel(intake.sessionFormat));
    }
    return highlights.slice(0, 3);
  }

  // ── Intro moment (gentle, held) ──────────────────────────────────────────────
  if (intro || loading) {
    return (
      <div style={s.introScreen}>
        <div style={{ ...s.introContent, opacity: loading ? 0 : 1 }}>
          <p style={s.introEyebrow}>Thank you for sharing that</p>
          <h1 style={s.introHeading}>Here are some people{'\n'}who may be right for you</h1>
          <p style={s.introSub}>Take your time. There's no rush.</p>
          <div style={s.introDots}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ ...s.introDot, animationDelay: `${i * 0.3}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.screen}>
      {/* Top bar */}
      <div style={s.topBar}>
        <button style={s.backBtn} onClick={() => navigate(-1)}>←</button>
        <span style={s.topTitle}>Find the right fit</span>
        {selected.length > 0 && (
          <span style={s.selCount}>{selected.length} / 3</span>
        )}
      </div>

      <div style={s.scrollArea}>
        <p style={s.instruction}>
          Tap "I'd feel comfortable with this person" on up to 3 profiles.
          There's no wrong choice — we'll do the rest.
        </p>

        {therapists.length === 0 ? (
          <div style={s.empty}>
            <p style={s.emptyIcon}>🌿</p>
            <p style={s.emptyTitle}>We're building our network</p>
            <p style={s.emptyBody}>No therapist profiles are available yet. Your referral has been received and an admin will reach out within 24 hours.</p>
            <button style={s.skipBtn} onClick={() => navigate('/therapists/confirm', {
              state: { referralId: intake.referralId, selected: [], struggles: intake.struggles }
            })}>
              Continue without selecting
            </button>
          </div>
        ) : (
          therapists.map((t, i) => (
            <TherapistCard
              key={t.id}
              therapist={t}
              isSelected={selected.includes(t.id)}
              isDisabled={!selected.includes(t.id) && selected.length >= 3}
              fitHighlights={getFitHighlights(t)}
              staggerIndex={i}
              visible={cardsVisible}
              onSelect={() => toggleSelect(t.id)}
              onViewProfile={() => setProfile(t)}
            />
          ))
        )}

        <div style={{ height: selected.length > 0 ? 120 : 40 }} />
      </div>

      {/* Sticky CTA */}
      {selected.length > 0 && (
        <div style={s.stickyBar}>
          {error && <p style={s.error}>{error}</p>}
          <button style={s.confirmBtn} onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Saving…' : `Continue with ${selected.length} ${selected.length === 1 ? 'person' : 'people'}`}
          </button>
        </div>
      )}

      {/* Profile bottom sheet */}
      {profile && (
        <ProfileSheet
          therapist={profile}
          isSelected={selected.includes(profile.id)}
          isDisabled={!selected.includes(profile.id) && selected.length >= 3}
          fitHighlights={getFitHighlights(profile)}
          onSelect={() => { toggleSelect(profile.id); }}
          onClose={() => setProfile(null)}
        />
      )}
    </div>
  );
}

function TherapistCard({ therapist, isSelected, isDisabled, fitHighlights, staggerIndex, visible, onSelect, onViewProfile }) {
  const avail = AVAILABILITY_COLORS[therapist.availability_status] || AVAILABILITY_COLORS.available;

  // Selected cards use a light calm-bg overlay (near-transparent green on cream page) → dark text.
  // Unselected cards use --color-surface-card (#5C4035 dark brown) → light text.
  const textMain = isSelected ? 'var(--color-text-primary)' : '#F5EDE4';
  const textSub  = isSelected ? 'var(--color-text-secondary)' : 'rgba(245,237,228,0.65)';
  const chipColor = isSelected ? 'var(--color-text-secondary)' : 'rgba(245,237,228,0.75)';
  const chipBg    = isSelected ? 'rgba(47,38,34,0.08)' : 'rgba(245,237,228,0.1)';

  return (
    <div
      style={{
        ...s.card,
        transform: visible ? 'none' : 'translateY(14px)',
        transition: `opacity 450ms var(--easing-out) ${staggerIndex * 90}ms,
                     transform 450ms var(--easing-out) ${staggerIndex * 90}ms,
                     border-color 250ms ease`,
        borderColor: isSelected ? 'var(--color-calm)' : 'var(--color-border)',
        background: isSelected ? 'var(--color-calm-bg)' : 'var(--color-surface-card)',
        opacity: visible ? (isDisabled ? 0.45 : 1) : 0,
      }}
    >
      {/* Header row */}
      <div style={s.cardHeader}>
        <div style={s.avatar}>
          {therapist.photo_url
            ? <img src={therapist.photo_url} alt={therapist.display_name} style={s.avatarImg} />
            : <span style={{ ...s.avatarInitial, color: textMain }}>{therapist.display_name.charAt(0)}</span>
          }
        </div>
        <div style={s.cardMeta}>
          <p style={{ ...s.displayName, color: textMain }}>{therapist.display_name}</p>
          <p style={{ ...s.credentials, color: textSub }}>{therapist.credentials}</p>
          <span style={{ ...s.availBadge, background: avail.bg, color: avail.text }}>
            {avail.label}
          </span>
        </div>
      </div>

      {/* Plain language intro */}
      {therapist.plain_language_intro && (
        <p style={{ ...s.intro, color: isSelected ? 'var(--color-text-primary)' : 'rgba(245,237,228,0.85)' }}>
          {therapist.plain_language_intro.slice(0, 140)}…
        </p>
      )}

      {/* Fit highlights */}
      {fitHighlights.length > 0 && (
        <div style={s.fitRow}>
          {fitHighlights.map((h) => (
            <span key={h} style={s.fitChip}>✓ {h}</span>
          ))}
        </div>
      )}

      {/* Cultural competencies */}
      {therapist.cultural_competencies?.length > 0 && (
        <div style={s.compRow}>
          {therapist.cultural_competencies.slice(0, 3).map((c) => (
            <span key={c} style={{ ...s.compChip, color: chipColor, background: chipBg }}>{c}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={s.cardActions}>
        <button style={{
          ...s.viewBtn,
          border: isSelected ? '1.5px solid var(--color-border)' : '1.5px solid rgba(245,237,228,0.25)',
          color: isSelected ? 'var(--color-text-secondary)' : 'rgba(245,237,228,0.7)',
        }} onClick={onViewProfile}>Full profile</button>
        <button
          style={{
            ...s.selectBtn,
            ...(isSelected ? s.selectBtnActive : {}),
          }}
          onClick={onSelect}
          disabled={isDisabled && !isSelected}
        >
          {isSelected ? '✓ Selected' : "I'd feel comfortable"}
        </button>
      </div>
    </div>
  );
}

function ProfileSheet({ therapist, isSelected, isDisabled, fitHighlights, onSelect, onClose }) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const avail = AVAILABILITY_COLORS[therapist.availability_status] || AVAILABILITY_COLORS.available;

  useEffect(() => {
    setTimeout(() => setSheetVisible(true), 30);
    return () => setSheetVisible(false);
  }, []);

  function handleClose() {
    setSheetVisible(false);
    setTimeout(onClose, 320);
  }

  return (
    <>
      <div
        style={{ ...s.overlay, opacity: sheetVisible ? 1 : 0, transition: 'opacity 350ms ease' }}
        onClick={handleClose}
      />
      <div style={{
        ...s.sheet,
        transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 350ms var(--easing-out)',
      }}>
        <div style={s.sheetHandle} />

        <div style={s.sheetScroll}>
          {/* Photo + name */}
          <div style={s.profileHeader}>
            <div style={s.profileAvatar}>
              {therapist.photo_url
                ? <img src={therapist.photo_url} alt={therapist.display_name} style={s.profileAvatarImg} />
                : <span style={s.profileInitial}>{therapist.display_name.charAt(0)}</span>
              }
            </div>
            <h2 style={s.profileName}>{therapist.display_name}</h2>
            <p style={s.profileCreds}>{therapist.credentials} · {therapist.years_experience} years</p>
            <span style={{ ...s.availBadge, background: avail.bg, color: avail.text, marginTop: 6 }}>
              {avail.label}
            </span>
          </div>

          {/* In their own words */}
          {therapist.plain_language_intro && (
            <div style={s.section}>
              <p style={s.sectionLabel}>In their own words</p>
              <p style={s.introLong}>{therapist.plain_language_intro}</p>
            </div>
          )}

          {/* What they're good at */}
          {therapist.approach_plain && (
            <div style={s.section}>
              <p style={s.sectionLabel}>Their approach</p>
              <p style={s.bodyText}>{therapist.approach_plain}</p>
            </div>
          )}

          {/* Fit highlights */}
          {fitHighlights.length > 0 && (
            <div style={s.section}>
              <p style={s.sectionLabel}>Matches your preferences</p>
              <div style={s.fitRow}>
                {fitHighlights.map((h) => (
                  <span key={h} style={s.fitChip}>✓ {h}</span>
                ))}
              </div>
            </div>
          )}

          {/* Cultural competencies */}
          {therapist.cultural_competencies?.length > 0 && (
            <div style={s.section}>
              <p style={s.sectionLabel}>Cultural competencies</p>
              <div style={s.compRow}>
                {therapist.cultural_competencies.map((c) => (
                  <span key={c} style={s.compChip}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Specializations */}
          {therapist.specializations?.length > 0 && (
            <div style={s.section}>
              <p style={s.sectionLabel}>Specializes in</p>
              <div style={s.compRow}>
                {therapist.specializations.map((sp) => (
                  <span key={sp} style={s.compChip}>{sp.replace(/_/g, ' ')}</span>
                ))}
              </div>
            </div>
          )}

          {/* Languages + formats */}
          <div style={{ ...s.section, display: 'flex', gap: 24 }}>
            {therapist.languages?.length > 0 && (
              <div style={{ flex: 1 }}>
                <p style={s.sectionLabel}>Languages</p>
                <p style={s.bodyText}>{therapist.languages.join(', ')}</p>
              </div>
            )}
            {therapist.session_formats?.length > 0 && (
              <div style={{ flex: 1 }}>
                <p style={s.sectionLabel}>Session formats</p>
                <p style={s.bodyText}>{therapist.session_formats.map(formatLabel).join(', ')}</p>
              </div>
            )}
          </div>

          {therapist.location && (
            <div style={s.section}>
              <p style={s.sectionLabel}>Location</p>
              <p style={s.bodyText}>{therapist.location}</p>
            </div>
          )}

          <div style={{ height: 100 }} />
        </div>

        {/* Fixed CTA */}
        <div style={s.sheetFooter}>
          <button
            style={{
              ...s.selectBtn,
              width: '100%',
              height: 52,
              fontSize: 16,
              ...(isSelected ? s.selectBtnActive : {}),
            }}
            onClick={onSelect}
            disabled={isDisabled && !isSelected}
          >
            {isSelected ? '✓ I\'ve selected this person' : "I'd feel comfortable with this person"}
          </button>
        </div>
      </div>
    </>
  );
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function formatLabel(f) {
  return { in_app: 'Text (in-app)', voice: 'Voice call', in_person: 'In-person', flexible: 'Any format' }[f] || f;
}

const s = {
  introScreen: {
    minHeight: '100vh',
    background: 'var(--color-bg-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  introContent: {
    textAlign: 'center',
    transition: 'opacity 600ms ease',
    animation: 'fadeInUp 600ms ease forwards',
  },
  introEyebrow: {
    fontSize: 13,
    color: 'var(--color-text-muted)',
    marginBottom: 16,
    letterSpacing: '0.04em',
  },
  introHeading: {
    fontSize: 26,
    fontWeight: 600,
    lineHeight: 1.35,
    color: 'var(--color-text-primary)',
    marginBottom: 12,
    whiteSpace: 'pre-line',
  },
  introSub: {
    fontSize: 15,
    color: 'var(--color-text-secondary)',
    marginBottom: 32,
  },
  introDots: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
  },
  introDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--color-accent)',
    display: 'inline-block',
    animation: 'introPulse 1.2s ease-in-out infinite',
  },
  screen: {
    minHeight: '100vh',
    background: 'var(--color-bg-primary)',
    display: 'flex',
    flexDirection: 'column',
  },
  topBar: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    background: 'var(--color-bg-primary)',
    borderBottom: '1px solid var(--color-border)',
    height: 56,
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 12,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: 22,
    cursor: 'pointer',
    padding: '8px 4px',
    lineHeight: 1,
  },
  topTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  selCount: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-accent)',
    background: 'rgba(194,164,138,0.15)',
    borderRadius: 'var(--radius-pill)',
    padding: '3px 10px',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 16px',
  },
  instruction: {
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--color-text-muted)',
    marginBottom: 20,
    textAlign: 'center',
  },
  card: {
    borderRadius: 'var(--radius-lg)',
    border: '1.5px solid var(--color-border)',
    padding: 18,
    marginBottom: 14,
    boxShadow: 'var(--shadow-card)',
    transition: 'border-color 250ms ease, background 250ms ease',
  },
  cardHeader: {
    display: 'flex',
    gap: 14,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'var(--color-surface-secondary)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '2px solid var(--color-border)',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarInitial: {
    fontSize: 22,
    fontWeight: 600,
    color: 'var(--color-text-dark)',
    fontFamily: 'Lora, Georgia, serif',
  },
  cardMeta: { flex: 1 },
  displayName: {
    fontSize: 17,
    fontWeight: 600,
    color: '#F5EDE4',
    marginBottom: 3,
  },
  credentials: {
    fontSize: 12,
    color: 'rgba(245,237,228,0.65)',
    marginBottom: 6,
  },
  availBadge: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 'var(--radius-pill)',
    padding: '3px 10px',
  },
  intro: {
    fontSize: 14,
    lineHeight: 1.65,
    color: 'rgba(245,237,228,0.85)',
    fontFamily: 'Lora, Georgia, serif',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  fitRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  fitChip: {
    fontSize: 11,
    fontWeight: 500,
    background: 'var(--color-calm-bg)',
    color: 'var(--color-calm)',
    borderRadius: 'var(--radius-pill)',
    padding: '4px 10px',
  },
  compRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  compChip: {
    fontSize: 11,
    background: 'rgba(245,237,228,0.1)',
    color: 'rgba(245,237,228,0.75)',
    borderRadius: 'var(--radius-pill)',
    padding: '4px 10px',
  },
  cardActions: {
    display: 'flex',
    gap: 8,
    marginTop: 14,
  },
  viewBtn: {
    flex: 0,
    height: 40,
    padding: '0 16px',
    background: 'none',
    border: '1.5px solid rgba(245,237,228,0.25)',
    borderRadius: 'var(--radius-pill)',
    fontSize: 13,
    color: 'rgba(245,237,228,0.7)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  selectBtn: {
    flex: 1,
    height: 40,
    background: 'transparent',
    border: '1.5px solid var(--color-accent)',
    borderRadius: 'var(--radius-pill)',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-accent)',
    cursor: 'pointer',
    transition: 'background 250ms ease, color 250ms ease',
    whiteSpace: 'nowrap',
    padding: '0 12px',
  },
  selectBtnActive: {
    background: 'var(--color-calm)',
    borderColor: 'var(--color-calm)',
    color: '#fff',
  },
  stickyBar: {
    position: 'fixed',
    bottom: 0, left: 0, right: 0,
    padding: '12px 16px',
    background: 'var(--color-bg-deep)',
    borderTop: '1px solid var(--color-border)',
    maxWidth: 430,
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  confirmBtn: {
    width: '100%',
    height: 52,
    background: 'var(--color-accent)',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--color-text-dark)',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-button)',
  },
  error: {
    fontSize: 13,
    color: 'var(--color-danger)',
    textAlign: 'center',
    marginBottom: 8,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--color-overlay)',
    zIndex: 200,
  },
  sheet: {
    position: 'fixed',
    bottom: 0, left: 0, right: 0,
    maxWidth: 430,
    margin: '0 auto',
    background: 'var(--color-bg-deep)',
    borderRadius: '24px 24px 0 0',
    maxHeight: '90vh',
    zIndex: 201,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-modal)',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    background: 'rgba(245,237,228,0.25)',
    borderRadius: 2,
    margin: '12px auto 0',
    flexShrink: 0,
  },
  sheetScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 20px 0',
  },
  profileHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: 24,
  },
  profileAvatar: {
    width: 96,
    height: 96,
    borderRadius: '50%',
    background: 'rgba(245,237,228,0.12)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    border: '3px solid rgba(245,237,228,0.2)',
  },
  profileAvatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  profileInitial: {
    fontSize: 38,
    fontWeight: 600,
    color: '#F5EDE4',
    fontFamily: 'Lora, Georgia, serif',
  },
  profileName: {
    fontSize: 22,
    fontWeight: 600,
    color: '#F5EDE4',
    marginBottom: 4,
  },
  profileCreds: {
    fontSize: 13,
    color: 'rgba(245,237,228,0.65)',
  },
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'rgba(245,237,228,0.5)',
    marginBottom: 8,
  },
  introLong: {
    fontSize: 15,
    lineHeight: 1.7,
    color: 'rgba(245,237,228,0.9)',
    fontFamily: 'Lora, Georgia, serif',
    fontStyle: 'italic',
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 1.65,
    color: 'rgba(245,237,228,0.85)',
  },
  sheetFooter: {
    padding: '12px 20px',
    borderTop: '1px solid rgba(245,237,228,0.12)',
    flexShrink: 0,
  },
  empty: {
    textAlign: 'center',
    padding: '60px 24px',
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 },
  emptyBody: { fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-muted)', marginBottom: 24 },
  skipBtn: {
    background: 'none',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    padding: '10px 24px',
    fontSize: 14,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
};
