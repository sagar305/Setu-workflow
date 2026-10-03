'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Field, MutationForm, post } from './form';
const subscribeHash = (callback: () => void) => { window.addEventListener('hashchange', callback); return () => window.removeEventListener('hashchange', callback); };
const readHash = () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
export function AuthForm({ mode }: { mode: 'login' | 'forgot' | 'invite' | 'reset' }) {
  const token = useSyncExternalStore(subscribeHash, readHash, () => null);
  const [firm, setFirm] = useState('');
  const [error, setError] = useState('');
  const isToken = mode === 'invite' || mode === 'reset';
  useEffect(() => {
    if (mode !== 'invite' || !token || !/^[a-f0-9]{64}$/.test(token)) return;
    let active = true;
    post('/api/auth/invitation', { token }).then(result => { if (active) setFirm(result.firmName ?? ''); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [mode, token]);
  const invalid = isToken && token !== null && !/^[a-f0-9]{64}$/.test(token);
  if (error || invalid) return <><p className="notice error" role="alert">{error || 'This link is invalid. Request a new link.'}</p><Link href="/login">Back to login</Link></>;
  if (isToken && (!token || (mode === 'invite' && !firm))) return <p role="status">Checking your link…</p>;
  return <>
    {mode === 'invite' && <p className="invite-firm">You’ve been invited to join <strong>{firm}</strong></p>}
    <MutationForm endpoint={`/api/auth/${mode}`} redirectTo={mode === 'login' ? '/dashboard' : undefined} label={mode === 'login' ? 'Log in to your workspace' : mode === 'forgot' ? 'Send reset link' : 'Set password'}>
      {!isToken && <Field label="Email address"><input name="email" type="email" autoComplete="email" placeholder="you@yourfirm.com" required maxLength={254}/></Field>}
      {mode !== 'forgot' && <Field label={isToken ? 'New password' : 'Password'} hint={isToken ? 'Use at least 12 characters.' : undefined}><input name="password" type="password" autoComplete={isToken ? 'new-password' : 'current-password'} minLength={isToken ? 12 : undefined} maxLength={128} required/></Field>}
      {isToken && <><input type="hidden" name="token" value={token ?? ''}/><Field label="Confirm password"><input name="confirmPassword" type="password" autoComplete="new-password" required maxLength={128}/></Field></>}
    </MutationForm>
    <div className="auth-links">{mode === 'login' ? <Link href="/forgot">Forgot password?</Link> : <Link href="/login">Back to login</Link>}</div>
  </>;
}
