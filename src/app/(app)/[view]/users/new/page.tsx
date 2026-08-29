import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { Department } from "@/lib/users";
import { UserForm, type RoleOption } from "../UserForm";

export const metadata: Metadata = { title: "New user" };

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const mine = await getMyPermissions();

  // The insert policy would refuse it anyway; this keeps someone from filling in
  // a long form only to be turned away at the end.
  if (!can(mine, "user", "add")) notFound();

  const supabase = await createClient();
  const [departments, roles, positions] = await Promise.all([
    supabase.from("departments").select("id, name, sort_order").order("sort_order"),
    supabase.from("roles").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("positions").select("name").order("use_count", { ascending: false }),
  ]);

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
        <h1 className="mt-1 text-xl font-semibold tracking-tight">New user</h1>
        <p className="mt-1 text-sm text-muted">
          Creates the employee record. A login is granted separately, and matches
          this record by email.
        </p>
      </div>

      <UserForm
        record={null}
        departments={(departments.data ?? []) as Department[]}
        roles={(roles.data ?? []) as RoleOption[]}
        positions={(positions.data ?? []).map((p) => p.name as string)}
        canEdit
        canSeeBank
        viewKey={view}
      />
    </div>
  );
}
