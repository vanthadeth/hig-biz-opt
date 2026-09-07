import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { can, getMyPermissions } from "@/lib/access";
import { CustomerSyncBuilder } from "./CustomerSyncBuilder";

export const metadata: Metadata = { title: "Customer sync" };

/**
 * The customer tab needs several syncs rather than one, so it gets a screen of
 * its own rather than a checkbox on the ordinary mapping form that would only
 * make sense for one table.
 */
export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const mine = await getMyPermissions();

  // The insert policy would refuse it anyway; this saves filling in a long form
  // to be turned away at the end.
  if (!can(mine, "data_sync", "add")) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/${view}/data-sync`}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
        >
          <Icon name="chevron" className="size-4 rotate-180" />
          All syncs
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Customer sync</h1>
        <p className="mt-1 text-sm text-muted">
          The customer tab is shaped differently from this database in two ways
          no single mapping can express: a location kept in one cell that is two
          columns here, and three phones in the customer&rsquo;s row that are rows
          of their own. This writes the several syncs that result.
        </p>
      </div>

      <CustomerSyncBuilder viewKey={view} />
    </div>
  );
}
