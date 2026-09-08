"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useI18n, useT } from "@/components/I18nProvider";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import {
  customerWhere,
  distanceMetres,
  nearestCustomers,
  type CartCustomer,
} from "@/lib/catalog";
import { createClient } from "@/lib/supabase/client";
import { distanceLabel, type Fix } from "@/lib/visits";

/**
 * Which shop this visit was to, chosen after the fact.
 *
 * The check-in fires on one tap so the time and the position are the real
 * ones; naming the shop happens here, a moment later, with the rep already
 * inside. Nearest first, because the answer is almost always the shop they are
 * standing in.
 *
 * The distances are this device's arithmetic and only sort the list. They are
 * shown here for choosing between them, and separately fed into the visit's
 * own recorded distance once a shop is picked (0059) — that one is the
 * database's own measurement, taken against the position already on the row.
 *
 * A shop that isn't in the list yet can be added right here, without leaving
 * the flow: `canCreate` gates it the same way every other write in this app
 * is gated, on the permission that would actually let it through. Creating one
 * saves it with whatever position the phone has right now — the same "close
 * enough" this whole screen already runs on — and immediately hands it back
 * to `onChoose`, so adding a shop and naming the visit to it is one motion,
 * not two.
 */
export function ShopPicker({
  customers,
  fix,
  busy,
  onChoose,
  canCreate,
}: {
  customers: CartCustomer[];
  fix: Fix | null;
  busy: boolean;
  onChoose: (customer: CartCustomer) => void;
  canCreate: boolean;
}) {
  const t = useT();
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const sorted = useMemo(() => nearestCustomers(customers, fix), [customers, fix]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? sorted.filter((customer) => {
          const where = customerWhere(customer);
          return (
            customer.shop_name.toLowerCase().includes(needle) ||
            (where !== null && where.toLowerCase().includes(needle))
          );
        })
      : sorted;
    return list.slice(0, 40);
  }, [sorted, query]);

  function startCreating() {
    haptic("tap");
    setName(query);
    setCreateError(null);
    setCreating(true);
  }

  /** Saves the new shop and, on success, hands it straight to `onChoose` --
   * adding it and naming the visit to it are one tap, not two. */
  async function createAndChoose() {
    const shopName = name.trim();
    if (!shopName) return;
    setSaving(true);
    setCreateError(null);

    const { data, error } = await createClient()
      .from("customers")
      .insert({ shop_name: shopName, latitude: fix?.latitude ?? null, longitude: fix?.longitude ?? null })
      .select("id, shop_name, street_address, province_text, district_text, latitude, longitude")
      .single();

    setSaving(false);
    if (error || !data) {
      haptic("error");
      setCreateError(error?.message ?? "That shop was not saved.");
      return;
    }
    haptic("success");
    setOpen(false);
    setCreating(false);
    setName("");
    onChoose(data as CartCustomer);
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          haptic("tap");
          setQuery("");
          setCreating(false);
          setOpen(true);
        }}
        className="pressable flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-brand px-3 text-sm font-medium text-brand disabled:opacity-60"
      >
        <Icon name="building" className="size-4" />
        {t("visit.chooseShop")}
      </button>

      <Sheet open={open} onClose={() => !saving && setOpen(false)} title={t("visit.whichShop")}>
        <div className="space-y-3 p-4">
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("visit.findShop")}
              aria-label={t("visit.findShop")}
              className="min-h-11 w-full rounded-xl border border-line bg-bg pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
            />
          </div>

          {matches.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{t("visit.noShopMatches")}</p>
          ) : (
            <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
              {matches.map((customer) => {
                const metres = fix ? distanceMetres(fix, customer) : null;
                const where = customerWhere(customer);
                return (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => {
                        haptic("select");
                        setOpen(false);
                        onChoose(customer);
                      }}
                      className="pressable flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-subtle"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {customer.shop_name}
                        </span>
                        {where && (
                          <span className="block truncate text-xs text-muted">{where}</span>
                        )}
                      </span>
                      {fix && (
                        <Chip tone={metres === null ? "neutral" : "accent"}>
                          {metres === null ? t("visit.noPin") : distanceLabel(metres, lang)}
                        </Chip>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {canCreate &&
            (creating ? (
              <div className="space-y-2 rounded-xl border border-line p-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("visit.newShopName")}
                  aria-label={t("visit.newShopName")}
                  autoFocus
                  className="min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-brand"
                />
                {createError && (
                  <p role="alert" className="text-xs text-danger">
                    {createError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    disabled={saving}
                    className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium disabled:opacity-50"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={createAndChoose}
                    disabled={saving || !name.trim()}
                    className="pressable min-h-11 flex-[2] rounded-xl bg-brand text-sm font-semibold text-brand-fg disabled:opacity-60"
                  >
                    {saving ? t("visit.addingShop") : t("visit.addShop")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={startCreating}
                className="pressable flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-line px-3 text-sm font-medium text-muted"
              >
                <Icon name="plus" className="size-4" />
                {t("visit.addNewShop")}
              </button>
            ))}
        </div>
      </Sheet>
    </>
  );
}
