import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RecordView } from "@/components/ui/RecordView";
import { requireViewer } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  profileGroups,
  USER_RECORD_COLUMNS,
  type UserRecord,
} from "@/lib/users";
import { RemoveUserButton } from "../RemoveUserButton";
import { StatusControls } from "../StatusControls";

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

  const person = record as unknown as UserRecord;

  // `can_edit_user` and `can_delete_user` ask the database the scoped questions
  // the policies will ask about this particular person — own, sub or any —
  // which `my_permissions` cannot, since it reports reach without a subject.
  const [{ data: canEdit }, { data: canDelete }, department, role, viewer] =
    await Promise.all([
      supabase.rpc("can_edit_user", { p_user: id }),
      supabase.rpc("can_delete_user", { p_user: id }),
      person.department_id
        ? supabase
            .from("departments")
            .select("name")
            .eq("id", person.department_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      person.role_id
        ? supabase.from("roles").select("name").eq("id", person.role_id).maybeSingle()
        : Promise.resolve({ data: null }),
      requireViewer(),
    ]);

  const isSelf = viewer.id === person.id;

  // Payroll follows the right to change the record. Nobody who can merely look
  // someone up in the directory gets their account number.
  const groups = profileGroups(
    person,
    {
      department: (department.data?.name as string) ?? null,
      role: (role.data?.name as string) ?? null,
    },
    { includeBank: canEdit === true },
  );

  return (
    <div className="space-y-5">
      <Link
        href={`/${view}/users`}
        className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
      >
        <Icon name="chevron" className="size-4 rotate-180" />
        All users
      </Link>

      <RecordView
        record={person}
        groups={groups}
        // The badge belongs to the person on screen. `is_super_admin` is not in
        // the directory and only the viewer's own is in hand, so it is shown
        // only when they are the same person rather than guessed at.
        isSuperAdmin={isSelf && viewer.is_super_admin}
        actions={
          <>
            {canEdit === true && (
              <Link
                href={`/${view}/users/${id}/edit`}
                className="pressable flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-medium text-brand-fg"
              >
                <Icon name="pencil" className="size-4" />
                Edit record
              </Link>
            )}
            {canDelete === true && !isSelf && (
              <RemoveUserButton
                userId={person.id}
                fullName={person.full_name}
                viewKey={view}
              />
            )}
          </>
        }
      >
        <StatusControls record={person} canEdit={canEdit === true} isSelf={isSelf} />
      </RecordView>
    </div>
  );
}
