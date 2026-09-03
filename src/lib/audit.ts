/**
 * The audit log, as the screen reads it.
 *
 * The database records changes in its own terms — table names, column names,
 * whole rows as JSON. None of that is what somebody looking for "who dropped
 * the price on the 1.5 litre" wants to read, so everything here is the
 * translation: `items` becomes Item, `name_en` becomes Name (English), and a
 * row is titled by whatever it calls itself rather than by its uuid.
 */

export type AuditAction = "insert" | "update" | "delete";

export type AuditEntry = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  /** The actor's name as it read at the time, not as it reads now. */
  actor_name: string | null;
  table_name: string;
  record_id: string | null;
  action: AuditAction;
  changed: string[];
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
};

// One literal, not a concatenation: supabase-js reads this string in the type
// system to work out the row shape.
export const AUDIT_COLUMNS =
  "id, occurred_at, actor_id, actor_name, table_name, record_id, action, changed, old_row, new_row";

/**
 * How many entries a page asks for.
 *
 * The log has no natural end, and a screen that tries to show all of it gets
 * slower every week it is left running.
 */
export const AUDIT_PAGE_SIZE = 200;

/**
 * Cambodian time, pinned rather than taken from the machine.
 *
 * Two reasons. The page renders on a server in UTC and then hydrates in a
 * browser in Phnom Penh, and a timestamp formatted from the local zone would
 * differ between the two. And everyone reading this log is in one country: "at
 * 14:32" should mean the same thing to all of them.
 */
export const TIME_ZONE = "Asia/Phnom_Penh";

const TABLE_LABELS: Record<string, string> = {
  users: "Employee",
  roles: "Role",
  role_permissions: "Role permission",
  role_views: "Role view",
  user_permission_overrides: "Permission override",
  user_views: "View access",
  departments: "Department",
  positions: "Position",
  item_categories: "Category",
  brands: "Brand",
  items: "Item",
  item_variants: "Variant",
  item_pictures: "Item picture",
  customers: "Customer",
  customer_contacts: "Contact",
  customer_pictures: "Customer picture",
  printers: "Printer",
};

/** `item_variants` as "Variant", or a readable guess for a table added later. */
export function tableLabel(table: string): string {
  return TABLE_LABELS[table] ?? sentenceCase(table);
}

/** Every table the log currently holds, for the filter, in a settled order. */
export function tablesIn(entries: AuditEntry[]): string[] {
  return [...new Set(entries.map((e) => e.table_name))].sort((a, b) =>
    tableLabel(a).localeCompare(tableLabel(b)),
  );
}

const COLUMN_LABELS: Record<string, string> = {
  name_en: "Name (English)",
  name_km: "Name (Khmer)",
  price_usd: "Price USD",
  price_khr: "Price KHR",
  credit_limit_usd: "Credit limit USD",
  is_primary: "Main",
  is_super_admin: "Super administrator",
  photo_path: "Picture",
  logo_path: "Logo",
  telegram_id: "Telegram",
  role_id: "Role",
  manager_id: "Manager",
  department_id: "Department",
  position_id: "Position",
  category_id: "Category",
  brand_id: "Brand",
  item_id: "Item",
  customer_id: "Customer",
  owner_id: "Owner",
  parent_id: "Parent",
  status_note: "Reason",
  zipcode: "Zip code",
};

export function columnLabel(column: string): string {
  return COLUMN_LABELS[column] ?? sentenceCase(column);
}

function sentenceCase(value: string): string {
  const words = value.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ACTION_LABELS: Record<AuditAction, string> = {
  insert: "Created",
  update: "Changed",
  delete: "Removed",
};

export function actionLabel(action: AuditAction): string {
  return ACTION_LABELS[action];
}

/** Removal is the one that cannot be read back out of the record it left. */
export function actionTone(action: AuditAction): "accent" | "brand" | "danger" {
  if (action === "insert") return "accent";
  if (action === "delete") return "danger";
  return "brand";
}

export const AUDIT_ACTIONS: { value: AuditAction | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "insert", label: "Created" },
  { value: "update", label: "Changed" },
  { value: "delete", label: "Removed" },
];

/** Nobody was logged in: a migration, a script, or the sign-up trigger. */
export function actorLabel(entry: AuditEntry): string {
  return entry.actor_name?.trim() || "System";
}

// The columns worth reading a record's name out of, best first. A record is
// far easier to recognise by what it calls itself than by its uuid.
const TITLE_KEYS = [
  "full_name",
  "shop_name",
  "name_en",
  "name",
  "label",
  "property_value",
  "module_key",
  "view_key",
  "key",
];

/**
 * What the record is called, or failing that, its key.
 *
 * Read from whichever of the two rows exists — for a deletion that is the old
 * one, which is the only place the name still survives.
 */
export function recordTitle(entry: AuditEntry): string {
  const row = entry.new_row ?? entry.old_row ?? {};
  for (const key of TITLE_KEYS) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return entry.record_id ?? "—";
}

/** "Changed Item — Drinking Water", as one line. */
export function describeEntry(entry: AuditEntry): string {
  return `${actionLabel(entry.action)} ${tableLabel(entry.table_name)} — ${recordTitle(entry)}`;
}

export type ChangeRow = { column: string; label: string; from: string; to: string };

// Housekeeping, not history: the key never changes, and the timestamps say the
// same thing the entry's own occurred_at already says.
const HIDDEN_COLUMNS = new Set(["id", "created_at", "updated_at"]);

/**
 * The change, column by column.
 *
 * An update lists what moved. A creation and a removal list what the record
 * held, on the side it held it — so the same table reads the same way in all
 * three cases rather than needing three layouts.
 */
export function changeRows(entry: AuditEntry): ChangeRow[] {
  if (entry.action === "update") {
    return entry.changed
      .filter((column) => !HIDDEN_COLUMNS.has(column))
      .map((column) => ({
        column,
        label: columnLabel(column),
        from: formatValue(entry.old_row?.[column]),
        to: formatValue(entry.new_row?.[column]),
      }));
  }

  const row = entry.action === "insert" ? entry.new_row : entry.old_row;
  if (!row) return [];

  return Object.keys(row)
    .filter((column) => !HIDDEN_COLUMNS.has(column) && row[column] !== null)
    .sort()
    .map((column) => ({
      column,
      label: columnLabel(column),
      from: entry.action === "insert" ? "" : formatValue(row[column]),
      to: entry.action === "insert" ? formatValue(row[column]) : "",
    }));
}

/**
 * A stored value as a person reads it.
 *
 * An empty string is deliberately distinguished from a null: "blank" is a value
 * somebody typed and "empty" is a field they never filled in, and on an audit
 * screen the difference is occasionally the whole point.
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value.trim() === "" ? "blank" : value;
  if (Array.isArray(value)) return value.length === 0 ? "none" : value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const fold = (value: string) => value.toLowerCase().trim();

/** Does this entry answer the search — by person, record, table or column? */
export function matchesEntry(entry: AuditEntry, query: string): boolean {
  const needle = fold(query);
  if (needle === "") return true;

  return [
    actorLabel(entry),
    tableLabel(entry.table_name),
    recordTitle(entry),
    entry.record_id,
    actionLabel(entry.action),
    ...entry.changed.map(columnLabel),
  ].some((field) => typeof field === "string" && fold(field).includes(needle));
}

export function filterEntries(
  entries: AuditEntry[],
  query: string,
  action: AuditAction | "all",
  table: string | "all",
): AuditEntry[] {
  return entries.filter(
    (entry) =>
      matchesEntry(entry, query) &&
      (action === "all" || entry.action === action) &&
      (table === "all" || entry.table_name === table),
  );
}

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const headingFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** The Cambodian calendar day an instant falls on, as "2026-09-03". */
export function dayKey(iso: string): string {
  return dayFormat.format(new Date(iso));
}

export function timeOf(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/**
 * "Today", "Yesterday", or the date written out.
 *
 * `now` is a parameter rather than read from the clock so the heading is
 * decided by the caller — which is what lets it be tested, and what stops the
 * server and the browser disagreeing about where the day boundary fell.
 */
export function dayLabel(key: string, now: Date): string {
  const today = dayFormat.format(now);
  if (key === today) return "Today";

  const yesterday = new Date(now.getTime() - 86_400_000);
  if (key === dayFormat.format(yesterday)) return "Yesterday";

  // Midday, so the date cannot slide across a boundary while being formatted
  // back into the same zone it was derived in.
  return headingFormat.format(new Date(`${key}T12:00:00Z`));
}

export type AuditDay = { key: string; label: string; entries: AuditEntry[] };

/**
 * The log under day headings, newest first.
 *
 * The rows arrive ordered by the database; this only cuts them into days, so an
 * entry never moves relative to another.
 */
export function groupByDay(entries: AuditEntry[], now: Date): AuditDay[] {
  const days: AuditDay[] = [];

  for (const entry of entries) {
    const key = dayKey(entry.occurred_at);
    const last = days.at(-1);
    if (last && last.key === key) last.entries.push(entry);
    else days.push({ key, label: dayLabel(key, now), entries: [entry] });
  }

  return days;
}
