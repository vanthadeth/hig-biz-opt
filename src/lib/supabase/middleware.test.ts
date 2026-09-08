import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { KIOSK_GRACE_MS, kioskCookieValue } from "@/lib/kiosk";

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

const { updateSession } = await import("./middleware");

function request(pathname: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(pathname, "https://ops.hig.com"));
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}

/**
 * The same request, arriving on HIG Footprint's own domain.
 *
 * The `Host` header, explicitly — not just a URL whose origin says so. A
 * `NextRequest` built from a URL alone carries no `Host` header at all (that
 * is added by real HTTP transport, which nothing here is), and the
 * middleware reads the header, not the URL, for exactly this reason: see its
 * own comment on why `nextUrl.hostname` cannot be trusted for this.
 */
function onFootprintHost(pathname: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(pathname, "https://footprint.higbiz.app"), {
    headers: { host: "footprint.higbiz.app" },
  });
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}

/**
 * The same request, on a phone that has been handed to a customer.
 *
 * `agoMs` is how long since anything said the lock was still alive. The
 * default is "just now", which is what an open catalogue keeps making true.
 */
function locked(pathname: string, agoMs = 0) {
  return request(pathname, {
    hig_kiosk: kioskCookieValue("sales", Date.now() - agoMs, "sess1"),
  });
}

function signedIn() {
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
}

function signedOut() {
  getUser.mockResolvedValue({ data: { user: null } });
}

/** The Location a response redirects to, or null when it passes through. */
function redirectedTo(response: Response) {
  const location = response.headers.get("location");
  return location ? new URL(location) : null;
}

beforeEach(() => {
  getUser.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
});

describe("updateSession, HIG Footprint's own domain", () => {
  // Confinement is routing, not authorization — it fires the same whether or
  // not anybody is signed in, so these run without a getUser mock at all.

  it("sends the bare domain into Footprint", async () => {
    const to = redirectedTo(await updateSession(onFootprintHost("/")));
    expect(to?.pathname).toBe("/footprint");
  });

  it("sends the main app's own paths into Footprint instead of serving them", async () => {
    const to = redirectedTo(await updateSession(onFootprintHost("/sales/customers")));
    expect(to?.pathname).toBe("/footprint");
  });

  it("drops the query on the way there", async () => {
    const to = redirectedTo(await updateSession(onFootprintHost("/sales/customers?q=dara")));
    expect(to?.search).toBe("");
  });

  it("lets /footprint itself through untouched", async () => {
    signedOut();
    // Passes this check, then meets the ordinary signed-out redirect below —
    // /footprint/login, not another bounce to /footprint.
    const to = redirectedTo(await updateSession(onFootprintHost("/footprint")));
    expect(to?.pathname).toBe("/footprint/login");
  });

  it("lets a path already inside /footprint through", async () => {
    signedIn();
    expect(redirectedTo(await updateSession(onFootprintHost("/footprint/visits/abc")))).toBeNull();
  });

  it("does not confine api routes", async () => {
    signedOut();
    // Exempted on principle: a request naming an API path explicitly is not
    // "typed the main app's URL out of habit", the one thing this catches.
    expect(redirectedTo(await updateSession(onFootprintHost("/api/sync/tick")))).toBeNull();
  });

  it("leaves every other domain alone", async () => {
    signedIn();
    expect(redirectedTo(await updateSession(request("/sales/customers")))).toBeNull();
  });
});

describe("updateSession, signed out", () => {
  beforeEach(signedOut);

  it("sends a protected page to the login form", async () => {
    const to = redirectedTo(await updateSession(request("/sales/customers")));
    expect(to?.pathname).toBe("/login");
  });

  it("remembers where they were going", async () => {
    const to = redirectedTo(await updateSession(request("/sales/customers")));
    expect(to?.searchParams.get("next")).toBe("/sales/customers");
  });

  it("does not add a next parameter for the root", async () => {
    // "/" only resolves an entry point, so carrying it forward is noise.
    const to = redirectedTo(await updateSession(request("/")));
    expect(to?.pathname).toBe("/login");
    expect(to?.search).toBe("");
  });

  it("lets the login page through", async () => {
    expect(redirectedTo(await updateSession(request("/login")))).toBeNull();
  });

  it("lets the auth callback routes through", async () => {
    expect(redirectedTo(await updateSession(request("/auth/callback")))).toBeNull();
  });

  it("does not treat a path that merely starts with a public one as public", async () => {
    // /loginx is a different route; only /login and /login/... are public.
    const to = redirectedTo(await updateSession(request("/loginx")));
    expect(to?.pathname).toBe("/login");
  });

  it("protects the view selection screen", async () => {
    const to = redirectedTo(await updateSession(request("/select-view")));
    expect(to?.pathname).toBe("/login");
  });
});

describe("updateSession, signed out, HIG Footprint", () => {
  beforeEach(signedOut);

  it("sends a Footprint page to Footprint's own login, not the main one", async () => {
    const to = redirectedTo(await updateSession(request("/footprint")));
    expect(to?.pathname).toBe("/footprint/login");
    expect(to?.searchParams.get("next")).toBe("/footprint");
  });

  it("does the same for a visit inside it", async () => {
    const to = redirectedTo(await updateSession(request("/footprint/visits/abc")));
    expect(to?.pathname).toBe("/footprint/login");
  });

  it("lets the Footprint login page through", async () => {
    expect(redirectedTo(await updateSession(request("/footprint/login")))).toBeNull();
  });

  it("does not treat /footprint/loginx as the login page itself", async () => {
    // A different route, were it ever to exist — not public, and still sent
    // to the real /footprint/login rather than the main app's.
    const to = redirectedTo(await updateSession(request("/footprint/loginx")));
    expect(to?.pathname).toBe("/footprint/login");
  });
});

describe("updateSession, signed in", () => {
  beforeEach(signedIn);

  it("bounces the login page back to the entry point", async () => {
    const to = redirectedTo(await updateSession(request("/login")));
    expect(to?.pathname).toBe("/");
  });

  it("drops any next parameter on that bounce", async () => {
    const to = redirectedTo(await updateSession(request("/login?next=%2Fsales%2Fhome")));
    expect(to?.search).toBe("");
  });

  it("lets a protected page through", async () => {
    expect(redirectedTo(await updateSession(request("/sales/customers")))).toBeNull();
  });

  it("lets the root through so it can resolve the entry point", async () => {
    expect(redirectedTo(await updateSession(request("/")))).toBeNull();
  });

  it("bounces the Footprint login page to Footprint, not the main entry point", async () => {
    const to = redirectedTo(await updateSession(request("/footprint/login")));
    expect(to?.pathname).toBe("/footprint");
  });

  it("lets a page inside Footprint through", async () => {
    expect(redirectedTo(await updateSession(request("/footprint/visits/abc")))).toBeNull();
  });
});

describe("updateSession, locked to the catalogue", () => {
  beforeEach(signedIn);

  it("lets the catalogue through", async () => {
    expect(redirectedTo(await updateSession(locked("/sales/products")))).toBeNull();
  });

  it("lets an item inside it through", async () => {
    expect(redirectedTo(await updateSession(locked("/sales/products/abc")))).toBeNull();
  });

  it("sends everything else back to the catalogue", async () => {
    // The lock itself. Not a hidden menu — a customer who types the URL, or
    // restores a tab, lands back where the phone was handed over.
    const to = redirectedTo(await updateSession(locked("/sales/customers")));
    expect(to?.pathname).toBe("/sales/products");
  });

  it("sends another view's catalogue back to the locked one", async () => {
    const to = redirectedTo(await updateSession(locked("/admin/products")));
    expect(to?.pathname).toBe("/sales/products");
  });

  it("drops any query on the way back", async () => {
    const to = redirectedTo(await updateSession(locked("/sales/users?q=dara")));
    expect(to?.search).toBe("");
  });

  it("leaves the way out reachable", async () => {
    // Without these there is no unlocking, and the redirect above would be a
    // loop with a PIN pad that could never post anywhere.
    expect(redirectedTo(await updateSession(locked("/api/kiosk/exit")))).toBeNull();
    expect(redirectedTo(await updateSession(locked("/api/kiosk/state")))).toBeNull();
  });

  it("locks nothing when the cookie is absent", async () => {
    expect(redirectedTo(await updateSession(request("/sales/customers")))).toBeNull();
  });
});

describe("updateSession, a lock past its backstop", () => {
  beforeEach(signedIn);

  // What ends a lock normally is the browsing session ending, which only the
  // page can see — see KioskGuard. This is the fallback underneath it, for a
  // browser that restores the cookie and the session storage together.

  it("still locks through a day of selling", async () => {
    // Deliberately: a phone asleep in a customer's hand for half an hour is
    // still a phone in a customer's hand, and refreshing must not free it.
    const to = redirectedTo(await updateSession(locked("/sales/home", 6 * 60 * 60 * 1000)));
    expect(to?.pathname).toBe("/sales/products");
  });

  it("but not past the backstop", async () => {
    const to = redirectedTo(await updateSession(locked("/sales/home", KIOSK_GRACE_MS + 60_000)));
    expect(to).toBeNull();
  });

  it("and not the next morning", async () => {
    const to = redirectedTo(await updateSession(locked("/sales/home", 20 * 60 * 60 * 1000)));
    expect(to).toBeNull();
  });

  it("still locks one that is being kept alive", async () => {
    const to = redirectedTo(await updateSession(locked("/sales/home", 60_000)));
    expect(to?.pathname).toBe("/sales/products");
  });

  it("sweeps the dead cookie up", async () => {
    // Otherwise it is read again on every request for as long as the browser
    // keeps it, and the app carries a lock it is deliberately ignoring.
    const response = await updateSession(locked("/sales/home", 30 * 60 * 60 * 1000));
    expect(response.headers.get("set-cookie")).toMatch(/hig_kiosk=;[\s\S]*Max-Age=0/i);
  });

  it("leaves a live one alone", async () => {
    const response = await updateSession(locked("/sales/products", 10_000));
    expect(response.headers.get("set-cookie") ?? "").not.toMatch(/hig_kiosk=;/);
  });

  it("ignores a cookie of the old shape", async () => {
    // Devices locked before the stamp existed carry a bare view key. It has no
    // moment attached, so it has never been kept alive, so it locks nothing.
    const to = redirectedTo(await updateSession(request("/sales/home", { hig_kiosk: "sales" })));
    expect(to).toBeNull();
    const stamped = redirectedTo(
      await updateSession(request("/sales/home", { hig_kiosk: `sales.${Date.now()}` })),
    );
    expect(stamped).toBeNull();
  });
});
