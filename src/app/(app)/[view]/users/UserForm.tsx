"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Field, SelectField, SuggestField } from "@/components/ui/Field";
import { NewDepartmentSheet } from "./NewDepartmentSheet";
import { PhotoField } from "./PhotoField";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  GENDERS,
  GENDER_LABELS,
  type Department,
  type UserRecord,
} from "@/lib/users";

export type RoleOption = { id: string; name: string };

/** Everything the form can write. Mirrors the columns, not the database row. */
type Draft = {
  full_name: string;
  nickname: string;
  gender: string;
  date_of_birth: string;
  phone_primary: string;
  phone_secondary: string;
  telegram_id: string;
  email: string;
  department_id: string;
  position: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  role_id: string;
};

function draftFrom(record: UserRecord | null): Draft {
  return {
    full_name: record?.full_name ?? "",
    nickname: record?.nickname ?? "",
    gender: record?.gender ?? "",
    date_of_birth: record?.date_of_birth ?? "",
    phone_primary: record?.phone_primary ?? "",
    phone_secondary: record?.phone_secondary ?? "",
    telegram_id: record?.telegram_id ?? "",
    email: record?.email ?? "",
    department_id: record?.department_id ?? "",
    position: record?.position ?? "",
    bank_name: record?.bank_name ?? "",
    bank_account_name: record?.bank_account_name ?? "",
    bank_account_number: record?.bank_account_number ?? "",
    role_id: record?.role_id ?? "",
  };
}

/** Empty strings are "not set", which the columns record as null, not "". */
function toRow(draft: Draft) {
  const blank = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    full_name: draft.full_name.trim(),
    nickname: blank(draft.nickname),
    gender: blank(draft.gender),
    date_of_birth: blank(draft.date_of_birth),
    phone_primary: blank(draft.phone_primary),
    phone_secondary: blank(draft.phone_secondary),
    telegram_id: blank(draft.telegram_id),
    email: blank(draft.email),
    department_id: blank(draft.department_id),
    position: blank(draft.position),
    bank_name: blank(draft.bank_name),
    bank_account_name: blank(draft.bank_account_name),
    bank_account_number: blank(draft.bank_account_number),
    role_id: blank(draft.role_id),
  };
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {caption && <p className="mt-0.5 text-xs text-muted">{caption}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

/**
 * The employee record, in the five groups the spec describes.
 *
 * The same component creates and edits: the only difference is whether it has a
 * record to start from, which keeps the two paths from drifting apart. Bank
 * details are payroll data and are only rendered when `canSeeBank` — see the
 * page components for who that is.
 */
export function UserForm({
  record,
  departments: initialDepartments,
  roles,
  positions,
  canEdit,
  canSeeBank,
  canAddDepartment,
  viewKey,
}: {
  record: UserRecord | null;
  departments: Department[];
  roles: RoleOption[];
  positions: string[];
  canEdit: boolean;
  canSeeBank: boolean;
  canAddDepartment: boolean;
  viewKey: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(record));
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Held locally so a department created here is selectable at once, without a
  // round trip through the router that would discard the rest of the form.
  const [departments, setDepartments] = useState(initialDepartments);
  const [addingDepartment, setAddingDepartment] = useState(false);

  const creating = record === null;
  const nameMissing = draft.full_name.trim().length === 0;

  function set<K extends keyof Draft>(key: K) {
    return (value: string) => {
      setDraft((d) => ({ ...d, [key]: value }));
      setError(null);
      setSaved(false);
    };
  }

  async function uploadPhoto(userId: string): Promise<string | null> {
    if (!photo) return null;
    const supabase = createClient();
    // Objects live under "<user id>/…", which is what the storage policies key
    // on; the timestamp keeps a replacement from being served from cache.
    const extension = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${userId}/${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, photo, { upsert: true, contentType: photo.type });
    if (error) throw error;
    return path;
  }

  async function save() {
    if (nameMissing) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const row = toRow(draft);

    try {
      if (creating) {
        // Insert first: the photo needs an id to be filed under, and the id is
        // generated by the database.
        const { data, error } = await supabase
          .from("users")
          .insert(row)
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("The record was not created.");

        const photoPath = await uploadPhoto(data.id);
        if (photoPath) {
          await supabase.from("users").update({ photo_path: photoPath }).eq("id", data.id);
        }

        haptic("success");
        router.replace(`/${viewKey}/users/${data.id}`);
        router.refresh();
        return;
      }

      const photoPath = await uploadPhoto(record.id);
      // `.select()` matters here: an update the policy refuses matches no rows
      // and reports no error, because the USING clause hides the row rather
      // than rejecting the statement. Without asking for the row back, a
      // refused save would announce itself as a successful one.
      const { data, error } = await supabase
        .from("users")
        .update(photoPath ? { ...row, photo_path: photoPath } : row)
        .eq("id", record.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That record could not be saved. You may not have permission.");
      }

      haptic("success");
      setPhoto(null);
      setSaved(true);
      router.refresh();
    } catch (e) {
      // Row level security refuses the write when the permission is not held,
      // so a failure here is a real answer rather than a glitch to retry.
      haptic("error");
      setError(e instanceof Error ? e.message : "The record could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <Card className="p-4">
          <p className="text-sm text-muted">
            You can see this record but not change it. Editing needs the User
            module at update level.
          </p>
        </Card>
      )}

      <Section title="Information">
        <div className="sm:col-span-2">
          <PhotoField
            name={draft.full_name || "New user"}
            path={record?.photo_path ?? null}
            file={photo}
            onChange={(file) => {
              setPhoto(file);
              setSaved(false);
            }}
            disabled={!canEdit}
          />
        </div>
        <Field
          label="Full name"
          value={draft.full_name}
          onChange={set("full_name")}
          placeholder="Sokha Chan"
          disabled={!canEdit}
          autoComplete="name"
          error={nameMissing && draft.full_name !== "" ? "A name is required." : null}
        />
        <Field
          label="Nickname"
          optional
          value={draft.nickname}
          onChange={set("nickname")}
          placeholder="Dara"
          disabled={!canEdit}
        />
        <SelectField
          label="Gender"
          value={draft.gender}
          onChange={set("gender")}
          options={GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g] }))}
          disabled={!canEdit}
        />
        <Field
          label="Date of birth"
          type="date"
          value={draft.date_of_birth}
          onChange={set("date_of_birth")}
          hint="Not shown in the staff directory."
          disabled={!canEdit}
        />
      </Section>

      <Section title="Contact">
        <Field
          label="Primary phone"
          type="tel"
          inputMode="tel"
          value={draft.phone_primary}
          onChange={set("phone_primary")}
          placeholder="012 345 678"
          disabled={!canEdit}
        />
        <Field
          label="Secondary phone"
          type="tel"
          inputMode="tel"
          optional
          value={draft.phone_secondary}
          onChange={set("phone_secondary")}
          disabled={!canEdit}
        />
        <Field
          label="Telegram ID"
          value={draft.telegram_id}
          onChange={set("telegram_id")}
          placeholder="@sokha"
          disabled={!canEdit}
        />
        <Field
          label="Email"
          type="email"
          inputMode="email"
          optional
          value={draft.email}
          onChange={set("email")}
          placeholder="sokha@hig.com"
          hint="Also how a login is matched to this record later."
          disabled={!canEdit}
        />
      </Section>

      <Section title="Position">
        <div className="grid gap-1">
          <SelectField
            label="Department"
            value={draft.department_id}
            onChange={set("department_id")}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
            disabled={!canEdit}
          />
          {canEdit && canAddDepartment && (
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setAddingDepartment(true);
              }}
              className="justify-self-start text-xs font-medium text-brand hover:underline"
            >
              + New department
            </button>
          )}
        </div>
        <SuggestField
          label="Position"
          value={draft.position}
          onChange={set("position")}
          suggestions={positions}
          placeholder="Sales Supervisor"
          hint="Free text. Previous entries are offered as you type."
          disabled={!canEdit}
        />
      </Section>

      {canSeeBank && (
        <Section
          title="Bank info"
          caption="Payroll. Visible only to people who may edit this record."
        >
          <Field
            label="Bank name"
            value={draft.bank_name}
            onChange={set("bank_name")}
            placeholder="ABA Bank"
            disabled={!canEdit}
          />
          <Field
            label="Account name"
            value={draft.bank_account_name}
            onChange={set("bank_account_name")}
            disabled={!canEdit}
          />
          <Field
            label="Account number"
            inputMode="numeric"
            value={draft.bank_account_number}
            onChange={set("bank_account_number")}
            disabled={!canEdit}
          />
        </Section>
      )}

      <Section title="Role" caption="What this person may do, before any per-user override.">
        <SelectField
          label="Role"
          value={draft.role_id}
          onChange={set("role_id")}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
          placeholder="No role"
          disabled={!canEdit}
        />
      </Section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <NewDepartmentSheet
        open={addingDepartment}
        onClose={() => setAddingDepartment(false)}
        existing={departments}
        nextSortOrder={departments.length + 1}
        onCreated={(department) => {
          setDepartments((list) => [...list, department]);
          set("department_id")(department.id);
        }}
      />

      {canEdit && (
        // Sits above the bottom bar so Save stays reachable however far down the
        // form you have scrolled.
        <div className="sticky bottom-24 z-30 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)] md:bottom-4">
          <span className="flex-1 text-sm text-muted" role="status">
            {saved ? "Saved." : creating ? "New employee record" : "Editing"}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={busy || nameMissing}
            className="pressable min-h-10 rounded-xl bg-brand px-4 text-sm font-medium text-brand-fg disabled:opacity-60"
          >
            {busy ? "Saving…" : creating ? "Create" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
