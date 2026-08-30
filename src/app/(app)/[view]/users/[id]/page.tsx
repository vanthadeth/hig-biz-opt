import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Chip } from "@/components/ui/Chip";
import { can, getMyPermissions, requireViewer } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  displayName,
  STATUS_LABELS,
  STATUS_TONE,
  USER_RECORD_COLUMNS,
  type Department,
  type UserRecord,
} from "@/lib/users";
import { StatusControls } from "../StatusControls";
import { UserForm, type RoleOption } from "../UserForm";

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

  return { title: (data?.full_name as string) ?? "User" };
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

  // Row level security already hid it; a missing row and a forbidden row look
  // the same from here, which is the right answer to give either way.
  if (!record) notFound();

  // `can_edit_user` answers the scoped question the policy will ask on write —
  // own, sub or any against this particular record — which `my_permissions`
  // cannot, since it reports reach without a subject.
  const [{ data: canEdit }, departments, roles, positions, mine, viewer] = await Promise.all([
    supabase.rpc("can_edit_user", { p_user: id }),
    supabase.from("departments").select("id, name, sort_order").order("sort_order"),
    supabase.from("roles").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("positions").select("name").order("use_count", { ascending: false }),
    getMyPermissions(),
    requireViewer(),
  ]);

  const person = record as unknown as UserRecord;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/${view}/users`}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
        >
          <Icon name="chevron" className="size-4 rotate-180" />
          All users
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">
            {displayName(person)}
          </h1>
          <Chip tone={STATUS_TONE[person.status]}>
            {STATUS_LABELS[person.status]}
          </Chip>
        </div>
        <p className="mt-1 text-sm text-muted">
          {person.position ?? "No position set"}
        </p>
      </div>

      <StatusControls
        record={person}
        canEdit={canEdit === true}
        isSelf={viewer.id === person.id}
      />

      <UserForm
        record={person}
        departments={(departments.data ?? []) as Department[]}
        roles={(roles.data ?? []) as RoleOption[]}
        positions={(positions.data ?? []).map((p) => p.name as string)}
        canEdit={canEdit === true}
        // Payroll follows the right to change the record. Nobody who can merely
        // look someone up in the directory gets their account number.
        canSeeBank={canEdit === true}
        canAddDepartment={can(mine, "role_permission", "edit")}
        viewKey={view}
      />
    </div>
  );
}
