// A form on another site cannot reach a route that sets a session or changes
// a record (login CSRF). A browser sends Origin on a cross-origin POST; the
// proxy refuses when it is not ours. Callers with no Origin (tests, webhooks,
// cron) are untouched and reach the route's own checks.

import { expect, test } from "@playwright/test";

const body = { phone: "0501234567", otp_code: "123456" };

test("a POST from another site is refused before the route sees it", async ({ request }) => {
  const res = await request.post("/api/login/verify", {
    data: body,
    headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
  });
  expect(res.status()).toBe(403);
  expect(await res.json()).toMatchObject({ code: "cross_site" });
  expect(res.headers()["set-cookie"] ?? "").not.toContain("sb-");
});

test("a text/plain form post from another site is refused the same way", async ({ request }) => {
  const res = await request.post("/api/login/verify", {
    data: JSON.stringify(body),
    headers: { Origin: "https://evil.example", "Content-Type": "text/plain" },
  });
  expect(res.status()).toBe(403);
});

test("the same request without an Origin reaches the route's own checks", async ({ request }) => {
  const res = await request.post("/api/login/verify", { data: body });
  expect(res.status()).not.toBe(403);
});

test("a read is never refused for its Origin", async ({ request }) => {
  const res = await request.get("/api/institutions", { headers: { Origin: "https://evil.example" } });
  expect(res.status()).not.toBe(403);
});
