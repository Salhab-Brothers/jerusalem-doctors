import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Sms4FreeOtpSender, fetchAvailableSms } from "./sms4free";

let reply = { body: "1", status: 200 };
let lastRequest: Record<string, string> | null = null;
let lastHeaders: Record<string, string | string[] | undefined> = {};
let server: ReturnType<typeof createServer>;
let sender: Sms4FreeOtpSender;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastRequest = JSON.parse(raw);
      lastHeaders = req.headers;
      res.writeHead(reply.status, { "Content-Type": "application/json" });
      res.end(reply.body);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  process.env.SMS4FREE_KEY = "K";
  process.env.SMS4FREE_USER = "0500000000";
  process.env.SMS4FREE_PASS = "P";
  process.env.SMS4FREE_SENDER = "JDoctors";
  process.env.SMS4FREE_API_URL = `http://127.0.0.1:${port}/`;
  process.env.SMS4FREE_BALANCE_URL = `http://127.0.0.1:${port}/`;
  sender = new Sms4FreeOtpSender();
});

afterAll(() => server.close());

const send = () => sender.send("+972501234567", "012345");

describe("Sms4FreeOtpSender over HTTP", () => {
  it("accepts status 1 and sends the right payload", async () => {
    reply = { body: '{"status":1,"message":"OK"}', status: 200 };
    const r = await send();
    expect(r.messageRef).toBe("sms4free:accepted:1");
    expect(lastRequest).toEqual({
      key: "K",
      user: "0500000000",
      pass: "P",
      sender: "JDoctors",
      recipient: "0501234567",
      msg: "012345 هو رمز دخول دليل أطباء القدس. لا تشاركه.",
    });
  });

  it("asks for a delivery report when reports are on", async () => {
    reply = { body: "1", status: 200 };
    process.env.SEND_SMS_HOOK_SECRET = "v1,whsec_test";
    process.env.SMS_DELIVERY_BASE_URL = "https://jd.example";
    try {
      await send();
    } finally {
      delete process.env.SEND_SMS_HOOK_SECRET;
      delete process.env.SMS_DELIVERY_BASE_URL;
    }
    expect(lastRequest?.returnUrl).toMatch(/^https:\/\/jd\.example\/api\/sms\/delivery\?k=[0-9a-f]{32}$/);
    expect(lastRequest?.usermsgid).toMatch(/^\d{13}-[0-9a-f]{8}$/);
  });

  it("accepts a bare numeric body", async () => {
    reply = { body: "1", status: 200 };
    await expect(send()).resolves.toMatchObject({ messageRef: "sms4free:accepted:1" });
  });

  it("FAILS on HTTP 200 carrying a negative status", async () => {
    reply = { body: '{"status":-4,"message":"low"}', status: 200 };
    await expect(send()).rejects.toMatchObject({ permanent: true });
  });

  it("marks an unverified sender permanent", async () => {
    reply = { body: "-6", status: 200 };
    await expect(send()).rejects.toMatchObject({ permanent: true });
  });

  it("leaves the general error retryable", async () => {
    reply = { body: "0", status: 200 };
    await expect(send()).rejects.toMatchObject({ permanent: false });
  });

  it("does not claim success on an unparseable body", async () => {
    reply = { body: "<html>oops</html>", status: 200 };
    await expect(send()).rejects.toMatchObject({ permanent: false });
  });

  it("treats 5xx as transient and 4xx as permanent", async () => {
    reply = { body: "err", status: 500 };
    await expect(send()).rejects.toMatchObject({ permanent: false });
    reply = { body: "nope", status: 403 };
    await expect(send()).rejects.toMatchObject({ permanent: true });
  });

  it("refuses a +970 number without touching the network", async () => {
    lastRequest = null;
    await expect(sender.send("+970599123456", "012345")).rejects.toMatchObject({
      permanent: true,
    });
    expect(lastRequest).toBeNull();
  });

  it("never puts the OTP in the error message", async () => {
    reply = { body: "-1", status: 200 };
    await expect(send()).rejects.toThrow(/^(?!.*012345).*$/);
  });
});

describe("fetchAvailableSms", () => {
  it("reads the bare number the live endpoint returns", async () => {
    reply = { body: "10", status: 200 };
    await expect(fetchAvailableSms()).resolves.toBe(10);
    // credentials only, no sender, no recipient
    expect(lastRequest).toEqual({ key: "K", user: "0500000000", pass: "P" });
  });

  it("treats an empty account as a valid answer, not an error", async () => {
    reply = { body: "0", status: 200 };
    await expect(fetchAvailableSms()).resolves.toBe(0);
  });

  it("throws on a credential failure", async () => {
    reply = { body: "-1", status: 200 };
    await expect(fetchAvailableSms()).rejects.toMatchObject({ permanent: true });
  });

  it("does not report a balance from an unparseable body", async () => {
    reply = { body: "<html>oops</html>", status: 200 };
    await expect(fetchAvailableSms()).rejects.toThrow(/unparseable/);
  });
});

describe("the provider's answers, edge by edge", () => {
  const status = (code: number) => ({ body: String(code), status: 200 });

  it("maps every documented status to its label and to permanent or retryable", async () => {
    const table: [number, boolean, string][] = [
      [0, false, "general provider error"],
      [-1, true, "invalid key, user or password"],
      [-2, true, "invalid sender id"],
      [-3, true, "no recipients"],
      [-4, true, "insufficient message balance"],
      [-5, true, "message content rejected"],
      [-6, true, "sender number not verified"],
    ];
    for (const [code, permanent, label] of table) {
      reply = status(code);
      await expect(send(), String(code)).rejects.toMatchObject({
        permanent,
        reason: `sms4free_status_${code}`,
        message: expect.stringContaining(label),
      });
    }
  });

  it("keeps an undocumented status retryable and says so", async () => {
    reply = { body: '{"status":-9,"message":"new code"}', status: 200 };
    await expect(send()).rejects.toMatchObject({ permanent: false, reason: "sms4free_status_-9", message: expect.stringContaining("new code") });
    reply = status(-9);
    await expect(send()).rejects.toMatchObject({ permanent: false, message: expect.stringContaining("unknown status") });
    await expect(fetchAvailableSms()).rejects.toMatchObject({ permanent: false, message: expect.stringContaining("unknown status") });
  });

  it("treats an empty or blank body as unreadable, never as the general error", async () => {
    for (const body of ["", "   ", "\n"]) {
      reply = { body, status: 200 };
      await expect(send(), JSON.stringify(body)).rejects.toMatchObject({ permanent: false, reason: "sms4free_unreadable" });
      await expect(fetchAvailableSms(), JSON.stringify(body)).rejects.toMatchObject({ permanent: false, message: expect.stringContaining("unparseable") });
    }
  });

  it("is permanent for HTTP 400 to 499 only, for a send and for the balance check", async () => {
    for (const [code, permanent] of [[400, true], [404, true], [499, true], [304, false], [500, false], [503, false]] as const) {
      reply = { body: "x", status: code };
      await expect(send(), `send ${code}`).rejects.toMatchObject({ permanent, reason: `sms4free_http_${code}` });
      await expect(fetchAvailableSms(), `balance ${code}`).rejects.toMatchObject({ permanent });
    }
  });

  it("sends and reads the balance as JSON", async () => {
    reply = { body: "1", status: 200 };
    await send();
    expect(lastHeaders["content-type"]).toBe("application/json");
    lastHeaders = {};
    reply = { body: "5", status: 200 };
    await fetchAvailableSms();
    expect(lastHeaders["content-type"]).toBe("application/json");
  });

  it("needs all three credentials to read the balance, as a permanent configuration error", async () => {
    const key = process.env.SMS4FREE_KEY;
    delete process.env.SMS4FREE_KEY;
    try {
      await expect(fetchAvailableSms()).rejects.toMatchObject({ permanent: true, message: expect.stringContaining("missing env") });
    } finally {
      process.env.SMS4FREE_KEY = key;
    }
  });
});
