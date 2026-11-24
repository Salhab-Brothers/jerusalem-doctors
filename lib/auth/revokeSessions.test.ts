import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { revokeSessions } from "./revokeSessions";

const rpc = vi.fn();
const service = { rpc } as never;

beforeEach(() => {
  rpc.mockReset();
  captureException.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("revokeSessions", () => {
  it("asks the database to end that user's logins", async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    expect(await revokeSessions(service, "auth-1", "phone_move")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("revoke_user_sessions", { p_user_id: "auth-1" });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("has nothing to end for a doctor with no login account", async () => {
    expect(await revokeSessions(service, null, "suspend")).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a failure instead of throwing, so the admin's change still stands", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await revokeSessions(service, "auth-1", "suspend")).toBe(false);
    expect(console.error).toHaveBeenCalledWith("[revokeSessions] suspend failed", { message: "boom" });
    expect(captureException).toHaveBeenCalledWith({ message: "boom" }, { extra: { action: "revoke_sessions.suspend" } });
  });
});
