import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  displayName,
  USER_RECORD_COLUMNS,
  type Department,
  type UserRecord,
} from "@/lib/users";
import { UserForm, type RoleOption } from "../../UserForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_directory")
    .select("full_name")
    .eq("id", id)
    .maybeSingle();

  return { title: data ? `Edit ${data.full_name as string}` : "Edit user" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ view: string; id: string }>;
}) {
  const { view, id } = await params;
  const supabase = await createClient();

  const { data: record } = await supabase
    .from("users")
    .select(USER_RECORD_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (!record) notFound();

  const [{ data: canEdit }, departments, roles, positions, mine] = await Promise.all([
    supabase.rpc("can_edit_user", { p_user: id }),
    supabase.from("departments").select("id, name, sort_order").order("sort_order"),
    supabase.from("roles").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("positions").select("name").order("use_count", { ascending: false }),
    getMyPermissions(),
  ]);

  // The update policy would refuse the save anyway; this keeps someone from
  // filling in a long form only to be turned away at the end.
  if (canEdit !== true) notFound();

  const person = record as unknown as UserRecord;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/${view}/users/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
        >
          <Icon name="chevron" className="size-4 rotate-180" />
          {displayName(person)}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Edit record</h1>
      </div>

      <UserForm
        record={person}
        departments={(departments.data ?? []) as Department[]}
        roles={(roles.data ?? []) as RoleOption[]}
        positions={(positions.data ?? []).map((p) => p.name as string)}
        canEdit
        canSeeBank
        canAddDepartment={can(mine, "role_permission", "edit")}
        viewKey={view}
      />
    </div>
  );
}
