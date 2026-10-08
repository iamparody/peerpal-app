import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

/* ──────────────────────────────────────────────────────────────────────────
   CONFIGURATION POINTS — set these for production.
   ────────────────────────────────────────────────────────────────────────── */
const WAITLIST_ENDPOINT = import.meta.env.VITE_WAITLIST_ENDPOINT || '';

const SOCIAL = {
  linkedin: import.meta.env.VITE_LINKEDIN_URL || 'https://www.linkedin.com/company/peerpalke/',
  instagram: import.meta.env.VITE_INSTAGRAM_URL || 'https://www.instagram.com/_peerpal/',
};

const CRISIS = { label: 'Befrienders Kenya', number: '0800 723 253', tel: '+254800723253' };

// Each one answers a different moment, not a feature in a list.
const situations = [
  {
    line: 'Sometimes you just need someone.',
    label: 'Peer support',
    body: 'Talk to a trained peer, anonymously, by text or voice. They’re there to listen — not to diagnose. They aren’t therapists.',
  },
  {
    line: 'Sometimes you’re not sure where to start.',
    label: 'AI companion',
    body: 'Something to talk to when you can’t face a person yet — to think out loud and put words to what’s going on. It isn’t therapy and won’t diagnose you.',
  },
  {
    line: 'Sometimes you’d rather work through it yourself.',
    label: 'Self-help',
    body: 'Journaling, mood check-ins, breathing exercises, and things to read when you want to sort it out on your own.',
  },
  {
    line: 'Sometimes you want people who get it.',
    label: 'Groups',
    body: 'Moderated, anonymous groups built around a shared experience, where you don’t have to explain the basics first.',
  },
  {
    line: 'Sometimes you need a professional.',
    label: 'Professional support',
    body: 'When you want clinical help, PeerPal connects you to qualified, independent therapists — a separate service from the peer and AI support.',
  },
  {
    line: 'Sometimes it can’t wait.',
    label: 'Emergency',
    body: 'If you’re in danger, PeerPal points you to external crisis lines and emergency services. It doesn’t provide emergency care itself.',
  },
];

const safety = [
  'If what you write suggests you’re at risk, PeerPal points you to crisis support right away.',
  'Serious situations are handed to people and outside services equipped for them — never left to the app alone.',
  'Your name and number are never required. You use PeerPal as an alias.',
  'Sensitive information is encrypted, and your data is yours to delete whenever you want.',
];

const faqs = [
  {
    q: 'Is PeerPal a medical service?',
    a: 'No. PeerPal is a support platform, not a clinic. It gives you people to talk to, tools to use, and a way to reach a professional. It doesn’t diagnose or treat, and in a crisis it points you to emergency services rather than standing in for them.',
  },
  {
    q: 'Are peer supporters therapists?',
    a: 'No. They’re trained to listen and support, not to diagnose or counsel — and many have been through something similar themselves. When you want professional care, PeerPal connects you to qualified, independent therapists. That’s a separate path.',
  },
  {
    q: 'What does the AI companion do?',
    a: 'It’s a companion for reflection, not a clinician. It won’t diagnose you or give medical advice, and if something sounds serious, it points you toward real help rather than handling it itself.',
  },
  {
    q: 'Why anonymity first?',
    a: 'Having to give your name is often the reason people don’t reach out at all. You start with an alias, so you can ask for help without it being tied to you — which matters most in the spaces you share with others.',
  },
  {
    q: 'Who is PeerPal for?',
    a: 'Adults 18 and over, in Kenya to start. It’s built mobile-first and shaped around how people here actually reach for help.',
  },
];

const screens = [
  { src: '/screens/home.png', label: 'Home', alt: 'PeerPal home screen with support options' },
  { src: '/screens/peer.png', label: 'Peer support', alt: 'Requesting anonymous peer support' },
  { src: '/screens/ai-chat.png', label: 'AI companion', alt: 'Chatting with the PeerPal AI companion' },
  { src: '/screens/resources.png', label: 'Resources', alt: 'Library of mental-health resources' },
  { src: '/screens/insights.png', label: 'My insights', alt: 'Mood calendar and check-in streak' },
  { src: '/screens/sounds.png', label: 'Calming sounds', alt: 'Calming sounds player' },
];

function useReveal() {
  useEffect(() => {
    const nodes = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

function ProductPhone() {
  return (
    <div className="phone-shell" role="img" aria-label="Preview of the PeerPal app">
      <div className="phone-top" aria-hidden="true">
        <span>9:41</span>
        <span>PeerPal</span>
      </div>
      <div className="mood-orb" aria-hidden="true">
        <span className="orb-face">calm</span>
      </div>
      <div className="phone-card active" aria-hidden="true">
        <span>Daily check-in</span>
        <strong>How are you feeling today?</strong>
      </div>
      <div className="phone-grid" aria-hidden="true">
        <span>Peer</span>
        <span>AI</span>
        <span>Journal</span>
        <span className="danger">Emergency</span>
      </div>
    </div>
  );
}

function FaqItem({ item, index }) {
  const [open, setOpen] = useState(index === 0);
  const panelId = `faq-panel-${index}`;
  const btnId = `faq-btn-${index}`;
  return (
    <div className={`faq-item ${open ? 'open' : ''}`}>
      <button type="button" id={btnId} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((next) => !next)}>
        <span>{item.q}</span>
        <span className="faq-sign" aria-hidden="true">{open ? '–' : '+'}</span>
      </button>
      <div className="faq-answer" id={panelId} role="region" aria-labelledby={btnId}>
        <p>{item.a}</p>
      </div>
    </div>
  );
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | success | dupe | error | unconfigured
  const [message, setMessage] = useState('');

  async function onSubmit(event) {
    event.preventDefault();
    if (status === 'submitting') return;
    const value = email.trim().toLowerCase();

    if (!emailRe.test(value)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    let joined = [];
    try { joined = JSON.parse(localStorage.getItem('peerpal_waitlist') || '[]'); } catch { joined = []; }
    if (joined.includes(value)) {
      setStatus('dupe');
      return;
    }

    if (!WAITLIST_ENDPOINT) {
      setStatus('unconfigured');
      // eslint-disable-next-line no-console
      console.warn('[PeerPal] Waitlist is not connected. Set VITE_WAITLIST_ENDPOINT (see .env.example) to a form endpoint to collect sign-ups.');
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch(WAITLIST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: value, source: 'landing' }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      try { localStorage.setItem('peerpal_waitlist', JSON.stringify([...joined, value])); } catch { /* ignore */ }
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setMessage('Something went wrong. Please try again in a moment.');
    }
  }

  if (status === 'success' || status === 'dupe') {
    return (
      <div className="waitlist-done" role="status">
        <div className="waitlist-check" aria-hidden="true">✓</div>
        <strong>{status === 'dupe' ? "You're already on the list." : "You're on the list."}</strong>
        <p>We'll email you once early access opens. No spam, and you can leave anytime.</p>
      </div>
    );
  }

  return (
    <form className="waitlist-form" onSubmit={onSubmit} noValidate>
      <label htmlFor="waitlist-email" className="waitlist-label">Email address</label>
      <div className="waitlist-row">
        <input
          id="waitlist-email"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (status !== 'idle') setStatus('idle'); }}
          aria-invalid={status === 'error'}
          aria-describedby="waitlist-status"
          required
        />
        <button type="submit" className="btn-primary" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Joining…' : 'Join the waitlist'}
        </button>
      </div>
      <p id="waitlist-status" className={`waitlist-status ${status}`} role="status" aria-live="polite">
        {status === 'error' && message}
        {status === 'unconfigured' && "Thanks — the waitlist is being connected. Please check back shortly."}
        {status === 'idle' && 'We only use your email to tell you when PeerPal opens.'}
        {status === 'submitting' && 'Adding you to the list…'}
      </p>
    </form>
  );
}

function SocialLink({ href, label, children }) {
  if (!href) {
    return (
      <span className="social-link is-unset" aria-disabled="true" title={`Add the official ${label} URL in main.jsx (SOCIAL config)`}>
        {children}
        <span className="sr-only">{label} (link not set yet)</span>
      </span>
    );
  }
  return (
    <a className="social-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={`PeerPal on ${label}`}>
      {children}
    </a>
  );
}

function App() {
  useReveal();

  const year = new Date().getFullYear();

  return (
    <>
      <a href="#waitlist" className="skip-link">Skip to joining the waitlist</a>

      <main>
        <section className="hero">
          <div className="ambient ambient-one" aria-hidden="true" />
          <div className="ambient ambient-two" aria-hidden="true" />

          <nav className="nav hero-rise" aria-label="Primary">
            <a href="#top" className="brand" aria-label="PeerPal home">PeerPal</a>
            <div className="nav-actions">
              <a href="#how" className="nav-link">How it works</a>
              <a href="#waitlist" className="btn-primary btn-sm">Join the waitlist</a>
            </div>
          </nav>

          <div className="hero-layout" id="top">
            <div className="hero-copy">
              <p className="eyebrow hero-rise delay-1">Launching in Kenya</p>
              <h1 className="hero-rise delay-2">
                Support isn’t one thing.
              </h1>
              <p className="hero-text hero-rise delay-3">
                Sometimes you need someone to talk to. Other times it’s space, people who understand,
                or a professional. PeerPal brings peer support, professional therapy, and self-help
                tools together in one anonymous, mobile-first mental health app — built for Kenya.
              </p>
              <div className="hero-cta hero-rise delay-4">
                <a href="#waitlist" className="btn-primary">Join the waitlist</a>
                <a href="#screens" className="btn-ghost">See the app</a>
              </div>
              <p className="hero-micro hero-rise delay-5">The app is being tested now. The first group opens soon.</p>
            </div>

            <div className="hero-visual hero-rise delay-3">
              <ProductPhone />
              <div className="floating-note note-one">
                <strong>The AI isn’t a therapist</strong>
                <span>It can help you start, but it won’t diagnose or pretend to be one.</span>
              </div>
              <div className="floating-note note-two">
                <strong>You stay anonymous</strong>
                <span>No real name required — you use an alias.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="split-section problem">
          <div data-reveal>
            <p className="eyebrow">Why PeerPal</p>
            <h2>Most of what’s hard never feels big enough to take anywhere.</h2>
          </div>
          <div className="copy-stack" data-reveal>
            <p>
              A thought you can’t shake. Something that feels too small to book a therapist for, or
              too tangled to explain. Usually you just want to talk it through before deciding
              whether it’s serious.
            </p>
            <p>
              That’s the part most services skip. It’s the part PeerPal is built for.
            </p>
          </div>
        </section>

        <section className="modules" id="how">
          <div className="section-heading" data-reveal>
            <p className="eyebrow">Six ways in</p>
            <h2>You don’t have to know what you need.</h2>
            <p className="section-lead">
              Each one fits a different moment. You can move between them without explaining
              yourself twice or starting over.
            </p>
          </div>

          <div className="situation-grid">
            {situations.map((item, index) => (
              <article className="situation-card" data-reveal key={item.label} style={{ '--delay': `${index * 70}ms` }}>
                <p className="situation-line">{item.line}</p>
                <div className="situation-form">
                  <h3 className="situation-label">{item.label}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="screens-section" id="screens">
          <div className="section-heading" data-reveal>
            <p className="eyebrow">The app</p>
            <h2>It’s built. You’re just early.</h2>
            <p className="section-lead">
              Real screens from the current build — not mockups.
            </p>
          </div>
          <div className="screens-strip" data-reveal role="list" aria-label="App screens">
            {screens.map((s) => (
              <div className="screen-frame" key={s.label} role="listitem">
                <img src={s.src} alt={s.alt} loading="lazy" width="200" height="433" />
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="safety-section" id="safety">
          <div className="safety-panel" data-reveal>
            <div>
              <p className="eyebrow">Safety</p>
              <h2>When it’s more than a hard day.</h2>
              <p>
                PeerPal is built to notice when a conversation moves past everyday support, and to
                point you toward crisis lines and professional help — real services, not the app
                itself. What you share stays yours.
              </p>
            </div>
            <ul>
              {safety.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="faq-section" id="faq">
          <div className="section-heading" data-reveal>
            <p className="eyebrow">Clear boundaries</p>
            <h2>Know what you’re getting.</h2>
            <p className="section-lead">
              The parts of PeerPal do different jobs, and they aren’t interchangeable. Here’s what
              each one is — and what it isn’t.
            </p>
          </div>
          <div className="faq-list" data-reveal>
            {faqs.map((item, index) => (
              <FaqItem item={item} index={index} key={item.q} />
            ))}
          </div>
        </section>

        <section className="waitlist-section" id="waitlist">
          <div className="waitlist-card" data-reveal>
            <div className="waitlist-copy">
              <p className="eyebrow">Early access</p>
              <h2>Be among the first to try PeerPal.</h2>
              <p>
                We’re opening access gradually. Leave your email and we’ll let you know when early
                access opens — nothing else.
              </p>
            </div>
            <WaitlistForm />
          </div>
        </section>
      </main>

      <footer id="contact">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="brand">PeerPal</div>
            <p>
              Mental health support that fits the moment — anonymous, and serious about safety.
            </p>
            <div className="social-row" aria-label="PeerPal on social media">
              <SocialLink href={SOCIAL.linkedin} label="LinkedIn">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/>
                </svg>
              </SocialLink>
              <SocialLink href={SOCIAL.instagram} label="Instagram">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07c-1.28.06-2.15.26-2.91.56-.79.31-1.46.72-2.13 1.38A5.88 5.88 0 0 0 .63 4.14c-.3.76-.5 1.63-.56 2.91C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.28.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13.67.66 1.34 1.07 2.13 1.38.76.3 1.63.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.28-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.76.5-1.63.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.28-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63c-.76-.3-1.63-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-10.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z"/>
                </svg>
              </SocialLink>
            </div>
          </div>

          <nav className="footer-nav" aria-label="Footer">
            <div className="footer-col">
              <h3>Explore</h3>
              <a href="#how">How it works</a>
              <a href="#safety">Safety</a>
              <a href="#faq">Questions</a>
              <a href="#waitlist">Join the waitlist</a>
            </div>
            <div className="footer-col">
              <h3>Need help now?</h3>
              <a href={`tel:${CRISIS.tel}`} className="footer-crisis">{CRISIS.label}: {CRISIS.number}</a>
              <p className="footer-note">If you're in immediate danger, contact local emergency services.</p>
            </div>
          </nav>
        </div>

        <div className="footer-bottom">
          <span>© {year} PeerPal</span>
          <p>
            PeerPal is a mental health support platform for adults 18+, not a medical service.
            Peer supporters and the AI companion are not therapists.
          </p>
        </div>
      </footer>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
