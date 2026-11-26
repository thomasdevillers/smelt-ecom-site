import { describe, expect, it } from "vitest";
import { EMAIL_QUESTION, emailEntryAnswer } from "./emailEntry";

describe("questionnaire email entry", () => {
  it("accepts each of the first question's exact options", () => {
    expect(EMAIL_QUESTION.id).toBe("frequency");
    for (const option of EMAIL_QUESTION.options!) {
      const params = new URLSearchParams({ frequency: option });
      expect(emailEntryAnswer(new URLSearchParams(params.toString()))).toBe(option);
    }
  });

  it("ignores missing, empty and invalid answers", () => {
    for (const query of [
      "",
      "frequency=",
      "frequency=invalid",
      "frequency=%3Cscript%3E",
      "frequency=0",
    ]) {
      expect(emailEntryAnswer(new URLSearchParams(query))).toBeNull();
    }
  });
});
