"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { OrdersPage } from "@/lib/admin/types";
import { api, RequestError } from "@/lib/admin/client";
import { OrderRow } from "./OrderRow";
import dynamic from "next/dynamic";
const ConversationsPanel = dynamic(() => import("./ConversationsPanel"));
const AnalyticsPanel = dynamic(() => import("./AnalyticsPanel"));
const RestockPanel = dynamic(() => import("./RestockPanel"));
const ReviewsPanel = dynamic(() => import("./ReviewsPanel"));
const CouponsPanel = dynamic(() => import("./CouponsPanel"));
const EmailAuditPanel = dynamic(() => import("./EmailAuditPanel"));
const CustomHatsPanel = dynamic(() => import("./CustomHatsPanel"));
const ResearchPanel = dynamic(() => import("./ResearchPanel"));
import styles from "./admin.module.css";

export default function AdminDashboard() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState<OrdersPage | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"active" | "completed" | "preorders">("active");
  const [completedSort, setCompletedSort] = useState<"newest" | "oldest">("newest");
  const [section, setSection] = useState<
    | "orders"
    | "analytics"
    | "reviews"
    | "restock"
    | "conversations"
    | "coupons"
    | "emails"
    | "custom"
    | "research"
  >("orders");
  const [emailIssues, setEmailIssues] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const expire = useCallback(() => {
    generation.current++;
    setAuth(false);
    setData(null);
    setError("Your session has ended. Sign in again to continue.");
  }, []);
  // Load the latest email audit on sign-in so the tab shows open issues at a glance.
  useEffect(() => {
    if (!auth) return;
    let active = true;
    api<{ report: { issues: unknown[] } | null }>("email-audit")
      .then((r) => {
        if (active) setEmailIssues(r.report?.issues.length ?? 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [auth]);
  useEffect(() => {
    let active = true;
    api<{ authenticated: boolean }>("session")
      .then((r) => {
        if (active) setAuth(r.authenticated);
      })
      .catch((e) => {
        if (active) {
          setAuth(false);
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const result = await api<OrdersPage>(
        `orders?page=${page}&view=${view}&sort=${completedSort}&search=${encodeURIComponent(search)}`,
      );
      if (generation.current === current) setData(result);
    } catch (e) {
      if (generation.current !== current) return;
      if (e instanceof RequestError && e.status === 401) expire();
      else setError(e instanceof Error ? e.message : "Could not load orders.");
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [page, search, view, completedSort, expire]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active && auth && section === "orders") void load();
    });
    return () => {
      active = false;
      invalidate();
    };
  }, [auth, section, load, invalidate]);
  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("session", { method: "POST", body: JSON.stringify({ password }) });
      setPassword("");
      setAuth(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    try {
      await api("session", { method: "DELETE" });
      generation.current++;
      setAuth(false);
      setData(null);
      setError("");
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function exportOrders() {
    setExporting(true);
    setExportError("");
    try {
      const response = await fetch("/api/admin/orders/export", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json();
        throw new RequestError(
          body.error || "Could not export orders. Please try again.",
          response.status,
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ||
        "smelt-orders.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      if (caught instanceof RequestError && caught.status === 401) expire();
      else
        setExportError(
          caught instanceof Error ? caught.message : "Could not export orders. Please try again.",
        );
    } finally {
      setExporting(false);
    }
  }
  const sectionCopy = {
    coupons: {
      eyebrow: "SMELT / COUPON CODES",
      title: (
        <>
          A little off<span>.</span>
        </>
      ),
      description: "Create codes. Keep track of who uses them.",
    },
    orders: {
      eyebrow: "SMELT / FULFILMENT",
      title: (
        <>
          The dispatch desk<span>.</span>
        </>
      ),
      description: "Paste a waybill. Send the good news.",
    },
    analytics: {
      eyebrow: "SMELT / COMMERCE",
      title: (
        <>
          Store performance<span>.</span>
        </>
      ),
      description: "Traffic, intent and verified sales in one view.",
    },
    restock: {
      eyebrow: "SMELT / NEXT BATCH",
      title: (
        <>
          Restock requests<span>.</span>
        </>
      ),
      description: "Pre-orders, waiting-list emails and restock requests.",
    },
    conversations: {
      eyebrow: "SMELT / PRODUCT QUESTIONS",
      title: (
        <>
          AI conversations<span>.</span>
        </>
      ),
      description: "See what customers ask and how the assistant answers.",
    },
    emails: {
      eyebrow: "SMELT / ORDER EMAILS",
      title: (
        <>
          Nothing left unsaid<span>.</span>
        </>
      ),
      description: "Paid orders whose confirmation or owner email did not go out.",
    },
    custom: {
      eyebrow: "SMELT / CUSTOM HATS",
      title: (
        <>
          Their logo, our felt<span>.</span>
        </>
      ),
      description: "Make a personal design link. See every hat they dream up.",
    },
    research: {
      eyebrow: "SMELT / PRODUCT RESEARCH",
      title: (
        <>
          Their say. What’s next<span>.</span>
        </>
      ),
      description: "Every answer, including the unfinished ones. Saved in Neon Postgres.",
    },
    reviews: {
      eyebrow: "SMELT / CUSTOMER PROOF",
      title: (
        <>
          Reviews, reviewed<span>.</span>
        </>
      ),
      description: "Approve the real thing. Publish only what customers sent.",
    },
  }[section];
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.wordmark}>
          smelt<span>®</span>
        </Link>
        <span className={styles.privateLabel}>THE BACK OFFICE</span>
        {auth && (
          <button className={styles.logout} disabled={busy} onClick={() => void signOut()}>
            Sign out ↗
          </button>
        )}
      </header>
      <main className={styles.main}>
        {auth === null ? (
          <p className={styles.loading} role="status">
            Opening the dispatch desk…
          </p>
        ) : !auth ? (
          <section className={styles.login}>
            <span className={styles.eyebrow}>SMELT / TEAM ACCESS</span>
            <h1>
              Good things.
              <br />
              In clear view.
            </h1>
            <p>Sign in to manage orders and see how the store is performing.</p>
            <form onSubmit={signIn}>
              <label htmlFor="admin-password">Admin password</label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={busy}
              />
              <button disabled={busy}>{busy ? "Signing in…" : "Open dispatch desk ↗"}</button>
            </form>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
          </section>
        ) : (
          <>
            <section className={styles.heading}>
              <div>
                <span className={styles.eyebrow}>{sectionCopy.eyebrow}</span>
                <h1>{sectionCopy.title}</h1>
                <p>{sectionCopy.description}</p>
              </div>
              {section === "research" ? (
                <div className={styles.analyticsStamp}>
                  <span>YOUR SAY</span>
                  <b>＋</b>
                  <span>NEON</span>
                </div>
              ) : section === "orders" ? (
                <div className={styles.total}>
                  <strong>{data?.total ?? "—"}</strong>
                  <span>
                    {view === "completed"
                      ? "COMPLETED ORDERS"
                      : view === "preorders"
                        ? "PAID PRE-ORDERS"
                        : "ACTIVE ORDERS"}
                  </span>
                </div>
              ) : section === "analytics" ? (
                <div className={styles.analyticsStamp}>
                  <span>VERCEL</span>
                  <b>＋</b>
                  <span>PAYSTACK</span>
                </div>
              ) : section === "conversations" ? (
                <div className={styles.analyticsStamp}>
                  <span>VISITOR</span>
                  <b>＋</b>
                  <span>SMELT AI</span>
                </div>
              ) : section === "emails" ? (
                <div className={styles.analyticsStamp}>
                  <span>REDIS</span>
                  <b>＋</b>
                  <span>RESEND</span>
                </div>
              ) : section === "custom" ? (
                <div className={styles.analyticsStamp}>
                  <span>REDIS</span>
                  <b>＋</b>
                  <span>R2</span>
                </div>
              ) : (
                <div className={styles.analyticsStamp}>
                  <span>PAYSTACK</span>
                  <b>＋</b>
                  <span>BLOB</span>
                </div>
              )}
            </section>
            <nav className={styles.primarySections} aria-label="Admin sections">
              <button
                type="button"
                aria-pressed={section === "coupons"}
                onClick={() => setSection("coupons")}
              >
                Coupons
              </button>
              <button
                type="button"
                aria-pressed={section === "orders"}
                onClick={() => setSection("orders")}
              >
                Orders
              </button>
              <button
                type="button"
                aria-pressed={section === "analytics"}
                onClick={() => setSection("analytics")}
              >
                Store performance
              </button>
              <button
                type="button"
                aria-pressed={section === "reviews"}
                onClick={() => setSection("reviews")}
              >
                Reviews
              </button>
              <button
                type="button"
                aria-pressed={section === "restock"}
                onClick={() => setSection("restock")}
              >
                Restock requests
              </button>
              <button
                type="button"
                aria-pressed={section === "conversations"}
                onClick={() => setSection("conversations")}
              >
                AI conversations
              </button>
              <button
                type="button"
                aria-pressed={section === "custom"}
                onClick={() => setSection("custom")}
              >
                Custom hats
              </button>
              <button
                type="button"
                aria-pressed={section === "research"}
                onClick={() => setSection("research")}
              >
                Product research
              </button>
              <button
                type="button"
                aria-pressed={section === "emails"}
                onClick={() => setSection("emails")}
              >
                Email issues
                {!!emailIssues && (
                  <span className={styles.issueCount} aria-label={`${emailIssues} open`}>
                    {emailIssues}
                  </span>
                )}
              </button>
            </nav>
            {section === "orders" ? (
              <>
                <section
                  className={styles.preorderSummary}
                  aria-labelledby="preorder-summary-heading"
                  aria-busy={loading}
                >
                  <div className={styles.preorderSummaryIntro}>
                    <h2 id="preorder-summary-heading">Pre-orders to fulfil</h2>
                    <p>
                      {search ? "Matching search · " : "All orders · "}Paid pre-order hats,
                      excluding orders marked complete.
                    </p>
                  </div>
                  <dl className={styles.preorderCounts}>
                    <div>
                      <dt>
                        <span className={`${styles.swatch} ${styles.cream}`} aria-hidden="true" />
                        Cream
                      </dt>
                      <dd>{data?.preorderToFulfil.cream ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>
                        <span className={styles.swatch} aria-hidden="true" />
                        Green
                      </dt>
                      <dd>{data?.preorderToFulfil.green ?? "—"}</dd>
                    </div>
                  </dl>
                </section>
                <nav className={styles.sections} aria-label="Order sections">
                  <button
                    type="button"
                    aria-pressed={view === "active"}
                    onClick={() => {
                      setView("active");
                      setPage(1);
                      setNotice("");
                    }}
                  >
                    Active orders {data && <span>{data.activeTotal}</span>}
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === "preorders"}
                    onClick={() => {
                      setView("preorders");
                      setPage(1);
                      setNotice("");
                    }}
                  >
                    Paid pre-orders · oldest first
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === "completed"}
                    onClick={() => {
                      setView("completed");
                      setPage(1);
                      setNotice("");
                    }}
                  >
                    Completed orders {data && <span>{data.completedTotal}</span>}
                  </button>
                </nav>
                {notice && (
                  <p className={styles.notice} role="status">
                    {notice}
                  </p>
                )}
                <div className={styles.toolbar}>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setPage(1);
                      if (search === query.trim() && page === 1) void load();
                      else setSearch(query.trim());
                    }}
                  >
                    <label className={styles.srOnly} htmlFor="order-search">
                      Search by customer name, email or order reference
                    </label>
                    <input
                      id="order-search"
                      type="search"
                      placeholder="Name, email or order reference"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <button disabled={loading}>Search</button>
                    {search && (
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={() => {
                          setQuery("");
                          setSearch("");
                          setPage(1);
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </form>
                  <div className={styles.orderActions}>
                    {view === "completed" && (
                      <label className={styles.sortControl} htmlFor="completed-order-sort">
                        <span>Sort completed</span>
                        <select
                          id="completed-order-sort"
                          value={completedSort}
                          disabled={loading}
                          onChange={(e) => {
                            setCompletedSort(e.target.value as "newest" | "oldest");
                            setPage(1);
                          }}
                        >
                          <option value="newest">Newest first</option>
                          <option value="oldest">Oldest first</option>
                        </select>
                      </label>
                    )}
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={exporting}
                      onClick={() => void exportOrders()}
                    >
                      {exporting ? "Exporting…" : "Export all orders CSV ↓"}
                    </button>
                    <button
                      className={styles.refresh}
                      disabled={loading}
                      onClick={() => void load()}
                    >
                      {loading ? "Refreshing…" : "Refresh orders ↻"}
                    </button>
                  </div>
                </div>
                <p className={styles.note}>
                  CSV includes all paid orders across every page, including completed orders,
                  regardless of the current search. Amounts include delivery and any discounts.
                  Paystack fees are included where available; refunds and bank payouts are not
                  included.
                </p>
                {exporting && (
                  <p className={styles.note} role="status">
                    Preparing your order export…
                  </p>
                )}
                {exportError && (
                  <p className={styles.error} role="alert">
                    {exportError}
                  </p>
                )}
                <p className={styles.help}>
                  {view === "completed"
                    ? `Completed orders, ${completedSort === "oldest" ? "oldest" : "most recently"} completed first. Reopen an order to move it back to active orders.`
                    : view === "preorders"
                      ? "Paid pre-orders, oldest payment first. Dispatch these before general restock orders once the batch is received."
                      : "Send tracking and mark complete, or review an accepted previous shipping email and complete the order without sending again."}
                </p>
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
                {loading && (
                  <div className={styles.loading} role="status">
                    Loading orders…
                  </div>
                )}
                {data && (
                  <>
                    <div className={styles.columnHead}>
                      <span>CUSTOMER / ORDER</span>
                      <span>IN THE BAG</span>
                      <span>TRACKING & EMAIL</span>
                    </div>
                    <div className={styles.orders}>
                      {data.orders.map((order) => (
                        <OrderRow
                          key={order.reference}
                          order={order}
                          onExpired={expire}
                          onMoved={() => {
                            setNotice(
                              view !== "completed"
                                ? "Order moved to Completed orders."
                                : "Order moved back to Active orders.",
                            );
                            if (data.orders.length === 1 && data.page > 1) setPage(data.page - 1);
                            else void load();
                          }}
                          onReceipt={(receipt) =>
                            setData((current) =>
                              current
                                ? {
                                    ...current,
                                    orders: current.orders.map((o) =>
                                      o.reference === order.reference ? { ...o, receipt } : o,
                                    ),
                                  }
                                : null,
                            )
                          }
                          onReviewMessageSent={(reviewMessageSentAt) =>
                            setData((current) =>
                              current
                                ? {
                                    ...current,
                                    orders: current.orders.map((o) =>
                                      o.reference === order.reference
                                        ? { ...o, reviewMessageSentAt }
                                        : o,
                                    ),
                                  }
                                : null,
                            )
                          }
                        />
                      ))}
                    </div>
                    {!data.orders.length && (
                      <div className={styles.empty}>
                        <h2>
                          {search
                            ? "No matching orders"
                            : view === "completed"
                              ? "No completed orders yet"
                              : "All caught up"}
                        </h2>
                        <p>
                          {search
                            ? "Search using all or part of a customer name, email address or payment reference."
                            : view === "completed"
                              ? "Orders appear here after you mark them complete."
                              : "New paid orders will appear here."}
                        </p>
                      </div>
                    )}
                    <nav className={styles.pagination} aria-label="Order pages">
                      <span>
                        {data.total
                          ? `Page ${data.page} of ${Math.max(1, data.pageCount)}`
                          : "0 orders"}
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
              </>
            ) : section === "research" ? (
              <ResearchPanel onExpired={expire} />
            ) : section === "coupons" ? (
              <CouponsPanel onExpired={expire} />
            ) : section === "analytics" ? (
              <AnalyticsPanel onExpired={expire} />
            ) : section === "restock" ? (
              <RestockPanel onExpired={expire} />
            ) : section === "conversations" ? (
              <ConversationsPanel onExpired={expire} />
            ) : section === "emails" ? (
              <EmailAuditPanel onExpired={expire} onCount={setEmailIssues} />
            ) : section === "custom" ? (
              <CustomHatsPanel onExpired={expire} />
            ) : (
              <ReviewsPanel onExpired={expire} />
            )}
            <footer className={styles.footnote}>
              Made with care. Measured with care.
              <span>
                {section === "research"
                  ? "Anonymous research answers stay private in Neon Postgres."
                  : section === "coupons"
                    ? "Coupon usage counts successful payments only."
                    : section === "orders"
                      ? "Email delivery status refers to the notification, not the parcel."
                      : section === "analytics"
                        ? "Payment totals come from successful Paystack transactions."
                        : section === "conversations"
                          ? "Conversation logs are visible only to the signed-in team."
                          : section === "emails"
                            ? "Accepted means Resend took the email; inbox delivery is not tracked here."
                            : section === "custom"
                              ? "Logo files stay private in R2; preview links expire after an hour."
                              : "Customer reviews remain private until approved."}
              </span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
