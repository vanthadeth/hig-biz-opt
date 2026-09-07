import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { can } from "@/lib/permissions";
import { getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { VISIT_COLUMNS, canEditVisit, type Visit } from "@/lib/visits";
import { VisitFacts } from "./VisitFacts";
import { VisitForm } from "./VisitForm";
// Read-only is a separate component from the form on purpose. One component
// trying to be both is how a form ends up with a disabled state nobody tests.
import { VisitRecordRead } from "./VisitRecordRead";

/**
 * One visit: what happened in the shop, and the button that ends it.
 *
 * Read from `visit_log` rather than `visits` so the shop's name arrives with the
 * row. The view is `security_invoker`, so the policies still decide whether this
 * row is visible at all — a missing row here is a visit that is not this
 * person's to see, and 404 is the honest answer to that.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data }, permissions] = await Promise.all([
    supabase.from("visit_log").select(VISIT_COLUMNS).eq("id", id).maybeSingle(),
    getMyPermissions(),
  ]);

  if (!data) notFound();
  const visit = data as unknown as Visit;

  // The window is enforced by `guard_visit_edit()` in the database. This decides
  // whether a form is drawn at all, so a rep is not offered a save that would
  // then be refused. The scope check is the same escape hatch the trigger makes:
  // 'any' means somebody who was given reach over other people's records.
  const anyScope = permissions.some(
    (p) => p.module_key === "visit" && p.action === "edit" && p.scope === "any",
  );
  const editable =
    can(permissions, "visit", "edit") && canEditVisit(visit, new Date(), { anyScope });

  return (
    <div className="space-y-5">
      <VisitFacts visit={visit} editable={editable} />

      {editable ? (
        <VisitForm visit={visit} />
      ) : (
        <>
          <VisitRecordRead visit={visit} />
          <Card className="p-4">
            <p className="text-sm text-muted">
              This visit was closed for editing. A record can be corrected for 24
              hours after check-out; after that a supervisor has to make the
              change, so that a correction to something a week old leaves a trace.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
