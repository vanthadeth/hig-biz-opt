import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RecordView } from "@/components/ui/RecordView";
import { requireViewer } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { NO_QUOTA, QUOTA_COLUMNS, type Quota } from "@/lib/quota";
import {
  profileGroups,
  USER_RECORD_COLUMNS,
  type UserRecord,
} from "@/lib/users";
import { VISIT_COLUMNS, type VisitRow } from "@/lib/visits";
import { RemoveUserButton } from "../RemoveUserButton";
import { StatusControls } from "../StatusControls";
import { GeneratePassword } from "./GeneratePassword";
import { QuotaAction } from "./QuotaAction";
import { TeamVisits } from "./TeamVisits";

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
  // `can_edit_visit_quota` is the same shape, for the one narrower question of
  // whether the viewer may move this person's target rather than their record.
  const [
    { data: canEdit },
    { data: canDelete },
    { data: canEditQuota },
    department,
    role,
    viewer,
    quotaRow,
    orgQuotaRow,
    teamVisits,
  ] = await Promise.all([
    supabase.rpc("can_edit_user", { p_user: id }),
    supabase.rpc("can_delete_user", { p_user: id }),
    supabase.rpc("can_edit_visit_quota", { p_user: id }),
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
    supabase.from("user_visit_quotas").select(QUOTA_COLUMNS).eq("user_id", id).maybeSingle(),
    supabase.from("app_settings").select(QUOTA_COLUMNS).maybeSingle(),
    // The permission this reads is `visit:view:sub` -- a grant nobody could
    // otherwise act on, since nothing pointed a manager at a subordinate's
    // calls until now. Five is enough to say "yes, this person is out on
    // calls" without turning a profile page into a second Visits screen.
    supabase
      .from("visits")
      .select(VISIT_COLUMNS)
      .eq("user_id", id)
      .order("checked_in_at", { ascending: false })
      .limit(5),
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
            {canEditQuota === true && (
              <QuotaAction
                userId={person.id}
                fullName={person.full_name}
                current={(quotaRow.data as Quota | null) ?? NO_QUOTA}
                org={(orgQuotaRow.data as Quota | null) ?? NO_QUOTA}
              />
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
        footer={
          <StatusControls record={person} canEdit={canEdit === true} isSelf={isSelf} />
        }
      />

      {/* Their own calls, not the viewer's -- so this stays off their own
          profile, where the full Visits screen already covers it. Silent
          for anyone the viewer holds no `visit:view` reach into: RLS
          returned nothing, and an empty list here says nothing either. */}
      {!isSelf && (
        <TeamVisits
          viewKey={view}
          visits={(teamVisits.data ?? []) as unknown as VisitRow[]}
        />
      )}

      {/* Only a super admin, because the route behind it holds the key that
          bypasses every policy in the database. Not for yourself either: your
          own password is changed on your profile, where it needs no such key. */}
      {viewer.is_super_admin && !isSelf && (
        <GeneratePassword
          userId={person.id}
          email={person.email}
          name={person.full_name}
        />
      )}
    </div>
  );
}
