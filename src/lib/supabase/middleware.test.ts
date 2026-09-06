import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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

/** The same request, on a phone that has been handed to a customer. */
function locked(pathname: string) {
  return request(pathname, { hig_kiosk: "sales" });
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
