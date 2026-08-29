import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

const { updateSession } = await import("./middleware");

function request(pathname: string) {
  return new NextRequest(new URL(pathname, "https://ops.hig.com"));
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
