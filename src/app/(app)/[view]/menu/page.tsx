import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageTitle } from "@/components/PageTitle";
import { Card } from "@/components/ui/Card";
import { getMyNav, groupNav } from "@/lib/access";

/**
 * Everything this view offers, under headings.
 *
 * The bottom bar's fifth slot used to open a sheet holding whatever did not fit
 * in four. That is a different thing from a menu: one is an apology for running
 * out of room, the other is where somebody goes to find a screen they know
 * exists but cannot see. So this lists the whole view rather than the remainder,
 * including the modules already sitting in the bar — a menu that hides what is
 * on screen makes you check twice.
 *
 * The headings come from the module registry, so they are the same on every
 * view and change when somebody edits the row rather than when somebody edits
 * this file.
 */
export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const nav = await getMyNav(view);
  const groups = groupNav(nav);

  return (
    <div className="space-y-5">
      <PageTitle />

      <Card className="p-0">
        <ul className="divide-y divide-line">
          <MenuRow
            href={`/${view}/home`}
            icon="home"
            name="Home"
            caption="The day at a glance"
          />
        </ul>
      </Card>

      {groups.map((group) => (
        <section key={group.name} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {group.name}
          </h2>
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {group.items.map((item) => (
                <MenuRow
                  key={item.module_key}
                  href={`/${view}/${item.href}`}
                  icon={item.icon}
                  name={item.name}
                />
              ))}
            </ul>
          </Card>
        </section>
      ))}

      {groups.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">
            This view has nothing in it yet. Ask an administrator which modules
            your role should reach.
          </p>
        </Card>
      )}

      <Link
        href={`/${view}/profile`}
        className="pressable flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border border-line text-sm font-medium text-muted"
      >
        <Icon name="user" className="size-4" />
        My profile
      </Link>
    </div>
  );
}

function MenuRow({
  href,
  icon,
  name,
  caption,
}: {
  href: string;
  icon: string;
  name: string;
  caption?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="pressable flex min-h-14 items-center gap-3 px-3 hover:bg-subtle"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
          <Icon name={icon} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          {caption && (
            <span className="block truncate text-xs text-muted">{caption}</span>
          )}
        </span>
        <Icon name="chevron" className="size-4 shrink-0 text-muted" />
      </Link>
    </li>
  );
}
