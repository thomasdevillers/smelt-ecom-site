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
    <span className={styles.eyebrow}>Next batch · {bundle ? 'Your two-hat bundle' : names(options)}</span>
    <h3>{canPreorder ? bundle ? 'Your bundle, next batch.' : 'Worth the wait.' : 'Out of stock. Stay in the loop.'}</h3>
    <p>{timing}</p>
    {canPreorder && <p>{bundle ? 'Reserve both hats using the pre-order button above. Your bundle ships together.' : 'Pre-order using the button above to reserve a hat.'} Pay in full at checkout; paid pre-orders get priority. Cancel before dispatch for a full refund by contacting us.</p>}
    <button type="button" className={styles.notify} onClick={() => setOpen(!open)} aria-expanded={open}>{bundle ? 'WhatsApp me about a restock' : 'WhatsApp me when it’s back'}</button>
    <small>No payment. No reservation. Just a restock message{options.length > 1 ? ' for the colours you choose' : ' for this colour'}.</small>
    {open && <>
      {saved.length > 0 && <p role="status">You’re on the notification list for {names(saved)}. We’ll WhatsApp you when {saved.length > 1 ? 'each colour is' : 'it’s'} available to buy.</p>}
      {!complete && <form onSubmit={submit} className={styles.form}>
        <fieldset disabled={busy}>
          {options.length > 1 && <fieldset className={styles.colours}>
            <legend>Which colours should we notify you about?</legend>
            {options.map(c => <label key={c} className={styles.consent}><input type="checkbox" checked={selected.includes(c)} disabled={saved.includes(c)} onChange={e => setSelected(previous => e.target.checked ? [...previous, c] : previous.filter(value => value !== c))} /><span>{PRODUCT.variants[c].name}{saved.includes(c) ? ' — saved' : ''}</span></label>)}
          </fieldset>}
          <label>WhatsApp number<input type="tel" autoComplete="tel" placeholder="082 123 4567" maxLength={24} required value={phone} readOnly={saved.length > 0} onChange={e => setPhone(e.target.value)} /></label>
          <label className={styles.consent}><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Send me a WhatsApp when {selected.length ? names(selected) : 'my selected colours'} {selected.length > 1 ? 'are' : 'is'} restocked. No other marketing. I can opt out by replying STOP or contacting hello@saunahat.co.za.</span></label>
          <button disabled={busy || selected.length === 0}>{busy ? 'Saving…' : 'Notify me on WhatsApp'}</button>
        </fieldset>
        {status && <p role="alert">{status}</p>}
      </form>}
    </>}
  </aside>;
}
