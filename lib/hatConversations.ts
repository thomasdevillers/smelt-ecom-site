import type { HatAnswer } from "./askHatShared";

export type HatTurn = {
  id: string;
  sequence: number;
  question: string;
  askedAt: string;
  finishedAt?: string;
  status: "pending" | "answered" | "error";
  answer?: HatAnswer;
  error?: string;
};
export type HatConversationSummary = {
  id: string;
  firstQuestion: string;
  startedAt: string;
  updatedAt: string;
  turnCount: number;
};
export type HatConversation = HatConversationSummary & { turns: HatTurn[] };
export type HatConversationsPage = { conversations: HatConversationSummary[]; page: number; pageCount: number; total: number };
export const isHatConversationId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
