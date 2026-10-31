'use client';
import { useEffect, useState, useCallback } from 'react';
import { PRODUCT } from '@/lib/product';
import type { RestockSignup } from '@/lib/restock';
import type { Availability } from '@/lib/availability';
import styles from './admin.module.css';
export default function RestockPanel({ onExpired }: { onExpired: () => void }) {
  const [data, setData] = useState<{ signups: (RestockSignup & { whatsappUrl: string })[]; stock: Availability } | null>(null);
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
  async function update(id: string, action: string) {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/restock', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
      if (r.status === 401) { onExpired(); return; }
      if (!r.ok) throw new Error('Could not update this signup.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <section>
    <p className={styles.help}>Notify customers only when stock is available to buy. Opening WhatsApp prepares a message; mark notified only after sending it. Remove anyone who opts out.</p>
    <button className={styles.refresh} onClick={() => void load()}>Refresh restock list</button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {data && <p>{data.stock.localTest ? 'Local test inventory · ' : ''}Green: {data.stock.green} ready · Cream: {data.stock.cream} ready</p>}
    {data?.signups.length === 0 && <p>No restock signups yet.</p>}
    {data?.signups.map(row => <article key={row.id} className={styles.login}>
      <h3>{PRODUCT.variants[row.colour].name}</h3><p>+{row.phone} · Requested {new Date(row.createdAt).toLocaleDateString('en-ZA')}</p>
      <p>{row.notifiedAt ? `Marked notified ${new Date(row.notifiedAt).toLocaleDateString('en-ZA')}` : 'Waiting for restock'}</p>
      {data.stock[row.colour] > 0 && !row.notifiedAt ? <a href={row.whatsappUrl} target="_blank" rel="noreferrer">Open WhatsApp message ↗</a> : !row.notifiedAt && <p>Restock message available once this colour is in stock.</p>}
      <div className={styles.orderActions}><button disabled={busy || !!row.notifiedAt || data.stock[row.colour] <= 0} onClick={() => void update(row.id, 'notified')}>Mark notified</button><button disabled={busy} onClick={() => { if (window.confirm('Remove this restock signup and its phone number?')) void update(row.id, 'remove'); }}>Remove / opt out</button></div>
    </article>)}
  </section>;
}
