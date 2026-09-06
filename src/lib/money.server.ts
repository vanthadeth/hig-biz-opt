import { cache } from "react";
import { asCurrency, DEFAULT_CURRENCY, type Currency } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

/**
 * The currency this organisation quotes in.
 *
 * Server only. Wrapped in `cache` so the several server components that each
 * need it during one render ask the database once between them.
 *
 * Falls back to the default rather than failing: a settings row that cannot be
 * read is a reason to show dollars, not a reason to show nothing. Every screen
 * that calls this is a screen whose real job is something else.
 */
export const primaryCurrency = cache(async (): Promise<Currency> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("primary_currency")
    .maybeSingle();

  return data ? asCurrency(data.primary_currency) : DEFAULT_CURRENCY;
});
