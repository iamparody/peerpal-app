import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import client from '../api/client';
import PageHeader from '../components/PageHeader';

const CATEGORIES = [
  { label: 'All',              value: '' },
  { label: 'Anxiety',          value: 'anxiety' },
  { label: 'Depression',       value: 'depression' },
  { label: 'OCD',              value: 'ocd' },
  { label: 'ADHD',             value: 'adhd' },
  { label: 'Grief',            value: 'grief' },
  { label: 'Trauma',           value: 'trauma' },
  { label: 'Relationships',    value: 'relationships' },
  { label: 'Loneliness',       value: 'loneliness' },
  { label: 'Stress',           value: 'stress' },
  { label: 'Wellness',         value: 'general_wellness' },
  { label: 'Crisis Support',   value: 'crisis_support' },
];

function ResourcesSkeleton() {
  return (
    <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skeleton" style={{ width: '100%', height: 80, borderRadius: 'var(--radius-lg)' }} />
      ))}
    </div>
  );
}

export default function ResourcesScreen() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [contentType, setContentType] = useState('article');

  const { data, isLoading: loading, isError } = useQuery({
    queryKey: ['resources', contentType, category.value, search],
    queryFn: () => {
      const params = { content_type: contentType };
      if (search) params.search = search;
      if (category.value) params.category = category.value;
      return client.get('/api/resources', { params }).then(r => r.data);
    },
  });

  const articles = data?.articles ?? (Array.isArray(data) ? data : []);
  const error = isError ? "We couldn't connect. Check your internet and try again." : '';

  return (
    <div className="screen">
      <PageHeader title="Resources" />

      <div style={{ padding: '0 var(--space-md) var(--space-sm)' }}>
        {/* Articles / Stories toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-sm)' }}>
          {['article', 'story'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setContentType(type)}
              style={{
                padding: '7px 18px',
                borderRadius: 'var(--radius-full)',
                border: contentType === type ? 'none' : '1px solid var(--color-border)',
                background: contentType === type ? 'var(--color-accent)' : 'transparent',
                color: contentType === type ? '#1a1209' : 'var(--color-text-muted)',
                fontWeight: contentType === type ? 600 : 400,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all var(--duration-fast)',
              }}
              aria-pressed={contentType === type}
            >
              {type === 'article' ? 'Articles' : 'Stories'}
            </button>
          ))}
        </div>

        <input
          type="search"
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={contentType === 'story' ? 'Search stories…' : 'Search articles…'}
          style={{ marginBottom: 'var(--space-sm)' }}
          aria-label="Search"
        />

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat)}
              className={`pill${category.value === cat.value ? ' pill--active' : ''}`}
              style={{ cursor: 'pointer', flexShrink: 0 }}
              aria-pressed={category.value === cat.value}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 var(--space-md)' }}>
        {error && <div className="error-msg" style={{ marginBottom: 'var(--space-md)' }}>{error}</div>}
        {loading ? (
          <ResourcesSkeleton />
        ) : articles.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={48} weight="duotone" color="var(--color-text-muted)" aria-hidden="true" />
            <div className="empty-state__title">
              {contentType === 'story' ? 'No stories yet' : 'No articles found'}
            </div>
            <div className="empty-state__body">
              {contentType === 'story'
                ? 'Personal stories from the community are coming soon.'
                : 'Try a different search term or category.'}
            </div>
          </div>
        ) : (
          articles.map((a) => (
            <div
              key={a.id}
              className="card card--interactive"
              style={{ marginBottom: 'var(--space-sm)' }}
              onClick={() => navigate(`/resources/${a.id}`)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 15, marginBottom: 4, lineHeight: 1.4 }}>{a.title}</h3>

                  {a.content_type === 'story' && a.author_name ? (
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                      By {a.author_name}
                    </p>
                  ) : (
                    a.category && (
                      <span className="pill" style={{ fontSize: 10, marginBottom: 6, display: 'inline-block' }}>
                        {a.category.replace(/_/g, ' ')}
                      </span>
                    )
                  )}

                  {a.tags?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {a.tags.slice(0, 3).map((t) => (
                        <span key={t} className="pill" style={{ fontSize: 10, padding: '1px 6px' }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                {a.estimated_read_minutes && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }}>
                    {a.estimated_read_minutes} min
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
