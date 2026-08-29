import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

const { can, getMyViews, getViewer, resolveEntryPath } = await import("./access");

const profile = {
  id: "u1",
  email: "dara@hig.com",
  full_name: "Dara Chan",
  nickname: null,
  photo_path: null,
  is_super_admin: false,
};

function signedIn(user = { id: "u1", email: "dara@hig.com" }) {
  getUser.mockResolvedValue({ data: { user } });
}

function signedOut() {
  getUser.mockResolvedValue({ data: { user: null } });
}

function views(...keys: string[]) {
  rpc.mockResolvedValue({
    data: keys.map((key, i) => ({
      key,
      name: key,
      description: null,
      icon: "square",
      sort_order: i,
    })),
    error: null,
  });
}

beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset();
  maybeSingle.mockReset();
  maybeSingle.mockResolvedValue({ data: profile });
});

describe("getViewer", () => {
  it("returns null when nobody is signed in", async () => {
    signedOut();
    expect(await getViewer()).toBeNull();
  });

  it("returns the profile row", async () => {
    signedIn();
    expect(await getViewer()).toEqual(profile);
  });

  it("falls back to the email local part when the profile row is missing", async () => {
    // Authenticated but not yet provisioned: the shell still needs a name to
    // render rather than crashing on a null.
    signedIn({ id: "u9", email: "sophea.kim@hig.com" });
    maybeSingle.mockResolvedValue({ data: null });

    expect(await getViewer()).toEqual({
      id: "u9",
      email: "sophea.kim@hig.com",
      full_name: "sophea.kim",
      nickname: null,
      photo_path: null,
      is_super_admin: false,
    });
  });
});

describe("getMyViews", () => {
  it("rethrows an RPC error rather than reporting no views", async () => {
    // Swallowing this would look identical to "no access assigned", which would
    // strand a legitimate user on /no-access.
    rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(getMyViews()).rejects.toThrow("boom");
  });

  it("treats a null payload as an empty list", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getMyViews()).toEqual([]);
  });
});

describe("resolveEntryPath", () => {
  it("sends a signed-out visitor to the login page", async () => {
    signedOut();
    expect(await resolveEntryPath()).toBe("/login");
  });

  it("sends someone with no views to the dead end", async () => {
    signedIn();
    views();
    expect(await resolveEntryPath()).toBe("/no-access");
  });

  it("goes straight in when there is exactly one view", async () => {
    // A single-purpose user should never see a chooser with one option on it.
    signedIn();
    views("sales");
    expect(await resolveEntryPath()).toBe("/sales/home");
  });

  it("offers the chooser when there is an actual choice", async () => {
    signedIn();
    views("admin", "sales");
    expect(await resolveEntryPath()).toBe("/select-view");
  });
});

describe("can", () => {
  const permissions = [
    { module_key: "customer", action: "view" as const, scope: "any" as const },
    { module_key: "customer", action: "add" as const, scope: "own" as const },
  ];

  it("is true for a held permission", () => {
    expect(can(permissions, "customer", "view")).toBe(true);
  });

  it("is false for an action that is not held", () => {
    expect(can(permissions, "customer", "delete")).toBe(false);
  });

  it("is false for a module that is not held", () => {
    expect(can(permissions, "invoice", "view")).toBe(false);
  });

  it("does not match an action across modules", () => {
    expect(can(permissions, "invoice", "add")).toBe(false);
  });
});
