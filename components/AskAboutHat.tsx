"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  HAT_QUESTION_MAX_LENGTH, HAT_QUESTION_STARTERS, HAT_SOURCES, parseHatAnswer,
  type HatMessage, type HatAnswer,
} from "@/lib/askHatShared";
import { trackHatAssistantEvent } from "@/lib/vercelAnalytics";
import styles from "./AskAboutHat.module.css";

type ChatEntry = HatMessage & Partial<Pick<HatAnswer, "sources" | "needsHuman">>;
class HatRequestError extends Error {}

export default function AskAboutHat() {
  const panelId = useId();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const busy = Boolean(pending);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (open && !busy) inputRef.current?.focus({ preventScroll: true });
  }, [open, busy]);
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages, pending, error, open]);

  async function ask(value: string) {
    const content = value.trim();
    if (!content || content.length > HAT_QUESTION_MAX_LENGTH || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(content);
    setQuestion("");
    setError("");
    const history: HatMessage[] = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    trackHatAssistantEvent("AskHatQuestion");

    try {
      const response = await fetch("/api/ask-hat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...history, { role: "user", content }] }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
      });
      const data = await response.json();
      if (!response.ok) throw new HatRequestError(typeof data.error === "string" ? data.error : "We couldn't get an answer. Please try again.");
      const answer = parseHatAnswer(data);
      if (!answer) throw new HatRequestError("We couldn't read that answer. Please try again.");
      if (controller.signal.aborted) return;
      setMessages(previous => [...previous,
        { role: "user", content },
        { role: "assistant", content: answer.answer, sources: answer.sources, needsHuman: answer.needsHuman },
      ]);
      trackHatAssistantEvent("AskHatAnswered", { needsHuman: answer.needsHuman });
    } catch (failure) {
      if (controller.signal.aborted) return;
      setQuestion(content);
      setError(failure instanceof Error && failure.name === "TimeoutError"
        ? "That took a little too long. Please try again or contact us."
        : failure instanceof HatRequestError
          ? failure.message : "We couldn't connect just now. Please try again or contact us.");
      trackHatAssistantEvent("AskHatError");
    } finally {
      requestRef.current = null;
      if (!controller.signal.aborted) setPending("");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <section className={`${styles.card} ${open ? styles.cardOpen : ""}`} aria-label="Ask about this hat">
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) trackHatAssistantEvent("AskHatOpened");
          setOpen(value => !value);
        }}
      >
        <span className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-3 3V11.5a9 9 0 0 1 18 0Z" />
            <path d="M8 9.5a3 3 0 0 1 6 0c0 2-3 2-3 4M11 16h.01" />
          </svg>
        </span>
        <span className={styles.triggerCopy}>
          <strong>Ask about this hat</strong>
          <span>Fit, care, delivery. Ask away.</span>
        </span>
        <span className={styles.toggle} aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      <div id={panelId} hidden={!open}>
        <div className={styles.panel}>
          <div className={styles.intro}>
            <span className={styles.aiLabel}>Smelt AI assistant</span>
            <p>A little help before you hit the sauna.</p>
          </div>

          {!messages.length && !busy && (
            <div className={styles.starters} aria-label="Suggested questions">
              {HAT_QUESTION_STARTERS.map(starter => (
                <button type="button" key={starter} onClick={() => void ask(starter)}>
                  {starter} <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          )}

          <div ref={threadRef} className={styles.thread} role="log" aria-label="Conversation with Smelt's AI assistant" aria-live="polite" aria-relevant="additions" aria-busy={busy}>
            {messages.map((message, index) => (
              <div key={index} className={message.role === "user" ? styles.question : styles.answer}>
                <span className={styles.speaker}>{message.role === "user" ? "You" : "Smelt AI"}</span>
                <p>{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className={styles.sources} aria-label="Answer references">
                    {message.sources.map(source => (
                      <Link key={source} href={HAT_SOURCES[source].href}>{HAT_SOURCES[source].label} ↗</Link>
                    ))}
                  </div>
                )}
                {message.needsHuman && <Link href="/contact" className={styles.humanLink}>Ask the founders →</Link>}
              </div>
            ))}
            {pending && <div className={styles.question}><span className={styles.speaker}>You</span><p>{pending}</p></div>}
          </div>

          {busy && <p className={styles.loading} role="status"><span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>Thinking about your question…</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}

          <form className={styles.form} onSubmit={submit}>
            <label className={styles.srOnly} htmlFor={inputId}>Your question about the Smelt sauna hat</label>
            <input
              id={inputId}
              ref={inputRef}
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder={messages.length ? "Ask a follow-up…" : "What would you like to know?"}
              maxLength={HAT_QUESTION_MAX_LENGTH}
              disabled={busy}
              autoComplete="off"
            />
            <button type="submit" disabled={busy || !question.trim()} aria-label="Send question">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 12 14 0M13 6l6 6-6 6" /></svg>
            </button>
          </form>

          <div className={styles.footer}>
            <p>AI answers from Smelt&rsquo;s product information. Please keep personal and order details out of this chat.</p>
            <div className={styles.footerActions}>
              <Link href="/contact">Talk to the founders</Link>
              {messages.length > 0 && <button type="button" disabled={busy} onClick={() => { setMessages([]); setQuestion(""); setError(""); inputRef.current?.focus(); }}>New chat</button>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
