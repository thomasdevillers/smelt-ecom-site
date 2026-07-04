"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "./admin.module.css";

interface OrderItem {
  colour: string;
  name: string;
  qty: number;
}

interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  phone?: string;
}

interface Order {
  reference: string;
  email: string;
  customerName: string | null;
  amountRand: number;
  status: string;
  items: OrderItem[];
  shippingAddress: ShippingAddress | null;
  fulfillmentStatus: string;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  trackingUrl: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

interface ShipForm {
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
}

const PW_KEY = "smelt-admin-pw";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export default function AdminPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [forms, setForms] = useState<Record<string, ShipForm>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const clearPassword = useCallback(() => {
    setPassword(null);
    sessionStorage.removeItem(PW_KEY);
  }, []);

  const loadOrders = useCallback(
    async (pw: string) => {
      setLoading(true);
      setAuthError("");
      try {
        const res = await fetch("/api/admin/orders", {
          headers: { "x-admin-password": pw },
        });
        if (res.status === 401) {
          clearPassword();
          setAuthError("Incorrect password.");
          return;
        }
        if (!res.ok) {
          setAuthError("Could not load orders.");
          return;
        }
        const data: { orders: Order[] } = await res.json();
        setOrders(data.orders);
      } catch {
        setAuthError("Could not load orders.");
      } finally {
        setLoading(false);
      }
    },
    [clearPassword],
  );

  // On mount, pick up a stored password and fetch. Reading sessionStorage and
  // the fetch happen off the synchronous render path (inside a microtask), so
  // no setState runs synchronously in the effect body.
  useEffect(() => {
    void (async () => {
      const stored = sessionStorage.getItem(PW_KEY);
      if (stored) {
        setPassword(stored);
        await loadOrders(stored);
      }
    })();
  }, [loadOrders]);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    const pw = pwInput.trim();
    if (!pw) return;
    sessionStorage.setItem(PW_KEY, pw);
    setPassword(pw);
    setPwInput("");
    void loadOrders(pw);
  }

  function getForm(ref: string): ShipForm {
    return forms[ref] ?? { carrier: "", trackingNumber: "", trackingUrl: "" };
  }

  function setFormField(ref: string, field: keyof ShipForm, value: string) {
    setForms((f) => ({
      ...f,
      [ref]: { ...getForm(ref), [field]: value },
    }));
  }

  function replaceOrder(updated: Order) {
    setOrders((list) =>
      list.map((o) => (o.reference === updated.reference ? updated : o)),
    );
  }

  async function markShipped(ref: string) {
    if (!password) return;
    const form = getForm(ref);
    setBusy((b) => ({ ...b, [ref]: true }));
    setRowError((e) => ({ ...e, [ref]: "" }));
    try {
      const res = await fetch("/api/admin/orders/ship", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
        },
        body: JSON.stringify({
          reference: ref,
          carrier: form.carrier,
          trackingNumber: form.trackingNumber,
          trackingUrl: form.trackingUrl || undefined,
        }),
      });
      if (res.status === 401) {
        clearPassword();
        setAuthError("Incorrect password.");
        return;
      }
      const data: { ok?: boolean; order?: Order; error?: string } =
        await res.json();
      if (!res.ok || !data.order) {
        setRowError((e) => ({ ...e, [ref]: data.error ?? "Could not mark shipped." }));
        return;
      }
      replaceOrder(data.order);
    } catch {
      setRowError((e) => ({ ...e, [ref]: "Network error." }));
    } finally {
      setBusy((b) => ({ ...b, [ref]: false }));
    }
  }

  async function markDelivered(ref: string) {
    if (!password) return;
    setBusy((b) => ({ ...b, [ref]: true }));
    setRowError((e) => ({ ...e, [ref]: "" }));
    try {
      const res = await fetch("/api/admin/orders/deliver", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
        },
        body: JSON.stringify({ reference: ref }),
      });
      if (res.status === 401) {
        clearPassword();
        setAuthError("Incorrect password.");
        return;
      }
      const data: { ok?: boolean; order?: Order; error?: string } =
        await res.json();
      if (!res.ok || !data.order) {
        setRowError((e) => ({ ...e, [ref]: data.error ?? "Could not mark delivered." }));
        return;
      }
      replaceOrder(data.order);
    } catch {
      setRowError((e) => ({ ...e, [ref]: "Network error." }));
    } finally {
      setBusy((b) => ({ ...b, [ref]: false }));
    }
  }

  // Locked view: show the password prompt.
  if (!password) {
    return (
      <main className={styles.page}>
        <h1 className={styles.h1}>Admin</h1>
        <form className={styles.unlock} onSubmit={handleUnlock}>
          <label className={styles.label} htmlFor="admin-pw">
            Password
          </label>
          <input
            id="admin-pw"
            className={styles.input}
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            autoComplete="current-password"
          />
          <button className={styles.button} type="submit">
            Unlock
          </button>
          {authError ? <p className={styles.err}>{authError}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.h1}>Orders</h1>
        <button
          className={styles.linkButton}
          type="button"
          onClick={clearPassword}
        >
          Lock
        </button>
      </div>

      {loading ? <p className={styles.muted}>Loading orders…</p> : null}
      {!loading && orders.length === 0 ? (
        <p className={styles.muted}>No orders yet.</p>
      ) : null}

      <div className={styles.list}>
        {orders.map((order) => {
          const ff = order.fulfillmentStatus;
          const form = getForm(order.reference);
          const isBusy = busy[order.reference];
          const err = rowError[order.reference];
          return (
            <article key={order.reference} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.ref}>{order.reference}</span>
                <span className={styles.date}>{formatDate(order.createdAt)}</span>
              </div>

              <div className={styles.meta}>
                <div>
                  <strong>{order.customerName ?? "—"}</strong>
                  <br />
                  <span className={styles.muted}>{order.email}</span>
                </div>
                <div className={styles.amount}>{`R${order.amountRand}`}</div>
              </div>

              <ul className={styles.items}>
                {order.items.map((it, i) => (
                  <li key={i}>
                    {it.name} ×{it.qty}
                  </li>
                ))}
              </ul>

              {order.shippingAddress ? (
                <address className={styles.address}>
                  {order.shippingAddress.line1}
                  {order.shippingAddress.line2
                    ? `, ${order.shippingAddress.line2}`
                    : ""}
                  <br />
                  {order.shippingAddress.city}, {order.shippingAddress.province}{" "}
                  {order.shippingAddress.postalCode}
                  <br />
                  {order.shippingAddress.country}
                  {order.shippingAddress.phone
                    ? ` · ${order.shippingAddress.phone}`
                    : ""}
                </address>
              ) : (
                <p className={styles.muted}>No shipping address.</p>
              )}

              <div className={styles.statusRow}>
                <span className={styles.pill}>{ff}</span>
              </div>

              {ff !== "shipped" && ff !== "delivered" ? (
                <div className={styles.actions}>
                  <div className={styles.field}>
                    <label className={styles.label}>Carrier</label>
                    <input
                      className={styles.input}
                      value={form.carrier}
                      onChange={(e) =>
                        setFormField(order.reference, "carrier", e.target.value)
                      }
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Tracking number</label>
                    <input
                      className={styles.input}
                      value={form.trackingNumber}
                      onChange={(e) =>
                        setFormField(
                          order.reference,
                          "trackingNumber",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Tracking URL (optional)</label>
                    <input
                      className={styles.input}
                      value={form.trackingUrl}
                      onChange={(e) =>
                        setFormField(
                          order.reference,
                          "trackingUrl",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <button
                    className={styles.button}
                    type="button"
                    disabled={isBusy}
                    onClick={() => markShipped(order.reference)}
                  >
                    {isBusy ? "Working…" : "Mark shipped"}
                  </button>
                </div>
              ) : null}

              {ff === "shipped" ? (
                <div className={styles.actions}>
                  {order.trackingCarrier ? (
                    <p className={styles.muted}>
                      {order.trackingCarrier} · {order.trackingNumber}
                    </p>
                  ) : null}
                  <button
                    className={styles.button}
                    type="button"
                    disabled={isBusy}
                    onClick={() => markDelivered(order.reference)}
                  >
                    {isBusy ? "Working…" : "Mark delivered"}
                  </button>
                </div>
              ) : null}

              {ff === "delivered" ? (
                <p className={styles.delivered}>Delivered ✓</p>
              ) : null}

              {err ? <p className={styles.err}>{err}</p> : null}
            </article>
          );
        })}
      </div>
    </main>
  );
}
