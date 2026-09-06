import { beforeEach, describe, expect, it, vi } from "vitest";

const getViewer = vi.fn();
const maybeSingle = vi.fn();
const createUser = vi.fn();
const updateUserById = vi.fn();
const createAdminClient = vi.fn(() => ({
  auth: { admin: { createUser, updateUserById } },
}));

vi.mock("@/lib/access", () => ({ getViewer }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

const { POST } = await import("./[id]/password/route");

const call = (id = "u2") =>
  POST(new Request("https://ops.hig.com/api/users/u2/password", { method: "POST" }), {
    params: Promise.resolve({ id }),
  });

/** Who is asking. */
function asSuperAdmin() {
  getViewer.mockResolvedValue({ id: "u1", is_super_admin: true });
}
function asOrdinaryUser() {
  getViewer.mockResolvedValue({ id: "u1", is_super_admin: false });
}

/** Who they are asking about. */
function target(row: { id: string; email: string | null; full_name: string } | null) {
  maybeSingle.mockResolvedValue({ data: row });
}

beforeEach(() => {
  getViewer.mockReset();
  maybeSingle.mockReset();
  createUser.mockReset().mockResolvedValue({ error: null });
  updateUserById.mockReset().mockResolvedValue({ error: null });
  createAdminClient.mockClear();
  asSuperAdmin();
  target({ id: "u2", email: "rep@hig.com", full_name: "Dara Chan" });
});

describe("who may set somebody's password", () => {
  it("refuses anybody but a super admin", async () => {
    // This route holds the key that bypasses every policy in the database, so
    // the guard is checked here rather than trusted from the page that drew
    // the button.
    asOrdinaryUser();
    const response = await call();

    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("refuses a stranger", async () => {
    getViewer.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("cannot be used to reach a record the caller cannot see", async () => {
    // The lookup goes through the caller's own client, so row level security
    // decides what exists — a hidden row is a 404, not a password.
    target(null);
    expect((await call()).status).toBe(404);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe("setting the password", () => {
  it("creates the login against the record's own id", async () => {
    // One person, one row. Keying the account to the id that already exists is
    // what stops a second profile appearing beside the first.
    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u2", email: "rep@hig.com", email_confirm: true }),
    );
    expect(body).toMatchObject({ ok: true, created: true, email: "rep@hig.com" });
    expect(body.password).toMatch(/^[^-]{4}-[^-]{4}-[^-]{4}-[^-]{4}$/);
  });

  it("sets a new one when the login already exists", async () => {
    // The ordinary second half of what this route is for, not a failure.
    createUser.mockResolvedValue({ error: { message: "already registered" } });
    const body = await (await call()).json();

    expect(updateUserById).toHaveBeenCalledWith("u2", {
      password: expect.stringMatching(/^[^-]{4}-/),
    });
    expect(body).toMatchObject({ ok: true, created: false });
  });

  it("hands back a different password every time", async () => {
    const first = await (await call()).json();
    const second = await (await call()).json();
    expect(first.password).not.toBe(second.password);
  });

  it("refuses a record with no email, rather than inventing one", async () => {
    target({ id: "u2", email: null, full_name: "Warehouse Hand" });
    const response = await call();

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/email/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("says so plainly when the service key is not configured", async () => {
    // A deployment fact, not something the person clicking can fix by trying
    // again — so it must not read as a transient failure.
    createAdminClient.mockImplementationOnce(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
    });
    const response = await call();

    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/SERVICE_ROLE/);
  });

  it("explains a clash rather than reporting success", async () => {
    createUser.mockResolvedValue({ error: { message: "already registered" } });
    updateUserById.mockResolvedValue({ error: { message: "User not found" } });
    const response = await call();

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/could not be set/i);
  });
});
