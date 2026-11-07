"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HatConversation, HatConversationsPage } from "@/lib/hatConversations";
import { HAT_SOURCES } from "@/lib/askHatShared";
import styles from "./admin.module.css";

const date = (value: string) => new Date(value).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });

export default function ConversationsPanel({ onExpired }: { onExpired: () => void }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HatConversationsPage | null>(null);
  const [selected, setSelected] = useState<HatConversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const detailRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/conversations?page=${page}`, { cache: "no-store", signal });
      if (response.status === 401) { onExpired(); return; }
      if (!response.ok) throw new Error("Could not load conversations. Please try again.");
      setData(await response.json());
    } catch (failure) {
      if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load conversations.");
    } finally { if (!signal.aborted) setLoading(false); }
  }, [page, onExpired]);

  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => controller.abort();
  }, [load, refresh]);
  useEffect(() => () => detailRequest.current?.abort(), []);

  async function open(id: string) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setOpening(true); setError(""); setSelected(null);
    try {
      const response = await fetch(`/api/admin/conversations?id=${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
      if (response.status === 401) { onExpired(); return; }
      if (!response.ok) throw new Error("Could not open this conversation. Please try again.");
      const result = await response.json();
      if (!controller.signal.aborted) setSelected(result.conversation);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not open this conversation.");
    } finally { if (!controller.signal.aborted) setOpening(false); }
  }

  return <section aria-label="AI conversations">
    <div className={styles.conversationToolbar}>
      <p className={styles.help}>Questions from the product page, with the AI’s replies. Times are South African time. Logging starts when this feature is deployed.</p>
      <button type="button" className={styles.refresh} disabled={loading || opening} onClick={() => { setRefresh(value => value + 1); if (selected) void open(selected.id); }}>Refresh conversations ↻</button>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading && <p role="status">Loading conversations…</p>}
    <div className={styles.conversationLayout}>
      <div>
        {data && !data.total && <div className={styles.empty}><h2>No conversations yet</h2><p>New product questions and answers will appear here.</p></div>}
        <div className={styles.conversationList} aria-label="Saved conversations">
          {data?.conversations.map(row => <button type="button" key={row.id} className={styles.conversationItem} aria-pressed={selected?.id === row.id} onClick={() => void open(row.id)}>
            <span>{date(row.startedAt)}</span><strong>{row.firstQuestion}</strong><span>{row.turnCount} {row.turnCount === 1 ? "question" : "questions"} · Last activity {date(row.updatedAt)}</span>
          </button>)}
        </div>
        {data && data.total > 0 && <nav className={styles.pagination} aria-label="Conversation pages"><span>{data.total} conversations · Page {data.page} of {data.pageCount}</span><div>
          <button type="button" className={styles.secondary} disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>← Previous</button>
          <button type="button" className={styles.secondary} disabled={loading || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>Next →</button>
        </div></nav>}
      </div>
      <div className={styles.conversationDetail} aria-label="Full conversation" aria-busy={opening}>
        {opening ? <p role="status">Opening conversation…</p> : selected ? <>
          <h2>Full conversation</h2><p className={styles.note}>Started {date(selected.startedAt)} · {selected.turnCount} {selected.turnCount === 1 ? "question" : "questions"}</p>
          {selected.turns.map(turn => <article key={turn.id} className={styles.conversationTurn}>
            <div><span className={styles.eyebrow}>VISITOR · {date(turn.askedAt)}</span><p>{turn.question}</p></div>
            <div className={styles.conversationAnswer}><span className={styles.eyebrow}>SMELT AI{turn.finishedAt ? ` · ${date(turn.finishedAt)}` : ""}</span>
              {turn.answer ? <><p>{turn.answer.answer}</p><p className={styles.note}>Sources: {turn.answer.sources.map(source => HAT_SOURCES[source].label).join(", ") || "None"}</p>{turn.answer.needsHuman && <span className={styles.badge}>Referred to the team</span>}</> : turn.status === "error" ? <p className={styles.error}>Answer failed: {turn.error}</p> : <p className={styles.note}>No completed answer recorded. This request may still be running, or its final log could not be saved. Refresh to check.</p>}
            </div>
          </article>)}
        </> : <p className={styles.help}>Select a conversation to read every question and reply.</p>}
      </div>
    </div>
  </section>;
}
