vi.mock("./salesMode", async original => ({ ...await original<typeof import("./salesMode")>(), PREORDER_MODE: false }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ eval: vi.fn(), hget: vi.fn(), hgetall: vi.fn(), hdel: vi.fn(), send: vi.fn(), stock: vi.fn(), admin: vi.fn() }));
vi.mock('@upstash/redis', () => ({ Redis: class { eval = mocks.eval; hget = mocks.hget; hgetall = mocks.hgetall; hdel = mocks.hdel; } }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('./purchaseStore', () => ({ getAvailability: mocks.stock, batchReceived: vi.fn().mockResolvedValue(false) }));
vi.mock('./admin/auth', () => ({ requireAdmin: mocks.admin }));
import { POST } from '../app/api/restock/route';
import { GET, PATCH } from '../app/api/admin/restock/route';
import { ACCEPT_RESTOCK_CONFIRMATION, PREPARE_RESTOCK_CONFIRMATION, SAVE_EMAIL_RESTOCK, confirmEmailRestock, listEmailRestock, type EmailRestockSignup } from './restockEmail';
import { AdminError } from './admin/store';
import { restockConfirmationEmail } from './emails/restockConfirmation';

const rows = new Map<string, EmailRestockSignup>();
const body = { email: ' Customer@Example.com ', quantities: { green: 2, cream: 1 }, consent: true };
const request = (value: unknown = body, method = 'POST', origin = 'https://saunahat.co.za') => new Request(`https://saunahat.co.za/api/${method === 'PATCH' ? 'admin/' : ''}restock`, {
  method, headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(value),
});

beforeEach(() => {
  vi.resetAllMocks(); rows.clear();
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.com'); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test');
  vi.stubEnv('RESEND_API_KEY', 'test'); vi.stubEnv('ORDER_FROM_EMAIL', 'Smelt <hello@saunahat.co.za>');
  vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_example');
  mocks.stock.mockResolvedValue({ green: 1, cream: 10, localTest: false });
  mocks.send.mockResolvedValue({ data: { id: 'email-123' }, error: null });
  mocks.hget.mockImplementation(async (_key, id) => structuredClone(rows.get(id) ?? null));
  mocks.hgetall.mockImplementation(async key => key.includes('restock-email') ? Object.fromEntries(rows) : {});
  mocks.hdel.mockImplementation(async (_key, id) => Number(rows.delete(id)));
  mocks.eval.mockImplementation(async (script, _keys, args) => {
    if (script === SAVE_EMAIL_RESTOCK) {
      if (!rows.has(args[0])) rows.set(args[0], JSON.parse(args[1]));
      return JSON.stringify(rows.get(args[0]));
    }
    if (script === PREPARE_RESTOCK_CONFIRMATION) {
      const row = rows.get(args[0]);
      if (!row) return null;
      row.confirmation ??= JSON.parse(args[1]);
      return JSON.stringify(row);
    }
    if (script === ACCEPT_RESTOCK_CONFIRMATION) {
      const row = rows.get(args[0]);
      if (!row || row.createdAt !== args[2]) return 0;
      row.confirmation = JSON.parse(args[1]);
    }
    return 1;
  });
});

describe('email waiting list', () => {
  it('saves a normalized email, requested quantities and unavailable colours before sending a confirmation', async () => {
    mocks.send.mockImplementationOnce(async () => {
      expect(rows.size).toBe(1);
      return { data: { id: 'email-123' }, error: null };
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true, confirmationSent: true });
    expect([...rows.values()][0]).toMatchObject({ email: 'customer@example.com', quantities: { green: 2, cream: 1 }, waitingColours: ['green'], confirmation: { status: 'accepted', id: 'email-123' } });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'customer@example.com', text: expect.stringContaining('Available in 3 weeks') }), { idempotencyKey: expect.stringContaining('restock-confirmation/test/') });
  });
  it('supports a sold-out single colour and shortages across both colours', async () => {
    mocks.stock.mockResolvedValue({ green: 0, cream: 0, localTest: false });
    await POST(request({ ...body, quantities: { green: 0, cream: 1 } }));
    expect([...rows.values()][0].waitingColours).toEqual(['cream']);
    await POST(request());
    expect([...rows.values()][1].waitingColours).toEqual(['green', 'cream']);
  });
  it('does not duplicate a signup or accepted email on repeat submission', async () => {
    await POST(request()); await POST(request());
    expect(rows.size).toBe(1); expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('keeps the signup if Resend rejects or throws and retries with the frozen message and same key', async () => {
    mocks.send.mockResolvedValueOnce({ error: { message: 'Unavailable' }, data: null });
    expect(await (await POST(request())).json()).toEqual({ saved: true, confirmationSent: false });
    const firstCall = structuredClone(mocks.send.mock.calls[0]);
    vi.stubEnv('ORDER_FROM_EMAIL', 'Changed <changed@example.com>');
    expect(await (await POST(request())).json()).toEqual({ saved: true, confirmationSent: true });
    expect(mocks.send.mock.calls[1]).toEqual(firstCall);
    expect(rows.size).toBe(1);
  });
  it('preserves a signup when the mail provider throws', async () => {
    mocks.send.mockRejectedValueOnce(new Error('timeout'));
    expect(await (await POST(request())).json()).toEqual({ saved: true, confirmationSent: false });
    expect(rows.size).toBe(1);
  });
  it('keeps an accepted provider response idempotent after a receipt-write failure', async () => {
    const implementation = mocks.eval.getMockImplementation()!;
    mocks.eval.mockImplementation(async (...args) => {
      if (args[0] === ACCEPT_RESTOCK_CONFIRMATION) throw new Error('storage offline');
      return implementation(...args);
    });
    expect(await (await POST(request())).json()).toEqual({ saved: true, confirmationSent: false });
    mocks.eval.mockImplementation(implementation);
    await POST(request());
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
  });
  it('saves without claiming email acceptance when email configuration is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(await (await POST(request())).json()).toEqual({ saved: true, confirmationSent: false });
    expect(mocks.send).not.toHaveBeenCalled(); expect(rows.size).toBe(1);
  });
  it('stops ambiguous retries after 23 hours and exposes review status without the email payload', async () => {
    mocks.send.mockRejectedValueOnce(new Error('timeout'));
    await POST(request());
    const row = [...rows.values()][0];
    if (row.confirmation?.status !== 'pending') throw new Error('Expected pending confirmation');
    row.confirmation.startedAt = Date.now() - 24 * 60 * 60 * 1000;
    expect(await confirmEmailRestock(row.id)).toBe(false);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect((await listEmailRestock())[0].confirmation).toEqual({ status: 'review' });
  });
  it.each([
    { ...body, email: 'invalid' }, { ...body, email: 'a@example.com,b@example.com' }, { ...body, consent: false },
    { ...body, quantities: { green: -1, cream: 1 } }, { ...body, quantities: { green: 1.5, cream: 0 } },
    { ...body, quantities: { green: 0, cream: 0 } }, { ...body, quantities: { green: 100, cream: 0 } },
    { ...body, quantities: { green: '2', cream: 0 } }, { ...body, quantities: null },
  ])('rejects malformed inputs before storage or email', async value => {
    expect((await POST(request(value))).status).toBe(400);
    expect(mocks.eval).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('checks current stock on the server and rejects already available selections', async () => {
    mocks.stock.mockResolvedValue({ green: 2, cream: 1, localTest: false });
    expect((await POST(request())).status).toBe(409); expect(rows.size).toBe(0); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('fails safely on rate limits, inventory failures and storage failures', async () => {
    mocks.eval.mockResolvedValueOnce(0);
    expect((await POST(request())).status).toBe(429);
    mocks.stock.mockRejectedValueOnce(new Error('offline'));
    expect((await POST(request())).status).toBe(503);
    mocks.eval.mockRejectedValueOnce(new Error('offline'));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('requires same origin and authenticated admin reads and writes', async () => {
    expect((await POST(request(body, 'POST', 'https://other.example'))).status).toBe(403);
    mocks.admin.mockRejectedValue(new AdminError('Sign in.', 401));
    expect((await GET()).status).toBe(401);
    expect((await PATCH(request({ id: 'a'.repeat(64), action: 'remove', channel: 'email' }, 'PATCH'))).status).toBe(401);
    expect(mocks.hgetall).not.toHaveBeenCalled(); expect(mocks.hdel).not.toHaveBeenCalled();
  });
  it('lists email signups alongside legacy requests and supports removal', async () => {
    await POST(request());
    const response = await GET(); const data = await response.json();
    expect(data.signups).toEqual([]); expect(data.emailSignups).toHaveLength(1);
    expect(data.emailSignups[0].email).toBe('customer@example.com');
    expect((await PATCH(request({ id: data.emailSignups[0].id, action: 'remove', channel: 'email' }, 'PATCH'))).status).toBe(200);
    expect(rows.size).toBe(0);
  });
  it('requires the full requested quantity before marking a restock notification', async () => {
    await POST(request()); const id = [...rows.keys()][0];
    expect((await PATCH(request({ id, action: 'notified', channel: 'email' }, 'PATCH'))).status).toBe(400);
    mocks.stock.mockResolvedValue({ green: 2, cream: 1, localTest: false });
    expect((await PATCH(request({ id, action: 'notified', channel: 'email' }, 'PATCH'))).status).toBe(200);
  });
  it('renders a brief confirmation with the selected quantities and no marketing offer', () => {
    const email = restockConfirmationEmail({ green: 2, cream: 1 });
    expect(email.subject).toBe('You’re on the Smelt waiting list');
    expect(email.text).toContain('2 × Forest Green'); expect(email.text).toContain('1 × Natural Cream');
    expect(email.text).toContain('This doesn’t reserve stock'); expect(email.html).not.toContain('Shop the hats');
  });
});
