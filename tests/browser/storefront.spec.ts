import { test, expect, type Page } from "@playwright/test";

const inventory = {
  green: 5,
  cream: 5,
  preorder: { green: 0, cream: 0 },
  batch: "2026-11-30",
  timing: "Ships in 1–3 business days",
  localTest: true,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({ status: 503, json: { error: "Unmocked test API" } });
    return route.continue();
  });
  await page.route("**/api/inventory", (route) => route.fulfill({ json: inventory }));
});

async function seedCart(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("test-cart-seeded")) {
      localStorage.setItem("smelt-cart-v1", JSON.stringify({ green: 1, cream: 0 }));
      sessionStorage.setItem("test-cart-seeded", "true");
    }
  });
}

async function fillCheckout(page: Page) {
  await page.getByLabel("Email Address", { exact: true }).fill("buyer@example.com");
  await page.getByLabel("Full name", { exact: true }).fill("Test Buyer");
  await page.getByLabel("Street address", { exact: true }).fill("12 Loop Street");
  await page.getByRole("button", { name: "Enter address manually" }).click();
  await page.getByLabel("Suburb", { exact: true }).fill("City Centre");
  await page.getByLabel("City", { exact: true }).fill("Cape Town");
  await page.getByLabel("Postal code", { exact: true }).fill("8001");
  await page.getByLabel("Province", { exact: true }).fill("Western Cape");
  await page.getByLabel("Contact phone number", { exact: true }).fill("0832342234");
}

test("cart drawer loads stock only on opening and restores keyboard focus", async ({ page }) => {
  await seedCart(page);
  let requests = 0;
  await page.route("**/api/inventory", (route) => {
    requests++;
    return route.fulfill({ json: inventory });
  });
  await page.goto("/");
  const bag = page.getByRole("button", { name: "Bag · 1" });
  await expect(bag).toBeVisible();
  expect(requests).toBe(0);
  await bag.click();
  const dialog = page.getByRole("dialog", { name: "Shopping bag" });
  await expect(dialog.getByRole("button", { name: "Increase Forest Green" })).toBeEnabled();
  expect(requests).toBe(1);
  await expect(dialog.getByRole("button", { name: "Close bag" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "View full bag" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close bag" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(bag).toBeFocused();
  await expect(dialog).toHaveCount(0);
});

test("checkout applies a coupon, opens hosted payment and clears the verified cart", async ({
  page,
}) => {
  await seedCart(page);
  await page.route("**/api/vouchers/validate", (route) =>
    route.fulfill({ json: { code: "WARM50", amount: 50 } }),
  );
  await page.route("**/api/checkout", async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({
      email: "buyer@example.com",
      voucherCode: "WARM50",
      cart: { green: 1, cream: 0 },
      address: { city: "Cape Town", phone: "0832342234" },
    });
    await route.fulfill({
      json: {
        configured: true,
        authorizationUrl: "http://127.0.0.1:3100/checkout/success?reference=test-paid",
      },
    });
  });
  await page.route("**/api/checkout/verify?*", (route) =>
    route.fulfill({
      json: {
        paid: true,
        reference: "test-paid",
        amountRand: 590,
        currency: "ZAR",
        items: [{ colour: "green", qty: 1 }],
        shippingMethod: "aramex",
      },
    }),
  );
  await page.goto("/cart");
  await page.getByRole("link", { name: /Checkout securely/ }).click();
  await page.getByLabel("Coupon code", { exact: true }).fill("WARM50");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Coupon · WARM50")).toBeVisible();
  await fillCheckout(page);
  await page.getByRole("button", { name: "Pay R590 securely" }).click();
  await expect(page).toHaveURL(/checkout\/success\?reference=test-paid/);
  await expect(page.getByRole("button", { name: "Bag · 0" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("smelt-cart-v1")!)))
    .toEqual({ green: 0, cream: 0 });
});

test("checkout refuses payment when stock drops on a focus refresh", async ({ page }) => {
  await page.clock.install();
  await seedCart(page);
  let stock = inventory;
  await page.route("**/api/inventory", (route) => route.fulfill({ json: stock }));
  await page.goto("/checkout");
  const pay = page.getByRole("button", { name: /Pay R640 securely/ });
  await expect(pay).toBeEnabled();
  stock = { ...inventory, green: 0 };
  await page.clock.fastForward(31_000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(pay).toBeDisabled();
  await expect(page.getByRole("alert").filter({ hasText: "exceed available stock" })).toBeVisible();
});

test("admin login and logout use the isolated admin shell", async ({ page }) => {
  let authenticated = false;
  await page.route("**/api/admin/session", async (route) => {
    if (route.request().method() === "POST") authenticated = true;
    if (route.request().method() === "DELETE") authenticated = false;
    await route.fulfill({ json: { authenticated } });
  });
  await page.route("**/api/admin/orders?*", (route) =>
    route.fulfill({
      json: {
        orders: [],
        page: 1,
        pageCount: 0,
        total: 0,
        activeTotal: 0,
        completedTotal: 0,
        preorderToFulfil: { green: 0, cream: 0 },
      },
    }),
  );
  await page.route("**/api/admin/email-audit", (route) =>
    route.fulfill({ json: { report: null } }),
  );
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: /Bag ·/ })).toHaveCount(0);
  await page.getByLabel("Admin password", { exact: true }).fill("browser-test-password");
  await page.getByRole("button", { name: /Open dispatch desk/ }).click();
  await expect(page.getByRole("heading", { name: "All caught up" })).toBeVisible();
  await page.getByRole("button", { name: /Sign out/ }).click();
  await expect(page.getByLabel("Admin password", { exact: true })).toBeVisible();
});

test("private offer links do not mount analytics scripts", async ({ page }) => {
  await page.goto("/checkout/offer/WARM50");
  await expect(page.locator("#google-ads-tag, #meta-pixel")).toHaveCount(0);
  expect(await page.locator('meta[name="referrer"]').getAttribute("content")).toBe("no-referrer");
});

test("mobile home has no horizontal overflow and records a local resource baseline", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const baseline = await page.evaluate(() => ({
    navigation: performance.getEntriesByType("navigation").map((entry) => entry.toJSON()),
    resources: performance.getEntriesByType("resource").map((entry) => entry.toJSON()),
  }));
  await testInfo.attach("local-mobile-resources.json", {
    body: JSON.stringify(baseline, null, 2),
    contentType: "application/json",
  });
});
