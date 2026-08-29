import { beforeEach, describe, expect, it, vi } from "vitest";

const requireViewer = vi.fn();
const getMyViews = vi.fn();
const getMyNav = vi.fn();
const getMyPermissions = vi.fn();

vi.mock("@/lib/access", () => ({ requireViewer, getMyViews, getMyNav, getMyPermissions }));
vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ data }: { data: { view: { key: string } } }) => (
    <div data-testid="shell" data-view={data.view.key} />
  ),
}));

const { default: ViewLayout } = await import("./layout");

const viewer = {
  id: "u1",
  email: "dara@hig.com",
  full_name: "Dara Chan",
  nickname: null,
  photo_path: null,
  is_super_admin: false,
};

const view = (key: string, i = 0) => ({
  key,
  name: key,
  description: null,
  icon: "square",
  sort_order: i,
});

/** Renders the layout, returning either its element or the redirect target. */
async function enter(viewKey: string) {
  try {
    const element = await ViewLayout({
      children: null,
      params: Promise.resolve({ view: viewKey }),
    });
    return { element, redirectedTo: null as string | null };
  } catch (e) {
    const message = (e as Error).message;
    const match = /^NEXT_REDIRECT:(.*)$/.exec(message);
    if (!match) throw e;
    return { element: null, redirectedTo: match[1] };
  }
}

beforeEach(() => {
  requireViewer.mockReset().mockResolvedValue(viewer);
  getMyViews.mockReset();
  getMyNav.mockReset().mockResolvedValue([]);
  getMyPermissions.mockReset().mockResolvedValue([]);
});

describe("ViewLayout entitlement", () => {
  it("renders the shell for a view the user holds", async () => {
    getMyViews.mockResolvedValue([view("sales"), view("accounting", 1)]);
    const { element, redirectedTo } = await enter("sales");

    expect(redirectedTo).toBeNull();
    expect(element).not.toBeNull();
    expect(getMyNav).toHaveBeenCalledWith("sales");
  });

  it("turns away a view the user does not hold", async () => {
    // The switcher never offers `admin` here; this is what stops someone who
    // types the URL anyway.
    getMyViews.mockResolvedValue([view("sales"), view("accounting", 1)]);
    const { redirectedTo } = await enter("admin");

    expect(redirectedTo).toBe("/select-view");
    expect(getMyNav).not.toHaveBeenCalled();
  });

  it("sends a single-view user back into their own view", async () => {
    getMyViews.mockResolvedValue([view("warehouse")]);
    const { redirectedTo } = await enter("admin");
    expect(redirectedTo).toBe("/warehouse/home");
  });

  it("sends a user with no views to the dead end", async () => {
    getMyViews.mockResolvedValue([]);
    const { redirectedTo } = await enter("sales");
    expect(redirectedTo).toBe("/no-access");
  });

  it("does not redirect a single-view user into the view they asked for", async () => {
    // Guards against a redirect loop: the fallback must not be the same route.
    getMyViews.mockResolvedValue([view("sales")]);
    const { redirectedTo } = await enter("sales");
    expect(redirectedTo).toBeNull();
  });

  it("checks the viewer before anything else", async () => {
    getMyViews.mockResolvedValue([view("sales")]);
    await enter("sales");
    expect(requireViewer).toHaveBeenCalled();
  });
});
