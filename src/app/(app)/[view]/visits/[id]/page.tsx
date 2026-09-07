import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OPTION_COLUMNS, VISIT_COLUMNS, type VisitOption, type VisitRow } from "@/lib/visits";
import { VisitRecord } from "./VisitRecord";

/**
 * One call, as it was recorded.
 *
 * Not found and not allowed look the same on purpose. The policy decides which
 * visits exist for the person asking, and telling somebody a visit exists but
 * is not theirs is telling them where a colleague was.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ view: string; id: string }>;
}) {
  const { view, id } = await params;
  const supabase = await createClient();

  const [visit, options] = await Promise.all([
    supabase.from("visits").select(VISIT_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("visit_options").select(OPTION_COLUMNS),
  ]);

  if (!visit.data) notFound();

  return (
    <VisitRecord
      viewKey={view}
      visit={visit.data as unknown as VisitRow}
      // Every option, not just the active ones: a visit recorded under a word
      // the business has since retired must still say what it said.
      options={(options.data ?? []) as VisitOption[]}
      now={new Date().toISOString()}
    />
  );
}
