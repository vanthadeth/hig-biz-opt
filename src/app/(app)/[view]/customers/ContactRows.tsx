"use client";

import { Icon } from "@/components/Icon";
import { Field } from "@/components/ui/Field";
import { haptic } from "@/lib/haptics";

/**
 * One person at a shop, as the form holds them.
 *
 * `key` is a client-side handle rather than a database id: a row that has never
 * been saved has no id, and React still needs something stable to keep the
 * inputs attached to the right person while others are added above them.
 */
export type ContactDraft = {
  key: string;
  id: string | null;
  name: string;
  position: string;
  phone: string;
  telegram_id: string;
  is_primary: boolean;
};

export function emptyContact(isPrimary = false): ContactDraft {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    id: null,
    name: "",
    position: "",
    phone: "",
    telegram_id: "",
    is_primary: isPrimary,
  };
}

/** A row nobody has typed anything into. */
export function contactIsEmpty(contact: ContactDraft): boolean {
  return (
    contact.name.trim() === "" &&
    contact.position.trim() === "" &&
    contact.phone.trim() === "" &&
    contact.telegram_id.trim() === ""
  );
}

/**
 * What is wrong with a contact row.
 *
 * A wholly empty row is not wrong — a new customer form offers one, and a shop
 * recorded before anybody has got a name out of it is an ordinary thing. It is
 * simply not saved. A row with a phone number but no name *is* wrong, because
 * somebody started it and stopped.
 */
export function contactProblem(contact: ContactDraft): string | null {
  if (contactIsEmpty(contact)) return null;
  return contact.name.trim() === "" ? "This contact has no name yet." : null;
}

/**
 * The people at a shop, and which of them to ring first.
 *
 * Primary is a radio rather than a checkbox because the database holds a
 * partial unique index on it: two primaries is not a state the record can be
 * in, so it should not be a state the form can express.
 */
export function ContactRows({
  contacts,
  disabled,
  onChange,
}: {
  contacts: ContactDraft[];
  disabled: boolean;
  onChange: (next: ContactDraft[]) => void;
}) {
  function patch(key: string, changes: Partial<ContactDraft>) {
    onChange(contacts.map((c) => (c.key === key ? { ...c, ...changes } : c)));
  }

  function makePrimary(key: string) {
    haptic("select");
    onChange(contacts.map((c) => ({ ...c, is_primary: c.key === key })));
  }

  function remove(key: string) {
    haptic("tap");
    const next = contacts.filter((c) => c.key !== key);
    // Removing the primary would leave a shop nobody knows who to ring at.
    if (next.length > 0 && !next.some((c) => c.is_primary)) next[0].is_primary = true;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {contacts.map((contact, index) => {
        const problem = contactProblem(contact);
        return (
          <div key={contact.key} className="rounded-xl border border-line p-3" data-contact-row>
            <div className="flex items-center justify-between gap-2">
              <label className="flex min-h-9 items-center gap-2 text-xs font-medium text-muted">
                <input
                  type="radio"
                  name="primary-contact"
                  checked={contact.is_primary}
                  disabled={disabled}
                  onChange={() => makePrimary(contact.key)}
                  className="size-4 accent-[var(--brand)]"
                />
                Ring first
              </label>
              {!disabled && contacts.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(contact.key)}
                  aria-label={`Remove contact ${index + 1}`}
                  className="pressable flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:text-danger"
                >
                  <Icon name="trash" className="size-4" />
                  Remove
                </button>
              )}
            </div>

            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field
                label={`Name ${index + 1}`}
                value={contact.name}
                onChange={(v) => patch(contact.key, { name: v })}
                placeholder="Sok Dara"
                disabled={disabled}
              />
              <Field
                label={`Position ${index + 1}`}
                optional
                value={contact.position}
                onChange={(v) => patch(contact.key, { position: v })}
                placeholder="Owner"
                disabled={disabled}
              />
              <Field
                label={`Phone ${index + 1}`}
                type="tel"
                inputMode="tel"
                optional
                value={contact.phone}
                onChange={(v) => patch(contact.key, { phone: v })}
                placeholder="012 345 678"
                disabled={disabled}
              />
              <Field
                label={`Telegram ${index + 1}`}
                optional
                value={contact.telegram_id}
                onChange={(v) => patch(contact.key, { telegram_id: v })}
                placeholder="@dara"
                disabled={disabled}
              />
            </div>

            {problem && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {problem}
              </p>
            )}
          </div>
        );
      })}

      {!disabled && (
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            onChange([...contacts, emptyContact(contacts.length === 0)]);
          }}
          className="pressable flex min-h-10 items-center gap-1.5 rounded-xl border border-dashed border-brand/50 px-3 text-sm font-medium text-brand"
        >
          <Icon name="plus" className="size-4" />
          Add another contact
        </button>
      )}
    </div>
  );
}
