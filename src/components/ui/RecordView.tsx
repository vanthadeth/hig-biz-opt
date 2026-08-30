import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { StoredPhoto } from "@/components/ui/StoredPhoto";
import {
  STATUS_LABELS,
  STATUS_TONE,
  type InfoGroup,
  type UserRecord,
} from "@/lib/users";

/**
 * An employee record, read rather than edited.
 *
 * The same view serves your own profile and somebody else's record, because
 * they are the same thing seen by different people — and two implementations
 * of one page is two places for the truth to drift. What differs is who may do
 * what to it, so the actions are passed in rather than decided here.
 */
export function RecordView({
  record,
  groups,
  isSuperAdmin,
  actions,
  footer,
}: {
  record: UserRecord;
  groups: InfoGroup[];
  isSuperAdmin: boolean;
  /** Buttons for the header card: Edit, and whatever else the page allows. */
  actions?: React.ReactNode;
  /**
   * Anything that follows the detail, such as the employment status card. It
   * sits last because it is an action, not a fact: someone opening a record
   * has come to read it far more often than to suspend the person in it.
   */
  footer?: React.ReactNode;
}) {
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
              {isSuperAdmin && (
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

        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
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

      {footer}
    </div>
  );
}
