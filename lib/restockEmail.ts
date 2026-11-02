import { Resend } from 'resend';
import { adminStore, digest, AdminError } from './admin/store';
import { stockScope } from './stockEnvironment';
import { getAvailability } from './purchaseStore';
import { COLOURS, type Colour } from './product';
import type { CartState } from './cartReducer';
import { restockConfirmationEmail } from './emails/restockConfirmation';

type Message = { from: string; to: string; replyTo: string; subject: string; html: string; text: string };
type Confirmation = { status: 'accepted'; id: string; acceptedAt: string }
  | { status: 'pending'; startedAt: number; message: Message };
export interface EmailRestockSignup {
  id: string;
  email: string;
  quantities: CartState;
  waitingColours: Colour[];
  createdAt: string;
  notifiedAt: string | null;
  consent: string;
  confirmation: Confirmation | null;
}
export type AdminEmailRestockSignup = Omit<EmailRestockSignup, 'confirmation'> & {
  confirmation: { status: 'accepted'; id: string; acceptedAt: string } | { status: 'pending' | 'review' };
};
const key = () => `smelt:restock-email:v1:${stockScope()}`;
const RETRY_WINDOW = 23 * 60 * 60 * 1000;

export const SAVE_EMAIL_RESTOCK = `
local existing = redis.call('HGET', KEYS[1], ARGV[1])
if existing then return existing end
if redis.call('HLEN', KEYS[1]) >= 5000 then return nil end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return ARGV[2]
`;
export const PREPARE_RESTOCK_CONFIRMATION = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return nil end
local row = cjson.decode(raw)
if row.confirmation == cjson.null then
  row.confirmation = cjson.decode(ARGV[2])
  redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(row))
end
return cjson.encode(row)
`;
export const ACCEPT_RESTOCK_CONFIRMATION = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local row = cjson.decode(raw)
if row.createdAt ~= ARGV[3] then return 0 end
row.confirmation = cjson.decode(ARGV[2])
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(row))
return 1
`;

function decodeRow(value: EmailRestockSignup | string): EmailRestockSignup {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

export async function confirmEmailRestock(id: string): Promise<boolean> {
  const db = adminStore();
  const stored = await db.hget<EmailRestockSignup>(key(), id);
  if (!stored) throw new AdminError('Signup not found.', 404);
  let row = decodeRow(stored);
  if (row.confirmation?.status === 'accepted') return true;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_FROM_EMAIL;
  if (!apiKey || !from || from.includes('@resend.dev')) return false;
  if (!row.confirmation) {
    const prepared = await db.eval<unknown[], EmailRestockSignup | string | null>(PREPARE_RESTOCK_CONFIRMATION, [key()], [id, JSON.stringify({
      status: 'pending', startedAt: Date.now(), message: {
        from, to: row.email, replyTo: 'hello@saunahat.co.za', ...restockConfirmationEmail(row.quantities),
      },
    } satisfies Confirmation)]);
    if (!prepared) return false;
    row = decodeRow(prepared);
  }
  const receipt = row.confirmation;
  if (receipt?.status === 'accepted') return true;
  if (!receipt || Date.now() - receipt.startedAt >= RETRY_WINDOW) return false;
  // Freeze the payload and stop before Resend's 24-hour idempotency expiry.
  const response = await new Resend(apiKey).emails.send(receipt.message, {
    idempotencyKey: `restock-confirmation/${stockScope()}/${id}/${digest(row.createdAt)}`,
  });
  if (response.error || !response.data?.id) return false;
  await db.eval(ACCEPT_RESTOCK_CONFIRMATION, [key()], [id, JSON.stringify({
    status: 'accepted', id: response.data.id, acceptedAt: new Date().toISOString(),
  } satisfies Confirmation), row.createdAt]);
  return true;
}

export async function signupEmailRestock(body: Record<string, unknown>, ip: string) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) throw new AdminError('Please enter a valid email address.');
  if (body.consent !== true) throw new AdminError('Please agree to the restock email.');
  const input = body.quantities as CartState | undefined;
  if (!input || !COLOURS.every(c => Number.isSafeInteger(input[c]) && input[c] >= 0 && input[c] <= 99) || input.green + input.cream === 0) {
    throw new AdminError('Please choose your hats.');
  }
  const quantities = { green: input.green, cream: input.cream };
  const db = adminStore();
  const allowed = await db.eval(`
    local ipCount = redis.call('INCR', KEYS[1])
    if ipCount == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
    local emailCount = redis.call('INCR', KEYS[2])
    if emailCount == 1 then redis.call('EXPIRE', KEYS[2], 86400) end
    if ipCount > 10 or emailCount > 5 then return 0 end
    return 1
  `, [`${key()}:ip:${digest(ip)}`, `${key()}:email:${digest(email)}`], []);
  if (!allowed) throw new AdminError('Too many requests. Please try again later.', 429);
  const stock = await getAvailability();
  const waitingColours = COLOURS.filter(c => quantities[c] > stock[c]);
  if (!waitingColours.length) throw new AdminError('Your selection is available. Refresh to add it to your bag.', 409);
  const id = digest(`${email}:${quantities.green}:${quantities.cream}`);
  const row: EmailRestockSignup = {
    id, email, quantities, waitingColours, createdAt: new Date().toISOString(), notifiedAt: null,
    consent: 'Confirmation and restock email for this selection only; no other marketing. v1', confirmation: null,
  };
  const saved = await db.eval(SAVE_EMAIL_RESTOCK, [key()], [id, JSON.stringify(row)]);
  if (!saved) throw new AdminError('The waiting list is temporarily unavailable. Please try again later.', 503);
  try { return { saved: true, confirmationSent: await confirmEmailRestock(id) }; }
  catch { return { saved: true, confirmationSent: false }; }
}

export async function listEmailRestock(): Promise<AdminEmailRestockSignup[]> {
  const rows = await adminStore().hgetall<Record<string, EmailRestockSignup>>(key()) || {};
  return Object.values(rows).map(decodeRow).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(row => ({
    ...row,
    confirmation: row.confirmation?.status === 'accepted' ? row.confirmation : {
      status: row.confirmation && Date.now() - row.confirmation.startedAt >= RETRY_WINDOW ? 'review' : 'pending',
    },
  }));
}

export async function updateEmailRestock(id: string, action: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new AdminError('Invalid signup.');
  if (action === 'remove') { await adminStore().hdel(key(), id); return; }
  if (action === 'confirm') {
    if (!await confirmEmailRestock(id)) throw new AdminError('Confirmation not accepted. Check email configuration or reconcile an older attempt in Resend before sending again.', 503);
    return;
  }
  if (action !== 'notified') throw new AdminError('Invalid action.');
  const row = await adminStore().hget<EmailRestockSignup>(key(), id);
  if (!row) throw new AdminError('Signup not found.', 404);
  const stock = await getAvailability();
  if (COLOURS.some(c => row.quantities[c] > stock[c])) throw new AdminError('The requested quantities are not yet available.');
  await adminStore().eval(`
    local raw = redis.call('HGET', KEYS[1], ARGV[1])
    if not raw then return 0 end
    local row = cjson.decode(raw)
    row.notifiedAt = ARGV[2]
    redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(row))
    return 1
  `, [key()], [id, new Date().toISOString()]);
}
