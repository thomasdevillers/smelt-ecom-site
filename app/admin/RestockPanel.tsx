'use client';
import { useEffect, useState, useCallback } from 'react';
import { PRODUCT } from '@/lib/product';
import type { RestockSignup } from '@/lib/restock';
import type { Availability } from '@/lib/preorders';
import styles from './admin.module.css';
export default function RestockPanel({ onExpired }: { onExpired: () => void }) {
  const [data, setData] = useState<{ signups: (RestockSignup & { whatsappUrl: string })[]; stock: Availability; received: boolean } | null>(null);
  const [green, setGreen] = useState(100);
  const [cream, setCream] = useState(100);
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
  async function receive(event: React.FormEvent) {
    event.preventDefault();
    if (!window.confirm(`Confirm ${green} green and ${cream} cream hats have physically arrived? Existing pre-orders and payment holds will be allocated first, and only remaining hats will become available to buy.`)) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/restock', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'receive', confirmed: true, green, cream }) });
      if (r.status === 401) { onExpired(); return; }
      const value = await r.json();
      if (!r.ok) throw new Error(value.error || 'Could not receive the batch.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <section>
    <p className={styles.help}>Allocate paid pre-orders first, then notify customers only when stock is available to buy. Opening WhatsApp prepares a message; mark notified only after sending it. Remove anyone who opts out.</p>
    <button className={styles.refresh} onClick={() => void load()}>Refresh restock list</button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {data && <p>{data.stock.localTest ? 'Local test inventory · ' : ''}Green: {data.stock.green} ready / {data.stock.preorder.green} pre-order spaces · Cream: {data.stock.cream} ready / {data.stock.preorder.cream} pre-order spaces</p>}
    {data && !data.received && <details className={styles.login}><summary>Receive the October batch</summary><p>Use only when the hats have physically arrived. This closes pre-orders for the batch and reserves promised hats before making leftovers available.</p><form onSubmit={receive}><label>Green hats received<input type="number" min={0} max={10000} required value={green} onChange={e => setGreen(Number(e.target.value))} /></label><label>Cream hats received<input type="number" min={0} max={10000} required value={cream} onChange={e => setCream(Number(e.target.value))} /></label><button disabled={busy}>Receive batch and allocate pre-orders</button></form></details>}
    {data?.received && <p>The batch has been received and pre-orders allocated. Dispatch paid pre-orders first, in payment order for each colour.</p>}
    {data?.signups.length === 0 && <p>No restock signups yet.</p>}
    {data?.signups.map(row => <article key={row.id} className={styles.login}>
      <h3>{PRODUCT.variants[row.colour].name}</h3><p>+{row.phone} · Requested {new Date(row.createdAt).toLocaleDateString('en-ZA')}</p>
      <p>{row.notifiedAt ? `Marked notified ${new Date(row.notifiedAt).toLocaleDateString('en-ZA')}` : 'Waiting for restock'}</p>
      {data.stock[row.colour] > 0 && !row.notifiedAt ? <a href={row.whatsappUrl} target="_blank" rel="noreferrer">Open WhatsApp message ↗</a> : !row.notifiedAt && <p>Restock message available once this colour is in stock.</p>}
      <div className={styles.orderActions}><button disabled={busy || !!row.notifiedAt || data.stock[row.colour] <= 0} onClick={() => void update(row.id, 'notified')}>Mark notified</button><button disabled={busy} onClick={() => { if (window.confirm('Remove this restock signup and its phone number?')) void update(row.id, 'remove'); }}>Remove / opt out</button></div>
    </article>)}
  </section>;
}
