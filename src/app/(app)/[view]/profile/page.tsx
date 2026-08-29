import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { SignOutButton } from "@/components/SignOutButton";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { StoredPhoto } from "@/components/ui/StoredPhoto";
import { requireViewer } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  profileGroups,
  STATUS_LABELS,
  STATUS_TONE,
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
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <StoredPhoto name={record.full_name} path={record.photo_path} />

          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight">
              {record.full_name}
              {record.nickname && (
                <span className="font-normal text-muted"> ({record.nickname})</span>
              )}
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              {record.position ?? "No position set"}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {viewer.is_super_admin && (
                <Chip tone="brand">
                  <Icon name="shield" className="mr-1 size-3.5" />
                  Super admin
                </Chip>
              )}
              <Chip tone={STATUS_TONE[record.status]}>
                {STATUS_LABELS[record.status]}
              </Chip>
            </div>
          </div>
        </div>

        <Link
          href={`/${view}/users/${record.id}`}
          className="pressable mt-4 flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-medium text-brand-fg"
        >
          <Icon name="user" className="size-4" />
          Edit profile
        </Link>
      </Card>

      {groups.map((group) => (
        <section key={group.title} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {group.title}
          </h2>
          <Card className="divide-y divide-line p-0">
            {group.rows.map((row) => (
              <div
                key={row.label}
                className="flex min-h-12 items-center gap-3 px-4 py-2"
              >
                <span className="w-32 shrink-0 text-xs text-muted sm:w-40">
                  {row.label}
                </span>
                {row.value === null ? (
                  <span className="text-sm text-muted">Not set</span>
                ) : row.href ? (
                  <a
                    href={row.href}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-brand hover:underline"
                  >
                    {row.value}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {row.value}
                  </span>
                )}
              </div>
            ))}
          </Card>
        </section>
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <ResetPasswordButton email={record.email} />
        <SignOutButton />
      </div>
    </div>
  );
}
