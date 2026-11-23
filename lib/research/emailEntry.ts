import { BASE_QUESTIONS } from "./shared";

export const EMAIL_QUESTION = BASE_QUESTIONS[0];

export function emailEntryAnswer(params: URLSearchParams): string | null {
  const answer = params.get("frequency");
  return answer && EMAIL_QUESTION.options?.includes(answer) ? answer : null;
}
