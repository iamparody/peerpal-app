import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { UsersThree, MegaphoneSimple, Question, ChartBar, Plus, Minus } from '@phosphor-icons/react';

const POST_TYPES = [
  { key: 'announcement', label: 'Announcement', Icon: MegaphoneSimple },
  { key: 'prompt',       label: 'Weekly Prompt', Icon: Question },
  { key: 'poll',         label: 'Poll',           Icon: ChartBar },
];

export default function GroupsTab() {
  const [groups,  setGroups]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [panel,   setPanel]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/groups');
      setGroups(data.groups ?? []);
    } catch {
      setError('Failed to load groups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Groups</h1>
          <p className="page-subtitle">Post content to community groups and moderate responses</p>
        </div>
        <div className="filter-row">
          <button className="refresh-btn" onClick={load} title="Refresh">↻</button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : groups.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><UsersThree size={32} weight="light" /></div>
              <p className="empty-text">No groups found</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Members</th>
                  <th>Status</th>
                  <th>Last Post</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td style={{ fontWeight: 500 }}>{g.name}</td>
                    <td style={{ color: 'var(--color-text-muted)' }}>
                      {g.condition_category?.replace(/_/g, ' ') ?? '—'}
                    </td>
                    <td>{g.member_count ?? 0}</td>
                    <td>
                      <span className={`badge badge--${g.is_active ? 'published' : 'archived'}`}>
                        {g.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td>
                      <span className="elapsed">
                        {g.last_post_at
                          ? new Date(g.last_post_at).toLocaleDateString()
                          : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => setPanel(g)}
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {panel && (
        <GroupPanel
          group={panel}
          onClose={() => setPanel(null)}
          onPosted={load}
        />
      )}
    </div>
  );
}

function GroupPanel({ group, onClose, onPosted }) {
  const [feed,        setFeed]        = useState(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError,   setFeedError]   = useState('');
  const [postType,    setPostType]    = useState('announcement');
  const [content,     setContent]     = useState('');
  const [question,    setQuestion]    = useState('');
  const [options,     setOptions]     = useState(['', '']);
  const [minVotes,    setMinVotes]    = useState(5);
  const [posting,     setPosting]     = useState(false);
  const [postError,   setPostError]   = useState('');
  const [postSuccess, setPostSuccess] = useState('');

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError('');
    try {
      const { data } = await client.get(`/api/admin/groups/${group.id}/feed`);
      setFeed(data);
    } catch {
      setFeedError('Failed to load group content.');
    } finally {
      setFeedLoading(false);
    }
  }, [group.id]);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  function resetCompose() {
    setContent('');
    setQuestion('');
    setOptions(['', '']);
    setMinVotes(5);
    setPostError('');
    setPostSuccess('');
  }

  async function handlePost() {
    setPostError('');
    setPostSuccess('');
    setPosting(true);
    try {
      if (postType === 'announcement') {
        if (!content.trim()) { setPostError('Content is required.'); setPosting(false); return; }
        await client.post(`/api/groups/${group.id}/announce`, { content: content.trim() });
        setPostSuccess('Announcement posted.');
      } else if (postType === 'prompt') {
        if (!content.trim()) { setPostError('Content is required.'); setPosting(false); return; }
        await client.post(`/api/groups/${group.id}/prompt`, { content: content.trim() });
        setPostSuccess('Prompt posted.');
      } else {
        if (!question.trim()) { setPostError('Question is required.'); setPosting(false); return; }
        const cleanOpts = options.map(o => o.trim()).filter(Boolean);
        if (cleanOpts.length < 2) { setPostError('At least 2 non-empty options are required.'); setPosting(false); return; }
        await client.post(`/api/groups/${group.id}/polls`, {
          question: question.trim(),
          options: cleanOpts,
          min_votes_to_show: minVotes,
        });
        setPostSuccess('Poll posted.');
      }
      resetCompose();
      loadFeed();
      onPosted();
    } catch (err) {
      setPostError(err.response?.data?.error || 'Failed to post.');
    } finally {
      setPosting(false);
    }
  }

  async function handleApprove(msgId) {
    try {
      await client.post(`/api/admin/groups/held/${msgId}/publish`);
      loadFeed();
    } catch (err) {
      setFeedError(err.response?.data?.error || 'Failed to approve.');
    }
  }

  async function handleDelete(msgId) {
    try {
      await client.delete(`/api/admin/groups/held/${msgId}`);
      loadFeed();
    } catch (err) {
      setFeedError(err.response?.data?.error || 'Failed to delete.');
    }
  }

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="slide-panel" style={{ width: 520 }}>
        <div className="slide-panel__header">
          <div>
            <span className="slide-panel__title">{group.name}</span>
            {group.condition_category && (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 8 }}>
                {group.condition_category.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>✕</button>
        </div>

        <div className="slide-panel__body">

          {/* ── Compose ──────────────────────────────────────────── */}
          <div className="form-group">
            <label className="form-label">Post type</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {POST_TYPES.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setPostType(key); resetCompose(); }}
                  className={`btn btn--sm ${postType === key ? 'btn--primary' : 'btn--ghost'}`}
                  style={{ flex: 1, gap: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {postType !== 'poll' ? (
            <div className="form-group">
              <label className="form-label">
                {postType === 'announcement' ? 'Announcement text' : 'Prompt question'}
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder={
                  postType === 'announcement'
                    ? 'Write something for your community…'
                    : 'This week, reflect on…'
                }
                maxLength={postType === 'announcement' ? 1000 : 500}
              />
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
                {content.length} / {postType === 'announcement' ? 1000 : 500}
              </div>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Poll question</label>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="How are you feeling this week?"
                  maxLength={300}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Options</label>
                {options.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...options];
                        next[i] = e.target.value;
                        setOptions(next);
                      }}
                      placeholder={`Option ${i + 1}`}
                      maxLength={100}
                      style={{ flex: 1 }}
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setOptions(options.filter((_, j) => j !== i))}
                        style={{ padding: '4px 8px', flexShrink: 0 }}
                      >
                        <Minus size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {options.length < 5 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setOptions([...options, ''])}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Plus size={12} /> Add option
                  </button>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Min votes before results show</label>
                <input
                  type="number"
                  value={minVotes}
                  onChange={(e) => setMinVotes(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  max={100}
                  style={{ width: 80 }}
                />
              </div>
            </>
          )}

          {postError   && <p className="error-text" style={{ marginTop: 0 }}>{postError}</p>}
          {postSuccess && (
            <p style={{ fontSize: 13, color: 'var(--color-success)', marginTop: 0 }}>{postSuccess}</p>
          )}

          <button
            className="btn btn--primary"
            onClick={handlePost}
            disabled={posting}
            style={{ width: '100%', marginBottom: 4 }}
          >
            {posting ? 'Posting…' : `Post ${POST_TYPES.find(t => t.key === postType)?.label}`}
          </button>

          {/* ── Divider ──────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--color-border)', margin: '20px 0 16px' }} />

          {/* ── Live state ───────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Current content</div>
            {feedLoading ? (
              <div className="loading" style={{ padding: '12px 0' }}>Loading…</div>
            ) : feedError ? (
              <p className="error-text">{feedError}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <LiveItem
                  label="Announcement"
                  value={feed?.announcement?.content}
                  date={feed?.announcement?.created_at}
                  empty="No announcement posted"
                />
                <LiveItem
                  label="Active Prompt"
                  value={feed?.prompt?.content}
                  date={feed?.prompt?.created_at}
                  meta={feed?.prompt ? `${feed.prompt.response_count} response${feed.prompt.response_count !== 1 ? 's' : ''}` : null}
                  empty="No active prompt"
                />
                <LiveItem
                  label="Active Poll"
                  value={feed?.poll?.question}
                  date={null}
                  meta={feed?.poll ? `${feed.poll.total_votes} vote${feed.poll.total_votes !== 1 ? 's' : ''}` : null}
                  empty="No active poll"
                />
              </div>
            )}
          </div>

          {/* ── Held responses ───────────────────────────────────── */}
          {!feedLoading && (
            <>
              <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0 16px' }} />
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                Held responses
                {feed?.held?.length > 0 && (
                  <span style={{
                    marginLeft: 8, background: 'var(--color-danger)', color: '#fff',
                    borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                  }}>
                    {feed.held.length}
                  </span>
                )}
              </div>
              {!feed?.held?.length ? (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No held responses.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {feed.held.map((r) => (
                    <div key={r.id} style={{
                      padding: '10px 12px',
                      background: 'var(--color-bg)',
                      border: `1px solid ${r.risk_flagged ? 'var(--color-danger)' : 'var(--color-border)'}`,
                      borderRadius: 'var(--radius)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{r.alias}</span>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          {r.risk_flagged && (
                            <span className="badge badge--high" style={{ fontSize: 10 }}>risk</span>
                          )}
                          <span className="elapsed" style={{ fontSize: 11 }}>
                            {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <p style={{ fontSize: 13, margin: '0 0 8px', lineHeight: 1.5 }}>{r.content}</p>
                      <div className="btn-group">
                        <button
                          className="btn btn--success btn--sm"
                          onClick={() => handleApprove(r.id)}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn--ghost btn--sm"
                          style={{ color: 'var(--color-danger)' }}
                          onClick={() => handleDelete(r.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="slide-panel__footer">
          <button className="btn btn--ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  );
}

function LiveItem({ label, value, date, meta, empty }) {
  return (
    <div style={{
      padding: '9px 12px',
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: value ? 4 : 0, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          {label}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {meta && <span style={{ fontSize: 11, color: 'var(--color-primary)' }}>{meta}</span>}
          {date && <span className="elapsed" style={{ fontSize: 11 }}>{new Date(date).toLocaleDateString()}</span>}
        </div>
      </div>
      {value
        ? <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5, color: 'var(--color-text)' }}>{value}</p>
        : <p style={{ fontSize: 12, margin: 0, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{empty}</p>
      }
    </div>
  );
}
