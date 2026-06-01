import { useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

export default function RecoverScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email) { setError('Please enter your email address.'); return; }
    setLoading(true);
    try {
      await client.post('/api/auth/recover', { email });
    } catch {
      // Swallow all errors — never reveal whether email exists
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="screen screen--no-nav" style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: 'var(--space-xl) var(--space-lg)',
    }}>
      <div style={{ marginBottom: 'var(--space-xl)', textAlign: 'center' }}>
        <div className="wordmark" style={{ fontSize: 28, marginBottom: 'var(--space-sm)' }}>Melah</div>
        <h1 style={{ fontSize: 'var(--text-h2)', marginBottom: 'var(--space-xs)' }}>
          {submitted ? 'Check your inbox' : 'Forgot your password?'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
          {submitted
            ? "If that email is registered, you'll receive a link shortly. Check your spam folder too."
            : "Enter your email and we'll send you a reset link."}
        </p>
      </div>

      {submitted ? (
        <div style={{ textAlign: 'center' }}>
          <Link
            to="/login"
            className="btn btn--ghost"
            style={{ width: 'auto', padding: '0 var(--space-xl)', textDecoration: 'none', display: 'inline-block' }}
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn btn--primary" disabled={loading || !email}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
          <div style={{ marginTop: 'var(--space-lg)', textAlign: 'center' }}>
            <Link to="/login" style={{ color: 'var(--color-accent)', textDecoration: 'none', fontSize: 14 }}>
              Back to sign in
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
