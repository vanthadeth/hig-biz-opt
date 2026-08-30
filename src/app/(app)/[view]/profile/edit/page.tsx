import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { requireViewer } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { USER_RECORD_COLUMNS, type UserRecord } from "@/lib/users";
import { SelfProfileForm } from "./SelfProfileForm";

export const metadata: Metadata = { title: "Edit profile" };

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
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
        <h1 className="text-xl font-semibold tracking-tight">Edit profile</h1>
        <Card className="p-4">
          <p className="text-sm text-muted">
            Your login has no employee record attached yet, so there is nothing to
            edit. An administrator can create one, and it will be matched to you
            by email.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/${view}/profile`}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
        >
          <Icon name="chevron" className="size-4 rotate-180" />
          Profile
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Edit profile</h1>
      </div>

      <SelfProfileForm record={data as unknown as UserRecord} viewKey={view} />
    </div>
  );
}
