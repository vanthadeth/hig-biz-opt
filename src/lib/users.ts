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
};

/** The columns the form reads and writes, as one select list. */
export const USER_RECORD_COLUMNS =
  "id, full_name, nickname, gender, date_of_birth, photo_path, phone_primary, " +
  "phone_secondary, telegram_id, email, department_id, position, bank_name, " +
  "bank_account_name, bank_account_number, role_id, status";

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
