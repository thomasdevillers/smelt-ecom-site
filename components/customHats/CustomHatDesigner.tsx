"use client";
/* eslint-disable @next/next/no-img-element -- swatch-book photos and uploaded artwork thumbnails. */
import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { feltColour, SWATCH_BOOK_PHOTOS } from "@/lib/customHats/palette";
import {
  CUSTOM_HAT_FILE_ACCEPT,
  CUSTOM_HAT_FILE_TYPES,
  CUSTOM_HAT_MAX_DESIGNS,
  CUSTOM_HAT_MAX_FILE_BYTES,
  CUSTOM_HAT_MAX_QUANTITY,
  CUSTOM_HAT_TAG_MAX,
  newHatDesign,
  emptyPlacement,
  totalHats,
  type CustomHatContact,
  type CustomHatInvite,
  type HatDesign,
  type LogoPlacement,
  type LogoSide,
} from "@/lib/customHats/shared";
import FeltPicker from "./FeltPicker";
import HatPreview from "./HatPreview";
import { prepareLogoFile } from "./prepareLogo";
import styles from "./CustomHat.module.css";

const BLANK_HEX = "#d9d2c3";
const uid = () => crypto.randomUUID().slice(0, 8);
const isImage = (type: string | null) => !!type && type.startsWith("image/");
const SIDE_COPY: Record<LogoSide, { title: string; detail: string }> = {
  front: {
    title: "Logo on the front",
    detail: "Embroidered on the front panel, where Smelt sits on ours.",
  },
  back: { title: "Logo on the back", detail: "A second mark on the back, just above the brim." },
};
const UPLOAD_ACCEPT = `${CUSTOM_HAT_FILE_ACCEPT},image/heic,image/heif,.heic,.heif`;

interface Draft {
  savedAt: string;
  contact: CustomHatContact;
  hats: HatDesign[];
  notes: string;
}

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export default function CustomHatDesigner({ token }: { token: string }) {
  const [invite, setInvite] = useState<CustomHatInvite | null>(null);
  const [contact, setContact] = useState<CustomHatContact>({
    name: "",
    company: "",
    email: "",
    phone: "",
  });
  const [hats, setHats] = useState<HatDesign[]>([]);
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(0);
  const [localFiles, setLocalFiles] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<{ at: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [showReceived, setShowReceived] = useState(false);
  const [book, setBook] = useState(false);
  const objectUrls = useRef<string[]>([]);
  const draftKey = `smelt:custom-hats:${token}`;

  useEffect(() => {
    let live = true;
    fetch(`/api/custom-hats/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => (await response.json()) as CustomHatInvite)
      .then((result) => {
        if (!live) return;
        setInvite(result);
        if (!result.valid) return;
        const customer = result.customer!;
        const saved = result.submission;
        const draft = readDraft(draftKey);
        const useDraft =
          draft &&
          draft.hats?.length &&
          (!result.submittedAt || draft.savedAt > result.submittedAt);
        setContact(
          useDraft
            ? draft.contact
            : saved?.contact || {
                name: customer.name,
                company: "",
                email: customer.email,
                phone: customer.phone,
              },
        );
        setHats(useDraft ? draft.hats : saved?.hats.length ? saved.hats : [newHatDesign(uid())]);
        setNotes(useDraft ? draft.notes : saved?.notes || "");
        setSubmittedAt(result.submittedAt || null);
        setShowReceived(!!result.submittedAt && !useDraft);
      })
      .catch(() => {
        if (live)
          setInvite({
            valid: false,
            error: "The design page is temporarily unavailable. Please refresh in a moment.",
          });
      });
    return () => {
      live = false;
    };
  }, [token, draftKey]);

  // Keep an in-progress draft in this browser so a closed tab loses nothing.
  useEffect(() => {
    if (!hats.length || showReceived) return;
    const draft: Draft = { savedAt: new Date().toISOString(), contact, hats, notes };
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      /* storage unavailable */
    }
  }, [contact, hats, notes, draftKey, showReceived]);

  useEffect(
    () => () => {
      objectUrls.current.forEach(URL.revokeObjectURL);
    },
    [],
  );

  const hat = hats[Math.min(active, hats.length - 1)];
  const fileSrc = (placement: LogoPlacement) =>
    placement.fileKey && isImage(placement.fileType)
      ? localFiles[placement.fileKey] || invite?.files?.[placement.fileKey] || null
      : null;

  function updateHat(id: string, change: (hat: HatDesign) => HatDesign) {
    setHats((current) => current.map((h) => (h.id === id ? change(h) : h)));
  }
  function updatePlacement(id: string, side: LogoSide, patch: Partial<LogoPlacement>) {
    updateHat(id, (h) => ({ ...h, [side]: { ...h[side], ...patch } }));
  }
  function addHat() {
    if (hats.length >= CUSTOM_HAT_MAX_DESIGNS) return;
    setHats((current) => [...current, newHatDesign(uid())]);
    setActive(hats.length);
    setError("");
  }
  function duplicateHat(source: HatDesign) {
    if (hats.length >= CUSTOM_HAT_MAX_DESIGNS) return;
    const index = hats.findIndex((h) => h.id === source.id);
    setHats((current) => [
      ...current.slice(0, index + 1),
      { ...structuredClone(source), id: uid() },
      ...current.slice(index + 1),
    ]);
    setActive(index + 1);
  }
  function removeHat(id: string) {
    if (hats.length <= 1) return;
    const index = hats.findIndex((h) => h.id === id);
    setHats((current) => current.filter((h) => h.id !== id));
    setActive(Math.max(0, index - 1));
  }

  async function uploadLogo(id: string, side: LogoSide, original: File | undefined) {
    if (!original) return;
    const at = `${id}:${side}`;
    setUploadError(null);
    setUploading(at);
    try {
      // Same approach as review photos: phone photos (HEIC, oversized or
      // unlabelled files) are redrawn in the browser and saved as WebP/JPEG
      // with a content type that matches the bytes.
      const file = await prepareLogoFile(original);
      if (!(file.type in CUSTOM_HAT_FILE_TYPES))
        throw new Error("Logos must be PNG, JPEG, WebP, SVG or PDF files.");
      if (file.size > CUSTOM_HAT_MAX_FILE_BYTES)
        throw new Error("That file is over 15 MB. Try a smaller export.");
      const response = await fetch(`/api/custom-hats/${encodeURIComponent(token)}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      const grant = (await response.json()) as {
        key?: string;
        url?: string;
        headers?: Record<string, string>;
        error?: string;
      };
      if (!response.ok || !grant.key || !grant.url)
        throw new Error(grant.error || "Could not start the upload.");
      let put: Response;
      try {
        put = await fetch(grant.url, { method: "PUT", headers: grant.headers, body: file });
      } catch {
        throw new Error(
          "We couldn’t reach our file storage. Please try again, or describe the logo in the notes and we’ll ask for the file.",
        );
      }
      if (!put.ok) throw new Error("The upload did not finish. Please try again.");
      if (isImage(file.type)) {
        const src = URL.createObjectURL(file);
        objectUrls.current.push(src);
        setLocalFiles((current) => ({ ...current, [grant.key!]: src }));
      }
      updatePlacement(id, side, {
        enabled: true,
        fileKey: grant.key,
        fileName: file.name,
        fileType: file.type,
      });
    } catch (caught) {
      setUploadError({
        at,
        message: caught instanceof Error ? caught.message : "Could not upload this file.",
      });
    } finally {
      setUploading(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const missing = hats.findIndex((h) => !feltColour(h.colour));
    if (missing >= 0) {
      setActive(missing);
      setError(`Hat ${missing + 1} still needs a felt colour.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/custom-hats/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact, notes, hats }),
      });
      const result = (await response.json()) as { submittedAt?: string; error?: string };
      if (!response.ok) {
        const match = result.error?.match(/^Hat (\d+):/);
        if (match) setActive(Number(match[1]) - 1);
        throw new Error(result.error || "Could not send your designs.");
      }
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* storage unavailable */
      }
      setSubmittedAt(result.submittedAt || new Date().toISOString());
      setShowReceived(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send your designs.");
    } finally {
      setBusy(false);
    }
  }

  if (!invite)
    return (
      <main className={styles.page}>
        <p className={styles.loading} role="status">
          Warming up the workshop…
        </p>
      </main>
    );
  if (!invite.valid)
    return (
      <main className={styles.page}>
        <section className={styles.message}>
          <span>SMELT / CUSTOM HATS</span>
          <h1>This link has cooled off.</h1>
          <p>{invite.error}</p>
          <Link href="/">Visit Smelt →</Link>
        </section>
      </main>
    );

  const firstName = (invite.customer?.name || contact.name).split(/\s+/)[0];
  const swatchBook = book && (
    <div
      className={styles.bookBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Swatch book photos"
      onClick={() => setBook(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setBook(false);
      }}
    >
      <div className={styles.book} onClick={(e) => e.stopPropagation()}>
        <div className={styles.bookHead}>
          <strong>The swatch book</strong>
          <button type="button" autoFocus onClick={() => setBook(false)} aria-label="Close">
            ✕
          </button>
        </div>
        <p>Straight from our felt supplier. Every code in the picker matches a swatch here.</p>
        <div className={styles.bookPages}>
          {SWATCH_BOOK_PHOTOS.map((src, i) => (
            <img key={src} src={src} alt={`Swatch book page ${i + 1}`} loading="lazy" />
          ))}
        </div>
      </div>
    </div>
  );

  if (showReceived)
    return (
      <main className={styles.page}>
        <section className={styles.message}>
          <span>SMELT / CUSTOM HATS</span>
          <h1>Designs received.</h1>
          <p>
            Thanks {firstName}. We&rsquo;ll go through your{" "}
            {hats.length === 1 ? "hat" : `${hats.length} hats`} and logo files, design the mock-ups
            ourselves and send them to you{contact.email ? ` at ${contact.email}` : ""} with a
            quote. If we need a better file or more detail, we&rsquo;ll ask.
          </p>
          {submittedAt && (
            <p className={styles.hint}>
              Sent{" "}
              {new Intl.DateTimeFormat("en-ZA", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Africa/Johannesburg",
              }).format(new Date(submittedAt))}
              . You can still make changes with this link.
            </p>
          )}
        </section>
        <div className={styles.receivedGrid}>
          {hats.map((h, i) => {
            const colour = feltColour(h.colour);
            return (
              <article key={h.id} className={styles.receivedCard}>
                <HatPreview size="small" hex={colour?.hex || BLANK_HEX} />
                <div>
                  <strong>
                    Hat {i + 1} · {h.quantity}×
                  </strong>
                  <span>{colour ? `${colour.name} · ${colour.code}` : "No colour"}</span>
                  <span>
                    {[
                      h.front.enabled && "Front logo",
                      h.back.enabled && "Back logo",
                      h.tag.enabled && `Tag “${h.tag.text}”`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Plain felt"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => setShowReceived(false)}
        >
          Make changes
        </button>
      </main>
    );

  const colour = feltColour(hat.colour);
  const totals = totalHats({ contact, notes, hats });
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <span>SMELT / CUSTOM HATS</span>
        <h1>
          Make it <em>yours</em>.
        </h1>
        <p>
          Hi {firstName}. Pick a felt colour, tell us where your logo goes and what the tag should
          say, and send us your files. Add as many hats as you like. You don&rsquo;t need to design
          anything: once we have everything, we&rsquo;ll make the mock-ups and send them to you to
          approve.
        </p>
      </header>

      <form onSubmit={submit} className={styles.form}>
        <section className={styles.card} aria-labelledby="contact-heading">
          <h2 id="contact-heading">Your details</h2>
          <div className={styles.contactGrid}>
            <label>
              Name
              <input
                required
                maxLength={120}
                autoComplete="name"
                value={contact.name}
                onChange={(e) => setContact({ ...contact, name: e.target.value })}
              />
            </label>
            <label>
              <span>
                Business <small>Optional</small>
              </span>
              <input
                maxLength={160}
                autoComplete="organization"
                value={contact.company}
                onChange={(e) => setContact({ ...contact, company: e.target.value })}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                maxLength={200}
                autoComplete="email"
                value={contact.email}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                maxLength={40}
                autoComplete="tel"
                value={contact.phone}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              />
            </label>
          </div>
          <p className={styles.hint}>
            An email or phone number is enough. We only use these to talk about this order.
          </p>
        </section>

        <nav className={styles.hatTabs} aria-label="Your hat designs">
          {hats.map((h, i) => {
            const c = feltColour(h.colour);
            return (
              <button
                type="button"
                key={h.id}
                aria-current={i === active ? "true" : undefined}
                onClick={() => setActive(i)}
              >
                <HatPreview size="small" hex={c?.hex || BLANK_HEX} />
                <span>
                  <strong>Hat {i + 1}</strong>
                  {c ? `${c.name} · ${h.quantity}×` : "Choose a colour"}
                </span>
              </button>
            );
          })}
          {hats.length < CUSTOM_HAT_MAX_DESIGNS && (
            <button type="button" className={styles.addHat} onClick={addHat}>
              <b>+</b>
              <span>Add another hat</span>
            </button>
          )}
        </nav>

        <section className={styles.designer} aria-label={`Hat ${active + 1}`}>
          <div className={styles.stage}>
            <HatPreview hex={colour?.hex || BLANK_HEX} />
            <p className={styles.stageCaption}>
              {colour ? (
                <>
                  {colour.name} <span>{colour.code}</span>
                </>
              ) : (
                "Pick a felt to see it here"
              )}
            </p>
            <p className={styles.stageNote}>
              Colour preview only. We&rsquo;ll place your logo and tag in the mock-up we design for
              you.
            </p>
          </div>

          <div className={styles.options}>
            <div className={styles.hatHead}>
              <h2>Hat {active + 1}</h2>
              <div className={styles.hatActions}>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => duplicateHat(hat)}
                  disabled={hats.length >= CUSTOM_HAT_MAX_DESIGNS}
                >
                  Duplicate
                </button>
                {hats.length > 1 && (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => removeHat(hat.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className={styles.quantity}>
              <label htmlFor={`qty-${hat.id}`}>How many?</label>
              <div>
                <button
                  type="button"
                  aria-label="Fewer"
                  onClick={() =>
                    updateHat(hat.id, (h) => ({ ...h, quantity: Math.max(1, h.quantity - 1) }))
                  }
                >
                  −
                </button>
                <input
                  id={`qty-${hat.id}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={CUSTOM_HAT_MAX_QUANTITY}
                  required
                  value={hat.quantity || ""}
                  onChange={(e) =>
                    updateHat(hat.id, (h) => ({
                      ...h,
                      quantity: Math.min(
                        CUSTOM_HAT_MAX_QUANTITY,
                        Math.max(0, Math.floor(Number(e.target.value) || 0)),
                      ),
                    }))
                  }
                />
                <button
                  type="button"
                  aria-label="More"
                  onClick={() =>
                    updateHat(hat.id, (h) => ({
                      ...h,
                      quantity: Math.min(CUSTOM_HAT_MAX_QUANTITY, h.quantity + 1),
                    }))
                  }
                >
                  +
                </button>
              </div>
            </div>

            <FeltPicker
              idPrefix={hat.id}
              value={hat.colour}
              onChange={(code) => {
                updateHat(hat.id, (h) => ({ ...h, colour: code }));
                setError("");
              }}
              onShowBook={() => setBook(true)}
            />

            <fieldset className={styles.group}>
              <legend className={styles.stepLabel}>
                <b>2</b>Logos
              </legend>
              <p className={styles.hint}>
                Send whatever you have. A vector file (SVG or PDF) is best, but a clear PNG or photo
                works too. We&rsquo;ll prepare it for embroidery and show you the result before
                anything is made.
              </p>
              {(["front", "back"] as const).map((side) => (
                <LogoOption
                  key={side}
                  side={side}
                  placement={hat[side]}
                  previewSrc={fileSrc(hat[side])}
                  uploading={uploading === `${hat.id}:${side}`}
                  error={uploadError?.at === `${hat.id}:${side}` ? uploadError.message : ""}
                  uploadsEnabled={!!invite.uploadsEnabled}
                  onToggle={(enabled) =>
                    updatePlacement(hat.id, side, enabled ? { enabled } : emptyPlacement())
                  }
                  onFile={(file) => void uploadLogo(hat.id, side, file)}
                  onClear={() =>
                    updatePlacement(hat.id, side, { fileKey: null, fileName: null, fileType: null })
                  }
                  onNotes={(value) => updatePlacement(hat.id, side, { notes: value })}
                />
              ))}
            </fieldset>

            <fieldset className={styles.group}>
              <legend className={styles.stepLabel}>
                <b>3</b>Tag
              </legend>
              <label className={`${styles.option} ${hat.tag.enabled ? styles.optionOn : ""}`}>
                <input
                  type="checkbox"
                  className={styles.switch}
                  checked={hat.tag.enabled}
                  onChange={(e) =>
                    updateHat(hat.id, (h) => ({
                      ...h,
                      tag: { enabled: e.target.checked, text: e.target.checked ? h.tag.text : "" },
                    }))
                  }
                />
                <span>
                  <strong>Add a small tag</strong>
                  <small>
                    A little woven label stitched into the brim, like our &ldquo;Cape Town
                    SA&rdquo;.
                  </small>
                </span>
              </label>
              {hat.tag.enabled && (
                <label className={styles.tagField}>
                  Tag text
                  <input
                    maxLength={CUSTOM_HAT_TAG_MAX}
                    required
                    placeholder="e.g. Est. 2024"
                    value={hat.tag.text}
                    onChange={(e) =>
                      updateHat(hat.id, (h) => ({
                        ...h,
                        tag: { enabled: true, text: e.target.value },
                      }))
                    }
                  />
                  <small>
                    {hat.tag.text.length}/{CUSTOM_HAT_TAG_MAX}
                  </small>
                </label>
              )}
            </fieldset>

            <label className={styles.notesField}>
              <span>
                Anything else about this hat? <small>Optional</small>
              </span>
              <textarea
                rows={3}
                maxLength={600}
                placeholder="Thread colours, sizing, a deadline…"
                value={hat.notes}
                onChange={(e) => updateHat(hat.id, (h) => ({ ...h, notes: e.target.value }))}
              />
            </label>
          </div>
        </section>

        <section className={`${styles.card} ${styles.sendCard}`} aria-labelledby="send-heading">
          <h2 id="send-heading">Ready to send?</h2>
          <ol className={styles.summaryList}>
            {hats.map((h, i) => {
              const c = feltColour(h.colour);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => {
                      setActive(i);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Hat {i + 1}
                  </button>
                  <span
                    className={styles.summaryDot}
                    style={{ background: c?.hex || "transparent" }}
                  />
                  {c ? c.name : <em>No colour yet</em>}
                  <span>
                    {[
                      h.front.enabled && "front logo",
                      h.back.enabled && "back logo",
                      h.tag.enabled && "tag",
                    ]
                      .filter(Boolean)
                      .join(", ") || "plain"}
                  </span>
                  <strong>{h.quantity}×</strong>
                </li>
              );
            })}
          </ol>
          <label className={styles.notesField}>
            <span>
              Notes for the whole order <small>Optional</small>
            </span>
            <textarea
              rows={3}
              maxLength={2000}
              placeholder="Delivery date, event, packaging…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button className={styles.submit} disabled={busy || !!uploading}>
            {busy
              ? "Sending…"
              : uploading
                ? "Waiting for upload…"
                : `Send ${hats.length === 1 ? "my design" : `${hats.length} designs`} · ${totals} hats →`}
          </button>
          <p className={styles.hint}>
            {submittedAt
              ? "Sending again replaces your previous designs."
              : "No payment now. We’ll design your mock-ups and confirm everything with you first."}
          </p>
        </section>
      </form>
      {swatchBook}
    </main>
  );
}

function LogoOption({
  side,
  placement,
  previewSrc,
  uploading,
  error,
  uploadsEnabled,
  onToggle,
  onFile,
  onClear,
  onNotes,
}: {
  side: LogoSide;
  placement: LogoPlacement;
  previewSrc: string | null;
  uploading: boolean;
  error: string;
  uploadsEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onFile: (file: File | undefined) => void;
  onClear: () => void;
  onNotes: (value: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputId = `logo-${side}-${placement.fileKey || "new"}`;
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!uploading) onFile(event.dataTransfer.files[0]);
  };
  return (
    <div className={`${styles.option} ${placement.enabled ? styles.optionOn : ""}`}>
      <label className={styles.optionToggle}>
        <input
          type="checkbox"
          className={styles.switch}
          checked={placement.enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>
          <strong>{SIDE_COPY[side].title}</strong>
          <small>{SIDE_COPY[side].detail}</small>
        </span>
      </label>
      {placement.enabled && (
        <div className={styles.logoBody}>
          {placement.fileKey ? (
            <div className={styles.logoFile}>
              <div className={styles.logoThumb}>
                {previewSrc ? (
                  <img src={previewSrc} alt="" />
                ) : (
                  <span>{placement.fileType === "application/pdf" ? "PDF" : "FILE"}</span>
                )}
              </div>
              <span>{placement.fileName}</span>
              <label className={styles.textButton}>
                Replace
                <input
                  type="file"
                  hidden
                  accept={UPLOAD_ACCEPT}
                  disabled={uploading}
                  onChange={(e) => {
                    onFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <button type="button" className={styles.textButton} onClick={onClear}>
                Remove
              </button>
            </div>
          ) : uploadsEnabled ? (
            <label
              htmlFor={inputId}
              className={`${styles.dropzone} ${dragging ? styles.dropzoneOn : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
            >
              <strong>{uploading ? "Uploading…" : "Upload your logo"}</strong>
              <span>
                Drop a file or tap to choose · SVG, PDF, PNG, JPEG or a photo · up to 15 MB
              </span>
              <input
                id={inputId}
                type="file"
                hidden
                accept={UPLOAD_ACCEPT}
                disabled={uploading}
                onChange={(e) => {
                  onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          ) : (
            <p className={styles.hint}>
              Uploads are unavailable right now. Describe the logo below and we&rsquo;ll ask for the
              file.
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <label className={styles.inlineField}>
            <span>
              Notes <small>Optional</small>
            </span>
            <input
              maxLength={600}
              placeholder={
                placement.fileKey
                  ? "Thread colour, size…"
                  : "Describe the logo if you have no file yet"
              }
              value={placement.notes}
              onChange={(e) => onNotes(e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
