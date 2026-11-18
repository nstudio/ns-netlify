import { useEffect, useState, type FormEvent } from 'react';
import { APP_NAME, TAGLINE } from '../../../shared';
import { Icon, Mark, type IconName } from '../components/Icon';
import { Topo } from '../components/Topo';
import { auth } from '../lib/session';

type Mode = 'signin' | 'signup';

const unconfirmed = (message: string) => /confirm/i.test(message);

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'camera', title: 'Photo, place and heading', body: 'Where you stood, which way you faced and how high you were.' },
  { icon: 'scan', title: 'Read on the phone', body: 'Text in the picture and your voice note, recognized on the device.' },
  { icon: 'sparkle', title: 'Here the instant you save', body: 'A live socket brings every capture to this page as it happens.' },
];

export function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    document.title = `Sign in · ${APP_NAME}`;
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') await auth.signUp(email.trim(), password, name.trim() || undefined);
      else await auth.logIn(email.trim(), password);
    } catch (err) {
      const message = (err as Error).message;
      if (unconfirmed(message)) setConfirming(true);
      else setError(friendly(message, mode));
    } finally {
      setBusy(false);
    }
  }

  async function retryAfterConfirm() {
    setBusy(true);
    setError(null);
    try {
      await auth.logIn(email.trim(), password);
    } catch (err) {
      const message = (err as Error).message;
      setError(unconfirmed(message) ? 'Not confirmed yet. Open the link in the email, then try again.' : friendly(message, 'signin'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <aside className="login-hero">
        <Topo className="login-topo" seed={11} peaks={4} />
        <div className="login-hero-inner">
          <div className="brand brand-hero">
            <Mark size={36} />
            <span className="brand-name">{APP_NAME}</span>
          </div>
          <h1 className="login-headline">
            Capture the world on your phone. <em>Explore it on the web.</em>
          </h1>
          <ul className="login-features">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <span className="login-feature-icon">
                  <Icon name={f.icon} size={18} />
                </span>
                <span>
                  <strong>{f.title}</strong>
                  {f.body}
                </span>
              </li>
            ))}
          </ul>
          <p className="login-stack">
            One Netlify project · Identity · Database · Blobs · Server
            <span className="login-stack-native">
              <Icon name="phone" size={13} /> Native on iOS and Android with NativeScript
            </span>
          </p>
        </div>
      </aside>

      <section className="login-panel" aria-label={TAGLINE}>
        <div className="login-card">
          {confirming ? (
            <div className="confirm">
              <span className="confirm-icon">
                <Icon name="mail" size={26} />
              </span>
              <h2 className="login-title">Confirm your email</h2>
              <p className="login-sub">
                We sent a confirmation link to <strong>{email}</strong>. Open it on any device, then come back here.
              </p>
              {error && (
                <p className="form-error" role="alert">
                  <Icon name="alert" size={16} /> {error}
                </p>
              )}
              <button type="button" className="button button-primary button-block" onClick={retryAfterConfirm} disabled={busy}>
                {busy ? <span className="spinner" /> : <Icon name="check" size={17} />}
                I've confirmed, sign me in
              </button>
              <button
                type="button"
                className="button button-ghost button-block"
                onClick={() => {
                  setConfirming(false);
                  setMode('signin');
                  setError(null);
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h2 className="login-title">{mode === 'signin' ? 'Welcome back' : 'Start your field journal'}</h2>
              <p className="login-sub">
                {mode === 'signin' ? 'Sign in to see everything you captured.' : 'One account for the web and the phone app.'}
              </p>
              <div className="segmented" role="tablist" aria-label="Sign in or create an account">
                <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => (setMode('signin'), setError(null))}>
                  Sign in
                </button>
                <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => (setMode('signup'), setError(null))}>
                  Create account
                </button>
              </div>
              <form onSubmit={submit} className="form">
                {mode === 'signup' && (
                  <label className="field">
                    <span className="field-label">
                      Name <span className="field-hint">optional</span>
                    </span>
                    <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ada Lovelace" />
                  </label>
                )}
                <label className="field">
                  <span className="field-label">Email</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Password</span>
                  <span className="field-with-action">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={mode === 'signup' ? 8 : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                    />
                    <button type="button" className="field-action" onClick={() => setShowPassword((s) => !s)}>
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </span>
                </label>
                {error && (
                  <p className="form-error" role="alert">
                    <Icon name="alert" size={16} /> {error}
                  </p>
                )}
                <button type="submit" className="button button-primary button-block" disabled={busy}>
                  {busy && <span className="spinner" />}
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>
              <p className="login-foot">
                <Icon name="check" size={14} /> Secured by Netlify Identity
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function friendly(message: string, mode: Mode): string {
  if (/invalid|no user found|password/i.test(message) && mode === 'signin') return 'That email and password don’t match an account.';
  if (/already.*registered|exists/i.test(message)) return 'There’s already an account for that email. Sign in instead.';
  if (/failed to fetch|network/i.test(message)) return 'Can’t reach the server. Check your connection and try again.';
  return message;
}
