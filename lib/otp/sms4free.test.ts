import { describe, expect, it } from "vitest";
import {
  SMS4FREE_STATUS,
  buildSendPayload,
  parseSendResponse,
  replyExcerpt,
} from "./sms4free";

const creds = { key: "K", user: "0500000000", pass: "P", sender: "JDoctors" };

describe("buildSendPayload", () => {
  const payload = buildSendPayload(creds, "0501234567", "رمز: 123456");

  it("sends the credential fields the API documents", () => {
    expect(payload.key).toBe("K");
    expect(payload.user).toBe("0500000000");
    expect(payload.pass).toBe("P");
    expect(payload.sender).toBe("JDoctors");
  });

  it("sends the recipient in local form", () => {
    expect(payload.recipient).toBe("0501234567");
  });

  it("never fans out to more than one recipient", () => {
    expect(payload.recipient).not.toContain(";");
  });

  it("passes the message through unchanged", () => {
    expect(payload.msg).toBe("رمز: 123456");
  });
});

describe("parseSendResponse: only plain numbers count as one", () => {
  it("reads a bare integer, and a status that is a JSON number", () => {
    expect(parseSendResponse(" -4 ")).toEqual({ status: -4 });
    expect(parseSendResponse('{"status":-6}')).toEqual({ status: -6, message: undefined });
  });

  it("does not take JavaScript's other readings of a number", () => {
    for (const body of ["1e2", "4.0", "+4", "0x10", "1_0", "Infinity", "NaN", '{"status":"4"}', '{"status":null}', '{"status":true}', '{"status":[4]}', "null", "[]"]) {
      expect(parseSendResponse(body), body).toBeNull();
    }
  });
});

describe("parseSendResponse", () => {
  it("reads the documented JSON object", () => {
    expect(parseSendResponse('{"status":1,"message":"OK"}')).toEqual({
      status: 1,
      message: "OK",
    });
  });

  it("reads a bare numeric body", () => {
    expect(parseSendResponse("1")).toEqual({ status: 1 });
    expect(parseSendResponse("-4")).toEqual({ status: -4 });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseSendResponse("  -1\n")).toEqual({ status: -1 });
  });

  it("reads a negative status out of JSON", () => {
    expect(parseSendResponse('{"status":-6,"message":"not verified"}')?.status).toBe(-6);
  });

  it("returns null for an unusable body", () => {
    expect(parseSendResponse("")).toBeNull();
    expect(parseSendResponse("<html>502</html>")).toBeNull();
    expect(parseSendResponse('{"ok":true}')).toBeNull();
  });
});

describe("SMS4FREE_STATUS", () => {
  it("treats account and configuration failures as permanent", () => {
    for (const code of [-1, -2, -3, -4, -5, -6]) {
      expect(SMS4FREE_STATUS[code]?.permanent).toBe(true);
    }
  });

  it("leaves the general error retryable", () => {
    expect(SMS4FREE_STATUS[0]?.permanent).toBe(false);
  });

  it("names the low-balance code, which is the one on-call will see", () => {
    expect(SMS4FREE_STATUS[-4]?.label).toContain("balance");
  });
});

describe("replyExcerpt: what a log may hold of a reply we could not read", () => {
  it("is the reply as one quoted line, cut at 40 characters", () => {
    expect(replyExcerpt("4.0")).toBe('"4.0"');
    expect(replyExcerpt("  1e2\n")).toBe('"1e2"');
    expect(replyExcerpt("<html>\n  <body>\toops</body>\n</html>")).toBe('"<html> <body> oops</body> </html>"');
    expect(replyExcerpt("a".repeat(40))).toBe(`"${"a".repeat(40)}"`);
    expect(replyExcerpt("a".repeat(41))).toBe(`"${"a".repeat(40)}…"`);
    expect(replyExcerpt("")).toBe('""');
  });

  it("masks every run of five digits or more, so a number or a code never reaches a log", () => {
    expect(replyExcerpt("Invalid recipient 0501234567 code 482913")).toBe('"Invalid recipient # code #"');
    expect(replyExcerpt("12345")).toBe('"#"');
    expect(replyExcerpt("1234")).toBe('"1234"');
    expect(replyExcerpt("972501234567")).toBe('"#"');
    // Cut after masking, so masking cannot be undone by the cut.
    expect(replyExcerpt(`${"a".repeat(38)}0501234567`)).toBe(`"${"a".repeat(38)}#"`);
  });
});

