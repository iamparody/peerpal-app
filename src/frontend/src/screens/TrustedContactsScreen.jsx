import { useState } from 'react';
import { CheckCircle, UserCirclePlus, ArrowLeft } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import PageHeader from '../components/PageHeader';

export default function TrustedContactsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const { data: tcData, isLoading: loadingTc } = useQuery({
    queryKey: ['trusted-contacts'],
    queryFn: () => client.get('/api/safety-plan/trusted-contacts').then(r => r.data),
  });

  const { data: joinedData, isLoading: loadingJoined } = useQuery({
    queryKey: ['trusted-contacts-joined'],
    queryFn: () => client.get('/api/safety-plan/trusted-contacts/joined').then(r => r.data),
  });

  const myContacts = (tcData?.trusted_contacts || []).filter(tc => tc.status === 'accepted');
  const joined     = joinedData?.joined || [];

  async function handleRemove(id) {
    setError('');
    try {
      await client.delete(`/api/safety-plan/trusted-contacts/${id}`);
      queryClient.invalidateQueries({ queryKey: ['trusted-contacts'] });
    } catch {
      setError('Could not remove contact. Please try again.');
    }
  }

  async function handleLeave(id) {
    setError('');
    try {
      await client.delete(`/api/safety-plan/trusted-contacts/${id}/leave`);
      queryClient.invalidateQueries({ queryKey: ['trusted-contacts-joined'] });
    } catch {
      setError('Could not leave plan. Please try again.');
    }
  }

  const loading = loadingTc || loadingJoined;

  return (
    <div className="screen">
      <PageHeader
        title="Trusted Contacts"
        left={
          <button
            onClick={() => navigate('/safety-plan')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center' }}
            aria-label="Back to safety plan"
          >
            <ArrowLeft size={22} color="var(--color-text)" />
          </button>
        }
      />

      <div style={{ padding: 'var(--space-sm) var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {error && <div className="error-msg">{error}</div>}

        {/* ── People in MY safety plan ─────────────────────────────────── */}
        <div>
          <label className="label" style={{ marginBottom: 4 }}>In my safety plan</label>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            People you invited who accepted — they can receive alerts when you are struggling.
          </p>

          {loading && <div className="skeleton" style={{ height: 56, borderRadius: 12 }} />}

          {!loading && myContacts.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '12px 0' }}>
              No one in your safety plan yet. Generate an invite link from the safety plan screen.
            </div>
          )}

          {!loading && myContacts.map(tc => (
            <div key={tc.id} style={{
              border: '1px solid rgba(194,164,138,0.3)', borderRadius: 12,
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 8,
            }}>
              <CheckCircle size={18} weight="fill" color="var(--color-success, #27ae60)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{tc.contact_alias}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  Accepted {tc.accepted_at ? new Date(tc.accepted_at).toLocaleDateString() : ''}
                </div>
              </div>
              <button
                className="btn btn--ghost"
                onClick={() => handleRemove(tc.id)}
                style={{ fontSize: 12, color: 'var(--color-danger, #e74c3c)', borderColor: 'rgba(231,76,60,0.3)', padding: '4px 12px' }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {/* ── Safety plans I am part of ────────────────────────────────── */}
        <div>
          <label className="label" style={{ marginBottom: 4 }}>Safety plans I am part of</label>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            People whose safety plans you accepted to join — you may receive alerts if they are struggling.
          </p>

          {loading && <div className="skeleton" style={{ height: 56, borderRadius: 12 }} />}

          {!loading && joined.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '12px 0' }}>
              You have not been added to anyone's safety plan yet.
            </div>
          )}

          {!loading && joined.map(j => (
            <div key={j.id} style={{
              border: '1px solid rgba(194,164,138,0.3)', borderRadius: 12,
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 8,
            }}>
              <UserCirclePlus size={18} weight="duotone" color="var(--color-primary)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{j.user_alias}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  Joined {j.accepted_at ? new Date(j.accepted_at).toLocaleDateString() : ''}
                </div>
              </div>
              <button
                className="btn btn--ghost"
                onClick={() => handleLeave(j.id)}
                style={{ fontSize: 12, padding: '4px 12px' }}
              >
                Leave
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
