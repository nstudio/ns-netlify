import { useRef, useState } from 'react';
import { ApplicationSettings, type TextField } from '@nativescript/core';
import { APP_NAME, TAGLINE } from '../shared';
import { API_BASE, DEPLOY } from '../config';
import { KeyboardScroll } from '../components/KeyboardScroll';
import { Icon } from '../components/ui';
import { auth, friendlyError } from '../session';
import { haptic } from '../platform/haptics';
import { systemBars } from '../platform/insets';
import { textRecognitionSupported } from '../platform/textRecognition';
import type { IconName } from '../platform/icons';

type Mode = 'signin' | 'signup';

const LAST_EMAIL = 'fieldnotes.email';

function Feature({ name, text }: { name: IconName; text: string }) {
  return (
    <stacklayout orientation="horizontal" className="feature-chip">
      <Icon name={name} size={14} className="feature-icon" />
      <label text={text} className="feature-text" />
    </stacklayout>
  );
}

function footer(): string {
  const host = API_BASE.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const build = DEPLOY.context && DEPLOY.context !== 'production' && DEPLOY.context !== 'local' ? ` · ${DEPLOY.context}${DEPLOY.commit ? ` ${DEPLOY.commit.slice(0, 7)}` : ''}` : '';
  return `The same account works on the web at ${host}${build}`;
}

export function SignIn({ notice }: { notice: string | null }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => ApplicationSettings.getString(LAST_EMAIL, ''));
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The address waiting for its confirmation link, when Identity requires one. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const emailField = useRef<TextField>(null);
  const passwordField = useRef<TextField>(null);

  const submit = async () => {
    if (busy) return;
    const e = email.trim();
    if (!e || !/^\S+@\S+\.\S+$/.test(e)) return setError('Enter the email address you use for Field Notes.');
    if (password.length < (mode === 'signup' ? 8 : 1)) return setError(mode === 'signup' ? 'Choose a password of at least 8 characters.' : 'Enter your password.');
    passwordField.current?.dismissSoftInput();
    emailField.current?.dismissSoftInput();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') await auth.signUp(e, password, name.trim() || undefined);
      else await auth.logIn(e, password);
      ApplicationSettings.setString(LAST_EMAIL, e);
      haptic('success');
    } catch (err) {
      setBusy(false);
      if (/not confirmed/i.test((err as Error)?.message ?? '')) {
        setConfirming(e);
        haptic('success');
        return;
      }
      setError(friendlyError(err));
      haptic('error');
    }
  };

  const confirmed = async () => {
    if (busy || !confirming) return;
    setError(null);
    setBusy(true);
    try {
      await auth.logIn(confirming, password);
      ApplicationSettings.setString(LAST_EMAIL, confirming);
      haptic('success');
    } catch (err) {
      setBusy(false);
      setError(/not confirmed/i.test((err as Error)?.message ?? '') ? 'Not confirmed yet. Open the link in the email first; it can take a minute to arrive.' : friendlyError(err));
      haptic('error');
    }
  };

  const switchTo = (m: Mode) => {
    if (m === mode) return;
    haptic('selection');
    setMode(m);
    setError(null);
  };

  return (
    <KeyboardScroll className="signin">
      <stacklayout paddingTop={systemBars().top + 8} paddingBottom={systemBars().bottom}>
        <stacklayout className="signin-hero">
          <gridlayout className="mark">
            <Icon name="pin" size={30} className="mark-icon" />
          </gridlayout>
          <label text={APP_NAME} className="signin-title" />
          <label text={TAGLINE} className="signin-tagline" textWrap />
          <wraplayout marginTop={18}>
            <Feature name="camera" text="Camera" />
            <Feature name="pin" text="Place" />
            <Feature name="heading" text="Compass" />
            {textRecognitionSupported ? <Feature name="text" text="Text in photos" /> : <Feature name="mountain" text="Altitude" />}
            <Feature name="wave" text="Live sync" />
          </wraplayout>
        </stacklayout>

        <stacklayout className="sheet">
          {confirming ? (
            <stacklayout paddingTop={16}>
              <gridlayout className="empty-badge">
                <Icon name="mail" size={32} className="empty-icon" />
              </gridlayout>
              <label text="Check your inbox" className="empty-title" />
              <label text={`We sent a confirmation link to ${confirming}. Open it on any device, then come back here.`} className="empty-text" textWrap marginBottom={18} />
              {error ? <label text={error} className="error" textWrap /> : null}
              <gridlayout>
                <button text={busy ? '' : 'I’ve confirmed it · Sign in'} className="primary" isEnabled={!busy} onTap={() => void confirmed()} />
                {busy ? <activityindicator busy color="#ffffff" width={24} height={24} isUserInteractionEnabled={false} /> : null}
              </gridlayout>
              <button
                text="Use a different email"
                className="ghost"
                marginTop={6}
                onTap={() => {
                  setConfirming(null);
                  setError(null);
                }}
              />
            </stacklayout>
          ) : (
            <>
              <gridlayout columns="*, *" className="segment">
                <label text="Sign in" className={`segment-item ${mode === 'signin' ? 'active' : ''}`} onTap={() => switchTo('signin')} />
                <label col={1} text="Create account" className={`segment-item ${mode === 'signup' ? 'active' : ''}`} onTap={() => switchTo('signup')} />
              </gridlayout>

              {notice && !error && mode === 'signin' ? <label text={notice} className="notice" textWrap /> : null}
              {error ? <label text={error} className="error" textWrap /> : null}

              {mode === 'signup' ? (
                <>
                  <label text="NAME" className="field-label" />
                  <textfield
                    className="field"
                    hint="What should we call you?"
                    text={name}
                    autocapitalizationType="words"
                    autocorrect={false}
                    returnKeyType="next"
                    onTextChange={(e: { value: string }) => setName(e.value)}
                    onReturnPress={() => emailField.current?.focus()}
                  />
                </>
              ) : null}

              <label text="EMAIL" className="field-label" />
              <textfield
                ref={emailField}
                className="field"
                hint="you@example.com"
                text={email}
                keyboardType="email"
                autocapitalizationType="none"
                autocorrect={false}
                autofillType="email"
                returnKeyType="next"
                onTextChange={(e: { value: string }) => setEmail(e.value)}
                onReturnPress={() => passwordField.current?.focus()}
              />

              <label text="PASSWORD" className="field-label" />
              <textfield
                ref={passwordField}
                className="field"
                hint={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                text={password}
                secure
                autocapitalizationType="none"
                autocorrect={false}
                autofillType={mode === 'signup' ? 'newPassword' : 'password'}
                returnKeyType="go"
                onTextChange={(e: { value: string }) => setPassword(e.value)}
                onReturnPress={() => void submit()}
              />

              <gridlayout marginTop={4}>
                <button text={busy ? '' : mode === 'signup' ? 'Create account' : 'Sign in'} className="primary" isEnabled={!busy} onTap={() => void submit()} />
                {busy ? <activityindicator busy color="#ffffff" width={24} height={24} isUserInteractionEnabled={false} /> : null}
              </gridlayout>
            </>
          )}
        </stacklayout>

        <label text={footer()} className="signin-footer" textWrap />
      </stacklayout>
    </KeyboardScroll>
  );
}
