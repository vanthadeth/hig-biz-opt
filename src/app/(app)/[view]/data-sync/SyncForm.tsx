"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Field, SelectField } from "@/components/ui/Field";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  fromMinutes,
  kindForType,
  spreadsheetIdFrom,
  syncProblems,
  toMinutes,
  VALUE_KIND_LABELS,
  type IntervalUnit,
  type SyncColumnMap,
  type SyncDefinition,
  type SyncTarget,
  type SyncTrigger,
  type SyncValueKind,
  type TargetColumn,
} from "@/lib/sync";

type Pairing = { target: string; kind: SyncValueKind };

/**
 * Defining a sync: which tab, which table, and which column feeds which.
 *
 * The column pairing is the part that has to be right, and the thing that makes
 * it possible to get right is the sample values. "Price" next to "1,250.50" is
 * obvious; "Price" on its own is a guess, and a guess here quietly writes the
 * wrong column into the catalogue every night.
 *
 * Nothing is saved until the sheet has been read, because a mapping written
 * against imagined column names is a mapping that matches nothing.
 */
export function SyncForm({
  sync,
  maps,
  targets,
  viewKey,
}: {
  sync: SyncDefinition | null;
  maps: SyncColumnMap[];
  targets: SyncTarget[];
  viewKey: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const initialInterval = fromMinutes(sync?.interval_minutes ?? 1440);

  const [name, setName] = useState(sync?.name ?? "");
  const [sheetInput, setSheetInput] = useState(sync?.spreadsheet_id ?? "");
  const [tab, setTab] = useState(sync?.tab_name ?? "");
  const [headerRow, setHeaderRow] = useState(String(sync?.header_row ?? 1));
  const [targetTable, setTargetTable] = useState(sync?.target_table ?? targets[0]?.table_name ?? "");
  const [triggerKind, setTriggerKind] = useState<SyncTrigger>(sync?.trigger_kind ?? "interval");
  const [every, setEvery] = useState(String(initialInterval.every));
  const [unit, setUnit] = useState<IntervalUnit>(initialInterval.unit);
  const [active, setActive] = useState(sync?.active ?? true);

  const [tabs, setTabs] = useState<string[]>([]);
  const [headers, setHeaders] = useState<string[]>(maps.map((m) => m.sheet_column));
  const [samples, setSamples] = useState<unknown[][]>([]);
  const [columns, setColumns] = useState<TargetColumn[]>([]);

  const [pairs, setPairs] = useState<Record<string, Pairing>>(() =>
    Object.fromEntries(
      maps.map((m) => [m.sheet_column, { target: m.target_column ?? "", kind: m.value_kind }]),
    ),
  );

  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const spreadsheetId = spreadsheetIdFrom(sheetInput);
  const target = targets.find((t) => t.table_name === targetTable) ?? null;

  // The columns this table will accept, from the database rather than from a
  // list in the browser: the allow-list is enforced by a trigger, and a screen
  // offering more than the trigger allows would fail on save.
  useEffect(() => {
    if (!targetTable) return;
    let live = true;
    supabase
      .rpc("sync_columns", { p_table: targetTable })
      .then(({ data }) => {
        if (live) setColumns((data ?? []) as TargetColumn[]);
      });
    return () => {
      live = false;
    };
  }, [supabase, targetTable]);

  const readSheet = useCallback(async () => {
    if (!spreadsheetId) {
      setError("That does not look like a Google Sheet link or id.");
      return;
    }
    setReading(true);
    setError(null);
    setNotice(null);

    try {
      const query = new URLSearchParams({ spreadsheetId });
      if (tab) query.set("tab", tab);
      query.set("headerRow", headerRow || "1");

      const response = await fetch(`/api/sync/sheet?${query}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The sheet could not be read.");

      setTabs(body.tabs ?? []);
      if (!tab && body.tabs?.length) {
        // Reading a file with no tab chosen gets the tab list; choosing the
        // first is a better default than an empty box, and it is one tap to
        // change.
        setTab(body.tabs[0]);
        setNotice("Choose the tab, then read it again.");
        return;
      }

      const found: string[] = body.headers ?? [];
      setHeaders(found);
      setSamples(body.samples ?? []);

      // Existing pairings survive a re-read; a column that has appeared in the
      // sheet since arrives unmapped, which is visible rather than silent.
      setPairs((current) => {
        const next: Record<string, Pairing> = {};
        for (const header of found) {
          next[header] = current[header] ?? { target: "", kind: "text" };
        }
        return next;
      });

      if (found.length === 0) setNotice("That tab has no headings in that row.");
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The sheet could not be read.");
    } finally {
      setReading(false);
    }
  }, [spreadsheetId, tab, headerRow]);

  function pair(header: string, patch: Partial<Pairing>) {
    setPairs((current) => ({
      ...current,
      [header]: { ...(current[header] ?? { target: "", kind: "text" }), ...patch },
    }));
  }

  /** Picking a column suggests the kind its type implies, unless one was set. */
  function choose(header: string, column: string) {
    const type = columns.find((c) => c.column_name === column);
    pair(header, {
      target: column,
      kind: type ? kindForType(type.data_type) : "text",
    });
  }

  // A column already taken by another sheet column cannot be offered twice: the
  // database has a unique index on it, and two columns feeding one is a race.
  const takenBy = (header: string, column: string) =>
    Object.entries(pairs).some(([h, p]) => h !== header && p.target === column);

  const asMaps: SyncColumnMap[] = headers.map((header, i) => ({
    id: `draft-${i}`,
    sync_id: sync?.id ?? "draft",
    sheet_column: header,
    target_column: pairs[header]?.target || null,
    value_kind: pairs[header]?.kind ?? "text",
    sort_order: i,
  }));

  const intervalMinutes =
    triggerKind === "interval" ? toMinutes(Number(every) || 1, unit) : null;

  const problems = target
    ? syncProblems({ trigger_kind: triggerKind, interval_minutes: intervalMinutes }, asMaps, target.key_column)
    : [];

  async function save() {
    if (!spreadsheetId || !tab || !target) {
      setError("A sync needs a sheet, a tab and a table.");
      return;
    }
    if (headers.length === 0) {
      setError("Read the sheet first, so the mapping is against its real columns.");
      return;
    }
    if (problems.length > 0) {
      setError(problems.join(" "));
      return;
    }

    setSaving(true);
    setError(null);

    const row = {
      name: name.trim(),
      spreadsheet_id: spreadsheetId,
      tab_name: tab,
      header_row: Number(headerRow) || 1,
      target_table: targetTable,
      trigger_kind: triggerKind,
      interval_minutes: intervalMinutes,
      active,
    };

    try {
      // `.select()` on every write: a policy refuses an update by matching no
      // rows and raising nothing at all.
      let id = sync?.id;
      if (id) {
        const { data, error: e } = await supabase
          .from("sync_definitions")
          .update(row)
          .eq("id", id)
          .select("id");
        if (e) throw e;
        if (!data?.length) throw new Error("You may not change this sync.");
      } else {
        const { data, error: e } = await supabase
          .from("sync_definitions")
          .insert(row)
          .select("id")
          .single();
        if (e || !data) throw e ?? new Error("The sync could not be created.");
        id = data.id;
      }

      // Replaced wholesale rather than reconciled: the mapping is small, and a
      // diff that gets one row wrong writes the wrong column for a year.
      await supabase.from("sync_column_maps").delete().eq("sync_id", id);
      const { error: mapError } = await supabase.from("sync_column_maps").insert(
        headers.map((header, i) => ({
          sync_id: id,
          sheet_column: header,
          target_column: pairs[header]?.target || null,
          value_kind: pairs[header]?.kind ?? "text",
          sort_order: i,
        })),
      );
      if (mapError) throw mapError;

      haptic("success");
      router.push(`/${viewKey}/data-sync/${id}`);
      router.refresh();
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The sync could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-4">
        <SectionHeader title="The sheet" />
        <Field
          label="Name"
          value={name}
          onChange={setName}
          placeholder="Item master, daily"
          hint="What this sync is for, in your words."
        />
        <Field
          label="Google Sheet link or id"
          value={sheetInput}
          onChange={setSheetInput}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          hint={
            spreadsheetId
              ? `Reading file ${spreadsheetId}`
              : "Paste the address bar. The file id is taken out of it."
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {tabs.length > 0 ? (
            <SelectField
              label="Tab"
              value={tab}
              onChange={setTab}
              options={tabs.map((t) => ({ value: t, label: t }))}
            />
          ) : (
            <Field label="Tab" value={tab} onChange={setTab} placeholder="Sheet1" />
          )}
          <Field
            label="Heading row"
            value={headerRow}
            onChange={setHeaderRow}
            inputMode="numeric"
            hint="Usually 1. Higher if the sheet has a title above the headings."
          />
        </div>

        <button
          type="button"
          onClick={readSheet}
          disabled={reading || !spreadsheetId}
          className="pressable flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-medium disabled:opacity-50"
        >
          <Icon name="search" className="size-4" />
          {reading ? "Reading…" : "Read the sheet"}
        </button>

        {notice && <p className="text-xs text-muted">{notice}</p>}
      </Card>

      <Card className="space-y-3 p-4">
        <SectionHeader title="The table" />
        <SelectField
          label="Write into"
          value={targetTable}
          onChange={setTargetTable}
          options={targets.map((t) => ({ value: t.table_name, label: t.label }))}
          hint={
            target
              ? `Rows are matched on ${target.key_column}. A row whose ${target.key_column} is already there is updated; one that is not is added.`
              : undefined
          }
        />
      </Card>

      {headers.length > 0 && (
        <Card className="space-y-3 p-4">
          <SectionHeader
            title="Column pairing"
            caption="Each sheet column, and where it goes."
          />

          <ul className="divide-y divide-line">
            {headers.map((header, i) => {
              const chosen = pairs[header]?.target ?? "";
              const sample = samples.map((row) => row[i]).find(
                (v) => v !== null && v !== undefined && String(v).trim() !== "",
              );

              return (
                <li key={header} className="grid gap-2 py-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{header}</p>
                    {/* The sample is what makes this screen usable. */}
                    <p className="truncate text-xs text-muted">
                      {sample === undefined ? "No example in the first rows" : `e.g. ${String(sample)}`}
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <SelectField
                      label="Goes to"
                      value={chosen}
                      onChange={(value) => (value ? choose(header, value) : pair(header, { target: "" }))}
                      placeholder="Skip this column"
                      options={columns
                        .filter((c) => c.column_name === chosen || !takenBy(header, c.column_name))
                        .map((c) => ({
                          value: c.column_name,
                          label:
                            c.column_name === target?.key_column
                              ? `${c.column_name} — matched on`
                              : c.column_name,
                        }))}
                    />
                    {chosen && (
                      <SelectField
                        label="Read as"
                        value={pairs[header]?.kind ?? "text"}
                        onChange={(value) => pair(header, { kind: value as SyncValueKind })}
                        options={Object.entries(VALUE_KIND_LABELS).map(([value, label]) => ({
                          value,
                          label,
                        }))}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <SectionHeader title="When it runs" />
        <SelectField
          label="Run"
          value={triggerKind}
          onChange={(value) => setTriggerKind(value as SyncTrigger)}
          options={[
            { value: "interval", label: "Every so often" },
            { value: "change", label: "When the sheet changes" },
          ]}
        />

        {triggerKind === "interval" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Every" value={every} onChange={setEvery} inputMode="numeric" />
              <SelectField
                label="Unit"
                value={unit}
                onChange={(value) => setUnit(value as IntervalUnit)}
                options={[
                  { value: "minutes", label: "Minutes" },
                  { value: "hours", label: "Hours" },
                  { value: "days", label: "Days" },
                ]}
              />
            </div>
            {/* Said here because the alternative is somebody setting fifteen
                minutes, believing it, and finding out a week later that the
                scheduler only calls once a day. */}
            <p className="text-xs text-muted">
              This says when the sync is <em>due</em>, not how often anything
              checks. It runs no more often than the scheduler calls the app —
              once a day by default. See Data sync in the README to run it more
              often than that.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">
            The sheet has to tell us. Save this sync, then follow the short
            instruction on its page to add the notifier to the spreadsheet.
          </p>
        )}

        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm">Switched on</span>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="size-5 accent-[var(--brand)]"
          />
        </label>
      </Card>

      {problems.length > 0 && headers.length > 0 && (
        <ul className="space-y-1">
          {problems.map((problem) => (
            <li key={problem} className="text-xs text-warn-fg">
              {problem}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="pressable flex min-h-11 w-full items-center justify-center rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
      >
        {saving ? "Saving…" : sync ? "Save changes" : "Create sync"}
      </button>
    </div>
  );
}
