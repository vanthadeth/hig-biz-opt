"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Field, SelectField } from "@/components/ui/Field";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { spreadsheetIdFrom, toMinutes, type IntervalUnit } from "@/lib/sync";
import {
  CUSTOMER_FIELDS,
  customerSyncProblem,
  guessPicks,
  guessSummary,
  looksLikeProvinceCodes,
  planCustomerSync,
  planSummary,
  type ContactSlot,
  type CustomerField,
  type CustomerSyncPicks,
} from "@/lib/customerSync";

const SLOTS = 3;

/**
 * The customer sheet, set up in one pass.
 *
 * The ordinary mapping screen pairs one sheet column with one target column,
 * which the customer tab breaks twice: a location kept in one cell that is two
 * columns here, and three phones in the customer's row that are rows of their
 * own in another table. Neither can be said in a pairing, so this says it for
 * you and writes the several syncs that result.
 *
 * It only asks which column is which. Everything about identity — the derived
 * IDs that make a second run an update rather than a duplicate — is decided by
 * `planCustomerSync`, which is where it can be tested.
 */
export function CustomerSyncBuilder({ viewKey }: { viewKey: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [sheetInput, setSheetInput] = useState("");
  const [tab, setTab] = useState("");
  const [headerRow, setHeaderRow] = useState("1");
  const [tabs, setTabs] = useState<string[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [samples, setSamples] = useState<unknown[][]>([]);

  const [sheetIdColumn, setSheetIdColumn] = useState("");
  const [fields, setFields] = useState<Partial<Record<CustomerField, string>>>({});
  const [locationColumn, setLocationColumn] = useState("");
  const [provinceColumn, setProvinceColumn] = useState("");
  const [contacts, setContacts] = useState<ContactSlot[]>(
    Array.from({ length: SLOTS }, () => ({ phone: "", label: "" })),
  );

  const [provinceIsCode, setProvinceIsCode] = useState(false);
  const [guessNote, setGuessNote] = useState<string | null>(null);

  const [every, setEvery] = useState("1");
  const [unit, setUnit] = useState<IntervalUnit>("hours");

  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spreadsheetId = spreadsheetIdFrom(sheetInput);
  const picks: CustomerSyncPicks = {
    spreadsheetId: spreadsheetId ?? "",
    tab,
    headerRow: Number(headerRow) || 1,
    sheetIdColumn,
    fields,
    locationColumn,
    provinceColumn,
    provinceIsCode,
    contacts,
    intervalMinutes: toMinutes(Number(every) || 1, unit),
  };

  const planned = planCustomerSync(picks);
  const problem = customerSyncProblem(picks);

  /** The columns to choose from, with an example so a header is recognisable. */
  const options = [
    { value: "", label: "Not mapped" },
    ...headers.map((header, i) => {
      const example = samples[0]?.[i];
      const shown =
        example === null || example === undefined || String(example).trim() === ""
          ? null
          : String(example).slice(0, 24);
      return { value: header, label: shown ? `${header} — ${shown}` : header };
    }),
  ];

  async function read() {
    if (!spreadsheetId) {
      setError("That does not look like a spreadsheet link or ID.");
      return;
    }
    setReading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ spreadsheetId, headerRow });
      if (tab) query.set("tab", tab);
      const response = await fetch(`/api/sync/sheet?${query}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The sheet could not be read.");

      const found: string[] = body.headers ?? [];
      const rows: unknown[][] = body.samples ?? [];

      setTabs(body.tabs ?? []);
      setHeaders(found);
      setSamples(rows);
      if (!tab && body.tabs?.length === 1) setTab(body.tabs[0]);

      // The sheet has just named its own columns. Reading them is work for the
      // machine, and everything below is now a review rather than thirty
      // questions.
      const guess = guessPicks(found);
      setSheetIdColumn(guess.sheetIdColumn);
      setFields(guess.fields);
      setLocationColumn(guess.locationColumn);
      setProvinceColumn(guess.provinceColumn);
      setContacts(
        Array.from({ length: SLOTS }, (_, i) => guess.contacts[i] ?? { phone: "", label: "" }),
      );
      setGuessNote(guessSummary(guess, found));

      // Which of the two things a province column can be is decided from its
      // real values, not assumed: a column of codes read as IDs looks up
      // nothing and leaves every customer with no province at all.
      if (guess.provinceColumn) {
        const at = found.indexOf(guess.provinceColumn);
        const { data } = await supabase.from("geo_provinces").select("code");
        setProvinceIsCode(
          looksLikeProvinceCodes(
            rows.map((row) => row[at]),
            ((data ?? []) as { code: string }[]).map((p) => p.code),
          ),
        );
      }
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The sheet could not be read.");
    } finally {
      setReading(false);
    }
  }

  async function create() {
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);

    try {
      let first: string | null = null;

      // In order, and one at a time: the phones resolve their customer through
      // the customers sync, and a run that happens between the two writes a
      // null link rather than failing — recoverable, but a second run to fix.
      for (const sync of planned) {
        const { data, error: e } = await supabase
          .from("sync_definitions")
          .insert({
            name: sync.name,
            spreadsheet_id: picks.spreadsheetId,
            tab_name: tab,
            header_row: picks.headerRow,
            target_table: sync.target_table,
            trigger_kind: "interval",
            interval_minutes: picks.intervalMinutes,
            match_on: "sheet_id",
            require_column: sync.require_column,
            active: true,
          })
          .select("id")
          .single();
        if (e || !data) throw e ?? new Error(`${sync.name} could not be created.`);
        first ??= data.id;

        const { error: mapError } = await supabase.from("sync_column_maps").insert(
          sync.maps.map((m) => ({ ...m, sync_id: data.id })),
        );
        if (mapError) throw mapError;
      }

      haptic("success");
      router.push(`/${viewKey}/data-sync/${first}`);
      router.refresh();
    } catch (e) {
      haptic("error");
      setError(
        e instanceof Error
          ? `${e.message} Anything created before this is on the sync list.`
          : "The syncs could not be created.",
      );
    } finally {
      setSaving(false);
    }
  }

  const setField = (column: CustomerField) => (value: string) =>
    setFields((f) => ({ ...f, [column]: value }));

  const setSlot = (i: number, patch: Partial<ContactSlot>) =>
    setContacts((all) => all.map((c, at) => (at === i ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-4">
        <SectionHeader
          title="The sheet"
          caption="Paste the link, then read it so the columns below are its real ones."
        />
        <Field
          label="Spreadsheet link or ID"
          value={sheetInput}
          onChange={setSheetInput}
          placeholder="https://docs.google.com/spreadsheets/d/…"
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
            <Field label="Tab" value={tab} onChange={setTab} optional />
          )}
          <Field
            label="Header row"
            value={headerRow}
            onChange={(v) => setHeaderRow(v.replace(/\D/g, "") || "1")}
            inputMode="numeric"
          />
        </div>
        <button
          type="button"
          onClick={read}
          disabled={reading}
          className="pressable min-h-11 w-full rounded-xl border border-line text-sm font-medium disabled:opacity-60"
        >
          {reading ? "Reading…" : headers.length > 0 ? "Read it again" : "Read the sheet"}
        </button>
      </Card>

      {headers.length > 0 && (
        <>
          <Card className="space-y-3 p-4">
            <SectionHeader
              title="The customer"
              caption="Which column holds what. Everything hangs off the ID."
            />
            {guessNote && (
              <p className="rounded-lg bg-subtle p-2.5 text-xs text-muted">{guessNote}</p>
            )}
            <SelectField
              label="Customer ID in the sheet"
              value={sheetIdColumn}
              onChange={setSheetIdColumn}
              options={options}
              hint="What makes a second run update the customer rather than add it again."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {CUSTOMER_FIELDS.map((f) => (
                <SelectField
                  key={f.column}
                  label={f.label}
                  value={fields[f.column] ?? ""}
                  onChange={setField(f.column)}
                  options={options}
                  optional={f.column !== "shop_name"}
                />
              ))}
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <SectionHeader
              title="Where the shop is"
              caption="The two things this database keeps differently from the sheet."
            />
            <SelectField
              label="Location, as one cell"
              value={locationColumn}
              onChange={setLocationColumn}
              options={options}
              optional
              hint="Split into latitude and longitude. A cell that is not two numbers is left empty rather than half filled."
            />
            <SelectField
              label="Province"
              value={provinceColumn}
              onChange={setProvinceColumn}
              options={options}
              optional
              hint={
                provinceIsCode
                  ? "These values are province codes this database already knows, so they are written straight through."
                  : "These values look like the province's ID on its own tab, so they are looked up there. Sync the provinces first, or run this again afterwards."
              }
            />
            {provinceColumn && (
              /* Read off the column's real values, and overridable, because
                 getting it wrong is silent: every customer lands with no
                 province rather than with a wrong one. */
              <label className="flex items-start gap-2.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={provinceIsCode}
                  onChange={(e) => setProvinceIsCode(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-brand"
                />
                <span>
                  This column already holds the province code
                  {samples[0] && provinceColumn && headers.indexOf(provinceColumn) >= 0
                    ? ` — the first row says "${String(
                        samples[0][headers.indexOf(provinceColumn)] ?? "",
                      ).slice(0, 16)}"`
                    : ""}
                  .
                </span>
              </label>
            )}
          </Card>

          <Card className="space-y-3 p-4">
            <SectionHeader
              title="The phones"
              caption="Each becomes a contact of its own, kept apart by its slot."
            />
            {contacts.map((slot, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label={`Phone ${i + 1}`}
                  value={slot.phone}
                  onChange={(v) => setSlot(i, { phone: v })}
                  options={options}
                  optional
                />
                <SelectField
                  label={`Label ${i + 1}`}
                  value={slot.label}
                  onChange={(v) => setSlot(i, { label: v })}
                  options={options}
                  optional
                  hint={i === 0 ? "Becomes the contact's name." : undefined}
                />
              </div>
            ))}
          </Card>

          <Card className="space-y-3 p-4">
            <SectionHeader title="How often" caption="Every sync below runs on this." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Every"
                value={every}
                onChange={(v) => setEvery(v.replace(/\D/g, "") || "1")}
                inputMode="numeric"
              />
              <SelectField
                label="Unit"
                value={unit}
                onChange={(v) => setUnit(v as IntervalUnit)}
                options={[
                  { value: "minutes", label: "Minutes" },
                  { value: "hours", label: "Hours" },
                  { value: "days", label: "Days" },
                ]}
              />
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <p className="text-sm text-muted">{planSummary(planned)}</p>
            <ul className="space-y-1">
              {planned.map((sync) => (
                <li key={sync.name} className="text-xs text-muted">
                  <span className="font-medium text-fg">{sync.name}</span> →{" "}
                  {sync.target_table}, {sync.maps.length} columns
                </li>
              ))}
            </ul>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            {problem && !error && <p className="text-sm text-muted">{problem}</p>}

            <button
              type="button"
              onClick={create}
              disabled={saving || problem !== null}
              className="pressable min-h-12 w-full rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create the syncs"}
            </button>
          </Card>
        </>
      )}

      {headers.length === 0 && error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
