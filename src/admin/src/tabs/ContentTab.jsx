import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

const CATEGORIES = [
  'anxiety','depression','ocd','adhd','grief','trauma','relationships',
  'loneliness','stress','general_wellness','crisis_support',
];
const STATUSES = ['', 'published', 'draft', 'archived'];

export default function ContentTab() {
  const [articles, setArticles]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState('');
  const [filter,   setFilter]     = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [panel,    setPanel]      = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/resources');
      setArticles(data.articles ?? []);
    } catch { setError('Failed to load articles.'); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = articles
    .filter((a) => !filter     || a.status       === filter)
    .filter((a) => !typeFilter || a.content_type === typeFilter);

  async function handlePublish(id) {
    try { await client.patch(`/api/admin/resources/${id}/publish`); load(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to publish.'); }
  }

  async function handleArchive(id) {
    try { await client.patch(`/api/admin/resources/${id}/archive`); load(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to archive.'); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Content Library</h1>
          <p className="page-subtitle">Articles and personal stories</p>
        </div>
        <div className="filter-row">
          <select style={{ width: 'auto' }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="article">Articles</option>
            <option value="story">Stories</option>
          </select>
          <select style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
          <button className="btn btn--primary btn--sm" onClick={() => setPanel({ isNew: true })}>
            + New
          </button>
          <button className="refresh-btn" onClick={load} title="Refresh">↻</button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📚</div>
              <p className="empty-text">No content found</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Read time</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.title}
                      {a.author_name && (
                        <span style={{ display: 'block', fontSize: 11, color: '#888', marginTop: 1 }}>
                          by {a.author_name}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${a.content_type === 'story' ? 'badge--pending' : 'badge--review'}`}>
                        {a.content_type}
                      </span>
                    </td>
                    <td>{a.category.replace(/_/g, ' ')}</td>
                    <td><span className={`badge badge--${a.status}`}>{a.status}</span></td>
                    <td>{a.estimated_read_minutes} min</td>
                    <td><span className="elapsed">{new Date(a.updated_at).toLocaleDateString()}</span></td>
                    <td>
                      <div className="btn-group">
                        <button className="btn btn--ghost btn--sm" onClick={() => setPanel({ article: a })}>Edit</button>
                        {a.status !== 'published' && (
                          <button className="btn btn--success btn--sm" onClick={() => handlePublish(a.id)}>Publish</button>
                        )}
                        {a.status !== 'archived' && (
                          <button className="btn btn--ghost btn--sm" onClick={() => handleArchive(a.id)}>Archive</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {panel && (
        <ArticlePanel
          article={panel.article ?? null}
          onClose={() => setPanel(null)}
          onSaved={() => { setPanel(null); load(); }}
        />
      )}
    </div>
  );
}

function ArticlePanel({ article, onClose, onSaved }) {
  const isNew = !article;
  const [contentType, setContentType] = useState(article?.content_type ?? 'article');
  const [title,       setTitle]       = useState(article?.title ?? '');
  const [category,    setCategory]    = useState(article?.category ?? CATEGORIES[0]);
  const [content,     setContent]     = useState(article?.content ?? '');
  const [readMins,    setReadMins]    = useState(article?.estimated_read_minutes ?? 5);
  const [tags,        setTags]        = useState(article?.tags ? article.tags.join(', ') : '');
  const [authorName,  setAuthorName]  = useState(article?.author_name ?? '');
  const [authorBio,   setAuthorBio]   = useState(article?.author_bio ?? '');
  const [sourceUrl,   setSourceUrl]   = useState(article?.source_url ?? '');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [dirty,       setDirty]       = useState(false);

  function markDirty(setter) {
    return (val) => { setter(val); setDirty(true); };
  }

  function handleClose() {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    onClose();
  }

  const isStory = contentType === 'story';

  async function handleSave() {
    if (!title.trim() || !content.trim()) { setError('Title and content are required.'); return; }
    setSaving(true);
    setError('');
    const body = {
      title:                  title.trim(),
      category,
      content:                content.trim(),
      estimated_read_minutes: parseInt(readMins) || 5,
      tags: tags.trim() ? tags.split(',').map((t) => t.trim()).filter(Boolean) : null,
      content_type:           contentType,
      author_name:            isStory ? (authorName.trim() || null) : null,
      author_bio:             isStory ? (authorBio.trim()  || null) : null,
      source_url:             isStory ? (sourceUrl.trim()  || null) : null,
    };
    try {
      if (isNew) {
        await client.post('/api/admin/resources', body);
      } else {
        await client.patch(`/api/admin/resources/${article.id}`, body);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="panel-overlay" onClick={handleClose} />
      <div className="slide-panel">
        <div className="slide-panel__header">
          <span className="slide-panel__title">{isNew ? 'New Content' : 'Edit Content'}</span>
          <button className="btn btn--ghost btn--sm" onClick={handleClose}>✕</button>
        </div>

        <div className="slide-panel__body">
          {/* Type selector */}
          <div className="form-group">
            <label className="form-label">Content type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['article', 'story'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setContentType(t); setDirty(true); }}
                  className={`btn btn--sm ${contentType === t ? 'btn--primary' : 'btn--ghost'}`}
                  style={{ flex: 1 }}
                >
                  {t === 'article' ? '📄 Article' : '💬 Personal Story'}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => markDirty(setTitle)(e.target.value)}
              placeholder={isStory ? 'Story title…' : 'Article title…'}
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select value={category} onChange={(e) => markDirty(setCategory)(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Read time (min)</label>
              <input type="number" value={readMins} onChange={(e) => markDirty(setReadMins)(e.target.value)} min={1} max={60} />
            </div>
          </div>

          {/* Story-only author fields */}
          {isStory && (
            <>
              <div className="form-group">
                <label className="form-label">Author name</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => markDirty(setAuthorName)(e.target.value)}
                  placeholder="e.g. Amina K."
                />
              </div>
              <div className="form-group">
                <label className="form-label">Author bio (short)</label>
                <textarea
                  value={authorBio}
                  onChange={(e) => markDirty(setAuthorBio)(e.target.value)}
                  rows={2}
                  placeholder="One or two sentences about the author…"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Source URL (Substack / blog link)</label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => markDirty(setSourceUrl)(e.target.value)}
                  placeholder="https://author.substack.com/p/story"
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Content {!isStory && '(markdown supported)'}</label>
            <textarea
              value={content}
              onChange={(e) => markDirty(setContent)(e.target.value)}
              rows={14}
              placeholder={isStory ? 'The full story…' : 'Article body — use **bold**, *italic*, - bullets…'}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Tags (comma-separated, optional)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => markDirty(setTags)(e.target.value)}
              placeholder="anxiety, recovery, Kenya"
            />
          </div>

          {error && <p className="error-text">{error}</p>}
        </div>

        <div className="slide-panel__footer">
          <button className="btn btn--ghost" onClick={handleClose}>Cancel</button>
          <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}
