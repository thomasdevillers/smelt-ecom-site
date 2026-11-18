"use client";
/* eslint-disable @next/next/no-img-element -- artwork is served from short-lived signed R2 URLs. */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { feltColour, feltTile } from "@/lib/customHats/palette";
import { totalHats, type AdminCustomHatRequest, type LogoPlacement } from "@/lib/customHats/shared";
import { customHatWhatsAppUrl } from "@/lib/whatsapp";
import styles from "./admin.module.css";
import own from "./CustomHatsPanel.module.css";

const date = (value: string) => new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" }).format(new Date(value));

function LinkActions({ url, name, phone, email, onCopied }: { url: string; name: string; phone: string; email: string; onCopied: (message: string) => void }) {
  const whatsapp = phone ? customHatWhatsAppUrl({ phone, customerName: name, designUrl: url }) : null;
  const first = name.split(/\s+/)[0] || "there";
  const mail = email ? `mailto:${email}?${new URLSearchParams({ subject: "Design your custom Smelt hats", body: `Hi ${first},\n\nHere's your personal link to design your custom Smelt hats:\n${url}\n\nPick a felt colour, add your logo front or back, and put your own words on the tag. Add as many designs as you like, then hit send.\n\nTom & Marc` }).toString().replace(/\+/g, "%20")}` : null;
  return <div className={own.linkActions}>
    <input aria-label={`Design link for ${name}`} readOnly value={url} onFocus={e => e.currentTarget.select()} />
    <button type="button" className={styles.secondary} onClick={() => void navigator.clipboard.writeText(url).then(() => onCopied("Link copied."), () => onCopied("Select and copy the link manually."))}>Copy</button>
    {whatsapp && <a className={styles.whatsappLink} href={whatsapp} target="_blank" rel="noreferrer">WhatsApp ↗</a>}
    {mail && <a className={`${own.mailLink}`} href={mail}>Email ↗</a>}
  </div>;
}

function Artwork({ label, placement, files }: { label: string; placement: LogoPlacement; files: Record<string, string> }) {
  if (!placement.enabled) return null;
  const src = placement.fileKey ? files[placement.fileKey] : null;
  return <div className={own.artwork}>
    <span>{label}</span>
    {placement.fileKey ? src ? <a href={src} target="_blank" rel="noreferrer" title={`Open ${placement.fileName || "logo"}`}>
      {placement.fileType?.startsWith("image/") ? <img src={src} alt={`${label} artwork`} /> : <b>PDF</b>}
      <small>{placement.fileName}</small>
    </a> : <small>File unavailable (check R2 settings)</small> : <small>No file. See notes.</small>}
    {placement.notes && <p>{placement.notes}</p>}
  </div>;
}

export default function CustomHatsPanel({ onExpired }: { onExpired: () => void }) {
  const [requests, setRequests] = useState<AdminCustomHatRequest[] | null>(null);
  const [uploadsEnabled, setUploadsEnabled] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [created, setCreated] = useState<{ url: string; name: string; email: string; phone: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const request = useCallback(async (init?: RequestInit) => {
    const response = await fetch("/api/admin/custom-hats", { ...init, cache: "no-store", headers: { "Content-Type": "application/json" } });
    if (response.status === 401) { onExpired(); throw new Error("Please sign in again."); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load custom hat requests.");
    return result;
  }, [onExpired]);
  const load = useCallback(async () => {
    try { const result = await request(); setRequests(result.requests); setUploadsEnabled(result.uploadsEnabled); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load custom hat requests."); }
  }, [request]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = await request({ method: "POST", body: JSON.stringify({ name, email, phone }) });
      setCreated({ url: result.url, name: name.trim(), email: email.trim(), phone: phone.trim() });
      try { await navigator.clipboard.writeText(result.url); setMessage("Link created and copied."); } catch { setMessage("Link created. Copy it below."); }
      setName(""); setEmail(""); setPhone("");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create the link."); }
    finally { setBusy(false); }
  }
  async function remove(item: AdminCustomHatRequest) {
    if (!window.confirm(`Delete ${item.customer.name}'s design link${item.submission ? ", their submitted designs and uploaded logos" : ""}? The link will stop working.`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await request({ method: "DELETE", body: JSON.stringify({ id: item.id }) }); setMessage("Request deleted."); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete the request."); }
    finally { setBusy(false); }
  }

  const submitted = requests?.filter(r => r.submission).length ?? 0;
  return <section aria-label="Custom hat requests">
    <form className={styles.couponForm} onSubmit={create}>
      <label>Customer name<input required maxLength={120} autoComplete="off" placeholder="Jane at Hot Rocks Sauna" value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label>
      <label>Email (optional)<input type="email" maxLength={200} autoComplete="off" placeholder="jane@example.com" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>
      <label>Phone (optional)<input type="tel" maxLength={40} autoComplete="off" placeholder="082 123 4567" value={phone} onChange={e => setPhone(e.target.value)} disabled={busy} /></label>
      <button disabled={busy}>{busy ? "Creating…" : "Create design link"}</button>
    </form>
    {created && <div className={own.created}>
      <p><strong>Link for {created.name}</strong> · It opens a design page with their details filled in.</p>
      <LinkActions url={created.url} name={created.name} phone={created.phone} email={created.email} onCopied={setMessage} />
    </div>}
    {!uploadsEnabled && <p className={styles.notice}>Logo uploads are off: the R2 settings are missing on this deployment. Customers can still describe their logos.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.note} role="status">{message}</p>}
    <div className={styles.conversationToolbar}>
      <p className={styles.help}>{requests ? `${requests.length} link${requests.length === 1 ? "" : "s"} · ${submitted} with designs.` : ""} Customers can resend from the same link; the latest version shows here.</p>
      <button className={styles.refresh} disabled={busy} onClick={() => void load()}>Refresh ↻</button>
    </div>
    {requests === null ? !error && <p role="status">Loading requests…</p> : !requests.length ? <p>No design links yet. Create one above.</p> : <div className={own.list}>
      {requests.map(item => {
        const s = item.submission;
        return <article key={item.id} className={own.request}>
          <header className={own.requestHead}>
            <div>
              <h2>{s?.contact.company || item.customer.name}</h2>
              <p>{[s?.contact.company ? s.contact.name : null, s?.contact.email || item.customer.email, s?.contact.phone || item.customer.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
            </div>
            <span className={`${own.status} ${s ? own.statusIn : ""}`}>{s ? `Designs in${item.revision > 1 ? ` · v${item.revision}` : ""}` : "Awaiting designs"}</span>
          </header>
          <p className={styles.date}>Link created {date(item.createdAt)}{item.submittedAt ? ` · Sent ${date(item.submittedAt)}` : ""}</p>
          {s && <>
            <div className={own.totals}><strong>{totalHats(s)}</strong> hats across {s.hats.length} design{s.hats.length === 1 ? "" : "s"}</div>
            <div className={own.designs}>{s.hats.map((hat, index) => {
              const colour = feltColour(hat.colour);
              return <div key={hat.id} className={own.design}>
                <div className={own.felt}>
                  {colour && <img src={feltTile(colour.code)} alt="" />}
                  <div><strong>Hat {index + 1} · {hat.quantity}×</strong><span>{colour ? `${colour.name} · ${colour.code}` : hat.colour}</span></div>
                </div>
                <div className={own.artworks}>
                  <Artwork label="Front" placement={hat.front} files={item.files} />
                  <Artwork label="Back" placement={hat.back} files={item.files} />
                  {hat.tag.enabled && <div className={own.artwork}><span>Tag</span><b className={own.tagText}>{hat.tag.text}</b></div>}
                  {!hat.front.enabled && !hat.back.enabled && !hat.tag.enabled && <p className={styles.note}>Plain felt, no branding.</p>}
                </div>
                {hat.notes && <p className={own.notes}>{hat.notes}</p>}
              </div>;
            })}</div>
            {s.notes && <p className={own.notes}><strong>Order notes:</strong> {s.notes}</p>}
          </>}
          <details className={own.linkDetails}><summary>Share link</summary>
            <LinkActions url={item.url} name={item.customer.name} phone={s?.contact.phone || item.customer.phone} email={s?.contact.email || item.customer.email} onCopied={setMessage} />
          </details>
          <button type="button" className={`${styles.secondary} ${own.delete}`} disabled={busy} onClick={() => void remove(item)}>Delete</button>
        </article>;
      })}
    </div>}
  </section>;
}
