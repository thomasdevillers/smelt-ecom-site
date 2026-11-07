import "server-only";
import { randomUUID } from "node:crypto";
import { adminStore } from "./admin/store";
import type { HatAnswer } from "./askHatShared";
import type { HatConversation, HatConversationSummary, HatConversationsPage, HatTurn } from "./hatConversations";

const prefix = () => `smelt:ask-hat:conversations:v1:${process.env.VERCEL_ENV || "local"}`;
const keys = (id: string) => [`${prefix()}:index`, `${prefix()}:${id}:meta`, `${prefix()}:${id}:turns`];

// Store only the current question and the server's own answer, never client-supplied assistant history.
// Atomic insertion keeps concurrent follow-ups from overwriting earlier exchanges.
export const BEGIN_HAT_TURN = `
redis.call('HSETNX', KEYS[2], 'id', ARGV[1])
redis.call('HSETNX', KEYS[2], 'firstQuestion', ARGV[2])
redis.call('HSETNX', KEYS[2], 'startedAt', ARGV[3])
redis.call('HSET', KEYS[2], 'updatedAt', ARGV[3])
local sequence = redis.call('HINCRBY', KEYS[2], 'turnCount', 1)
local turn = cjson.decode(ARGV[5])
turn.sequence = sequence
redis.call('HSET', KEYS[3], ARGV[4], cjson.encode(turn))
redis.call('ZADD', KEYS[1], 'NX', ARGV[6], ARGV[1])
return sequence
`;
export const FINISH_HAT_TURN = `
if redis.call('HEXISTS', KEYS[3], ARGV[1]) == 0 then return 0 end
redis.call('HSET', KEYS[3], ARGV[1], ARGV[2])
redis.call('HSET', KEYS[2], 'updatedAt', ARGV[3])
return 1
`;

export async function beginHatTurn(conversationId: string, question: string): Promise<HatTurn> {
  const turn: HatTurn = { id: randomUUID(), sequence: 0, question, askedAt: new Date().toISOString(), status: "pending" };
  const sequence = await adminStore().eval<unknown[], number>(BEGIN_HAT_TURN, keys(conversationId), [
    conversationId, question, turn.askedAt, turn.id, JSON.stringify(turn), Date.parse(turn.askedAt),
  ]);
  return { ...turn, sequence };
}

export async function finishHatTurn(conversationId: string, turn: HatTurn, outcome: { answer: HatAnswer } | { error: string }) {
  const finishedAt = new Date().toISOString();
  const result = await adminStore().eval(FINISH_HAT_TURN, keys(conversationId), [turn.id, JSON.stringify({
    ...turn, ...outcome, finishedAt, status: "answer" in outcome ? "answered" : "error",
  }), finishedAt]);
  if (result !== 1) throw new Error("hat_transcript_missing");
}

function summary(value: Record<string, unknown>): HatConversationSummary {
  return { id: String(value.id), firstQuestion: String(value.firstQuestion), startedAt: String(value.startedAt),
    updatedAt: String(value.updatedAt), turnCount: Number(value.turnCount) };
}

export async function listHatConversations(page: number): Promise<HatConversationsPage> {
  const db = adminStore();
  const total = await db.zcard(`${prefix()}:index`);
  const pageCount = Math.ceil(total / 20);
  page = Math.min(page, Math.max(1, pageCount));
  const ids = await db.zrange<string[]>(`${prefix()}:index`, (page - 1) * 20, page * 20 - 1, { rev: true });
  const records = await Promise.all(ids.map(id => db.hgetall<Record<string, unknown>>(keys(id)[1])));
  return { conversations: records.filter(value => value !== null).map(summary), total, page, pageCount };
}

export async function getHatConversation(id: string): Promise<HatConversation | null> {
  const db = adminStore();
  const [, metaKey, turnsKey] = keys(id);
  const [meta, turns] = await Promise.all([
    db.hgetall<Record<string, unknown>>(metaKey), db.hgetall<Record<string, HatTurn>>(turnsKey),
  ]);
  if (!meta) return null;
  return { ...summary(meta), turns: Object.values(turns ?? {}).sort((a, b) => a.sequence - b.sequence) };
}
