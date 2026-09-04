import type { ChipTone } from "@/components/ui/Chip";

/**
 * The shops HIG sells to, as the screens see them.
 *
 * Two things are worth stating once here rather than in every component:
 *
 *   * A customer has an *owner* — the rep whose account it is — and that is
 *     what the permission scopes key on. Sales holds add and edit at 'own', so
 *     the owner is not decoration: it decides who may change the record.
 *
 *   * The address is held twice over. `*_code` carries the official Cambodian
 *     administrative code when one was picked from the reference tables, and
 *     `*_text` carries what somebody typed when it was not. That is what lets an
 *     address be entered in a district nobody has imported yet without inventing
 *     a code for it.
 */

export type CustomerStatus = "active" | "inactive" | "banned";

export const CUSTOMER_STATUSES: CustomerStatus[] = ["active", "inactive", "banned"];

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  banned: "Banned",
};

export const CUSTOMER_STATUS_TONE: Record<CustomerStatus, ChipTone> = {
  active: "accent",
  inactive: "neutral",
  banned: "danger",
};

/**
 * Moving a shop between statuses.
 *
 * Status is deliberately not a field on the customer form. The rest of that
 * form is corrections — a phone number typed wrong, a landmark that has moved —
 * saved in a batch. Banning a shop is not a correction: it stops anybody selling
 * to it, and somebody will ask in a year why it happened. So it is an action
 * with its own confirmation, and it commits on its own.
 *
 * A new customer is always active. There is no case for creating one already
 * banned, and offering the choice would only let somebody set it by accident.
 */
export type StatusAction = {
  target: CustomerStatus;
  /** The word on the button. */
  label: string;
  /** What it does, said plainly on the confirmation. */
  describe: (shopName: string) => string;
  /** Banning demands a reason; the CHECK constraint agrees. */
  needsReason: boolean;
  /** Destructive enough to warrant the danger colour. */
  danger: boolean;
  icon: string;
};

const STATUS_ACTIONS: Record<CustomerStatus, StatusAction> = {
  active: {
    target: "active",
    label: "Reactivate",
    describe: (shop) => `${shop} returns to active, and can be sold to again.`,
    needsReason: false,
    danger: false,
    icon: "check",
  },
  inactive: {
    target: "inactive",
    label: "Mark inactive",
    describe: (shop) =>
      `${shop} stays on the books with its whole history, but stops appearing as somewhere to sell to.`,
    needsReason: false,
    danger: false,
    icon: "calendar",
  },
  banned: {
    target: "banned",
    label: "Ban",
    describe: (shop) =>
      `${shop} is refused further business. The reason stays on the record, because somebody will ask why.`,
    needsReason: true,
    danger: true,
    icon: "logout",
  },
};

/** The moves available from where a shop is now — never a move to itself. */
export function statusActions(current: CustomerStatus): StatusAction[] {
  return CUSTOMER_STATUSES.filter((s) => s !== current).map((s) => STATUS_ACTIONS[s]);
}

export function statusAction(target: CustomerStatus): StatusAction {
  return STATUS_ACTIONS[target];
}

/**
 * The row a status change writes.
 *
 * The note always describes the status the shop is in *now*, so it is replaced
 * on every move rather than accumulated. Coming back to active clears it: a
 * stale "cheques returned twice" sitting on a shop that has been reinstated
 * reads as though it were still true.
 */
export function statusChange(target: CustomerStatus, note: string) {
  const trimmed = note.trim();
  return {
    status: target,
    status_note: target === "active" || trimmed === "" ? null : trimmed,
  };
}

/** What stops a status change going through, in the words the person needs. */
export function statusProblem(target: CustomerStatus, note: string): string | null {
  if (STATUS_ACTIONS[target].needsReason && note.trim() === "") {
    return "Say why this shop is being banned. It stays on the record.";
  }
  return null;
}

export type Province = { code: string; name_en: string; name_km: string | null };
export type District = Province & { province_code: string };
export type Commune = Province & { district_code: string };

export type Customer = {
  id: string;
  shop_name: string;
  business_type: string | null;
  owner_id: string | null;
  street_address: string | null;
  province_code: string | null;
  district_code: string | null;
  commune_code: string | null;
  province_text: string | null;
  district_text: string | null;
  commune_text: string | null;
  landmark: string | null;
  zipcode: string | null;
  latitude: number | null;
  longitude: number | null;
  status: CustomerStatus;
  status_note: string | null;
  credit_limit_usd: number | null;
  remarks: string | null;
  last_visit_date: string | null;
  last_purchase_date: string | null;
};

/**
 * `active` is how a contact leaves, since 0031 removed the delete outright.
 *
 * A shop's people change, and the record that somebody used to answer that
 * phone is worth as much as the record of who answers it now — on a book of
 * accounts, more. Retiring keeps it and takes them off the screens.
 */
export type CustomerContact = {
  id: string;
  customer_id: string;
  name: string;
  position: string | null;
  phone: string | null;
  telegram_id: string | null;
  is_primary: boolean;
  sort_order: number;
  active: boolean;
};

export type CustomerPicture = {
  id: string;
  customer_id: string;
  photo_path: string;
  description: string | null;
  is_primary: boolean;
  sort_order: number;
  active: boolean;
};

/** One row of public.customer_directory. */
export type DirectoryCustomer = {
  id: string;
  shop_name: string;
  business_type: string | null;
  status: CustomerStatus;
  owner_id: string | null;
  owner_name: string | null;
  street_address: string | null;
  landmark: string | null;
  zipcode: string | null;
  latitude: number | null;
  longitude: number | null;
  credit_limit_usd: number | null;
  last_visit_date: string | null;
  last_purchase_date: string | null;
  province_name: string | null;
  district_name: string | null;
  commune_name: string | null;
  province_code: string | null;
  district_code: string | null;
  commune_code: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  primary_photo_path: string | null;
  contact_count: number | null;
};

export const CUSTOMER_COLUMNS =
  "id, shop_name, business_type, owner_id, street_address, province_code, district_code, commune_code, province_text, district_text, commune_text, landmark, zipcode, latitude, longitude, status, status_note, credit_limit_usd, remarks, last_visit_date, last_purchase_date";

export const DIRECTORY_COLUMNS =
  "id, shop_name, business_type, status, owner_id, owner_name, street_address, landmark, zipcode, latitude, longitude, credit_limit_usd, last_visit_date, last_purchase_date, province_name, district_name, commune_name, province_code, district_code, commune_code, primary_contact_name, primary_contact_phone, primary_photo_path, contact_count";

export const CONTACT_COLUMNS =
  "id, customer_id, name, position, phone, telegram_id, is_primary, sort_order, active";

export const PICTURE_COLUMNS =
  "id, customer_id, photo_path, description, is_primary, sort_order, active";

export const CUSTOMERS_BUCKET = "customers";

/**
 * The address on one line, largest unit last.
 *
 * Cambodian addresses are read street-first, so that is the order here, and
 * whichever parts are missing simply do not appear rather than leaving commas
 * with nothing between them.
 */
export function addressLine(customer: {
  street_address: string | null;
  commune_name: string | null;
  district_name: string | null;
  province_name: string | null;
}): string | null {
  const parts = [
    customer.street_address,
    customer.commune_name,
    customer.district_name,
    customer.province_name,
  ].filter((p): p is string => p !== null && p.trim() !== "");

  return parts.length ? parts.join(", ") : null;
}

/** A map link, when the shop has actually been pinned. */
export function mapHref(customer: {
  latitude: number | null;
  longitude: number | null;
}): string | null {
  if (customer.latitude === null || customer.longitude === null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${customer.latitude},${customer.longitude}`;
}

/**
 * How a contact reads on the record: the number first, the person second.
 *
 * Inverted from the obvious order on purpose. A rep opening a shop is nearly
 * always about to ring it, and the number is what they are looking for; the
 * name tells them who will answer. Where there is no number to dial, the person
 * is all there is, so they lead instead of an empty line.
 */
export function contactHeading(contact: {
  name: string;
  position: string | null;
  phone: string | null;
}): { title: string; subtitle: string | null } {
  const phone = contact.phone?.trim() || null;
  const name = contact.name.trim();
  const position = contact.position?.trim() || null;

  if (phone) {
    return {
      title: phone,
      subtitle: [name, position].filter(Boolean).join(" · ") || null,
    };
  }

  return { title: name, subtitle: position };
}

export function telegramHref(handle: string | null): string | null {
  if (!handle) return null;
  return `https://t.me/${handle.replace(/^@/, "")}`;
}

const fold = (value: string) => value.toLowerCase().trim();

/** Does this shop answer the search? */
export function matchesCustomer(customer: DirectoryCustomer, query: string): boolean {
  const needle = fold(query);
  if (needle === "") return true;

  return [
    customer.shop_name,
    customer.business_type,
    customer.primary_contact_name,
    customer.primary_contact_phone,
    customer.owner_name,
    customer.street_address,
    customer.landmark,
    customer.commune_name,
    customer.district_name,
    customer.province_name,
  ].some((field) => field != null && fold(field).includes(needle));
}

export type CustomerGroup = { key: string; name: string; customers: DirectoryCustomer[] };

/**
 * Shops under their province.
 *
 * A rep works a territory, so province is the heading that matches how the list
 * is actually used — the same reasoning that groups the staff list by
 * department rather than alphabetically.
 */
export function groupByProvince(
  customers: DirectoryCustomer[],
  query = "",
): CustomerGroup[] {
  const matched = customers.filter((c) => matchesCustomer(c, query));
  const groups = new Map<string, CustomerGroup>();

  for (const customer of matched) {
    const key = customer.province_code ?? customer.province_name ?? "";
    const name = customer.province_name ?? "No province set";
    const group = groups.get(key);
    if (group) group.customers.push(customer);
    else groups.set(key, { key: key || "unplaced", name, customers: [customer] });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      customers: [...group.customers].sort((a, b) =>
        a.shop_name.localeCompare(b.shop_name),
      ),
    }))
    .sort((a, b) => {
      if (a.key === "unplaced") return 1;
      if (b.key === "unplaced") return -1;
      return a.name.localeCompare(b.name);
    });
}

export function countCustomers(groups: CustomerGroup[]): number {
  return groups.reduce((total, group) => total + group.customers.length, 0);
}

/** Districts belonging to the chosen province, and communes to the district. */
export function districtsIn(districts: District[], provinceCode: string): District[] {
  return districts
    .filter((d) => d.province_code === provinceCode)
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
}

export function communesIn(communes: Commune[], districtCode: string): Commune[] {
  return communes
    .filter((c) => c.district_code === districtCode)
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
}

/**
 * A coordinate typed into a box, or null for an empty one.
 *
 * `undefined` means "that is not a coordinate", so a form can tell a blank from
 * a mistake and say which. Unlike a price, a coordinate may be negative.
 */
export function parseCoordinate(
  input: string,
  limit: 90 | 180,
): number | null | undefined {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (!/^-?\d*\.?\d*$/.test(trimmed) || !/\d/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || Math.abs(value) > limit) return undefined;
  return value;
}

/**
 * What is wrong with a pair of coordinate boxes.
 *
 * Half a coordinate locates nothing — it reads on a map as a point in the Gulf
 * of Guinea — so the database refuses one, and the form says so before the save.
 */
export function coordinateProblem(
  latitude: string,
  longitude: string,
): string | null {
  const lat = parseCoordinate(latitude, 90);
  const lng = parseCoordinate(longitude, 180);

  if (lat === undefined) return "That is not a latitude. It runs from -90 to 90.";
  if (lng === undefined) return "That is not a longitude. It runs from -180 to 180.";
  if ((lat === null) !== (lng === null)) {
    return "A location needs both numbers, or neither.";
  }
  return null;
}

// Reading the location off the phone --------------------------------------------

/**
 * Six decimal places, which is about a tenth of a metre.
 *
 * Fewer would throw away accuracy the phone actually has; more is writing down
 * noise. The column is numeric, so this is the form the box shows rather than
 * the precision the database keeps.
 */
export const COORDINATE_PLACES = 6;

export function formatCoordinate(value: number): string {
  return value.toFixed(COORDINATE_PLACES);
}

/** "±12 m" — how much to trust the reading, in the unit the phone reports. */
export function formatAccuracy(metres: number | null | undefined): string | null {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return null;
  return `±${Math.round(metres)} m`;
}

/**
 * Why the browser would not give a position, in words a rep can act on.
 *
 * The codes are the ones in GeolocationPositionError: 1 refused, 2 no fix,
 * 3 timed out. Anything else, including the API not being there at all, gets
 * the general answer.
 */
export const GEOLOCATION_MESSAGES: Record<number, string> = {
  1: "Location permission was refused. Allow it for this site in your browser, then try again.",
  2: "Your device could not get a fix. Step outside or nearer a window and try again.",
  3: "That took too long. Try again once the signal is better.",
};

export function locationProblem(code?: number): string {
  return (
    (code === undefined ? undefined : GEOLOCATION_MESSAGES[code]) ??
    "This device cannot report its location. Type the numbers instead."
  );
}

// Receivables ------------------------------------------------------------------

/** How an unpaid invoice is aged, in days overdue. */
export const AGEING_BUCKETS = [
  { key: "current", label: "Current", from: -Infinity, to: 0 },
  { key: "d1_30", label: "1–30 days", from: 1, to: 30 },
  { key: "d31_60", label: "31–60 days", from: 31, to: 60 },
  { key: "d61_90", label: "61–90 days", from: 61, to: 90 },
  { key: "d90_plus", label: "Over 90 days", from: 91, to: Infinity },
] as const;

export type AgeingKey = (typeof AGEING_BUCKETS)[number]["key"];

/** An unpaid amount and the day it fell due. */
export type OpenInvoice = { due_date: string; outstanding_usd: number };

export type Ageing = {
  buckets: { key: AgeingKey; label: string; amount: number }[];
  total: number;
  overdue: number;
};

const DAY = 24 * 60 * 60 * 1000;

/** Whole days between two dates, ignoring the time of day. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / DAY);
}

/**
 * The receivables ageing for one customer.
 *
 * Written and tested now, ahead of the invoicing module that will feed it,
 * because the bucket boundaries are a business rule rather than a rendering
 * detail — "31–60 days" has to mean the same thing on the customer record as it
 * will on a statement, and deciding that twice is how the two come to disagree.
 *
 * `asOf` is passed in rather than read from the clock, so a statement rendered
 * on the server and the same figure rendered in a browser in another timezone
 * cannot land in different buckets.
 */
export function ageReceivables(invoices: OpenInvoice[], asOf: string): Ageing {
  const amounts = new Map<AgeingKey, number>(
    AGEING_BUCKETS.map((b) => [b.key, 0]),
  );

  for (const invoice of invoices) {
    const overdueDays = daysBetween(invoice.due_date, asOf);
    const bucket =
      AGEING_BUCKETS.find((b) => overdueDays >= b.from && overdueDays <= b.to) ??
      AGEING_BUCKETS[0];
    amounts.set(bucket.key, (amounts.get(bucket.key) ?? 0) + invoice.outstanding_usd);
  }

  const buckets = AGEING_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    amount: round2(amounts.get(b.key) ?? 0),
  }));

  const total = round2(buckets.reduce((sum, b) => sum + b.amount, 0));
  const overdue = round2(
    buckets.filter((b) => b.key !== "current").reduce((sum, b) => sum + b.amount, 0),
  );

  return { buckets, total, overdue };
}

/** Money is added in cents, not in floats that drift. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * How much of the credit limit is used, as a fraction.
 *
 * Null when no limit is set, which is not the same as a limit of zero: one
 * means nobody has decided, the other means cash only.
 */
export function creditUsage(
  balance: number,
  limit: number | null,
): number | null {
  if (limit === null) return null;
  if (limit === 0) return balance > 0 ? 1 : 0;
  return Math.max(0, Math.min(balance / limit, 1));
}

export function overCreditLimit(balance: number, limit: number | null): boolean {
  return limit !== null && balance > limit;
}
