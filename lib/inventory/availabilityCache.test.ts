import { expect, it, vi } from "vitest";
import { createAvailabilityCache } from "./availabilityCache";
import type { Availability } from "./availability";

const stock: Availability = {
  green: 2,
  cream: 1,
  preorder: { green: 0, cream: 0 },
  batch: "2026-11-30",
  timing: "Ships soon",
  localTest: true,
};

it("shares concurrent requests and avoids refetching a fresh snapshot", async () => {
  let resolve!: (value: Availability) => void;
  const load = vi.fn(
    () =>
      new Promise<Availability>((done) => {
        resolve = done;
      }),
  );
  const cache = createAvailabilityCache(load, () => 100_000);
  const first = cache.refresh();
  const second = cache.refresh();
  expect(first).toBe(second);
  resolve(stock);
  await first;
  await cache.refresh(false);
  expect(load).toHaveBeenCalledTimes(1);
  expect(cache.getSnapshot().stock).toEqual(stock);
});
it("fails closed after a refresh failure and permits explicit retry", async () => {
  const load = vi
    .fn()
    .mockResolvedValueOnce(stock)
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce({ ...stock, green: 0 });
  const cache = createAvailabilityCache(load);
  await cache.refresh();
  await cache.refresh();
  expect(cache.getSnapshot()).toMatchObject({ stock: null, error: expect.any(String) });
  await cache.refresh();
  expect(cache.getSnapshot()).toMatchObject({ stock: { green: 0 }, error: "" });
});
