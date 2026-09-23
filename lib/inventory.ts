import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { CartState } from "./cartReducer";
import type { Colour } from "./product";
import { localStockTest, stockScope } from './stockEnvironment';

export const INITIAL_STOCK: Readonly<Record<Colour, number>> = {
  green: 9,
  cream: 13,
};

export interface InventorySnapshot {
  green: number;
  cream: number;
}

// Checkout reservations are reconciled for expiry after one hour.
export const RESERVATION_TTL_SECONDS = 60 * 60;

const mode = stockScope;
const keys = () => {
  const prefix = `smelt:inventory:v1:${mode()}`;
  return {
    stock: `${prefix}:available`,
    reservations: `${prefix}:reservations`,
    expiries: `${prefix}:expiries`,
    committed: `${prefix}:committed`,
  };
};

function store() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Inventory storage is not configured.");
  return new Redis({ url, token, retry: { retries: 0 }, signal: () => AbortSignal.timeout(10_000) });
}

// Never recycle a hold merely because time elapsed: its payment link may
// still accept money or its successful webhook may have been delayed.
const CLEAN_EXPIRED = `
redis.call('HSETNX', KEYS[1], 'green', ARGV[2])
redis.call('HSETNX', KEYS[1], 'cream', ARGV[3])
`;

const READ_STOCK = `${CLEAN_EXPIRED}
return {tonumber(redis.call('HGET', KEYS[1], 'green')), tonumber(redis.call('HGET', KEYS[1], 'cream'))}
`;

const RESERVE_STOCK = `${CLEAN_EXPIRED}
if redis.call('HGET', KEYS[2], ARGV[4]) then
  return {1, tonumber(redis.call('HGET', KEYS[1], 'green')), tonumber(redis.call('HGET', KEYS[1], 'cream'))}
end
local green = tonumber(redis.call('HGET', KEYS[1], 'green'))
local cream = tonumber(redis.call('HGET', KEYS[1], 'cream'))
local requestedGreen = tonumber(ARGV[5])
local requestedCream = tonumber(ARGV[6])
if requestedGreen > green or requestedCream > cream then return {0, green, cream} end
green = redis.call('HINCRBY', KEYS[1], 'green', -requestedGreen)
cream = redis.call('HINCRBY', KEYS[1], 'cream', -requestedCream)
redis.call('HSET', KEYS[2], ARGV[4], requestedGreen .. ':' .. requestedCream)
redis.call('ZADD', KEYS[3], ARGV[7], ARGV[4])
return {1, green, cream}
`;

const RELEASE_STOCK = `
local held = redis.call('HGET', KEYS[2], ARGV[1])
if not held then return 0 end
local separator = string.find(held, ':')
redis.call('HINCRBY', KEYS[1], 'green', tonumber(string.sub(held, 1, separator - 1)))
redis.call('HINCRBY', KEYS[1], 'cream', tonumber(string.sub(held, separator + 1)))
redis.call('HDEL', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[3], ARGV[1])
return 1
`;

const COMMIT_STOCK = `
if redis.call('SISMEMBER', KEYS[4], ARGV[1]) == 1 then return 1 end
local held = redis.call('HGET', KEYS[2], ARGV[1])
if not held or held ~= (ARGV[2] .. ':' .. ARGV[3]) then return 0 end
redis.call('HDEL', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[3], ARGV[1])
redis.call('SADD', KEYS[4], ARGV[1])
return 1
`;

function snapshot(result: unknown): InventorySnapshot {
  const values = Array.isArray(result) ? result : [];
  return {
    green: Math.max(0, Number(values[0]) || 0),
    cream: Math.max(0, Number(values[1]) || 0),
  };
}

export async function getInventory(): Promise<InventorySnapshot> {
  const k = keys();
  const result = await store().eval(READ_STOCK, [k.stock, k.reservations, k.expiries], [
    Date.now(), localStockTest() ? 0 : INITIAL_STOCK.green, localStockTest() ? 0 : INITIAL_STOCK.cream,
  ]);
  return snapshot(result);
}

export function createInventoryReservationId(): string {
  return `smelt-${randomUUID()}`;
}

export async function reserveInventory(cart: CartState, reservationId: string): Promise<{ reserved: boolean; stock: InventorySnapshot }> {
  const k = keys();
  const result = await store().eval(
    RESERVE_STOCK,
    [k.stock, k.reservations, k.expiries],
    [Date.now(), localStockTest() ? 0 : INITIAL_STOCK.green, localStockTest() ? 0 : INITIAL_STOCK.cream, reservationId, cart.green, cart.cream, Date.now() + RESERVATION_TTL_SECONDS * 1000],
  );
  const values = Array.isArray(result) ? result : [];
  return { reserved: Number(values[0]) === 1, stock: snapshot(values.slice(1)) };
}

export async function releaseInventory(reservationId: string): Promise<boolean> {
  const k = keys();
  return Number(await store().eval(RELEASE_STOCK, [k.stock, k.reservations, k.expiries], [reservationId])) === 1;
}

export async function commitInventory(reservationId: string, cart: CartState): Promise<boolean> {
  if (reservationId.startsWith("smeltp-")) return (await import("./preorderStore")).commitPurchase(reservationId, cart);
  const k = keys();
  return Number(await store().eval(
    COMMIT_STOCK,
    [k.stock, k.reservations, k.expiries, k.committed],
    [reservationId, cart.green, cart.cream],
  )) === 1;
}
