'use client';
import { useState } from 'react';
import { PRODUCT, type Colour } from '@/lib/product';
import styles from './RestockChoice.module.css';

type Props = { timing: string; canPreorder: boolean } & (
  { colour: Colour; colours?: never; bundle?: false } |
  { colour?: never; colours: Colour[]; bundle: true }
);

export default function RestockChoice({ colour, colours, bundle, timing, canPreorder }: Props) {
  const options = colours ?? [colour!];
  const [selected, setSelected] = useState<Colour[]>(options);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState('');
  const [saved, setSaved] = useState<Colour[]>([]);
  const [busy, setBusy] = useState(false);
  const complete = selected.length > 0 && selected.every(c => saved.includes(c));
  const names = (values: Colour[]) => values.map(c => PRODUCT.variants[c].name).join(' and ');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected.length || !consent || busy) return;
    setBusy(true); setStatus('');
    const pending = selected.filter(c => !saved.includes(c));
    const results = await Promise.allSettled(pending.map(async c => {
      const response = await fetch('/api/restock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ colour: c, phone, consent }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save your request. Please try again.');
      return c;
    }));
    const added = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    setSaved(previous => [...previous, ...added]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') setStatus(failure.reason instanceof Error ? failure.reason.message : 'Could not save your request. Please try again.');
    else setPhone('');
    setBusy(false);
  }

  return <aside className={styles.choice}>
    <span className={styles.eyebrow}>{bundle ? 'Two-hat bundle' : names(options)}</span>
    <h3>{canPreorder ? 'Pre-order or get notified' : 'Get a restock alert'}</h3>
    <p>{timing}</p>
    {canPreorder && <p>Pay now to reserve. Cancel before dispatch for a full refund.</p>}
    <button type="button" className={styles.notify} onClick={() => setOpen(!open)} aria-expanded={open}>WhatsApp me when restocked</button>
    <small>Free restock alert. No reservation.</small>
    {open && <>
      {saved.length > 0 && <p role="status">We’ll WhatsApp you when {names(saved)} {saved.length > 1 ? 'are' : 'is'} back.</p>}
      {!complete && <form onSubmit={submit} className={styles.form}>
        <fieldset disabled={busy}>
          {options.length > 1 && <fieldset className={styles.colours}>
            <legend>Choose colours</legend>
            {options.map(c => <label key={c} className={styles.consent}><input type="checkbox" checked={selected.includes(c)} disabled={saved.includes(c)} onChange={e => setSelected(previous => e.target.checked ? [...previous, c] : previous.filter(value => value !== c))} /><span>{PRODUCT.variants[c].name}{saved.includes(c) ? ' — saved' : ''}</span></label>)}
          </fieldset>}
          <label>WhatsApp number<input type="tel" autoComplete="tel" placeholder="082 123 4567" maxLength={24} required value={phone} readOnly={saved.length > 0} onChange={e => setPhone(e.target.value)} /></label>
          <label className={styles.consent}><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} /><span>WhatsApp me about this restock only. Reply STOP to opt out.</span></label>
          <button disabled={busy || selected.length === 0}>{busy ? 'Saving…' : 'Notify me on WhatsApp'}</button>
        </fieldset>
        {status && <p role="alert">{status}</p>}
      </form>}
    </>}
  </aside>;
}
