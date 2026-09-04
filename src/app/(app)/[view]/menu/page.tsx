import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageTitle } from "@/components/PageTitle";
import { Card } from "@/components/ui/Card";
import { getMyModules, groupNav } from "@/lib/access";

/**
 * Everything this person can reach, under headings.
 *
 * Not the current view's modules — the whole app, minus what their permissions
 * do not cover. The bars are view-scoped because a view is a deliberate
 * grouping and the bar belongs to the view you are standing in; a menu is the
 * opposite errand. Somebody who holds the Audit Log and is in the Sale view has
 * to be able to find it, and looking for it in a bar that does not carry it is
 * the moment they decide the app cannot do it.
 *
 * Nothing is shown greyed out or locked. A row for something you cannot open
 * teaches you where the walls are, which is neither useful nor anybody's
 * business; my_modules simply does not return it.
 *
 * Each row leads through a view that actually holds the module, so the bar, the
 * title and the quick actions all agree when you land. Rows that leave the
 * current view say which one they go to, because the shell changing underfoot
 * without warning reads as a bug.
 */
export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const modules = await getMyModules(view);
  const groups = groupNav(modules);

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
                  href={`/${item.view_key}/${item.href}`}
                  icon={item.icon}
                  name={item.name}
                  caption={
                    item.view_key === view ? undefined : `Opens in ${item.view_name}`
                  }
                />
              ))}
            </ul>
          </Card>
        </section>
      ))}

      {groups.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">
            Nothing here yet. Ask an administrator which modules your role should
            reach.
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
