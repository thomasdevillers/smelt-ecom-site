'use client';
import { useId, useState, type FormEvent } from 'react';
import type { CartState } from '@/lib/cartReducer';
import styles from './RestockSignup.module.css';

export default function RestockSignup({ quantities, id }: { quantities: CartState; id?: string }) {
  const inputId = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'saved'>('idle');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== 'idle') return;
    setStatus('sending'); setError('');
    try {
      const response = await fetch('/api/restock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, quantities, consent: true }),
      });
      const result = await response.json();
      if (!response.ok || !result.saved) throw new Error(result.error || 'Could not join the list. Please try again.');
      setStatus('saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the list. Please try again.');
      setStatus('idle');
    }
  }
  return <div id={id} className={styles.signup}>
    <div className={styles.heading}><span aria-hidden="true" /><strong>Available in 3 weeks</strong></div>
    {status === 'saved' ? <p className={styles.success} role="status">You’re on the list. We’ll email you when it’s back.</p> : <form onSubmit={submit} aria-label="Join the waiting list" aria-busy={status === 'sending'}>
      <label className={styles.srOnly} htmlFor={inputId}>Email address</label>
      <div className={styles.fields}>
        <input id={inputId} type="email" name="email" autoComplete="email" placeholder="Your email address" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={status === 'sending'} aria-describedby={`${inputId}-note${error ? ` ${inputId}-error` : ''}`} aria-invalid={!!error} />
        <button type="submit" disabled={status === 'sending'}>{status === 'sending' ? 'Joining…' : 'Notify me'}</button>
      </div>
      <p id={`${inputId}-note`} className={styles.note}>Just an email when your selection is back.</p>
      {error && <p id={`${inputId}-error`} className={styles.error} role="alert">{error}</p>}
    </form>}
  </div>;
}
