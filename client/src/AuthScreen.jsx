import { useEffect, useRef, useState } from 'react';
import { api, clearToken, setToken } from './api';
import { CollabArt, Icon, Logo } from './ui.jsx';
import { PASSWORD_RULE, checkEmail, checkPassword } from './validation.js';

const DEMOS = [
  { name: 'Alice', email: 'alice@demo.com', note: 'owns docs and a team' },
  { name: 'Bob', email: 'bob@demo.com', note: 'team member' },
  { name: 'Carol', email: 'carol@demo.com', note: 'has a pending invite' },
];

// the reset link looks like  https://host/#/reset?token=...
const resetTokenFromHash = () => {
  const m = /^#\/reset\?token=([\w-]+)/.exec(location.hash);
  return m ? m[1] : '';
};

// "Continue with Google": Google's own button when a client id is configured,
// otherwise a look-alike that explains what is missing.
function GoogleButton({ onCredential, onError, disabled }) {
  const box = useRef(null);
  const [clientId, setClientId] = useState(null); // null = still loading, '' = not configured

  useEffect(() => {
    api('/auth/config').then((r) => setClientId(r.googleClientId || '')).catch(() => setClientId(''));
  }, []);

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    const draw = () => {
      if (cancelled || !box.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => onCredential(resp.credential),
      });
      window.google.accounts.id.renderButton(box.current, {
        theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill',
        width: Math.min(box.current.offsetWidth || 364, 400),
      });
    };
    if (window.google?.accounts?.id) draw();
    else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = draw;
      s.onerror = () => onError('Could not load Google sign-in. Check your connection.');
      document.head.appendChild(s);
    }
    return () => { cancelled = true; };
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (clientId) return <div ref={box} className="google-box" aria-disabled={disabled} />;
  return (
    <button type="button" className="google-fallback" disabled={clientId === null}
      onClick={() => onError('Google sign-in is not set up on this server yet. Add GOOGLE_CLIENT_ID (see the README).')}>
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
        <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z"/>
        <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.6l-7.5-5.8c-2.1 1.4-4.7 2.2-7.7 2.2-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
      </svg>
      Continue with Google
    </button>
  );
}

function PasswordField({ label, value, onChange, autoComplete, placeholder, invalid, describedBy }) {
  const [shown, setShown] = useState(false);
  return (
    <label className="field">{label}
      <span className="pw-wrap">
        <input type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} placeholder={placeholder} aria-invalid={invalid || undefined}
          aria-describedby={describedBy} required />
        <button type="button" className="pw-toggle" onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
          <Icon name={shown ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </span>
    </label>
  );
}

export default function AuthScreen({ onAuthed }) {
  // modes: login | signup | forgot | reset
  const [mode, setMode] = useState(() => (resetTokenFromHash() ? 'reset' : 'login'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);

  // follow the reset link if the hash changes while this screen is open
  useEffect(() => {
    const onHash = () => { if (resetTokenFromHash()) { setMode('reset'); setError(''); setNotice(''); } };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (next, msg = '') => {
    setMode(next); setError(''); setNotice(msg); setResetLink('');
    setPassword(''); setConfirm(''); setTouched({});
    if (location.hash.startsWith('#/reset')) location.hash = '#/';
  };
  const touch = (k) => setTouched((t) => ({ ...t, [k]: true }));

  // live messages, shown once a field has been visited (or on submit)
  const emailError = touched.email ? checkEmail(email) : '';
  const passwordError = touched.password && (mode === 'signup' || mode === 'reset') ? checkPassword(password) : '';
  const confirmError = touched.confirm && confirm !== password ? 'Passwords do not match' : '';

  const login = async (body) => {
    setBusy(true); setError('');
    try {
      const r = await api('/auth/login', { method: 'POST', body });
      setToken(r.token);
      onAuthed(r.user);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const googleSignIn = async (credential) => {
    setBusy(true); setError('');
    try {
      const r = await api('/auth/google', { method: 'POST', body: { credential } });
      setToken(r.token);
      onAuthed(r.user);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true, confirm: true });
    setError(''); setNotice('');

    if (mode === 'login') {
      if (!email.trim() || !password) return setError('Enter your email and password');
      return login({ email, password });
    }
    if (mode === 'signup') {
      if (!name.trim()) return setError('Enter your name');
      const bad = checkEmail(email) || checkPassword(password) || (confirm !== password && 'Passwords do not match');
      if (bad) return setError(bad);
    }
    if (mode === 'forgot') {
      const bad = checkEmail(email);
      if (bad) return setError(bad);
    }
    if (mode === 'reset') {
      const bad = checkPassword(password) || (confirm !== password && 'Passwords do not match');
      if (bad) return setError(bad);
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        await api('/auth/signup', { method: 'POST', body: { name, email, password } });
        // the account exists, but the person logs in rather than landing in the app unasked
        const created = email.trim().toLowerCase();
        setMode('login'); setEmail(created); setPassword(''); setConfirm(''); setTouched({});
        setNotice('Account created. Log in to continue.');
      } else if (mode === 'forgot') {
        const r = await api('/auth/forgot', { method: 'POST', body: { email } });
        setNotice(r.message);
        setResetLink(r.resetLink || '');
      } else if (mode === 'reset') {
        await api('/auth/reset', { method: 'POST', body: { token: resetTokenFromHash(), password } });
        // the server ended every session for this account, so drop the stale token here too
        clearToken();
        window.dispatchEvent(new Event('draftly:signed-out'));
        go('login', 'Password updated. Log in with your new password.');
      }
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const heading = {
    login: 'Welcome back',
    signup: 'Start writing with your team',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  }[mode];
  const showTabs = mode === 'login' || mode === 'signup';

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="auth-brand"><Logo size={40} /><span>Draftly</span></div>
        <h1>Write together, without the clutter.</h1>
        <p>Documents, teams and sharing in one calm place. Draft alone, then invite your team when it is ready.</p>
        <ul className="auth-points">
          <li><Icon name="file" /> Rich-text editing that saves as you type</li>
          <li><Icon name="users" /> Teams with shared documents and invites</li>
          <li><Icon name="upload" /> Turn .txt, .md and .docx files into drafts</li>
        </ul>
        <CollabArt />
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          {showTabs && (
            <div className="seg" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''}
                onClick={() => go('login')}>Log in</button>
              <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''}
                onClick={() => go('signup')}>Create account</button>
            </div>
          )}
          <h2>{heading}</h2>
          {showTabs && (
            <>
              <GoogleButton onCredential={googleSignIn} onError={setError} disabled={busy} />
              <div className="or-rule"><span>or use your email</span></div>
            </>
          )}
          {mode === 'forgot' && <p className="auth-sub">Enter the email you signed up with and we will prepare a link to set a new password.</p>}

          {notice && <p className="notice" role="status">{notice}</p>}

          {mode === 'signup' && (
            <label className="field">Your name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} required />
            </label>
          )}

          {mode !== 'reset' && (
            <label className="field">Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => touch('email')}
                autoComplete="email" placeholder="name@gmail.com" aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? 'email-err' : undefined} required />
              {emailError && <span id="email-err" className="field-error">{emailError}</span>}
            </label>
          )}

          {mode !== 'forgot' && (
            <>
              <div onBlur={() => touch('password')}>
                <PasswordField label={mode === 'reset' ? 'New password' : 'Password'} value={password} onChange={setPassword}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  invalid={!!passwordError} describedBy={mode === 'login' ? undefined : 'pw-rule'} />
              </div>
              {mode !== 'login' && (
                <p id="pw-rule" className={`pw-rule${passwordError ? ' bad' : ''}`}>{PASSWORD_RULE}</p>
              )}
              {mode !== 'login' && (
                <div onBlur={() => touch('confirm')}>
                  <PasswordField label="Confirm password" value={confirm} onChange={setConfirm}
                    autoComplete="new-password" invalid={!!confirmError} describedBy={confirmError ? 'confirm-err' : undefined} />
                  {confirmError && <span id="confirm-err" className="field-error">{confirmError}</span>}
                </div>
              )}
            </>
          )}

          {mode === 'login' && (
            <button type="button" className="link-btn" onClick={() => go('forgot')}>Forgot password?</button>
          )}

          {error && <p className="error" role="alert">{error}</p>}

          {resetLink && (
            <div className="notice demo-link">
              <p>Demo mode: no email service is connected, so the link is shown here instead of being sent.</p>
              <a className="btn wide" href={resetLink}>
                Open reset link
              </a>
            </div>
          )}

          {!resetLink && (
            <button className="btn primary wide" disabled={busy}>
              {busy ? 'One moment' : {
                login: 'Log in', signup: 'Create account', forgot: 'Send reset link', reset: 'Update password',
              }[mode]}
            </button>
          )}

          {(mode === 'forgot' || mode === 'reset') && (
            <button type="button" className="link-btn center" onClick={() => go('login')}>Back to log in</button>
          )}

          {mode === 'login' && (
            <div className="demo">
              <p>Reviewing this project? Try a demo account (password <code>demo1234</code>)</p>
              <div className="demo-row">
                {DEMOS.map((d) => (
                  <button type="button" key={d.email} className="demo-chip" disabled={busy}
                    onClick={() => login({ email: d.email, password: 'demo1234' })}>
                    <strong>{d.name}</strong><span>{d.note}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
