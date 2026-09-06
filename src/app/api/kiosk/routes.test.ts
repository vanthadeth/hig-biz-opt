import { beforeEach, describe, expect, it, vi } from "vitest";

const getViewer = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/access", () => ({ getViewer }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

const { POST: enter } = await import("./enter/route");
const { POST: exit } = await import("./exit/route");
const { GET: state } = await import("./state/route");

/** The Set-Cookie line for the lock, or null when the response sets none. */
function lockCookie(response: Response) {
  const header = response.headers.get("set-cookie");
  if (!header) return null;
  const line = header.split(/,(?=\s*[A-Za-z0-9_-]+=)/).find((c) => c.includes("hig_kiosk="));
  return line ?? null;
}

function post(body: unknown) {
  return new Request("https://ops.hig.com/api/kiosk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** What the database says about the caller's PIN, per function. */
function pin({ isSet, verifies }: { isSet: boolean; verifies?: boolean }) {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === "my_pin_is_set") return { data: isSet, error: null };
    if (fn === "verify_my_pin") return { data: verifies === true, error: null };
    throw new Error(`unexpected rpc ${fn}`);
  });
}

beforeEach(() => {
  rpc.mockReset();
  getViewer.mockReset().mockResolvedValue({ id: "u1" });
});

describe("entering kiosk mode", () => {
  it("refuses when the account has no PIN", async () => {
    // The trap this closes: locking with no PIN meant no way back out, because
    // the PIN is the only key. The app shut on its owner for as long as the
    // cookie lived.
    pin({ isSet: false });
    const response = await enter(post({ view: "sales" }));

    expect(response.status).toBe(400);
    expect(lockCookie(response)).toBeNull();
    expect((await response.json()).error).toMatch(/PIN/);
  });

  it("locks when there is a PIN, and says where to go", async () => {
    pin({ isSet: true });
    const response = await enter(post({ view: "sales" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, to: "/sales/products" });
    expect(lockCookie(response)).toContain("hig_kiosk=sales");
  });

  it("locks for this run of the app and no longer", async () => {
    // A session cookie, deliberately. Dated, it made every launch for the next
    // day open into a customer-facing catalogue — handing the phone over once
    // is not a standing instruction.
    pin({ isSet: true });
    const cookie = lockCookie(await enter(post({ view: "sales" })));

    expect(cookie).not.toMatch(/Max-Age/i);
    expect(cookie).not.toMatch(/Expires/i);
  });

  it("cannot be locked into a view that was not named", async () => {
    pin({ isSet: true });
    const response = await enter(post({ view: "" }));
    expect(response.status).toBe(400);
    expect(lockCookie(response)).toBeNull();
  });

  it("refuses a caller who is not signed in", async () => {
    getViewer.mockResolvedValue(null);
    const response = await enter(post({ view: "sales" }));
    expect(response.status).toBe(401);
  });
});

describe("leaving kiosk mode", () => {
  it("opens for the right PIN", async () => {
    pin({ isSet: true, verifies: true });
    const response = await exit(post({ pin: "1234" }));

    expect(await response.json()).toMatchObject({ ok: true });
    expect(lockCookie(response)).toMatch(/Max-Age=0/i);
  });

  it("stays shut for the wrong one", async () => {
    pin({ isSet: true, verifies: false });
    const response = await exit(post({ pin: "9999" }));

    expect(await response.json()).toMatchObject({ ok: false });
    expect(lockCookie(response)).toBeNull();
  });

  it("stays shut for something that is not a PIN", async () => {
    pin({ isSet: true, verifies: true });
    const response = await exit(post({ pin: "12" }));

    expect(await response.json()).toMatchObject({ ok: false });
    expect(lockCookie(response)).toBeNull();
    // Never asked: a three-digit PIN is not a wrong guess, so it must not
    // spend one of the five tries.
    expect(rpc).not.toHaveBeenCalledWith("verify_my_pin", expect.anything());
  });

  it("lets a device out when there is no PIN to type", async () => {
    // For a device locked before entering required one. A lock with no key is
    // not a lock, and refusing here would leave somebody stuck in a catalogue.
    pin({ isSet: false });
    const response = await exit(post({ pin: "" }));

    expect(await response.json()).toMatchObject({ ok: true, noPin: true });
    expect(lockCookie(response)).toMatch(/Max-Age=0/i);
  });
});

describe("the unlock pad asking what it is facing", () => {
  it("reports a PIN that is set", async () => {
    pin({ isSet: true });
    expect(await (await state()).json()).toEqual({ pinSet: true });
  });

  it("reports one that is not", async () => {
    pin({ isSet: false });
    expect(await (await state()).json()).toEqual({ pinSet: false });
  });

  it("tells a stranger nothing", async () => {
    getViewer.mockResolvedValue(null);
    expect((await state()).status).toBe(401);
  });
});
