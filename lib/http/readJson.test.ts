import { expect, it } from "vitest";
import { readJsonObject } from "./readJson";

const request = (body: string) =>
  new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

it.each(["null", "[]", "1", '"text"', "{"])("rejects non-object JSON %s", async (body) => {
  await expect(readJsonObject(request(body))).rejects.toMatchObject({ status: 400 });
});
it("limits actual UTF-8 bytes without relying on Content-Length", async () => {
  await expect(
    readJsonObject(request(JSON.stringify({ name: "é".repeat(10) })), 25),
  ).rejects.toMatchObject({ status: 413 });
});
it("accepts a JSON object with an optional charset", async () => {
  const req = request('{"name":"Test"}');
  req.headers.set("Content-Type", "application/json; charset=utf-8");
  expect(await readJsonObject(req)).toEqual({ name: "Test" });
});
