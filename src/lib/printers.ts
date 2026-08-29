export type Printer = {
  id: string;
  label: string;
  eprint_address: string;
  location: string | null;
  is_default: boolean;
  sort_order: number;
};

/** The columns the settings screen reads, as one select list. */
export const PRINTER_COLUMNS =
  "id, label, eprint_address, location, is_default, sort_order";

/**
 * The same shape the CHECK constraint enforces, so the form can say no before
 * the database has to. Deliberately not full RFC validation: an address with a
 * local part, an @ and a dotted host is as much as is worth asserting, and
 * anything stricter starts rejecting addresses that work.
 */
export function isEprintAddress(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

export type PrinterDraft = { label: string; eprint_address: string; location: string };

/** What is wrong with a draft, keyed by field, or an empty object when it is fine. */
export function validatePrinter(
  draft: PrinterDraft,
  existing: Printer[],
  editingId: string | null = null,
): Partial<Record<keyof PrinterDraft, string>> {
  const problems: Partial<Record<keyof PrinterDraft, string>> = {};
  const label = draft.label.trim();
  const address = draft.eprint_address.trim();

  if (!label) problems.label = "A label is required.";

  if (!address) {
    problems.eprint_address = "An e-print address is required.";
  } else if (!isEprintAddress(address)) {
    problems.eprint_address = "That does not look like an email address.";
  } else if (
    // The unique index would catch it, but as an error after the fact rather
    // than a hint while typing.
    existing.some(
      (p) =>
        p.id !== editingId &&
        p.eprint_address.toLowerCase() === address.toLowerCase(),
    )
  ) {
    problems.eprint_address = "Another printer already uses that address.";
  }

  return problems;
}

/** Defaults first, then by configured order, then by label. */
export function sortPrinters(printers: Printer[]): Printer[] {
  return [...printers].sort(
    (a, b) =>
      Number(b.is_default) - Number(a.is_default) ||
      a.sort_order - b.sort_order ||
      a.label.localeCompare(b.label),
  );
}

/** The printer a job goes to when nobody picks one. */
export function defaultPrinter(printers: Printer[]): Printer | null {
  return printers.find((p) => p.is_default) ?? null;
}
