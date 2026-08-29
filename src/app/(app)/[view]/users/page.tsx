import { PageTitle } from "@/components/PageTitle";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { Department, DirectoryEntry } from "@/lib/users";
import { UserList } from "./UserList";

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const supabase = await createClient();

  // The directory rather than public.users: the list needs none of the payroll
  // columns, and reading the narrower thing is the point of having it. Row level
  // security still decides who appears, since the view is security_invoker.
  const [peopleResult, departmentsResult, mine] = await Promise.all([
    supabase
      .from("user_directory")
      .select("id, full_name, nickname, position, department_id, status, photo_path")
      .order("full_name"),
    supabase.from("departments").select("id, name, sort_order").order("sort_order"),
    getMyPermissions(),
  ]);

  return (
    <div className="space-y-5">
      <PageTitle />
      <UserList
        people={(peopleResult.data ?? []) as DirectoryEntry[]}
        departments={(departmentsResult.data ?? []) as Department[]}
        canAdd={can(mine, "user", "add")}
        viewKey={view}
      />
    </div>
  );
}
