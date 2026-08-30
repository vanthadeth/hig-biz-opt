"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import type { UserRecord } from "@/lib/users";
import { PhotoField } from "../../users/PhotoField";

/**
 * The three things about yourself that are yours to change.
 *
 * What people call you, what you look like, and a second number to reach you
 * on. Your name, department, position, role, pay details and employment status
 * are matters of record: someone holding the user module changes those, from
 * the record screen.
 *
 * The database enforces the same split (0021) rather than trusting this form —
 * the row is reachable over the API with nothing but a session, so a UI that
 * merely declined to show a field would not be a restriction at all.
 */
export function SelfProfileForm({
  record,
  viewKey,
}: {
  record: UserRecord;
  viewKey: string;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState(record.nickname ?? "");
  const [phone, setPhone] = useState(record.phone_secondary ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blank = (v: string) => (v.trim() === "" ? null : v.trim());
  const dirty =
    photo !== null ||
    blank(nickname) !== record.nickname ||
    blank(phone) !== record.phone_secondary;

  async function save() {
    setBusy(true);
    setError(null);
    const supabase = createClient();

    try {
      let photoPath: string | null = null;
      if (photo) {
        // Objects live under "<user id>/…", which is what the storage policies
        // key on; the timestamp keeps a replacement from being cached.
        const extension = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
        photoPath = `${record.id}/${Date.now()}.${extension}`;
        const { error } = await supabase.storage
          .from("avatars")
          .upload(photoPath, photo, { upsert: true, contentType: photo.type });
        if (error) throw error;
      }

      // `.select()` because an update the policy refuses matches no rows and
      // reports no error at all.
      const { data, error } = await supabase
        .from("users")
        .update({
          nickname: blank(nickname),
          phone_secondary: blank(phone),
          ...(photoPath ? { photo_path: photoPath } : {}),
        })
        .eq("id", record.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That change could not be saved. You may not have permission.");
      }

      haptic("success");
      router.replace(`/${viewKey}/profile`);
      router.refresh();
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The change could not be saved.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <PhotoField
              name={record.full_name}
              path={record.photo_path}
              file={photo}
              onChange={setPhoto}
            />
          </div>
          <Field
            label="Nickname"
            optional
            value={nickname}
            onChange={setNickname}
            placeholder="Dara"
            hint="What colleagues call you. It shows beside your name on the staff list."
          />
          <Field
            label="Secondary phone"
            type="tel"
            inputMode="tel"
            optional
            value={phone}
            onChange={setPhone}
            placeholder="098 765 432"
          />
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-sm text-muted">
          Everything else on your record — your name, department, position, role,
          bank details and employment status — is changed by someone holding the
          User module. Ask them if any of it is wrong.
        </p>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="sticky bottom-24 z-30 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)] md:bottom-4">
        <span className="flex-1 text-sm text-muted" role="status">
          {dirty ? "Unsaved changes" : "Nothing changed yet"}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="pressable min-h-10 rounded-xl bg-brand px-4 text-sm font-medium text-brand-fg disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
