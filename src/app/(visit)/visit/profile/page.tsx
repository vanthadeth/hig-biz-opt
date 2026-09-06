import type { Metadata } from "next";
import { SignOutButton } from "@/components/SignOutButton";
import { Card } from "@/components/ui/Card";
import { RecordView } from "@/components/ui/RecordView";
import { SecurityButtons } from "@/components/profile/SecurityButtons";
import { requireViewer } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { profileGroups, USER_RECORD_COLUMNS, type UserRecord } from "@/lib/users";

export const metadata: Metadata = { title: "Profile" };

/**
 * The same record as `/{view}/profile`, minus the editing.
 *
 * It exists because the account menu in the title bar links to the profile of
 * whichever view you are standing in, and a rep whose only workspace is this one
 * would otherwise have a dead link where their password lives.
 *
 * What is missing is deliberate. Changing your nickname or your photo is a
 * back-office errand, and this app is for the ten minutes somebody spends in a
 * shop; it is one tap away in Sale for anyone who holds it. What a rep actually
 * needs from here is their password, their PIN and the way out, so that is what
 * is here.
 */
export default async function Page() {
  const viewer = await requireViewer();
  const supabase = await createClient();

  const { data } = await supabase
    .from("users")
    .select(USER_RECORD_COLUMNS)
    .eq("id", viewer.id)
    .maybeSingle();

  if (!data) {
    return (
      <div className="space-y-5">
        <Card className="p-4">
          <p className="text-sm text-muted">
            Your login has no employee record attached yet. An administrator can
            create one, and it will be matched to you by email.
          </p>
        </Card>
        <SignOutButton />
      </div>
    );
  }

  const record = data as unknown as UserRecord;
  const { data: pinSet } = await supabase.rpc("my_pin_is_set");

  const [department, role] = await Promise.all([
    record.department_id
      ? supabase.from("departments").select("name").eq("id", record.department_id).maybeSingle()
      : Promise.resolve({ data: null }),
    record.role_id
      ? supabase.from("roles").select("name").eq("id", record.role_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const groups = profileGroups(
    record,
    {
      department: (department.data?.name as string) ?? null,
      role: (role.data?.name as string) ?? null,
    },
    { includeBank: true },
  );

  return (
    <div className="space-y-5">
      <RecordView record={record} groups={groups} isSuperAdmin={viewer.is_super_admin} />

      <div className="flex flex-wrap gap-2 pt-1">
        <SecurityButtons pinIsSet={pinSet === true} />
        <SignOutButton />
      </div>
    </div>
  );
}
