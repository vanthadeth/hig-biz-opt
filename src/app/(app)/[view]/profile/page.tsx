import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { SignOutButton } from "@/components/SignOutButton";
import { Card } from "@/components/ui/Card";
import { RecordView } from "@/components/ui/RecordView";
import { requireViewer } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  profileGroups,
  USER_RECORD_COLUMNS,
  type UserRecord,
} from "@/lib/users";
import { ResetPasswordButton } from "./ResetPasswordButton";

export const metadata: Metadata = { title: "Profile" };

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const viewer = await requireViewer();
  const supabase = await createClient();

  const { data } = await supabase
    .from("users")
    .select(USER_RECORD_COLUMNS)
    .eq("id", viewer.id)
    .maybeSingle();

  // Signed in with no employee record yet — the shell still works, so say so
  // plainly rather than crashing on a row that is legitimately absent.
  if (!data) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
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

  const [department, role] = await Promise.all([
    record.department_id
      ? supabase.from("departments").select("name").eq("id", record.department_id).maybeSingle()
      : Promise.resolve({ data: null }),
    record.role_id
      ? supabase.from("roles").select("name").eq("id", record.role_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Your own bank details are yours to see: this is the one record where that
  // needs no permission beyond being the person it describes.
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
      <RecordView
        record={record}
        groups={groups}
        isSuperAdmin={viewer.is_super_admin}
        actions={
          <Link
            href={`/${view}/profile/edit`}
            className="pressable flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-medium text-brand-fg"
          >
            <Icon name="pencil" className="size-4" />
            Edit profile
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2 pt-1">
        <ResetPasswordButton email={record.email} />
        <SignOutButton />
      </div>
    </div>
  );
}
