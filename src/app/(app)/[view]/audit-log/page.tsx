import { PageTitle } from "@/components/PageTitle";
import { Card } from "@/components/ui/Card";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { AUDIT_COLUMNS, AUDIT_PAGE_SIZE, type AuditEntry } from "@/lib/audit";
import { AuditList } from "./AuditList";

export default async function Page() {
  const supabase = await createClient();

  const [log, mine] = await Promise.all([
    supabase
      .from("audit_log")
      .select(AUDIT_COLUMNS)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(AUDIT_PAGE_SIZE),
    getMyPermissions(),
  ]);

  // Row level security would have returned nothing anyway; saying so is kinder
  // than an empty log that looks like a system with no history.
  if (!can(mine, "audit_log", "view")) {
    return (
      <div className="space-y-5">
        <PageTitle />
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">
            You do not have access to the audit log.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageTitle />
      <p className="text-sm text-muted">
        Every change to people, permissions, the catalogue and the customer
        book. Entries cannot be edited or removed from here — the log only ever
        gains rows. The most recent {AUDIT_PAGE_SIZE} are shown.
      </p>
      <AuditList
        entries={(log.data ?? []) as unknown as AuditEntry[]}
        now={new Date().toISOString()}
      />
    </div>
  );
}
