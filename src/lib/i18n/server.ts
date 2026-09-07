import { cookies } from "next/headers";
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  isLang,
  translate,
  type Lang,
  type MessageKey,
} from "./index";

/**
 * The language this request is in.
 *
 * Read on the server so the first render is already right: nothing flips after
 * hydration, and there is no moment where a Khmer-speaking rep sees English.
 */
export async function requestLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

/**
 * The translator, for a Server Component.
 *
 * `useT()` is a hook and there are no hooks on the server, so a page that
 * renders words rather than delegating them to a client component asks for
 * this instead. Same dictionary, same fallback.
 */
export async function serverT() {
  const lang = await requestLang();
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);
}
