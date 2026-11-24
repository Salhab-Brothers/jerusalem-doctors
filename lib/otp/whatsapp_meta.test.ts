import { tel } from "@/test/phone";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppMetaOtpSender, buildAuthTemplatePayload } from "./whatsapp_meta";

describe("buildAuthTemplatePayload", () => {
  const payload = buildAuthTemplatePayload("+972501234567", "123456", "otp_login_ar");

  it("strips the leading + from the recipient", () => {
    expect(payload.to).toBe("972501234567");
  });

  it("strips only the leading +", () => {
    expect(buildAuthTemplatePayload("+97+25", "1", "t").to).toBe("97+25");
    expect(buildAuthTemplatePayload("97+25", "1", "t").to).toBe("97+25");
  });

  it("leaves an already-plainless number alone", () => {
    expect(buildAuthTemplatePayload("972501234567", "1", "t").to).toBe("972501234567");
  });

  it("targets the named template in Arabic by default", () => {
    expect(payload.template.name).toBe("otp_login_ar");
    expect(payload.template.language.code).toBe("ar");
  });

  it("honours a language override", () => {
    const p = buildAuthTemplatePayload("+972501234567", "1", "t", "en_US");
    expect(p.template.language.code).toBe("en_US");
  });

  it("puts the code in BOTH the body and the copy-code button", () => {
    const [body, button] = payload.template.components;
    expect(body!.type).toBe("body");
    expect(body!.parameters[0]?.text).toBe("123456");
    expect(button!.type).toBe("button");
    expect(button!.sub_type).toBe("url");
    expect(button!.index).toBe("0");
    expect(button!.parameters[0]?.text).toBe("123456");
  });

  it("preserves leading zeros in the code", () => {
    const p = buildAuthTemplatePayload("+972501234567", "000123", "t");
    expect(p.template.components[0]?.parameters[0]?.text).toBe("000123");
  });

  it("declares the whatsapp product and individual recipient", () => {
    expect(payload.messaging_product).toBe("whatsapp");
    expect(payload.recipient_type).toBe("individual");
    expect(payload.type).toBe("template");
  });
});

describe("WhatsAppMetaOtpSender", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("META_PHONE_NUMBER_ID", "pn1");
    vi.stubEnv("META_ACCESS_TOKEN", "tok");
    vi.stubEnv("META_AUTH_TEMPLATE_NAME", "otp_login_ar");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuses to start without its env, as a permanent configuration error", () => {
    vi.stubEnv("META_ACCESS_TOKEN", "");
    expect(() => new WhatsAppMetaOtpSender()).toThrow(expect.objectContaining({ permanent: true, message: expect.stringContaining("missing env") }));
  });

  it("is permanent for 400 to 499 and transient outside it, whatever the body", async () => {
    for (const [status, permanent] of [[400, true], [404, true], [499, true], [399, false], [500, false], [503, false]] as const) {
      fetchMock.mockResolvedValue(new Response("x", { status }));
      await expect(new WhatsAppMetaOtpSender().send(tel("+972501234567"), "1"), String(status)).rejects.toMatchObject({ permanent });
    }
  });

  it("returns an empty ref when Meta answers with no messages at all", async () => {
    fetchMock.mockResolvedValue(Response.json({ messages: [] }));
    expect(await new WhatsAppMetaOtpSender().send(tel("+972501234567"), "1")).toEqual({ messageRef: "" });
  });

  it("posts the template and returns Meta's message id", async () => {
    fetchMock.mockResolvedValue(Response.json({ messages: [{ id: "wamid.1" }] }));
    expect(await new WhatsAppMetaOtpSender().send(tel("+972501234567"), "123456")).toEqual({ messageRef: "wamid.1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v21.0/pn1/messages");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body).template.name).toBe("otp_login_ar");
  });

  it("returns an empty ref when Meta omits the id", async () => {
    fetchMock.mockResolvedValue(Response.json({}));
    expect(await new WhatsAppMetaOtpSender().send(tel("+972501234567"), "1")).toEqual({ messageRef: "" });
  });

  it("treats a network failure as transient", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(new WhatsAppMetaOtpSender().send(tel("+972501234567"), "1")).rejects.toMatchObject({ permanent: false });
  });

  it("treats a 4xx as permanent and keeps Meta's error", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: 132000, message: "params" } }, { status: 400 }));
    await expect(new WhatsAppMetaOtpSender().send(tel("+972501234567"), "1")).rejects.toMatchObject({
      permanent: true,
      message: expect.stringContaining("132000: params"),
    });
  });

  it("treats a 5xx with no JSON body as transient", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 502 }));
    await expect(new WhatsAppMetaOtpSender().send(tel("+972501234567"), "1")).rejects.toMatchObject({
      permanent: false,
      message: expect.stringContaining("status 502"),
    });
  });
});
