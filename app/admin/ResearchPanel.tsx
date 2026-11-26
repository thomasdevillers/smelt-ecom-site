"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ALL_QUESTIONS, hasAnswer, type ResearchResponse } from "@/lib/research/shared";
import styles from "./admin.module.css";
import research from "./ResearchPanel.module.css";

type Report = {
  responses: ResearchResponse[];
  total: number;
  completed: number;
  page: number;
  pageCount: number;
  interest: { product: string; count: number }[];
};
function date(value: string) {
  return new Date(value).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
export default function ResearchPanel({ onExpired }: { onExpired: () => void }) {
  const [data, setData] = useState<Report | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/research?page=${page}`, { cache: "no-store" });
      if (current !== generation.current) return;
      if (response.status === 401) {
        onExpired();
        return;
      }
      if (!response.ok) throw new Error("Could not load product research. Please retry.");
      const result = await response.json();
      if (current === generation.current) setData(result);
    } catch (caught) {
      if (current === generation.current)
        setError(caught instanceof Error ? caught.message : "Could not load responses.");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [page, onExpired]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);
  return (
    <section aria-label="Product research responses" aria-busy={loading}>
      <div className={research.toolbar}>
        <p className={styles.help}>
          Anonymous answers, saved as people go. Partial means they haven’t finished—not necessarily
          that they’ve abandoned it. All times are South African time.
        </p>
        <button className={styles.refresh} disabled={loading} onClick={() => void load()}>
          {loading ? "Refreshing…" : "Refresh responses ↻"}
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!data && loading && <p role="status">Loading product research…</p>}
      {data && (
        <>
          <div className={research.totals}>
            <div>
              <strong>{data.total}</strong>
              <span>Responses</span>
            </div>
            <div>
              <strong>{data.completed}</strong>
              <span>Completed</span>
            </div>
            <div>
              <strong>{data.total - data.completed}</strong>
              <span>Partial</span>
            </div>
          </div>
          <section className={research.interest} aria-label="Product interest across all responses">
            <h2>What’s catching their eye</h2>
            <p className={styles.note}>
              Current selections across all responses, including partial responses. People can
              choose more than one product.
            </p>
            {data.interest.map((row) => (
              <div key={row.product}>
                <span>{row.product}</span>
                <strong>{row.count}</strong>
              </div>
            ))}
          </section>
          {!data.total && (
            <p className={styles.empty}>
              No answers yet. Responses appear here as soon as someone answers their first question.
            </p>
          )}
          <div className={research.responses}>
            {data.responses.map((response, index) => (
              <article className={research.response} key={response.id}>
                <header>
                  <div>
                    <h2>Anonymous response {(data.page - 1) * 25 + index + 1}</h2>
                    <p>
                      Started {date(response.createdAt)}
                      <br />
                      Last saved {date(response.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={`${styles.badge} ${response.completedAt ? styles.accepted : ""}`}
                  >
                    {response.completedAt ? "Completed" : "Partial"}
                  </span>
                </header>
                <details>
                  <summary>
                    View answers · {Object.values(response.answers).filter(hasAnswer).length}{" "}
                    answered
                  </summary>
                  <dl>
                    {ALL_QUESTIONS.filter((question) =>
                      hasAnswer(response.answers[question.id]),
                    ).map((question) => {
                      const value = response.answers[question.id];
                      const selected = Array.isArray(response.answers.products)
                        ? response.answers.products
                        : [];
                      return (
                        <div key={question.id}>
                          <dt>
                            {question.product && (
                              <span className={research.product}>
                                {question.product}
                                {!selected.includes(question.product)
                                  ? " · no longer selected"
                                  : ""}
                              </span>
                            )}
                            {question.title}
                          </dt>
                          <dd>{Array.isArray(value) ? value.join(" · ") : value}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </details>
              </article>
            ))}
          </div>
          <nav className={styles.pagination} aria-label="Research response pages">
            <span>
              Page {data.page} of {data.pageCount}
            </span>
            <div>
              <button
                className={styles.secondary}
                disabled={loading || data.page <= 1}
                onClick={() => setPage(data.page - 1)}
              >
                ← Previous
              </button>
              <button
                className={styles.secondary}
                disabled={loading || data.page >= data.pageCount}
                onClick={() => setPage(data.page + 1)}
              >
                Next →
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
