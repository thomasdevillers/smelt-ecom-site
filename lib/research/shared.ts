export type Question = { id: string; title: string; options?: readonly string[]; multiple?: boolean; max?: number; exclusive?: string; optional?: boolean; product?: string };
export type Answers = Record<string, string | string[]>;
export const SURVEY_VERSION = 1;
export const PRODUCTS = ["Sauna towel", "Sauna water bottle", "Sauna seat pad", "Sauna bag", "More hat styles or colours", "Something else", "Nothing right now"] as const;
export const BASE_QUESTIONS: Question[] = [
  { id: "frequency", title: "How often do you sauna?", options: ["Several times a week", "About weekly", "A few times a month", "Occasionally", "Haven’t tried it yet"] },
  { id: "kit", title: "What do you currently take into the sauna?", multiple: true, exclusive: "Nothing", options: ["Regular towel", "Dedicated sauna towel", "Sauna hat", "Water bottle", "Something else", "Nothing"] },
  { id: "products", title: "What would you like Smelt to explore next?", multiple: true, exclusive: "Nothing right now", options: PRODUCTS },
];
export const FOLLOW_UPS: Record<string, Question[]> = {
  "Sauna towel": [
    { id: "towel.use", title: "What would you mainly use a sauna towel for?", options: ["Sitting or lying on", "Wrapping around myself", "Drying off", "A combination", "Not sure"] },
    { id: "towel.priorities", title: "What matters most in a sauna towel?", multiple: true, max: 3, options: ["Quick drying", "Absorbency", "Softness", "Compactness", "Coverage", "Natural fibres", "Easy washing", "Price", "Appearance"] },
  ],
  "Sauna water bottle": [
    { id: "bottle.use", title: "When would you mainly use a sauna water bottle?", options: ["Between sauna rounds", "After the sauna", "Throughout the day", "Exercise and sauna", "Not sure"] },
    { id: "bottle.priorities", title: "What matters most in a sauna water bottle?", multiple: true, max: 3, options: ["Keeps water cold", "Comfortable to handle", "Leakproof", "Easy cleaning", "Lightweight", "Large capacity", "Compact size", "Price", "Appearance"] },
  ],
  "Sauna seat pad": [
    { id: "seat.use", title: "How would you mainly use a sauna seat pad?", options: ["Sitting on a shared bench", "Lying along a bench", "At my home sauna", "Travelling between saunas", "Not sure"] },
    { id: "seat.priorities", title: "What matters most in a sauna seat pad?", multiple: true, max: 3, options: ["Comfortable against skin", "Easy washing", "Quick drying", "Compactness", "Bench coverage", "Natural fibres", "Price"] },
  ],
  "Sauna bag": [
    { id: "bag.use", title: "What would your sauna bag need to carry?", multiple: true, options: ["Hat", "Towel", "Bottle", "Swimwear", "Change of clothes", "Toiletries"] },
    { id: "bag.priorities", title: "What matters most in a sauna bag?", multiple: true, max: 3, options: ["Wet/dry separation", "Ventilation", "Easy cleaning", "Compact size", "Room for everything", "Comfortable carrying", "Price", "Appearance"] },
  ],
  "More hat styles or colours": [
    { id: "hats.changes", title: "What would you like to see change about the hats?", multiple: true, options: ["New colours", "Different shapes", "Different sizes", "New embroidery", "Personalisation", "Something else"] },
    { id: "hats.details", title: "What colours, fit or design do you have in mind?", optional: true },
  ],
  "Something else": [
    { id: "other.idea", title: "What would you like us to make?" },
    { id: "other.reason", title: "What would it help you do, or improve about your current setup?", optional: true },
  ],
};
export const FINAL_QUESTION: Question = { id: "comment", title: "Anything else you’d love us to make or consider?", optional: true };
export const ALL_QUESTIONS = [...BASE_QUESTIONS, ...Object.entries(FOLLOW_UPS).flatMap(([product, questions]) => questions.map(q => ({ ...q, product, optional: true }))), FINAL_QUESTION];
export function questionsFor(answers: Answers): Question[] {
  const selected = Array.isArray(answers.products) ? answers.products : [];
  return [...BASE_QUESTIONS, ...PRODUCTS.filter(product => selected.includes(product)).flatMap(product => (FOLLOW_UPS[product] || []).map(q => ({ ...q, product, optional: true }))), FINAL_QUESTION];
}
export function hasAnswer(value: string | string[] | undefined) { return Array.isArray(value) ? value.length > 0 : !!value?.trim(); }
export function toggleOption(question: Question, current: string | string[] | undefined, option: string): string | string[] {
  if (!question.multiple) return option;
  const selected = Array.isArray(current) ? current : [];
  if (selected.includes(option)) return selected.filter(value => value !== option);
  if (option === question.exclusive) return [option];
  const next = selected.filter(value => value !== question.exclusive);
  return question.max && next.length >= question.max ? selected : [...next, option];
}
export type ResearchSave = { token: string; revision: number; version: number; answers: Answers; completed: boolean };
export function validateSave(input: unknown): ResearchSave {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid questionnaire data.");
  const body = input as Record<string, unknown>;
  if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token) || !Number.isSafeInteger(body.revision) || (body.revision as number) < 1 || (body.revision as number) > 1_000_000 || body.version !== SURVEY_VERSION || typeof body.completed !== "boolean") throw new Error("Invalid questionnaire data.");
  if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) throw new Error("Invalid answers.");
  const answers: Answers = {};
  for (const [id, value] of Object.entries(body.answers)) {
    const question = ALL_QUESTIONS.find(q => q.id === id);
    if (!question) throw new Error("Unknown question.");
    if (question.options) {
      const values = question.multiple ? value : [value];
      if (!Array.isArray(values) || values.length > (question.max || question.options.length) || new Set(values).size !== values.length || values.some(v => typeof v !== "string" || !question.options!.includes(v)) || (question.exclusive && values.includes(question.exclusive) && values.length > 1)) throw new Error("Invalid selection.");
      answers[id] = question.multiple ? values : values[0];
    } else {
      if (typeof value !== "string" || value.length > 1500) throw new Error("Please keep written answers under 1,500 characters.");
      answers[id] = value;
    }
  }
  if (!Object.values(answers).some(hasAnswer)) throw new Error("Please answer a question first.");
  if (body.completed && BASE_QUESTIONS.some(q => !hasAnswer(answers[q.id]))) throw new Error("Please answer the first three questions before finishing.");
  return { token: body.token, revision: body.revision as number, version: SURVEY_VERSION, answers, completed: body.completed };
}
export type ResearchResponse = { id: string; version: number; revision: number; answers: Answers; createdAt: string; updatedAt: string; completedAt: string | null };
