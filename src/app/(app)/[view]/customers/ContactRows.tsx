"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
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

  const [pending, setPending] = useState<string | null>(null);
  const asked = contacts.find((c) => c.key === pending) ?? null;

  /**
   * A row nobody has typed into goes without ceremony — there is nothing to
   * lose and nothing to confirm. Anything else asks first.
   */
  function askRemove(contact: ContactDraft) {
    haptic("tap");
    if (contact.id === null && contactIsEmpty(contact)) remove(contact.key);
    else setPending(contact.key);
  }

  function remove(key: string) {
    const next = contacts.filter((c) => c.key !== key);
    // Removing the primary would leave a shop nobody knows who to ring at.
    if (next.length > 0 && !next.some((c) => c.is_primary)) next[0].is_primary = true;
    setPending(null);
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
                Primary
              </label>
              {!disabled && contacts.length > 1 && (
                <button
                  type="button"
                  onClick={() => askRemove(contact)}
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

      <Sheet open={asked !== null} onClose={() => setPending(null)} title="Remove contact">
        {asked && (
          <div className="space-y-4 px-3 pb-4 pt-1">
            <p className="text-sm text-muted">
              {asked.id === null ? (
                <>
                  {asked.name.trim() || "This contact"} has not been saved yet.
                  Removing it discards what you have typed.
                </>
              ) : (
                <>
                  {asked.name.trim() || "This contact"} comes off this
                  shop&rsquo;s list when you save. The record is kept rather than
                  deleted, so who used to answer that phone is still answerable
                  later.
                </>
              )}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium text-muted"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => remove(asked.key)}
                className="pressable min-h-11 flex-1 rounded-xl bg-danger text-sm font-medium text-danger-fg"
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
