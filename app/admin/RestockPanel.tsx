'use client';
import { useEffect, useState, useCallback } from 'react';
import { COLOURS, PRODUCT } from '@/lib/product';
import type { RestockSignup } from '@/lib/restock';
import type { AdminEmailRestockSignup } from '@/lib/restockEmail';
import type { Availability } from '@/lib/availability';
import styles from './admin.module.css';
export default function RestockPanel({ onExpired }: { onExpired: () => void }) {
  const [data, setData] = useState<{ signups: (RestockSignup & { whatsappUrl: string })[]; emailSignups: AdminEmailRestockSignup[]; stock: Availability } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/restock', { cache: 'no-store' });
      if (r.status === 401) { onExpired(); return; }
      if (!r.ok) throw new Error('Could not load the restock list.');
      setData(await r.json()); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
  }, [onExpired]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  async function update(id: string, action: string, channel?: 'email') {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/restock', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, channel }) });
      if (r.status === 401) { onExpired(); return; }
      if (!r.ok) { const result = await r.json(); throw new Error(result.error || 'Could not update this signup.'); }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <section>
    <p className={styles.help}>Email signups receive a waiting-list confirmation. Send restock updates once the full requested quantity is available, then mark notified. Remove anyone who opts out.</p>
    <button className={styles.refresh} onClick={() => void load()}>Refresh restock list</button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {data && <p>{data.stock.localTest ? 'Local test inventory · ' : ''}Green: {data.stock.green} ready · Cream: {data.stock.cream} ready</p>}
    {data?.signups.length === 0 && data.emailSignups.length === 0 && <p>No restock signups yet.</p>}
    {!!data?.emailSignups.length && <div className={styles.restockList}>
      {data.emailSignups.map(row => {
        const ready = COLOURS.every(c => data.stock[c] >= row.quantities[c]);
        const selection = COLOURS.filter(c => row.quantities[c] > 0).map(c => `${row.quantities[c]} × ${PRODUCT.variants[c].name}`).join(' + ');
        const emailLink = `mailto:${row.email}?${new URLSearchParams({ subject: 'Your Smelt selection is back', body: `Hi! Your selection (${selection}) is now available: https://saunahat.co.za/product\n\nWarm regards,\nSmelt` }).toString().replace(/\+/g, '%20')}`;
        return <article key={row.id} className={styles.restockCard}>
          <div><a className={styles.email} href={`mailto:${row.email}`}>{row.email}</a><p>{selection}</p><span className={styles.date}>Joined {new Date(row.createdAt).toLocaleDateString('en-ZA')}</span></div>
          <div>
            <span className={`${styles.badge} ${row.notifiedAt ? styles.accepted : ''}`}>{row.notifiedAt ? `Notified ${new Date(row.notifiedAt).toLocaleDateString('en-ZA')}` : ready ? 'Ready to notify' : 'Waiting for restock'}</span>
            <p className={styles.note}>{row.confirmation.status === 'accepted' ? 'Confirmation accepted by Resend' : row.confirmation.status === 'review' ? 'Confirmation needs review in Resend' : 'Confirmation pending'}</p>
            {row.confirmation.status === 'accepted' && <span className={styles.date}>Email ID: {row.confirmation.id}</span>}
          </div>
          <div className={styles.orderActions}>
            {row.confirmation.status === 'pending' && <button disabled={busy} onClick={() => void update(row.id, 'confirm', 'email')}>Retry confirmation</button>}
            {ready && !row.notifiedAt && <a href={emailLink}>Write restock email ↗</a>}
            <button disabled={busy || !!row.notifiedAt || !ready} onClick={() => { if (window.confirm('Have you sent this customer their restock email?')) void update(row.id, 'notified', 'email'); }}>Mark notified</button>
            <button className={styles.secondary} disabled={busy} onClick={() => { if (window.confirm('Remove this signup and its email address?')) void update(row.id, 'remove', 'email'); }}>Remove</button>
          </div>
        </article>;
      })}
    </div>}
    {!!data?.signups.length && <h2>WhatsApp requests</h2>}
    {data?.signups.map(row => <article key={row.id} className={styles.login}>
      <h3>{PRODUCT.variants[row.colour].name}</h3><p>+{row.phone} · Requested {new Date(row.createdAt).toLocaleDateString('en-ZA')}</p>
      <p>{row.notifiedAt ? `Marked notified ${new Date(row.notifiedAt).toLocaleDateString('en-ZA')}` : 'Waiting for restock'}</p>
      {data.stock[row.colour] > 0 && !row.notifiedAt ? <a href={row.whatsappUrl} target="_blank" rel="noreferrer">Open WhatsApp message ↗</a> : !row.notifiedAt && <p>Restock message available once this colour is in stock.</p>}
      <div className={styles.orderActions}><button disabled={busy || !!row.notifiedAt || data.stock[row.colour] <= 0} onClick={() => void update(row.id, 'notified')}>Mark notified</button><button disabled={busy} onClick={() => { if (window.confirm('Remove this restock signup and its phone number?')) void update(row.id, 'remove'); }}>Remove / opt out</button></div>
    </article>)}
  </section>;
}
