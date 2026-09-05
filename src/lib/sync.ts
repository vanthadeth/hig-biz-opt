/**
 * One-way sync: a Google Sheet tab in, a Supabase table out.
 *
 * Everything here is pure. The Google call lives in `src/lib/google/sheets.ts`
 * and the write lives in one `security definer` function in the database; this
 * file is the part in between — which sheet column feeds which table column,
 * what a cell means once it stops being a string, and when a sync is next due.
 * Keeping it separate is what makes the interesting half testable without a
 * spreadsheet or a network.
 */

export type SyncValueKind =
  | "text"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "timestamp";

export type SyncTrigger = "change" | "interval";
export type SyncMatch = "sheet_id" | "natural";
export type SyncStatus = "running" | "ok" | "failed";
export type SyncSource = "manual" | "schedule" | "change";

export type SyncTarget = {
  table_name: string;
  label: string;
  key_column: string;
  /** Ours, not the sheet's: `id` everywhere except the geo tables, keyed by code. */
  pk_column: string;
  sort_order: number;
};

export type SyncDefinition = {
  id: string;
  name: string;
  spreadsheet_id: string;
  tab_name: string;
  header_row: number;
  target_table: string;
  trigger_kind: SyncTrigger;
  interval_minutes: number | null;
  match_on: SyncMatch;
  hook_token: string;
  active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
};

export type SyncColumnMap = {
  id: string;
  sync_id: string;
  sheet_column: string;
  target_column: string | null;
  value_kind: SyncValueKind;
  /**
   * When set, this column holds a sheet ID belonging to that table rather than a
   * value. The database resolves it to our own key at write time.
   */
  reference_table: string | null;
  sort_order: number;
};

export type SyncRun = {
  id: string;
  sync_id: string;
  source: SyncSource;
  status: SyncStatus;
  started_at: string;
  finished_at: string | null;
  rows_read: number;
  rows_written: number;
  rows_skipped: number;
  message: string | null;
};

export type TargetColumn = {
  column_name: string;
  data_type: string;
  is_required: boolean;
};

export const SYNC_DEFINITION_COLUMNS =
  "id, name, spreadsheet_id, tab_name, header_row, target_table, trigger_kind, interval_minutes, match_on, hook_token, active, last_run_at, next_run_at";

export const SYNC_COLUMN_MAP_COLUMNS =
  "id, sync_id, sheet_column, target_column, value_kind, reference_table, sort_order";

export const SYNC_TARGET_COLUMNS = "table_name, label, key_column, pk_column, sort_order";

export const SYNC_RUN_COLUMNS =
  "id, sync_id, source, status, started_at, finished_at, rows_read, rows_written, rows_skipped, message";

// Naming the sheet ------------------------------------------------------------------

/**
 * The file id out of whatever somebody pasted.
 *
 * People paste the address bar, which carries a `#gid=` for the tab and
 * sometimes a sharing token, and neither identifies the file. Accepts a bare id
 * too, because somebody who knows the id will type the id.
 */
export function spreadsheetIdFrom(input: string): string | null {
  const text = input.trim();
  if (text === "") return null;

  const inUrl = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (inUrl) return inUrl[1];

  // A Google file id is a long opaque token. Requiring a plausible shape stops
  // a half-pasted URL being stored as though it were an id.
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;

  return null;
}

/** The A1 range that reads the whole tab from its heading row down. */
export function a1Range(tab: string, headerRow: number): string {
  // Single quotes are the escape inside an A1 sheet name, and a sheet named
  // "Q1 'main'" is not hypothetical.
  const quoted = tab.replace(/'/g, "''");
  return `'${quoted}'!A${Math.max(1, headerRow)}:ZZ`;
}

// Cells into values -------------------------------------------------------------------

// Google's serial dates count from 1899-12-30, the same epoch Excel uses.
const SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

const TRUTHY = new Set(["true", "yes", "y", "1", "x", "✓", "✔", "on"]);
const FALSY = new Set(["false", "no", "n", "0", "off", "-"]);

function serialToDate(serial: number): Date {
  return new Date(SHEETS_EPOCH_UTC + Math.round(serial * MS_PER_DAY));
}

/**
 * Reads a number out of a cell somebody typed into.
 *
 * Thousands separators, a currency symbol and stray spaces are what a
 * spreadsheet column of money actually contains, and refusing them would fail
 * a sync on the formatting rather than on the data.
 */
function readNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;

  const cleaned = raw.replace(/[\s,$៛]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (cleaned === "" || cleaned === "-") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * One cell, as the column it is going into means it.
 *
 * Null for anything that cannot be read, never a guess and never a zero: a
 * blank price is not a free item, and an unparseable date is not today.
 */
export function coerceValue(raw: unknown, kind: SyncValueKind): unknown {
  if (raw === null || raw === undefined) return null;
  const text = typeof raw === "string" ? raw.trim() : raw;
  if (text === "") return null;

  switch (kind) {
    case "text":
      return String(text);

    case "number":
      return readNumber(text);

    case "integer": {
      const value = readNumber(text);
      return value === null ? null : Math.trunc(value);
    }

    case "boolean": {
      if (typeof text === "boolean") return text;
      const word = String(text).toLowerCase();
      if (TRUTHY.has(word)) return true;
      if (FALSY.has(word)) return false;
      return null;
    }

    case "date":
    case "timestamp": {
      // A real date cell arrives as a serial number, which is unambiguous.
      // Text that looks like a date does not: 03/04 is the third of April to
      // everyone here and the fourth of March to a machine reading US order,
      // so only ISO and an explicit day-first form are accepted.
      const date =
        typeof text === "number"
          ? serialToDate(text)
          : parseDateText(String(text));
      if (date === null) return null;
      return kind === "date"
        ? date.toISOString().slice(0, 10)
        : date.toISOString();
    }
  }
}

function parseDateText(text: string): Date | null {
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, y, m, d, hh = "0", mm = "0", ss = "0"] = iso;
    return new Date(
      Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss),
    );
  }

  // Day first, which is what a Cambodian spreadsheet holds.
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) {
      return new Date(Date.UTC(+y, +m - 1, +d));
    }
  }

  return null;
}

// The sheet into rows -------------------------------------------------------------------

export type BuiltRows = {
  records: Record<string, unknown>[];
  read: number;
  skipped: number;
  /** Why rows were left out, most common first. For the run's message. */
  reasons: { reason: string; count: number }[];
};

/**
 * The sheet's rows as records the target table can take.
 *
 * A row with no value in the key column is skipped rather than inserted: a sync
 * that invents a key makes a duplicate on every run, and a spreadsheet always
 * has a few trailing rows somebody left behind.
 */
export function buildRows(
  headers: string[],
  rows: unknown[][],
  maps: SyncColumnMap[],
  keyColumn: string,
): BuiltRows {
  const mapped = maps.filter((m) => m.target_column !== null);
  const byHeader = new Map(mapped.map((m) => [m.sheet_column.trim(), m]));
  const index = new Map<string, number>();
  headers.forEach((header, i) => {
    const name = String(header ?? "").trim();
    // First wins: a sheet with two columns of the same name is a mistake, and
    // silently taking the last one hides it.
    if (name !== "" && !index.has(name)) index.set(name, i);
  });

  const records: Record<string, unknown>[] = [];
  const reasons = new Map<string, number>();
  const seenKeys = new Set<string>();
  let skipped = 0;

  const note = (reason: string) => {
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    skipped += 1;
  };

  for (const row of rows) {
    if (row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "")) {
      // A blank row is the end of the data as often as it is a gap in it, and
      // it is never a record. Not counted as skipped: nobody meant it.
      continue;
    }

    const record: Record<string, unknown> = {};
    for (const [header, map] of byHeader) {
      const at = index.get(header);
      // A reference carries the other sheet's ID, which is text whatever the
      // column it will eventually land in holds. Coercing it to the target
      // column's type here would turn an ID into null before the database ever
      // got the chance to look it up.
      const kind = map.reference_table ? "text" : map.value_kind;
      record[map.target_column!] = at === undefined ? null : coerceValue(row[at], kind);
    }

    const key = record[keyColumn];
    if (key === null || key === undefined || String(key).trim() === "") {
      note(`no ${keyColumn}`);
      continue;
    }

    // The same key twice in one sheet would have the second row overwrite the
    // first inside a single statement, which Postgres refuses outright.
    const seen = String(key).trim().toLowerCase();
    if (seenKeys.has(seen)) {
      note(`${keyColumn} appears more than once`);
      continue;
    }
    seenKeys.add(seen);

    records.push(record);
  }

  return {
    records,
    read: records.length + skipped,
    skipped,
    reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** What the run log should say about rows it left out. */
export function skipMessage(built: BuiltRows): string | null {
  if (built.reasons.length === 0) return null;
  return built.reasons.map((r) => `${r.count} with ${r.reason}`).join(", ");
}

// Scheduling -------------------------------------------------------------------------

export type IntervalUnit = "minutes" | "hours" | "days";

const UNIT_MINUTES: Record<IntervalUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

export function toMinutes(every: number, unit: IntervalUnit): number {
  return Math.max(1, Math.round(every * UNIT_MINUTES[unit]));
}

/**
 * Minutes back into the largest unit that divides them exactly.
 *
 * So an edit screen opens on "every 2 hours" rather than "every 120 minutes",
 * which is the same schedule described in the words nobody chose.
 */
export function fromMinutes(minutes: number): { every: number; unit: IntervalUnit } {
  if (minutes % UNIT_MINUTES.days === 0) {
    return { every: minutes / UNIT_MINUTES.days, unit: "days" };
  }
  if (minutes % UNIT_MINUTES.hours === 0) {
    return { every: minutes / UNIT_MINUTES.hours, unit: "hours" };
  }
  return { every: minutes, unit: "minutes" };
}

export function intervalLabel(minutes: number | null): string {
  if (minutes === null) return "—";
  const { every, unit } = fromMinutes(minutes);
  const word = every === 1 ? unit.replace(/s$/, "") : unit;
  return every === 1 ? `Every ${word}` : `Every ${every} ${word}`;
}

export function scheduleLabel(sync: SyncDefinition): string {
  return sync.trigger_kind === "change"
    ? "When the sheet changes"
    : intervalLabel(sync.interval_minutes);
}

/** When a sync that has just finished should next run. */
export function nextRunAt(from: Date, minutes: number | null): string | null {
  if (minutes === null) return null;
  return new Date(from.getTime() + minutes * 60_000).toISOString();
}

/**
 * Is this sync due?
 *
 * A sync that has never run is due immediately: the first run is the one
 * somebody is waiting for. An on-change sync is never due on a clock — its
 * whole point is that the sheet says when.
 */
export function isDue(sync: SyncDefinition, now: Date): boolean {
  if (!sync.active) return false;
  if (sync.trigger_kind !== "interval") return false;
  if (sync.next_run_at === null) return true;
  return new Date(sync.next_run_at).getTime() <= now.getTime();
}

// Reading a sync back --------------------------------------------------------------

export function mappedColumns(maps: SyncColumnMap[]): SyncColumnMap[] {
  return maps.filter((m) => m.target_column !== null);
}

/** "6 of 11 columns" — what the list shows without opening the sync. */
export function mappingLabel(maps: SyncColumnMap[]): string {
  const total = maps.length;
  if (total === 0) return "Nothing mapped yet";
  return `${mappedColumns(maps).length} of ${total} columns`;
}

/**
 * What stops this sync running, in the order somebody should fix it.
 *
 * Returned rather than thrown: the edit screen shows all of them at once, and a
 * sync missing two things should not have to be saved twice to learn the second.
 */
/**
 * The column a sync matches rows on.
 *
 * The sheet's own ID by default, because that is what the sheets link to each
 * other by and it survives a rename. A sheet with no ID column falls back to
 * the target's natural key.
 */
export function matchColumn(
  sync: Pick<SyncDefinition, "match_on">,
  target: Pick<SyncTarget, "key_column">,
): string {
  return sync.match_on === "sheet_id" ? "sheet_id" : target.key_column;
}

export function syncProblems(
  sync: Pick<SyncDefinition, "trigger_kind" | "interval_minutes">,
  maps: SyncColumnMap[],
  keyColumn: string,
): string[] {
  const problems: string[] = [];
  const mapped = mappedColumns(maps);

  if (mapped.length === 0) {
    problems.push("No sheet column is mapped to a table column yet.");
  }
  if (!mapped.some((m) => m.target_column === keyColumn)) {
    problems.push(
      `Nothing feeds ${keyColumn}, which is how a row is matched. Without it every run would add rows rather than update them.`,
    );
  }
  if (sync.trigger_kind === "interval" && !sync.interval_minutes) {
    problems.push("An interval sync needs an interval.");
  }

  return problems;
}

export function statusTone(status: SyncStatus): "accent" | "danger" | "warn" {
  if (status === "ok") return "accent";
  if (status === "failed") return "danger";
  return "warn";
}

export const STATUS_LABELS: Record<SyncStatus, string> = {
  running: "Running",
  ok: "Synced",
  failed: "Failed",
};

export const SOURCE_LABELS: Record<SyncSource, string> = {
  manual: "Run by hand",
  schedule: "On schedule",
  change: "Sheet changed",
};

export const VALUE_KIND_LABELS: Record<SyncValueKind, string> = {
  text: "Text",
  number: "Number",
  integer: "Whole number",
  boolean: "Yes / no",
  date: "Date",
  timestamp: "Date and time",
};

/**
 * The kind a column's type suggests, so the mapping screen starts on the right
 * answer rather than on "text" for everything.
 */
export function kindForType(dataType: string): SyncValueKind {
  const type = dataType.toLowerCase();
  if (type.includes("timestamp")) return "timestamp";
  if (type === "date") return "date";
  if (type === "boolean") return "boolean";
  if (type.includes("int")) return "integer";
  if (["numeric", "real", "double precision", "decimal"].some((t) => type.includes(t))) {
    return "number";
  }
  return "text";
}
