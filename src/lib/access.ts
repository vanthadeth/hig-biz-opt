import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type PermissionAction = "view" | "add" | "edit" | "delete";

/** A reach that has actually been granted. `my_permissions()` returns only these. */
export type PermissionScope = "own" | "sub" | "any";

/**
 * What a matrix cell holds. `deny` is a decision somebody made, which is not
 * the same as a permission nobody has configured — the difference is invisible
 * once resolved, but the editing screen needs both.
 */
export type StoredScope = PermissionScope | "deny";

export type Permission = {
  module_key: string;
  action: PermissionAction;
  scope: PermissionScope;
};

export type ViewSummary = {
  key: string;
  name: string;
  description: string | null;
  icon: string;
  sort_order: number;
};

export type NavItem = {
  module_key: string;
  name: string;
  icon: string;
  href: string;
  sort_order: number;
};

export type Viewer = {
  id: string;
  email: string | null;
  full_name: string;
  nickname: string | null;
  photo_path: string | null;
  is_super_admin: boolean;
};

/** The signed-in employee, or null. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, email, full_name, nickname, photo_path, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) {
    // Authenticated but with no profile row yet.
    return {
      id: user.id,
      email: user.email ?? null,
      full_name: user.email?.split("@")[0] ?? "User",
      nickname: null,
      photo_path: null,
      is_super_admin: false,
    };
  }

  return data as Viewer;
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/** Views the signed-in user may enter, already ordered. */
export async function getMyViews(): Promise<ViewSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_views");
  if (error) throw error;
  return (data ?? []) as ViewSummary[];
}

/** Navigation entries for one view, already filtered by view permission. */
export async function getMyNav(viewKey: string): Promise<NavItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_nav", { p_view: viewKey });
  if (error) throw error;
  return (data ?? []) as NavItem[];
}

export async function getMyPermissions(): Promise<Permission[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_permissions");
  if (error) throw error;
  return (data ?? []) as Permission[];
}

export function can(
  permissions: Permission[],
  moduleKey: string,
  action: PermissionAction,
): boolean {
  return permissions.some((p) => p.module_key === moduleKey && p.action === action);
}

/**
 * Where a signed-in user belongs on arrival.
 *
 * No views assigned is a dead end rather than an error page; exactly one view
 * goes straight in, so a single-purpose user never sees a chooser with one
 * option on it; more than one lands on the view selection screen.
 */
export async function resolveEntryPath(): Promise<string> {
  const viewer = await getViewer();
  if (!viewer) return "/login";

  const views = await getMyViews();
  if (views.length === 0) return "/no-access";
  if (views.length === 1) return `/${views[0].key}/home`;
  return "/select-view";
}
