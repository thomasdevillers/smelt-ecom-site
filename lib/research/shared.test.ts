import { describe, expect, it } from "vitest";
import { BASE_QUESTIONS, FOLLOW_UPS, PRODUCTS, questionsFor, toggleOption, validateSave } from "./shared";

const base = { token: "ab".repeat(32), revision: 1, version: 1, completed: false, answers: { frequency: "About weekly" } };
describe("product research questions", () => {
  it("does not include the removed frustration question", () => {
    expect(BASE_QUESTIONS.map(q => q.id)).toEqual(["frequency", "kit", "products"]);
    expect(questionsFor({})).toHaveLength(4);
  });
  it("asks two unique questions per selected product in a stable order", () => {
    const questions = questionsFor({ products: ["Sauna water bottle", "Sauna towel"] });
    expect(questions.map(q => q.id)).toEqual(["frequency", "kit", "products", "towel.use", "towel.priorities", "bottle.use", "bottle.priorities", "comment"]);
    expect(questions.filter(q => q.product).every(q => q.optional)).toBe(true);
    for (const product of PRODUCTS.filter(p => p !== "Nothing right now")) expect(FOLLOW_UPS[product]).toHaveLength(2);
  });
  it("skips all product questions for nothing right now", () => {
    expect(questionsFor({ products: ["Nothing right now"] })).toHaveLength(4);
  });
  it("keeps deselected product answers without showing their questions", () => {
    const answers = { products: ["Sauna bag"], "towel.use": "Drying off" };
    expect(questionsFor(answers).some(q => q.id === "towel.use")).toBe(false);
    expect(validateSave({ ...base, answers: { ...base.answers, ...answers } }).answers["towel.use"]).toBe("Drying off");
  });
  it("handles exclusive selections and caps priorities at three", () => {
    const question = BASE_QUESTIONS[2];
    expect(toggleOption(question, ["Sauna towel"], "Nothing right now")).toEqual(["Nothing right now"]);
    expect(toggleOption(question, ["Nothing right now"], "Sauna towel")).toEqual(["Sauna towel"]);
    expect(toggleOption(question, ["Sauna towel"], "Sauna towel")).toEqual([]);
    const priorities = FOLLOW_UPS["Sauna towel"][1];
    expect(toggleOption(priorities, ["Softness", "Coverage", "Price"], "Appearance")).toEqual(["Softness", "Coverage", "Price"]);
  });
});
describe("research save validation", () => {
  it("accepts partial answers without requiring submission", () => { expect(validateSave(base)).toEqual(base); });
  it("rejects empty attempts, unknown questions and invalid payloads", () => {
    for (const input of [null, [], {}, { ...base, answers: {} }, { ...base, token: "guessable" }, { ...base, revision: 0 }, { ...base, revision: 1.2 }, { ...base, version: 2 }, { ...base, answers: { unknown: "text" } }, { ...base, answers: { frequency: "invented" } }, { ...base, answers: { frequency: ["About weekly"] } }, { ...base, answers: { products: "Sauna towel" } }, { ...base, answers: { products: ["Sauna towel", "Nothing right now"] } }, { ...base, answers: { products: ["Sauna towel", "Sauna towel"] } }, { ...base, answers: { comment: "a".repeat(1501) } }, { ...base, answers: { "towel.priorities": ["Price", "Softness", "Coverage", "Appearance"] } }]) expect(() => validateSave(input)).toThrow();
  });
  it("requires base answers to complete but permits skipped product follow-ups", () => {
    expect(() => validateSave({ ...base, completed: true })).toThrow();
    expect(validateSave({ ...base, completed: true, answers: { ...base.answers, kit: ["Nothing"], products: ["Sauna towel"] } }).completed).toBe(true);
  });
});
