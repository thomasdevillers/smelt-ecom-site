"use client";

import Link from "next/link";
import { upload, uploadPresigned } from "@vercel/blob/client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { REVIEW_MAX_PHOTO_BYTES, REVIEW_MAX_PHOTOS, REVIEW_PHOTO_TYPES } from "@/lib/reviews";
import type { Colour } from "@/lib/product";
import styles from "./ReviewForm.module.css";

type Invitation = { valid: boolean; used: boolean; suggestedName?: string; colours?: Colour[]; uploadKey?: string; photoUploadsEnabled?: boolean; photoUploadMode?: "presigned" | "client-token"; error?: string };

async function reencodePhoto(file: File): Promise<File> {
  const image = document.createElement("img");
  const source = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("We could not read this photo.")); image.src = source; });
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, 1600 / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("We could not prepare this photo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .84));
    if (!blob) throw new Error("We could not prepare this photo.");
    if (blob.size > REVIEW_MAX_PHOTO_BYTES) throw new Error("This photo is still larger than 5 MB after resizing.");
    return new File([blob], `${crypto.randomUUID()}.webp`, { type: "image/webp" });
  } finally { URL.revokeObjectURL(source); }
}

export default function ReviewForm({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const previews = useMemo(() => files.map(file => URL.createObjectURL(file)), [files]);

  useEffect(() => () => { previews.forEach(URL.revokeObjectURL); }, [previews]);
  useEffect(() => {
    let live = true;
    fetch(`/api/reviews/invitation?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async response => ({ ok: response.ok, body: await response.json() as Invitation }))
      .then(({ body: result }) => { if (live) { setInvitation(result); setDisplayName(result.suggestedName || ""); } })
      .catch(() => { if (live) setInvitation({ valid: false, used: false, error: "The review form is temporarily unavailable." }); });
    return () => { live = false; };
  }, [token]);

  function chooseFiles(list: FileList | null) {
    setError("");
    const selected = Array.from(list || []);
    if (selected.length > REVIEW_MAX_PHOTOS) return setError(`Choose no more than ${REVIEW_MAX_PHOTOS} photos.`);
    if (selected.some(file => !(REVIEW_PHOTO_TYPES as readonly string[]).includes(file.type))) return setError("Photos must be JPEG, PNG or WebP files.");
    if (selected.some(file => file.size > REVIEW_MAX_PHOTO_BYTES)) return setError("Each original photo must be 5 MB or smaller.");
    setFiles(selected);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!invitation?.uploadKey || busy) return;
    setBusy(true); setError("");
    try {
      const photoUrls: string[] = [];
      for (const file of files) {
        const ready = await reencodePhoto(file);
        const uploadPhoto = invitation.photoUploadMode === "presigned" ? uploadPresigned : upload;
        const blob = await uploadPhoto(`reviews/pending/${invitation.uploadKey}/${ready.name}`, ready, {
          access: "public",
          handleUploadUrl: "/api/reviews/upload",
          clientPayload: JSON.stringify({ token }),
          contentType: "image/webp",
        });
        photoUrls.push(blob.url);
      }
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, rating, body, displayName, anonymous, photoUrls, consent }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We could not submit your review.");
      setDone(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We could not submit your review."); }
    finally { setBusy(false); }
  }

  if (!invitation) return <main className={styles.page}><p className={styles.loading} role="status">Opening your review form…</p></main>;
  if (!invitation.valid || invitation.used) return <main className={styles.page}><section className={styles.message}><span>SMELT / REVIEW</span><h1>{invitation.used ? "Review received." : "This link has cooled off."}</h1><p>{invitation.used ? "This invitation has already been used. Thank you for sharing your experience." : invitation.error || "The review link is invalid or has expired."}</p><Link href="/product">Back to the hat →</Link></section></main>;
  if (done) return <main className={styles.page}><section className={styles.message}><span>WARM REGARDS</span><h1>Thank you.</h1><p>Your review is waiting for a quick moderation check. Once approved, it will appear on the product page.</p><Link href="/product#reviews">Visit the product page →</Link></section></main>;

  return <main className={styles.page}>
    <div className={styles.intro}><span>SMELT / VERIFIED PURCHASE</span><h1>How did we do?</h1><p>Your honest take helps the next person decide what belongs on their head at 90°C.</p></div>
    <form className={styles.form} onSubmit={submit}>
      <fieldset className={styles.rating}><legend>Your rating</legend><div>{[1,2,3,4,5].map(star => <button type="button" key={star} aria-label={`${star} star${star === 1 ? "" : "s"}`} aria-pressed={rating === star} onClick={() => setRating(star)} className={star <= rating ? styles.starOn : ""}>★</button>)}</div></fieldset>
      <label>Tell us about it<textarea required minLength={3} maxLength={1600} rows={7} value={body} onChange={event => setBody(event.target.value)} placeholder="Fit, feel, colour, sauna sessions — whatever mattered to you." /><small>{body.length}/1600</small></label>
      <label>Display name<input required={!anonymous} disabled={anonymous} maxLength={60} value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="First name is perfect" /></label>
      <label className={styles.check}><input type="checkbox" checked={anonymous} onChange={event => setAnonymous(event.target.checked)} />Publish my review anonymously</label>
      {invitation.photoUploadsEnabled ? <div className={styles.upload}><label htmlFor="review-photos">Add up to three photos <span>Optional · JPEG, PNG or WebP · 5 MB each</span></label><input id="review-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => chooseFiles(event.target.files)} />
        {previews.length > 0 && <div className={styles.previews}>{previews.map((source, index) => <div key={source}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source} alt={`Selected review photo ${index + 1}`} />
          <button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={`Remove photo ${index + 1}`}>×</button>
        </div>)}</div>}
      </div> : <p className={styles.privacy}>Photo uploads are temporarily unavailable. You can still submit your written review.</p>}
      <label className={styles.check}><input required type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />I confirm this is my experience and allow Smelt to publish my review, display name and submitted photos. I can request removal later.</label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} disabled={busy || rating === 0 || !consent}>{busy ? files.length ? "Preparing photos and sending…" : "Sending…" : "Submit review →"}</button>
      <p className={styles.privacy}>Your email and order details are used to verify the purchase and are never displayed with your review.</p>
    </form>
  </main>;
}
