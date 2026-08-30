import type { UserStatus } from "@/lib/access";

export type Gender = "male" | "female" | "other";

/** What the list needs. Read from user_directory, which carries no payroll data. */
export type DirectoryEntry = {
  id: string;
  full_name: string;
  nickname: string | null;
  position: string | null;
  department_id: string | null;
  status: UserStatus;
  photo_path: string | null;
};

/**
 * The whole employee record, as the form edits it.
 *
 * Read from public.users rather than the directory, because date_of_birth and
 * the bank columns are deliberately absent from the directory. Row level
 * security still decides whose record can be read at all.
 */
export type UserRecord = {
  id: string;
  full_name: string;
  nickname: string | null;
  gender: Gender | null;
  date_of_birth: string | null;
  photo_path: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  telegram_id: string | null;
  email: string | null;
  department_id: string | null;
  position: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  role_id: string | null;
  status: UserStatus;
  suspended_from: string | null;
  suspended_to: string | null;
  discharged_date: string | null;
  status_note: string | null;
};

/** The columns the form reads and writes, as one select list. */
export const USER_RECORD_COLUMNS =
  "id, full_name, nickname, gender, date_of_birth, photo_path, phone_primary, " +
  "phone_secondary, telegram_id, email, department_id, position, bank_name, " +
  "bank_account_name, bank_account_number, role_id, status, suspended_from, " +
  "suspended_to, discharged_date, status_note";

export type Department = { id: string; name: string; sort_order: number };

/** A department heading and the people under it. */
export type DepartmentGroup = {
  id: string | null;
  name: string;
  people: DirectoryEntry[];
};

export const GENDERS: Gender[] = ["male", "female", "other"];

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  discharged: "Discharged",
};

/** Suspended reads as a warning rather than a failure: it is reversible. */
export const STATUS_TONE: Record<UserStatus, "accent" | "warn" | "neutral"> = {
  active: "accent",
  suspended: "warn",
  discharged: "neutral",
};

/** What a status change writes. The trigger in 0019 stamps who and when. */
export type StatusChange = {
  status: UserStatus;
  suspended_from: string | null;
  suspended_to: string | null;
  discharged_date: string | null;
  status_note: string | null;
};

/**
 * The columns a status change sets, given the dates it was asked for.
 *
 * The shape is dictated by the CHECK constraints: a suspension carries a range,
 * a discharge carries a day, and neither may be half-filled. Building the row
 * here rather than in the component means the rules live in one testable place
 * and the form cannot compose a row the database will reject.
 *
 * Reinstating clears the dates in the trigger too — belt and braces, since an
 * active row that still remembers a suspension is a row that will be misread.
 */
export function statusChange(
  status: UserStatus,
  dates: { from?: string; to?: string; on?: string; note?: string },
): StatusChange {
  const blank = (v: string | undefined) => (v?.trim() ? v.trim() : null);

  return {
    status,
    suspended_from: status === "suspended" ? blank(dates.from) : null,
    suspended_to: status === "suspended" ? blank(dates.to) : null,
    discharged_date: status === "discharged" ? blank(dates.on) : null,
    status_note: blank(dates.note),
  };
}

/**
 * Why a status change cannot be saved yet, or null when it can.
 *
 * Says it in words rather than letting the CHECK constraint answer with
 * `users_suspension_dates_ck`, which tells nobody anything.
 */
export function statusProblem(change: StatusChange): string | null {
  if (change.status === "suspended") {
    if (!change.suspended_from || !change.suspended_to) {
      return "A suspension needs both a start and an end date.";
    }
    if (change.suspended_to < change.suspended_from) {
      return "The suspension cannot end before it starts.";
    }
  }

  if (change.status === "discharged" && !change.discharged_date) {
    return "A discharge needs a date.";
  }

  return null;
}

/** "Sokha Chan (Dara)", or just the name when there is no nickname. */
export function displayName(person: {
  full_name: string;
  nickname: string | null;
}): string {
  const nickname = person.nickname?.trim();
  return nickname ? `${person.full_name} (${nickname})` : person.full_name;
}

/** Two letters for the avatar fallback, from the name as written. */
export function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Does this person match what was typed?
 *
 * Matches name, nickname and position, because those are the three things
 * somebody scanning for a colleague actually remembers. Case and surrounding
 * space are ignored; an empty query matches everyone rather than nobody.
 */
export function matches(person: DirectoryEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return [person.full_name, person.nickname, person.position].some(
    (field) => field?.toLowerCase().includes(q),
  );
}

/**
 * People under their department heading, in the order departments are
 * configured, each department's people by name.
 *
 * Departments with nobody in them are dropped — a heading over an empty space
 * is noise on a phone. Anyone with no department is collected last under
 * "Unassigned" rather than silently disappearing from the list.
 */
export function groupByDepartment(
  people: DirectoryEntry[],
  departments: Department[],
  query = "",
): DepartmentGroup[] {
  const visible = people.filter((person) => matches(person, query));
  const byName = (a: DirectoryEntry, b: DirectoryEntry) =>
    a.full_name.localeCompare(b.full_name);

  const groups: DepartmentGroup[] = [];

  for (const department of [...departments].sort((a, b) => a.sort_order - b.sort_order)) {
    const members = visible
      .filter((person) => person.department_id === department.id)
      .sort(byName);
    if (members.length > 0) {
      groups.push({ id: department.id, name: department.name, people: members });
    }
  }

  const known = new Set(departments.map((d) => d.id));
  const unassigned = visible
    .filter((person) => !person.department_id || !known.has(person.department_id))
    .sort(byName);
  if (unassigned.length > 0) {
    groups.push({ id: null, name: "Unassigned", people: unassigned });
  }

  return groups;
}

/** How many people a filtered list is showing, for the result count. */
export function countPeople(groups: DepartmentGroup[]): number {
  return groups.reduce((total, group) => total + group.people.length, 0);
}

/** One line of the profile: what it is, what it says, and where it leads. */
export type InfoRow = { label: string; value: string | null; href?: string };
export type InfoGroup = { title: string; rows: InfoRow[] };

/** 1994-07-12 as "12 July 1994". The stored form is unambiguous; this is not. */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** A Telegram handle with or without its @, as a link. */
export function telegramHref(id: string | null): string | undefined {
  const handle = id?.trim().replace(/^@/, "");
  return handle ? `https://t.me/${handle}` : undefined;
}

/**
 * The whole record, in the groups the form edits it in.
 *
 * Same grouping as the form on purpose: someone who has just filled a section in
 * should find it under the same heading when they come back to read it. Every
 * field appears even when empty, so the page answers "is this set?" rather than
 * leaving you to wonder whether it was omitted or never filled in.
 */
export function profileGroups(
  record: UserRecord,
  lookups: { department: string | null; role: string | null },
  options: { includeBank?: boolean } = {},
): InfoGroup[] {
  const groups: InfoGroup[] = [
    {
      title: "Information",
      rows: [
        { label: "Full name", value: record.full_name },
        { label: "Nickname", value: record.nickname },
        {
          label: "Gender",
          value: record.gender ? GENDER_LABELS[record.gender] : null,
        },
        { label: "Date of birth", value: formatDate(record.date_of_birth) },
      ],
    },
    {
      title: "Contact",
      rows: [
        {
          label: "Primary phone",
          value: record.phone_primary,
          href: record.phone_primary ? `tel:${record.phone_primary}` : undefined,
        },
        {
          label: "Secondary phone",
          value: record.phone_secondary,
          href: record.phone_secondary ? `tel:${record.phone_secondary}` : undefined,
        },
        {
          label: "Telegram",
          value: record.telegram_id,
          href: telegramHref(record.telegram_id),
        },
        {
          label: "Email",
          value: record.email,
          href: record.email ? `mailto:${record.email}` : undefined,
        },
      ],
    },
    {
      title: "Position",
      rows: [
        { label: "Department", value: lookups.department },
        { label: "Position", value: record.position },
      ],
    },
  ];

  if (options.includeBank) {
    groups.push({
      title: "Bank info",
      rows: [
        { label: "Bank name", value: record.bank_name },
        { label: "Account name", value: record.bank_account_name },
        { label: "Account number", value: record.bank_account_number },
      ],
    });
  }

  groups.push({
    title: "Role",
    rows: [
      { label: "Role", value: lookups.role },
      { label: "Status", value: STATUS_LABELS[record.status] },
    ],
  });

  return groups;
}
