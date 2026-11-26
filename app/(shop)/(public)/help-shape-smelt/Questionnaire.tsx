"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasAnswer,
  questionsFor,
  SURVEY_VERSION,
  toggleOption,
  validateSave,
  type ResearchSave,
} from "@/lib/research/shared";
import styles from "./research.module.css";
import { emailEntryAnswer } from "@/lib/research/emailEntry";

const STORAGE_KEY = "smelt:product-research:v1";
type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
export default function Questionnaire() {
  const [draft, setDraft] = useState<ResearchSave | null>(null);
  const latest = useRef<ResearchSave | null>(null);
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [savedRevision, setSavedRevision] = useState(0);
  const acknowledged = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retries = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  // Email selections are only suggestions until the visitor interacts with the form.
  const unconfirmedEmailAnswer = useRef(false);

  const persist = useCallback((next: ResearchSave) => {
    latest.current = next;
    setDraft(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setStorageWarning(true);
    }
  }, []);

  const flush = useCallback(async function saveLatest() {
    clearTimeout(timer.current);
    if (
      unconfirmedEmailAnswer.current ||
      inFlight.current ||
      !latest.current ||
      latest.current.revision <= acknowledged.current
    )
      return;
    inFlight.current = true;
    if (mounted.current) {
      setStatus("saving");
      setError("");
    }
    try {
      while (latest.current && latest.current.revision > acknowledged.current) {
        const sent = latest.current;
        const response = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sent),
          keepalive: true,
          signal: AbortSignal.timeout(15_000),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "We couldn’t save your answers. Please retry.");
        if (result.revision !== sent.revision)
          throw new Error(
            "A newer response was saved in another tab. Please reload this page before continuing.",
          );
        acknowledged.current = sent.revision;
        retries.current = 0;
        if (mounted.current) setSavedRevision(sent.revision);
      }
      if (mounted.current) setStatus("saved");
    } catch (caught) {
      if (mounted.current) {
        setStatus("error");
        setError(
          caught instanceof Error ? caught.message : "We couldn’t save your answers. Please retry.",
        );
        timer.current = setTimeout(
          () => void saveLatest(),
          Math.min(30_000, 2000 * 2 ** retries.current++),
        );
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => {
      if (!mounted.current) return;
      let restored: ResearchSave | null = null;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) restored = validateSave(JSON.parse(stored));
      } catch {
        /* An old or invalid local draft must not prevent a fresh start. */
      }
      const emailAnswer = emailEntryAnswer(new URLSearchParams(window.location.search));
      if (emailAnswer && !restored?.completed) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const initial = restored || {
          token: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
          version: SURVEY_VERSION,
          revision: 0,
          answers: {},
          completed: false,
        };
        const preselected = { ...initial, answers: { ...initial.answers, frequency: emailAnswer } };
        unconfirmedEmailAnswer.current = true;
        latest.current = preselected;
        setDraft(preselected);
        setStarted(true);
        setStep(0);
        return;
      }
      if (restored) {
        latest.current = restored;
        setDraft(restored);
        setStarted(true);
        const questions = questionsFor(restored.answers);
        const unanswered = questions.findIndex((q) => !hasAnswer(restored!.answers[q.id]));
        setStep(restored.completed ? questions.length - 1 : Math.max(0, unanswered));
        void flush();
      } else {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        const initial = {
          token,
          version: SURVEY_VERSION,
          revision: 0,
          answers: {},
          completed: false,
        };
        latest.current = initial;
        setDraft(initial);
      }
    });
    const onHidden = () => {
      if (document.visibilityState !== "hidden") return;
      const pending = latest.current;
      if (!unconfirmedEmailAnswer.current && pending && pending.revision > acknowledged.current) {
        // A final best-effort send includes the latest typing, even if another save is in flight.
        void fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending),
          keepalive: true,
        }).catch(() => {});
      }
    };
    const onOnline = () => void flush();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("online", onOnline);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("online", onOnline);
    };
  }, [flush]);

  useEffect(() => {
    if (started) heading.current?.focus();
  }, [step, started]);

  function answer(id: string, value: string | string[], debounce = false) {
    const current = latest.current;
    if (!current) return;
    unconfirmedEmailAnswer.current = false;
    persist({
      ...current,
      revision: current.revision + 1,
      answers: { ...current.answers, [id]: value },
      completed: false,
    });
    setStatus("pending");
    clearTimeout(timer.current);
    if (debounce) timer.current = setTimeout(() => void flush(), 500);
    else void flush();
  }
  function finish() {
    const current = latest.current;
    if (!current) return;
    persist({ ...current, revision: current.revision + 1, completed: true });
    void flush();
  }
  const questions = questionsFor(draft?.answers || {});
  const question = questions[Math.min(step, questions.length - 1)];
  const completed = !!draft?.completed && savedRevision >= draft.revision;
  const value = draft?.answers[question.id];
  const last = step === questions.length - 1;
  const statusText =
    status === "saved"
      ? "Saved"
      : status === "saving"
        ? "Saving…"
        : status === "pending"
          ? "Waiting to save…"
          : status === "error"
            ? "Not saved yet"
            : "Answers save as you go";
  useEffect(() => {
    if (completed) heading.current?.focus();
  }, [completed]);

  return (
    <main className={styles.page}>
      <aside className={styles.intro}>
        <span className={styles.eyebrow}>SMELT / THE NEXT CHAPTER</span>
        <h1>
          Good things
          <br />
          start with
          <br />
          <em>your say.</em>
        </h1>
        <div className={styles.stamp} aria-hidden="true">
          MADE FOR
          <br />
          <strong>the ritual.</strong>
          <br />
          SHAPED BY YOU
        </div>
        <p>
          We made the hat. What comes next?
          <br />
          Help us shape a sauna kit you’d actually use.
        </p>
        <span className={styles.signature}>Warm regards, Smelt.</span>
      </aside>
      <section className={styles.panel} aria-label="Help shape Smelt questionnaire">
        {!draft ? (
          <p role="status">Getting your questions ready…</p>
        ) : completed ? (
          <div className={styles.thanks}>
            <span className={styles.eyebrow}>A LITTLE INPUT. A BETTER NEXT CHAPTER.</span>
            <h2 tabIndex={-1} ref={heading}>
              You’ve given us
              <br />
              food for thought.
            </h2>
            <p>
              Your answers are saved. Thanks for helping us make something that belongs in your
              sauna routine.
            </p>
            <Link href="/product" className={styles.primary}>
              Back to the hats <span aria-hidden="true">↗</span>
            </Link>
          </div>
        ) : !started ? (
          <div className={styles.welcome}>
            <span className={styles.eyebrow}>YOUR SAUNA. YOUR SAY.</span>
            <h2>
              A few questions.
              <br />
              Something good
              <br />
              in the making.
            </h2>
            <p>
              Tell us a little about your routine, then pick the products you’re curious about.
              We’ll only ask about those.
            </p>
            <ul>
              <li>No email or account needed.</li>
              <li>Skip any product follow-up.</li>
              <li>Come back in this browser to carry on.</li>
            </ul>
            <button className={styles.primary} onClick={() => setStarted(true)}>
              Let’s shape what’s next <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : (
          <>
            <div className={styles.progressHeader}>
              <span>
                QUESTION {step + 1} / {questions.length}
              </span>
              <span>{question.product || (last ? "ONE LAST THOUGHT" : "YOUR SAUNA ROUTINE")}</span>
            </div>
            <div
              className={styles.progress}
              role="progressbar"
              aria-label="Questionnaire progress"
              aria-valuemin={0}
              aria-valuemax={questions.length}
              aria-valuenow={step + 1}
            >
              <span style={{ width: `${((step + 1) / questions.length) * 100}%` }} />
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (question.optional || hasAnswer(value)) {
                  if (unconfirmedEmailAnswer.current && typeof value === "string")
                    answer(question.id, value);
                  if (last) finish();
                  else {
                    void flush();
                    setStep(step + 1);
                  }
                }
              }}
            >
              <fieldset className={styles.fieldset} aria-describedby="question-hint">
                <legend className={styles.legend}>
                  <h2 tabIndex={-1} ref={heading}>
                    {question.title}
                  </h2>
                </legend>
                <p id="question-hint" className={styles.hint}>
                  {question.options
                    ? question.multiple
                      ? question.max
                        ? `Choose up to ${question.max}.`
                        : question.id === "products"
                          ? "Select all that interest you."
                          : "Select all that apply."
                      : "Choose one."
                    : "In your own words. Up to 1,500 characters."}
                  {question.optional ? " Optional." : ""}
                  {question.id === "products"
                    ? " Your choices shape the questions that follow."
                    : ""}
                </p>
                {question.options ? (
                  <div className={styles.options}>
                    {question.options.map((option) => {
                      const selected = Array.isArray(value)
                        ? value.includes(option)
                        : value === option;
                      const atLimit =
                        !!question.max &&
                        Array.isArray(value) &&
                        value.length >= question.max &&
                        !selected;
                      return (
                        <label
                          key={option}
                          className={`${styles.option} ${selected ? styles.selected : ""} ${atLimit ? styles.limited : ""}`}
                        >
                          <input
                            type={question.multiple ? "checkbox" : "radio"}
                            name={question.id}
                            value={option}
                            checked={selected}
                            disabled={atLimit}
                            onChange={() =>
                              answer(question.id, toggleOption(question, value, option))
                            }
                          />
                          <span>{option}</span>
                          <span className={styles.mark} aria-hidden="true">
                            {selected ? "✓" : question.multiple ? "+" : "○"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    <textarea
                      key={question.id}
                      className={styles.textarea}
                      aria-label={question.title}
                      maxLength={1500}
                      rows={5}
                      placeholder="We’re listening…"
                      value={typeof value === "string" ? value : ""}
                      onChange={(event) => answer(question.id, event.target.value, true)}
                      onBlur={() => void flush()}
                    />
                    <span className={styles.counter}>
                      {typeof value === "string" ? value.length : 0} / 1,500
                    </span>
                  </>
                )}
              </fieldset>
              <div className={styles.navigation}>
                <button
                  type="button"
                  className={styles.back}
                  disabled={step === 0}
                  onClick={() => {
                    void flush();
                    setStep(step - 1);
                  }}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={
                    (!question.optional && !hasAnswer(value)) ||
                    (last && draft.completed && status === "saving")
                  }
                >
                  {last
                    ? draft.completed && status === "saving"
                      ? "Saving…"
                      : "Finish & thank you"
                    : question.optional && !hasAnswer(value)
                      ? "Skip"
                      : "Next"}{" "}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </form>
            <div className={styles.saveStatus} role="status">
              <span className={status === "error" ? styles.errorDot : styles.dot} />
              {statusText}
            </div>
            {error && (
              <p className={styles.error} role="alert">
                {error}{" "}
                <button type="button" onClick={() => void flush()}>
                  Retry save
                </button>
              </p>
            )}
          </>
        )}
        {storageWarning && (
          <p className={styles.error}>
            This browser can’t keep a local draft. Answers will still save online, but you may not
            be able to resume after closing this page.
          </p>
        )}
        <noscript>
          <p>Please enable JavaScript to answer the questionnaire and save answers as you go.</p>
        </noscript>
      </section>
    </main>
  );
}
