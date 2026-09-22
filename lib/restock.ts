import { adminStore, digest, AdminError } from './admin/store';
import { normalizeWhatsAppPhone } from './whatsapp';
import { stockScope } from './stockEnvironment';
import { COLOURS, PRODUCT, type Colour } from './product';
import { PREORDER_BATCH } from './preorders';
import { abs } from './seo';
export interface RestockSignup { id: string; colour: Colour; phone: string; createdAt: string; notifiedAt: string | null; consent: string }
const key = () => `smelt:restock:v1:${stockScope()}:${PREORDER_BATCH}`;
export async function signupRestock(body: Record<string, unknown>, ip: string) {
  if (!COLOURS.includes(body.colour as Colour) || body.consent !== true || typeof body.phone !== 'string' || body.phone.length > 24 || !/^[+\d\s()-]+$/.test(body.phone)) throw new AdminError('Choose a colour, enter a valid WhatsApp number and agree to the restock message.');
  const phone = normalizeWhatsAppPhone(body.phone);
  if (!phone) throw new AdminError('Please enter a valid WhatsApp number.');
  const colour = body.colour as Colour;
  const id = digest(`${colour}:${phone}`);
  const row: RestockSignup = { id, phone, colour, createdAt: new Date().toISOString(), notifiedAt: null, consent: 'Restock WhatsApp for this colour only; no other marketing. v1' };
  const allowed = await adminStore().eval(`
    local attempts = redis.call('INCR', KEYS[2])
    if attempts == 1 then redis.call('EXPIRE', KEYS[2], 3600) end
    if attempts > 10 then return 0 end
    if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 1 end
    if redis.call('HLEN', KEYS[1]) >= 5000 then return 0 end
    redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
    redis.call('EXPIRE', KEYS[1], 7776000)
    return 1
  `, [key(), `${key()}:rate:${digest(ip)}`], [id, JSON.stringify(row)]);
  if (!allowed) throw new AdminError('Too many requests. Please try again later.', 429);
}
export async function listRestock() {
  const records = await adminStore().hgetall<Record<string, RestockSignup>>(key()) || {};
  return Object.values(records).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(row => ({ ...row,
    whatsappUrl: `https://wa.me/${row.phone}?${new URLSearchParams({ text: `Hi! You asked us to let you know when ${PRODUCT.variants[row.colour].name} is back. It’s now available to order: ${abs(`/product?colour=${row.colour}`)}\n\nThis notification doesn’t reserve stock. Reply STOP if you no longer want this update. Warm regards, Smelt.` })}`,
  }));
}
export async function updateRestock(id: string, action: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new AdminError('Invalid signup.');
  if (action === 'remove') { await adminStore().hdel(key(), id); return; }
  if (action !== 'notified') throw new AdminError('Invalid action.');
  await adminStore().eval(`local raw = redis.call('HGET', KEYS[1], ARGV[1]); if not raw then return 0 end; local d = cjson.decode(raw); d.notifiedAt = ARGV[2]; redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(d)); return 1`, [key()], [id, new Date().toISOString()]);
}
