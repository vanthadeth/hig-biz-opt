"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Field, SelectField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { StoredPhoto } from "@/components/ui/StoredPhoto";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  categoryLabel,
  countCategories,
  filterCategoryTree,
  CATEGORY_COLUMNS,
  INVENTORY_BUCKET,
  type ActiveFilter,
  type Category,
} from "@/lib/inventory";
import { ImageField, uploadInventoryImage } from "../ImageField";
import { ListToolbar, statusChip } from "../ListToolbar";

type Draft = {
  id: string | null;
  parent_id: string;
  name_en: string;
  name_km: string;
  description: string;
  photo_path: string | null;
  active: boolean;
};

function draftFrom(category: Category | null, parentId: string): Draft {
  return {
    id: category?.id ?? null,
    parent_id: category?.parent_id ?? parentId,
    name_en: category?.name_en ?? "",
    name_km: category?.name_km ?? "",
    description: category?.description ?? "",
    photo_path: category?.photo_path ?? null,
    active: category?.active ?? true,
  };
}

/**
 * The category list, one level deep.
 *
 * The nesting is drawn rather than described: a sub-category is indented under
 * its parent, so the one-level rule the database enforces is visible before
 * anybody tries to break it. The "Add sub-category" button on a parent row is
 * the only way to create a child, which is why the parent select on the sheet
 * offers top-level categories alone — a category that already has children
 * cannot become somebody's child, and the trigger says so if you try.
 */
export function CategoryManager({
  categories: initial,
  canEdit,
  canDelete,
}: {
  categories: Category[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [categories, setCategories] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ActiveFilter>("all");
  // Parents are open until somebody closes one. Collapsing is for getting a
  // long list under control, not for hiding what you just arrived to see.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const branches = useMemo(
    () => filterCategoryTree(categories, query, filter),
    [categories, query, filter],
  );
  const shown = countCategories(branches);
  const searching = query.trim() !== "";
  const allCollapsed =
    branches.length > 0 && branches.every((b) => collapsed.has(b.parent.id));
  const parents = useMemo(
    () => categories.filter((c) => c.parent_id === null),
    [categories],
  );

  function open(category: Category | null, parentId = "") {
    haptic("tap");
    setDraft(draftFrom(category, parentId));
    setFile(null);
    setError(null);
  }

  function close() {
    setDraft(null);
    setFile(null);
    setError(null);
  }

  const trimmed = draft?.name_en.trim() ?? "";
  // The two partial unique indexes are what actually hold; catching it here
  // just saves a round trip to be told so. They key on the English name — the
  // one every category is guaranteed to have — so this does too.
  const duplicate = categories.some(
    (c) =>
      c.id !== draft?.id &&
      (c.parent_id ?? "") === (draft?.parent_id ?? "") &&
      c.name_en.toLowerCase() === trimmed.toLowerCase(),
  );
  const valid = trimmed !== "" && !duplicate;

  async function save() {
    if (!draft || !valid) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();

    try {
      const row = {
        parent_id: draft.parent_id === "" ? null : draft.parent_id,
        name_en: trimmed,
        name_km: draft.name_km.trim() === "" ? null : draft.name_km.trim(),
        description: draft.description.trim() === "" ? null : draft.description.trim(),
        active: draft.active,
      };

      if (draft.id === null) {
        const { data, error } = await supabase
          .from("item_categories")
          .insert(row)
          .select(CATEGORY_COLUMNS)
          .single();
        if (error || !data) throw error ?? new Error("The category was not created.");

        let created = data as Category;
        if (file) {
          const path = await uploadInventoryImage(`categories/${created.id}`, file);
          const { data: withPhoto } = await supabase
            .from("item_categories")
            .update({ photo_path: path })
            .eq("id", created.id)
            .select(CATEGORY_COLUMNS)
            .single();
          if (withPhoto) created = withPhoto as Category;
        }

        setCategories((list) => [...list, created]);
      } else {
        const photoPath = file
          ? await uploadInventoryImage(`categories/${draft.id}`, file)
          : draft.photo_path;

        // `.select()` because an update the policy refuses matches no rows and
        // raises nothing at all.
        const { data, error } = await supabase
          .from("item_categories")
          .update({ ...row, photo_path: photoPath })
          .eq("id", draft.id)
          .select(CATEGORY_COLUMNS);
        if (error) throw error;
        if (!data?.length) {
          throw new Error("That category could not be saved. You may not have permission.");
        }

        const updated = data[0] as Category;
        setCategories((list) => list.map((c) => (c.id === updated.id ? updated : c)));
      }

      haptic("success");
      close();
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The category could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    setBusy(true);
    setError(null);

    try {
      const { data, error } = await createClient()
        .from("item_categories")
        .delete()
        .eq("id", draft.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That category could not be removed. You may not have permission.");
      }

      const removed = draft.id;
      setCategories((list) => list.filter((c) => c.id !== removed));
      haptic("success");
      close();
    } catch (e) {
      haptic("error");
      // The foreign keys are `on delete restrict`, so this is the ordinary
      // answer rather than an edge case: say what it means.
      setError(
        e instanceof Error && /violates foreign key/i.test(e.message)
          ? "Items or sub-categories still use this category. Move them first."
          : e instanceof Error
            ? e.message
            : "The category could not be removed.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <button
          type="button"
          onClick={() => open(null)}
          className="pressable flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-medium text-brand-fg"
        >
          <Icon name="plus" className="size-4" />
          New category
        </button>
      )}

      <ListToolbar
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        placeholder="Category name or description"
        label="Search categories"
        extra={
          branches.length > 0 && (
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setCollapsed(
                  allCollapsed ? new Set() : new Set(branches.map((b) => b.parent.id)),
                );
              }}
              className="pressable flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-muted hover:text-fg"
            >
              <Icon
                name="chevron"
                className={`size-4 transition-transform ${allCollapsed ? "" : "-rotate-90"}`}
              />
              <span className="max-sm:sr-only">
                {allCollapsed ? "Expand all" : "Collapse all"}
              </span>
            </button>
          )
        }
      />

      <p className="text-xs text-muted" role="status">
        {shown === 0
          ? searching
            ? `Nothing matches “${query.trim()}”.`
            : filter === "all"
              ? "No categories yet."
              : `No ${filter} categories.`
          : `${shown} categor${shown === 1 ? "y" : "ies"}${searching ? " matching" : ""}`}
      </p>

      {branches.map(({ parent, children }) => {
        const isCollapsed = collapsed.has(parent.id);
        return (
          <Card key={parent.id} className="p-0">
            <Row
              category={parent}
              canEdit={canEdit}
              onEdit={() => open(parent)}
              className="rounded-t-2xl"
              // Only a parent that has something under it is worth collapsing.
              collapsible={children.length > 0 || canEdit}
              collapsed={isCollapsed}
              childCount={children.length}
              onToggle={() => {
                haptic("tap");
                setCollapsed((set) => {
                  const next = new Set(set);
                  if (next.has(parent.id)) next.delete(parent.id);
                  else next.add(parent.id);
                  return next;
                });
              }}
            />

            {!isCollapsed && (
              <>
                {children.map((child) => (
                  <Row
                    key={child.id}
                    category={child}
                    canEdit={canEdit}
                    onEdit={() => open(child)}
                    className="border-t border-line pl-10"
                  />
                ))}

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => open(null, parent.id)}
                    className="pressable flex min-h-11 w-full items-center gap-1.5 rounded-b-2xl border-t border-line px-3 pl-10 text-left text-sm font-medium text-brand"
                  >
                    <Icon name="plus" className="size-4" />
                    Add sub-category
                  </button>
                )}
              </>
            )}
          </Card>
        );
      })}

      <Sheet
        open={draft !== null}
        onClose={close}
        title={draft?.id ? "Edit category" : "New category"}
      >
        {draft && (
          <div className="space-y-4 px-3 pb-4 pt-1">
            <Field
              label="Name (English)"
              value={draft.name_en}
              onChange={(v) => setDraft({ ...draft, name_en: v })}
              placeholder="Grocery"
              error={
                duplicate ? `A category called “${trimmed}” already sits here.` : null
              }
            />

            <Field
              label="Name (Khmer)"
              optional
              value={draft.name_km}
              onChange={(v) => setDraft({ ...draft, name_km: v })}
              placeholder="គ្រឿងទេស"
            />

            <SelectField
              label="Sits under"
              optional
              value={draft.parent_id}
              onChange={(v) => setDraft({ ...draft, parent_id: v })}
              options={parents
                .filter((p) => p.id !== draft.id)
                .map((p) => ({ value: p.id, label: categoryLabel(p) }))}
              placeholder="Nothing — it is top level"
              hint="Categories go one level deep, so a sub-category cannot have children of its own."
            />

            <Field
              label="Description"
              optional
              value={draft.description}
              onChange={(v) => setDraft({ ...draft, description: v })}
              placeholder="What belongs in it"
            />

            <ImageField
              label="Picture"
              alt={draft.name_en || "Category"}
              path={draft.photo_path}
              file={file}
              onChange={setFile}
              disabled={busy}
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                className="size-4 accent-[var(--brand)]"
              />
              Active
            </label>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium text-muted disabled:opacity-60"
              >
                Cancel
              </button>
              {draft.id && canDelete && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="pressable min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-danger disabled:opacity-60"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={save}
                disabled={!valid || busy}
                className="pressable min-h-11 flex-1 rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
              >
                {busy ? "Saving…" : draft.id ? "Save" : "Create"}
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Row({
  category,
  canEdit,
  onEdit,
  className = "",
  collapsible = false,
  collapsed = false,
  childCount = 0,
  onToggle,
}: {
  category: Category;
  canEdit: boolean;
  onEdit: () => void;
  className?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  childCount?: number;
  onToggle?: () => void;
}) {
  const status = statusChip(category.active);
  const body = (
    <>
      <StoredPhoto
        name={category.name_en}
        path={category.photo_path}
        bucket={INVENTORY_BUCKET}
        fallback={<Icon name="grid" className="size-4" />}
        className="size-10 rounded-lg"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{category.name_en}</span>
        {category.name_km && (
          <span className="block truncate text-xs text-muted">{category.name_km}</span>
        )}
        {category.description && (
          <span className="block truncate text-xs text-muted">
            {category.description}
          </span>
        )}
      </span>
      <Chip tone={status.tone}>{status.label}</Chip>
    </>
  );

  // The disclosure sits outside the edit button rather than inside it: nesting
  // a button in a button is invalid, and tapping "collapse" must not also open
  // the edit sheet.
  const toggle = collapsible && onToggle && (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? "Expand" : "Collapse"} ${category.name_en}`}
      className="pressable flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-fg"
    >
      <Icon
        name="chevron"
        className={`size-4 transition-transform ${collapsed ? "" : "rotate-90"}`}
      />
    </button>
  );

  return (
    <div className={`flex min-h-14 items-center gap-1 pr-3 ${className}`}>
      {toggle ?? <span className="w-1" aria-hidden />}

      {canEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-14 flex-1 items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-subtle"
        >
          {body}
          <Icon name="pencil" className="size-4 shrink-0 text-muted" />
        </button>
      ) : (
        <div className="flex min-h-14 flex-1 items-center gap-3 px-2">{body}</div>
      )}

      {collapsed && childCount > 0 && (
        <span className="shrink-0 text-xs text-muted">{childCount}</span>
      )}
    </div>
  );
}
