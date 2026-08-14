import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';

function parseInline(text) {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|\*(?!\*)[^*\n]+\*)/);
  return tokens.map((token, i) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4)
      return <strong key={i}>{token.slice(2, -2)}</strong>;
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2)
      return <em key={i}>{token.slice(1, -1)}</em>;
    return token || null;
  });
}

function renderMarkdown(content) {
  if (!content) return null;
  const lines = content.split('\n');
  const result = [];
  let listBuffer = [];
  let k = 0;

  const flushList = () => {
    if (!listBuffer.length) return;
    const items = listBuffer.splice(0);
    result.push(
      <ul key={k++} style={{ margin: '6px 0 12px', paddingLeft: 20 }}>
        {items}
      </ul>
    );
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('- ')) {
      listBuffer.push(
        <li key={k++} style={{ marginBottom: 4, lineHeight: 1.65 }}>
          {parseInline(line.trimStart().slice(2))}
        </li>
      );
    } else if (line === '---') {
      flushList();
      result.push(
        <hr key={k++} style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '16px 0' }} />
      );
    } else if (line.trim() === '') {
      flushList();
      result.push(<div key={k++} style={{ height: 10 }} />);
    } else {
      flushList();
      result.push(
        <p key={k++} style={{ margin: 0, lineHeight: 1.75 }}>
          {parseInline(line)}
        </p>
      );
    }
  }

  flushList();
  return result;
}

export default function ArticleScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data } = await client.get(`/api/resources/${id}`);
        setArticle(data.article);
      } catch {
        setError('Failed to load article. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return (
    <div className="screen">
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <h2 className="page-header__title">Loading…</h2>
      </div>
      <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div className="skeleton" style={{ height: 20, width: '30%', borderRadius: 'var(--radius-sm)' }} />
        <div className="skeleton" style={{ height: 32, width: '90%', borderRadius: 'var(--radius-sm)' }} />
        <div className="skeleton" style={{ height: 14, width: '20%', borderRadius: 'var(--radius-sm)' }} />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton" style={{ height: 16, width: `${90 - i * 4}%`, borderRadius: 'var(--radius-sm)' }} />
        ))}
      </div>
    </div>
  );

  if (error || !article) return (
    <div className="screen" style={{ padding: 24, textAlign: 'center' }}>
      <p>{error || 'Article not found.'}</p>
      <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={() => navigate('/resources')}>
        Back to Resources
      </button>
    </div>
  );

  const isStory = article.content_type === 'story';

  return (
    <div className="screen" style={{ padding: '0 0 24px' }}>
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <h2 className="page-header__title">{isStory ? 'Story' : 'Article'}</h2>
      </div>

      <div style={{ padding: '8px 16px' }}>
        {/* Badge */}
        {isStory ? (
          <span className="pill" style={{ fontSize: '0.8rem', marginBottom: 10, display: 'inline-block', background: 'var(--color-accent)', color: '#ffffff' }}>
            Personal Story
          </span>
        ) : (
          article.category && (
            <span className="pill" style={{ fontSize: '0.8rem', marginBottom: 10, display: 'inline-block' }}>
              {article.category.replace(/_/g, ' ')}
            </span>
          )
        )}

        <h1 style={{ fontSize: '1.375rem', marginBottom: 8, lineHeight: 1.3 }}>{article.title}</h1>

        {/* Story byline */}
        {isStory && article.author_name && (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>
            By {article.author_name}
          </p>
        )}

        {/* Read time */}
        {article.estimated_read_minutes && (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 20 }}>
            {article.estimated_read_minutes} min read
          </p>
        )}

        {/* Tags */}
        {article.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
            {article.tags.map((t) => (
              <span key={t} className="pill" style={{ fontSize: '0.75rem' }}>{t}</span>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ fontSize: '0.95rem', color: 'var(--color-text)' }}>
          {renderMarkdown(article.content)}
        </div>

        {/* Author attribution block — stories only */}
        {isStory && (article.author_bio || article.source_url) && (
          <div style={{
            marginTop: 'var(--space-xl)',
            padding: '16px',
            background: 'var(--color-surface-secondary)',
            borderRadius: 'var(--radius-md)',
            borderLeft: '3px solid var(--color-accent)',
          }}>
            {article.author_name && (
              <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: article.author_bio ? 6 : 0 }}>
                About {article.author_name}
              </p>
            )}
            {article.author_bio && (
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: article.source_url ? 10 : 0 }}>
                {article.author_bio}
              </p>
            )}
            {article.source_url && (
              <a
                href={article.source_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.875rem', color: 'var(--color-accent)', textDecoration: 'none' }}
              >
                Read more from this author →
              </a>
            )}
          </div>
        )}

        {/* Crisis banner — crisis_support category only */}
        {article.category === 'crisis_support' && (
          <div className="info-banner info-banner--warning" style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
            <p style={{ fontWeight: 600, marginBottom: 4, color: 'var(--color-text-primary)' }}>Need immediate support?</p>
            <a
              href="tel:0800723253"
              style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-accent)', textDecoration: 'none' }}
            >
              Befrienders Kenya: 0800 723 253
            </a>
            <p style={{ fontSize: '0.75rem', marginTop: 4 }}>Free · 24/7</p>
          </div>
        )}
      </div>
    </div>
  );
}
