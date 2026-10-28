import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Siren, UserCirclePlus, CheckCircle, Link, X, Bell, BellSlash } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import PageHeader from '../components/PageHeader';

const DEFAULT_PLAN = {
  warning_signs: '',
  helpful_things: '',
  things_to_avoid: '',
  contacts: [
    { name: '', contact_detail: '' },
    { name: '', contact_detail: '' },
    { name: '', contact_detail: '' },
  ],
  reason_to_continue: '',
};

function SafetyPlanSkeleton() {
  return (
    <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton" style={{ width: '100%', height: 96, borderRadius: 'var(--radius-lg)' }} />
      ))}
    </div>
  );
}

// ── Trusted contact slot ──────────────────────────────────────────────────────
function TrustedContactSlot({ tc, slotIndex, onRevoke, onToggle }) {
  const isLinked  = tc?.status === 'accepted';
  const isPending = tc?.status === 'pending';

  const [inviteUrl, setInviteUrl]         = useState('');
  const [showLink, setShowLink]           = useState(false);
  const [copied, setCopied]               = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  async function generateInvite() {
    setInviteLoading(true);
    try {
      const { data } = await client.post('/api/safety-plan/trusted-contacts/invite');
      setInviteUrl(data.invite_url);
      setShowLink(true);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not generate invite link.');
    } finally {
      setInviteLoading(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (isLinked) {
    return (
      <div style={{ border: '1px solid rgba(194,164,138,0.3)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={16} weight="fill" color="var(--color-success, #27ae60)" />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{tc.contact_alias}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-muted)', background: 'rgba(39,174,96,0.12)', padding: '2px 8px', borderRadius: 20 }}>Connected</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            {tc.mood_alerts
              ? <Bell size={14} weight="fill" color="var(--color-primary)" />
              : <BellSlash size={14} color="var(--color-text-muted)" />}
            <span>Mood alerts</span>
            <input type="checkbox" checked={!!tc.mood_alerts} onChange={e => onToggle(tc.id, { mood_alerts: e.target.checked })} style={{ marginLeft: 'auto' }} />
          </label>

          {tc.mood_alerts && (
            <div style={{ paddingLeft: 22, display: 'flex', gap: 8 }}>
              {[
                { value: 1, label: 'Very low only' },
                { value: 2, label: 'Low or very low' },
              ].map(opt => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={`threshold-${tc.id}`}
                    checked={tc.mood_threshold === opt.value}
                    onChange={() => onToggle(tc.id, { mood_threshold: opt.value })}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            {tc.no_peer_alerts
              ? <Bell size={14} weight="fill" color="var(--color-primary)" />
              : <BellSlash size={14} color="var(--color-text-muted)" />}
            <span>Alert when I could not find a peer</span>
            <input type="checkbox" checked={!!tc.no_peer_alerts} onChange={e => onToggle(tc.id, { no_peer_alerts: e.target.checked })} style={{ marginLeft: 'auto' }} />
          </label>
        </div>

        <button
          className="btn btn--ghost"
          onClick={() => onRevoke(tc.id)}
          style={{ fontSize: 12, color: 'var(--color-danger, #e74c3c)', borderColor: 'rgba(231,76,60,0.3)', padding: '6px 12px', alignSelf: 'flex-start' }}
        >
          Remove
        </button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div style={{ border: '1px dashed rgba(194,164,138,0.4)', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <UserCirclePlus size={14} />
        <span>Waiting for them to accept</span>
        <button onClick={() => onRevoke(tc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', padding: 0 }}>
          <X size={14} color="var(--color-text-muted)" />
        </button>
      </div>
    );
  }

  // Unlinked slot
  return (
    <div style={{ border: '1px dashed rgba(194,164,138,0.25)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Contact {slotIndex + 1} — invite via link</span>

      {!showLink ? (
        <button className="btn btn--ghost" onClick={generateInvite} disabled={inviteLoading} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link size={14} /> {inviteLoading ? 'Generating...' : 'Generate invite link'}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, background: 'rgba(194,164,138,0.1)', borderRadius: 8, padding: '8px 10px', wordBreak: 'break-all', color: 'var(--color-text-muted)' }}>
            {inviteUrl}
          </div>
          <button className="btn btn--primary" onClick={copyLink} style={{ fontSize: 13 }}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button onClick={() => setShowLink(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-muted)' }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SafetyPlanScreen() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const [plan, setPlan]     = useState(DEFAULT_PLAN);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [saved, setSaved]   = useState(false);

  const { data: planData, isLoading: loading } = useQuery({
    queryKey: ['safety-plan'],
    queryFn: () => client.get('/api/safety-plan').then(r => r.data),
    retry: 1,
  });

  const { data: tcData, refetch: refetchTc } = useQuery({
    queryKey: ['trusted-contacts'],
    queryFn: () => client.get('/api/safety-plan/trusted-contacts').then(r => r.data),
  });

  const { data: incomingData, refetch: refetchIncoming } = useQuery({
    queryKey: ['trusted-contacts-incoming'],
    queryFn: () => client.get('/api/safety-plan/trusted-contacts/incoming').then(r => r.data),
  });

  useEffect(() => {
    if (planData?.plan) {
      const p = planData.plan;
      setPlan({
        ...DEFAULT_PLAN,
        warning_signs:    p.warning_signs    || '',
        helpful_things:   p.helpful_things   || '',
        things_to_avoid:  p.things_to_avoid  || '',
        reason_to_continue: p.reason_to_continue || '',
        contacts: p.contacts?.length
          ? [...p.contacts, ...Array(Math.max(0, 3 - p.contacts.length)).fill({ name: '', contact_detail: '' })]
          : DEFAULT_PLAN.contacts,
      });
    }
  }, [planData]);

  function updateField(field, value) { setPlan(p => ({ ...p, [field]: value })); }
  function updateContact(index, field, value) {
    setPlan(p => {
      const contacts = [...p.contacts];
      contacts[index] = { ...contacts[index], [field]: value };
      return { ...p, contacts };
    });
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      const payload = {
        warning_signs:      plan.warning_signs,
        helpful_things:     plan.helpful_things,
        things_to_avoid:    plan.things_to_avoid,
        reason_to_continue: plan.reason_to_continue,
        contacts:           plan.contacts.filter(c => c.name.trim()),
      };
      await client.put('/api/safety-plan', payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id) {
    await client.delete(`/api/safety-plan/trusted-contacts/${id}`);
    refetchTc();
  }

  async function handleToggle(id, patch) {
    await client.patch(`/api/safety-plan/trusted-contacts/${id}`, patch);
    refetchTc();
  }

  async function handleAcceptIncoming(requestId) {
    await client.post('/api/safety-plan/trusted-contacts/accept', { request_id: requestId });
    refetchIncoming();
    refetchTc();
  }

  async function handleDeclineIncoming(requestId) {
    await client.post('/api/safety-plan/trusted-contacts/decline', { request_id: requestId });
    refetchIncoming();
  }

  const trustedContacts = tcData?.trusted_contacts || [];
  const incoming        = incomingData?.incoming || [];
  const slots = [
    ...trustedContacts,
    ...Array(Math.max(0, 3 - trustedContacts.length)).fill(null),
  ].slice(0, 3);

  if (loading) {
    return (
      <div className="screen">
        <PageHeader title="My Safety Plan" />
        <SafetyPlanSkeleton />
      </div>
    );
  }

  return (
    <div className="screen">
      <PageHeader title="My Safety Plan" />

      <div style={{ padding: 'var(--space-sm) var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        <div className="info-banner">
          Write this during a calm moment. It is here for you when things get hard. All fields are optional and completely private.
        </div>

        {error && <div className="error-msg">{error}</div>}

        {[
          { field: 'warning_signs',   label: '1. Warning signs I notice in myself',    placeholder: 'e.g. withdrawing from people, difficulty sleeping' },
          { field: 'helpful_things',  label: '2. Things that have helped me before',    placeholder: 'e.g. calling a friend, going for a walk' },
          { field: 'things_to_avoid', label: '3. Things that make it worse, to avoid', placeholder: 'e.g. isolating, social media at night' },
        ].map(({ field, label, placeholder }) => (
          <div key={field}>
            <label className="label">{label}</label>
            <textarea
              className="textarea textarea--journal"
              rows={3}
              value={plan[field]}
              onChange={e => updateField(field, e.target.value)}
              placeholder={placeholder}
            />
          </div>
        ))}

        {/* ── Trusted contacts ─────────────────────────────────────────── */}
        <div>
          <label className="label" style={{ marginBottom: 8 }}>4. People I can contact (up to 3)</label>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Link app users to receive alerts when you are struggling, or add a name and number for contacts who are not on the app.
          </p>

          {incoming.length > 0 && (
            <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {incoming.map(req => (
                <div key={req.id} style={{ background: 'rgba(194,164,138,0.12)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <UserCirclePlus size={16} weight="fill" color="var(--color-primary)" />
                  <span style={{ fontSize: 13, flex: 1 }}><strong>{req.requester_alias}</strong> wants to be your trusted contact</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn--primary" onClick={() => handleAcceptIncoming(req.id)} style={{ fontSize: 12, padding: '6px 14px' }}>Accept</button>
                    <button className="btn btn--ghost"   onClick={() => handleDeclineIncoming(req.id)} style={{ fontSize: 12, padding: '6px 14px' }}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {slots.map((tc, i) => (
              <TrustedContactSlot
                key={tc?.id || `empty-${i}`}
                tc={tc}
                slotIndex={i}
                onRevoke={handleRevoke}
                onToggle={handleToggle}
              />
            ))}
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Name and number for contacts not on the app</span>
            {plan.contacts.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <input
                  type="text"
                  className="input"
                  value={c.name}
                  onChange={e => updateContact(i, 'name', e.target.value)}
                  placeholder={`Person ${i + 1} name`}
                />
                <input
                  type="text"
                  className="input"
                  value={c.contact_detail}
                  onChange={e => updateContact(i, 'contact_detail', e.target.value)}
                  placeholder="Phone or email"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="label">5. One thing that gives me a reason to keep going</label>
          <textarea
            className="textarea textarea--journal"
            rows={2}
            value={plan.reason_to_continue}
            onChange={e => updateField('reason_to_continue', e.target.value)}
            placeholder="What matters most to you?"
          />
        </div>

        <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Safety Plan'}
        </button>

        <button
          className="btn btn--danger"
          onClick={() => navigate('/emergency')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)' }}
        >
          <Siren size={20} weight="duotone" aria-hidden="true" />
          Emergency, I need help now
        </button>
      </div>
    </div>
  );
}
