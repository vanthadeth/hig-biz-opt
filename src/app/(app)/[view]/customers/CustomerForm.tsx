"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  coordinateProblem,
  parseCoordinate,
  type Commune,
  type Customer,
  type CustomerContact,
  type District,
  type Province,
} from "@/lib/customers";
import { AddressFields, type AddressDraft } from "./AddressFields";
import {
  contactIsEmpty,
  contactProblem,
  ContactRows,
  emptyContact,
  type ContactDraft,
} from "./ContactRows";

type Draft = AddressDraft & {
  shop_name: string;
  business_type: string;
  credit_limit_usd: string;
  remarks: string;
};

function draftFrom(customer: Customer | null): Draft {
  return {
    shop_name: customer?.shop_name ?? "",
    business_type: customer?.business_type ?? "",
    street_address: customer?.street_address ?? "",
    province_code: customer?.province_code ?? "",
    district_code: customer?.district_code ?? "",
    commune_code: customer?.commune_code ?? "",
    province_text: customer?.province_text ?? "",
    district_text: customer?.district_text ?? "",
    commune_text: customer?.commune_text ?? "",
    landmark: customer?.landmark ?? "",
    zipcode: customer?.zipcode ?? "",
    latitude: customer?.latitude === null || customer === null ? "" : String(customer.latitude),
    longitude: customer?.longitude === null || customer === null ? "" : String(customer.longitude),
    credit_limit_usd:
      customer?.credit_limit_usd === null || customer === null
        ? ""
        : String(customer.credit_limit_usd),
    remarks: customer?.remarks ?? "",
  };
}

function contactsFrom(rows: CustomerContact[]): ContactDraft[] {
  if (rows.length === 0) return [emptyContact(true)];
  return rows.map((row) => ({
    key: row.id,
    id: row.id,
    name: row.name,
    position: row.position ?? "",
    phone: row.phone ?? "",
    telegram_id: row.telegram_id ?? "",
    is_primary: row.is_primary,
  }));
}

const blank = (value: string) => (value.trim() === "" ? null : value.trim());

/**
 * A shop and the people at it, on one screen.
 *
 * Contacts are saved alongside the record rather than on a page of their own,
 * because a shop with nobody to ring is the commonest thing wrong with a new
 * customer, and a second screen is where that gets forgotten. Pictures are
 * managed from the record instead: they need the customer to exist first, since
 * the storage policies key on its id.
 */
export function CustomerForm({
  customer,
  contacts: saved,
  provinces,
  districts,
  communes,
  canDelete,
  viewKey,
}: {
  customer: Customer | null;
  contacts: CustomerContact[];
  provinces: Province[];
  districts: District[];
  communes: Commune[];
  canDelete: boolean;
  viewKey: string;
}) {
  const router = useRouter();
  const creating = customer === null;

  const [draft, setDraft] = useState<Draft>(() => draftFrom(customer));
  const [contacts, setContacts] = useState<ContactDraft[]>(() => contactsFrom(saved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDone(false);
  };

  const nameMissing = draft.shop_name.trim() === "";
  const badCoordinate = coordinateProblem(draft.latitude, draft.longitude) !== null;
  const badLimit =
    draft.credit_limit_usd.trim() !== "" &&
    !(Number(draft.credit_limit_usd) >= 0 && Number.isFinite(Number(draft.credit_limit_usd)));
  const badContact = contacts.some((c) => contactProblem(c) !== null);
  const blocked = nameMissing || badCoordinate || badLimit || badContact;

  function toRow() {
    return {
      shop_name: draft.shop_name.trim(),
      business_type: blank(draft.business_type),
      street_address: blank(draft.street_address),
      province_code: blank(draft.province_code),
      district_code: blank(draft.district_code),
      commune_code: blank(draft.commune_code),
      // Only kept where no code was picked, so the two can never disagree about
      // the same level.
      province_text: draft.province_code ? null : blank(draft.province_text),
      district_text: draft.district_code ? null : blank(draft.district_text),
      commune_text: draft.commune_code ? null : blank(draft.commune_text),
      landmark: blank(draft.landmark),
      zipcode: blank(draft.zipcode),
      latitude: parseCoordinate(draft.latitude, 90) ?? null,
      longitude: parseCoordinate(draft.longitude, 180) ?? null,
      // No status here. A new shop is active by the column default, and an
      // existing one keeps whatever the status card set — this form has no
      // business changing it in a batch of corrections.
      credit_limit_usd:
        draft.credit_limit_usd.trim() === "" ? null : Number(draft.credit_limit_usd),
      remarks: blank(draft.remarks),
    };
  }

  async function saveContacts(customerId: string) {
    const supabase = createClient();

    // A row nobody typed into is not a contact. The form offers one on a new
    // customer, and leaving it alone must not create a nameless person.
    const filled = contacts.filter((c) => !contactIsEmpty(c));

    const keptIds = new Set(filled.map((c) => c.id).filter(Boolean) as string[]);
    const dropped = saved.filter((row) => !keptIds.has(row.id)).map((row) => row.id);
    if (dropped.length > 0) {
      const { error } = await supabase.from("customer_contacts").delete().in("id", dropped);
      if (error) throw error;
    }

    // The partial unique index means an old primary and a new one cannot both
    // stand for even an instant, so the flag is cleared across the shop before
    // any row claims it.
    if (!creating) {
      const { error } = await supabase
        .from("customer_contacts")
        .update({ is_primary: false })
        .eq("customer_id", customerId)
        .eq("is_primary", true);
      if (error) throw error;
    }

    for (const [index, contact] of filled.entries()) {
      const row = {
        customer_id: customerId,
        name: contact.name.trim(),
        position: blank(contact.position),
        phone: blank(contact.phone),
        telegram_id: blank(contact.telegram_id),
        // If the row marked primary was the empty one that got skipped, the
        // first surviving contact takes it: a shop with contacts but no primary
        // would leave the list with nobody to show.
        is_primary: filled.some((c) => c.is_primary) ? contact.is_primary : index === 0,
        sort_order: index + 1,
      };

      if (contact.id) {
        // `.select()` because an update the policy refuses matches no rows and
        // raises nothing at all.
        const { data, error } = await supabase
          .from("customer_contacts")
          .update(row)
          .eq("id", contact.id)
          .select("id");
        if (error) throw error;
        if (!data?.length) {
          throw new Error("Those contacts could not be saved. You may not have permission.");
        }
      } else {
        const { error } = await supabase.from("customer_contacts").insert(row);
        if (error) throw error;
      }
    }
  }

  async function save() {
    if (blocked) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();

    try {
      if (creating) {
        // owner_id defaults to the caller in the database, so a rep creating a
        // shop does not have to name themselves and `add` at 'own' scope
        // succeeds without the form knowing the rule.
        const { data, error } = await supabase
          .from("customers")
          .insert(toRow())
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("The customer was not created.");

        await saveContacts(data.id);
        haptic("success");
        router.replace(`/${viewKey}/customers/${data.id}`);
        router.refresh();
        return;
      }

      const { data, error } = await supabase
        .from("customers")
        .update(toRow())
        .eq("id", customer.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That customer could not be saved. You may not have permission.");
      }

      await saveContacts(customer.id);
      haptic("success");
      setDone(true);
      router.refresh();
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The customer could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (creating) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await createClient()
        .from("customers")
        .delete()
        .eq("id", customer.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That customer could not be removed. You may not have permission.");
      }
      haptic("success");
      router.replace(`/${viewKey}/customers`);
      router.refresh();
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The customer could not be removed.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionHeader title="Shop" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Shop name"
            value={draft.shop_name}
            onChange={(v) => set("shop_name", v)}
            placeholder="Dara Mini Mart"
          />
          <Field
            label="Business type"
            optional
            value={draft.business_type}
            onChange={(v) => set("business_type", v)}
            placeholder="Grocery"
          />
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="Contacts" />
        <p className="mt-1 text-xs text-muted">
          Everyone worth ringing at this shop. The one marked “Ring first” is the
          one the list shows.
        </p>
        <div className="mt-3">
          <ContactRows
            contacts={contacts}
            disabled={busy}
            onChange={(next) => {
              setContacts(next);
              setDone(false);
            }}
          />
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="Address" />
        <div className="mt-3">
          <AddressFields
            draft={draft}
            provinces={provinces}
            districts={districts}
            communes={communes}
            disabled={busy}
            onChange={(next) => {
              setDraft((d) => ({ ...d, ...next }));
              setDone(false);
            }}
          />
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="Terms" />
        <p className="mt-1 text-xs text-muted">
          {creating
            ? "A new customer starts active. Making one inactive or banning it is done from the record, where it asks first."
            : "Status is changed from the record, where it asks first."}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Credit limit (USD)"
            optional
            inputMode="numeric"
            value={draft.credit_limit_usd}
            onChange={(v) => set("credit_limit_usd", v)}
            placeholder="500"
            error={badLimit ? "That is not an amount." : null}
          />
          <div className="sm:col-span-2">
            <Field
              label="Remarks"
              optional
              value={draft.remarks}
              onChange={(v) => set("remarks", v)}
              placeholder="Anything worth knowing about this account"
            />
          </div>
        </div>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="sticky bottom-24 z-30 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)] md:bottom-4">
        <span className="flex-1 text-sm text-muted" role="status">
          {done
            ? "Saved."
            : nameMissing
              ? "A shop name is needed."
              : badCoordinate
                ? "Check the location."
                : badContact
                  ? "Check the contacts."
                  : badLimit
                    ? "Check the credit limit."
                    : creating
                      ? "New customer"
                      : "Editing"}
        </span>

        {!creating && canDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="pressable min-h-10 rounded-xl border border-line px-3 text-sm font-medium text-danger disabled:opacity-60"
          >
            Remove
          </button>
        )}

        <button
          type="button"
          onClick={save}
          disabled={busy || blocked}
          className="pressable min-h-10 rounded-xl bg-brand px-4 text-sm font-medium text-brand-fg disabled:opacity-60"
        >
          {busy ? "Saving…" : creating ? "Create customer" : "Save"}
        </button>
      </div>
    </div>
  );
}
