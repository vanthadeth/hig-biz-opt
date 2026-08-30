import { PageTitle } from "@/components/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions, can } from "@/lib/access";
import { RoleMatrix, type ModuleSummary, type RoleSummary } from "./RoleMatrix";
import type { ViewOption } from "./RoleViews";
import type { PermissionRow } from "@/lib/roleMatrix";

export default async function Page() {
  const supabase = await createClient();

  const [rolesResult, modulesResult, permissionsResult, viewsResult, roleViewsResult, mine] =
    await Promise.all([
      supabase.from("roles").select("id, key, name, description").eq("active", true).order("sort_order"),
      supabase.from("modules").select("key, name, icon").eq("active", true).order("sort_order"),
      supabase.from("role_permissions").select("role_id, module_key, action, scope"),
      supabase
        .from("views")
        .select("key, name, description, icon")
        .eq("active", true)
        .order("sort_order"),
      supabase.from("role_views").select("role_id, view_key"),
      getMyPermissions(),
    ]);

  const roles = (rolesResult.data ?? []) as RoleSummary[];
  const modules = (modulesResult.data ?? []) as ModuleSummary[];
  const views = (viewsResult.data ?? []) as ViewOption[];

  const viewsByRole: Record<string, string[]> = {};
  for (const row of (roleViewsResult.data ?? []) as { role_id: string; view_key: string }[]) {
    (viewsByRole[row.role_id] ??= []).push(row.view_key);
  }

  // Grouped by role here rather than in the client, so the editor receives the
  // shape it renders and does no work to get there.
  const byRole: Record<string, PermissionRow[]> = {};
  for (const row of (permissionsResult.data ?? []) as (PermissionRow & { role_id: string })[]) {
    (byRole[row.role_id] ??= []).push({
      module_key: row.module_key,
      action: row.action,
      scope: row.scope,
    });
  }

  return (
    <div className="space-y-6">
      <PageTitle />
      <RoleMatrix
        roles={roles}
        modules={modules}
        permissions={byRole}
        views={views}
        roleViews={viewsByRole}
        canEdit={can(mine, "role_permission", "edit")}
      />
    </div>
  );
}
