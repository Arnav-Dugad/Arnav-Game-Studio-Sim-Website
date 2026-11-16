import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/services/auth';
import { authErrorMessage, firebaseConfigured } from '@/services/firebase';
import { Wordmark } from '../art/EventArt';
import { Avatar } from '../art/Avatar';
import { Button, Field, inputCls, cx } from '../components/ui';
import { Icon } from '../icons';
import { ThemeToggle } from '../components/ThemeToggle';
import { navigate } from '../router';

type Mode = 'login' | 'signup' | 'reset';

function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: ['Too short', 'Weak', 'Okay', 'Good', 'Strong', 'Excellent'][s]! };
}

export function AuthScreen({ mode }: { mode: Mode }) {
  const auth = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    // Guests may come here to create a real account — only signed-in users are sent back.
    if (auth.user && !auth.user.guest && mode !== 'reset') navigate('slots', true);
  }, [auth.user, mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email.includes('@')) return setError('Please enter a valid email address.');
    if (mode !== 'reset' && pw.length < (mode === 'signup' ? 8 : 1)) return setError(mode === 'signup' ? 'Use at least 8 characters.' : 'Please enter your password.');
    setBusy(true);
    try {
      if (mode === 'login') await auth.signIn(email, pw);
      else if (mode === 'signup') await auth.signUp(email, pw, name);
      else {
        await auth.resetPassword(email);
        setInfo('Check your inbox — we sent a link to reset your password.');
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError('');
    setBusy(true);
    try {
      await auth.signInGoogle();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const st = strength(pw);
  const title = mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Found your studio' : 'Reset your password';
  const sub = mode === 'login' ? 'Sign in to continue your saves on any device.' : mode === 'signup' ? 'Create an account to sync up to five save slots to the cloud.' : 'Enter your email and we’ll send a reset link.';

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => navigate('')} aria-label="Home">
            <Wordmark />
          </button>
          <ThemeToggle />
        </div>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-ink2">{sub}</p>
          {!firebaseConfigured && (
            <div className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs text-ink2">Online accounts aren’t available in this build. You can play as a guest — saves stay on this device.</div>
          )}
          <form onSubmit={submit} className="mt-6 space-y-3" noValidate>
            {mode === 'signup' && (
              <Field label="Your name">
                <input className={inputCls} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Ada Lovelace" />
              </Field>
            )}
            <Field label="Email">
              <input className={inputCls} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            {mode !== 'reset' && (
              <Field
                label="Password"
                hint={
                  mode === 'signup' && pw ? (
                    <span className="flex items-center gap-2">
                      <span className="flex flex-1 gap-1">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <span key={i} className={cx('h-1 flex-1 rounded-full', i < st.score ? (st.score >= 4 ? 'bg-good' : st.score >= 2 ? 'bg-warn' : 'bg-bad') : 'bg-bg2')} />
                        ))}
                      </span>
                      {st.label}
                    </span>
                  ) : undefined
                }
              >
                <div className="relative">
                  <input
                    className={cx(inputCls, 'pr-10')}
                    type={show ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                  />
                  <button type="button" onClick={() => setShow((x) => !x)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink3 hover:text-ink">
                    <Icon name="eye" size={16} />
                  </button>
                </div>
              </Field>
            )}
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl bg-bad/10 p-2.5 text-sm text-bad">
                <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            {info && (
              <div role="status" className="flex items-start gap-2 rounded-xl bg-good/10 p-2.5 text-sm text-good">
                <Icon name="mail" size={16} className="mt-0.5 shrink-0" />
                {info}
              </div>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !firebaseConfigured}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </Button>
          </form>
          {mode !== 'reset' && firebaseConfigured && (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-ink3">
                <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
              </div>
              <Button size="lg" className="w-full" icon="google" onClick={google} disabled={busy}>
                Continue with Google
              </Button>
            </>
          )}
          <div className="mt-6 space-y-2 text-center text-sm text-ink2">
            {mode === 'login' && (
              <>
                <p>
                  <button type="button" className="font-semibold text-accent hover:underline" onClick={() => navigate('reset')}>
                    Forgot your password?
                  </button>
                </p>
                <p>
                  New here?{' '}
                  <button type="button" className="font-semibold text-accent hover:underline" onClick={() => navigate('signup')}>
                    Create an account
                  </button>
                </p>
              </>
            )}
            {mode !== 'login' && (
              <p>
                {mode === 'signup' ? 'Already have an account?' : 'Remembered it?'}{' '}
                <button type="button" className="font-semibold text-accent hover:underline" onClick={() => navigate('login')}>
                  Sign in
                </button>
              </p>
            )}
            <p>
              <button
                type="button"
                className="text-ink3 hover:text-ink hover:underline"
                onClick={() => {
                  auth.playAsGuest();
                  navigate('slots');
                }}
              >
                Play as a guest (saves stay on this device)
              </button>
            </p>
          </div>
        </main>
      </div>
      <aside className="relative hidden overflow-hidden bg-ink lg:block" aria-hidden>
        <div className="absolute inset-0 grid grid-cols-6 gap-3 p-10 opacity-90">
          {Array.from({ length: 36 }, (_, i) => (
            <div key={i} className="animate-fade-up" style={{ animationDelay: `${(i % 12) * 60}ms` }}>
              <Avatar seed={i * 7919 + 13} size={88} mood={40 + ((i * 37) % 60)} />
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-10 text-white">
          <p className="font-display text-2xl font-semibold">“Every great studio starts with one desk and a terrible coffee machine.”</p>
          <p className="mt-2 text-sm opacity-70">— Your future staff, probably</p>
        </div>
      </aside>
    </div>
  );
}
