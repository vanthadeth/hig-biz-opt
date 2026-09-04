"use client";

import { useCallback, useEffect, useState } from "react";
import { PhotoCapture } from "@/components/PhotoCapture";
import { TodayTimeline } from "@/components/TodayTimeline";
import {
  ACTION_LABELS,
  CHECK_INS_BUCKET,
  CHECK_IN_COLUMNS,
  nextKind,
  photoPath,
  todays,
  type CheckIn,
} from "@/lib/checkIns";
import { formatAccuracy, getFix, LocationRefused, telegramWebApp, type Fix } from "@/lib/location";
import { downscale, MAX_BYTES } from "@/lib/photo";
import { createClient } from "@/lib/supabase/client";

export type Employee = {
  id: string;
  full_name: string;
  nickname: string | null;
};

export function CheckInScreen({ employee }: { employee: Employee }) {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind = nextKind(checkIns);
  const today = todays(checkIns);

  const locate = useCallback(async () => {
    setLocating(true);
    setLocationError(null);
    setCanOpenSettings(false);
    try {
      setFix(await getFix());
    } catch (caught) {
      setFix(null);
      setLocationError(
        caught instanceof Error ? caught.message : "Your location could not be found.",
      );
      setCanOpenSettings(caught instanceof LocationRefused && caught.canOpenSettings);
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();

      // Two days' worth, so a punch just before local midnight is still in hand
      // when the screen decides what "today" holds. RLS narrows this to the
      // caller's own without the query saying so.
      const { data } = await supabase
        .from("check_ins")
        .select(CHECK_IN_COLUMNS)
        .gte("occurred_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .order("occurred_at", { ascending: false });
      setCheckIns((data as CheckIn[] | null) ?? []);

      // After the read rather than beside it: both want the radio, and the list
      // is what the screen needs first to decide which punch it is offering.
      await locate();
    })();
  }, [locate]);

  const missing = !fix ? "your location" : !photo ? "a photo" : null;

  async function submit() {
    if (!fix || !photo) return;

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const image = await downscale(photo);

      if (image.size > MAX_BYTES) {
        setError("That photo is too large. Take another one.");
        return;
      }

      // Upload first: an orphaned object in a private bucket costs nothing,
      // while a row pointing at a photograph nobody can produce is a record
      // that lies.
      const path = photoPath(employee.id);
      const { error: uploadError } = await supabase.storage
        .from(CHECK_INS_BUCKET)
        .upload(path, image, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      // occurred_at is deliberately not sent — the database stamps it, and
      // sending it would invite somebody to believe it was used.
      const { data, error: insertError } = await supabase
        .from("check_ins")
        .insert({
          kind,
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracy_m: fix.accuracy,
          location_source: fix.source,
          photo_path: path,
        })
        .select(CHECK_IN_COLUMNS)
        .single();

      if (insertError || !data) {
        throw insertError ?? new Error("The check-in was not recorded.");
      }

      setCheckIns((previous) => [data as CheckIn, ...previous]);
      setPhoto(null);
      telegramWebApp()?.HapticFeedback?.notificationOccurred("success");
    } catch (caught) {
      telegramWebApp()?.HapticFeedback?.notificationOccurred("error");
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "That did not save. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="fade-up">
        <p className="text-sm text-muted">Signed in as</p>
        <h1 className="text-xl font-semibold">{employee.nickname ?? employee.full_name}</h1>
      </header>

      <section className="fade-up rounded-2xl bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-muted">Today</h2>
        <TodayTimeline checkIns={today} />
      </section>

      <section className="fade-up space-y-4 rounded-2xl bg-surface p-5">
        <div className="flex items-start gap-3">
          <PinIcon />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Location</p>
            {locating ? (
              <p className="text-sm text-muted">Finding you…</p>
            ) : fix ? (
              <p className="text-sm text-muted">
                Found{formatAccuracy(fix.accuracy) ? ` · ${formatAccuracy(fix.accuracy)}` : ""}
              </p>
            ) : (
              <p className="text-sm text-danger">{locationError}</p>
            )}
          </div>

          {!locating && !fix ? (
            <button
              type="button"
              onClick={() => {
                if (canOpenSettings) telegramWebApp()?.LocationManager?.openSettings();
                else void locate();
              }}
              className="pressable shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium"
            >
              {canOpenSettings ? "Settings" : "Retry"}
            </button>
          ) : null}
        </div>

        <PhotoCapture photo={photo} onChange={setPhoto} disabled={saving} />
      </section>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={saving || missing !== null}
        className="pressable w-full rounded-xl bg-brand px-4 py-4 text-base font-semibold text-brand-fg disabled:opacity-50"
      >
        {saving ? "Saving…" : ACTION_LABELS[kind]}
      </button>

      <p role="status" className="min-h-5 text-center text-sm text-muted">
        {missing ? `Add ${missing} first.` : ""}
      </p>
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 size-5 text-muted" aria-hidden="true">
      <path
        d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
