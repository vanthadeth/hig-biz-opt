import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Telegram's account, as it appears inside initData.
 *
 * `id` is the only field worth trusting for identity. A username is a handle:
 * people change them, give them up, and someone else registers them later.
 */
export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

export type InitData = {
  user: TelegramUser;
  authDate: Date;
};

/** Why a launch was not accepted. The page maps these onto what it says. */
export type InitDataProblem =
  | "missing"
  | "no-hash"
  | "bad-signature"
  | "stale"
  | "no-user";

export type InitDataResult =
  | { ok: true; data: InitData }
  | { ok: false; problem: InitDataProblem };

/**
 * How old a launch may be. Telegram keeps handing the page the same initData
 * for as long as it stays open, so this cannot be minutes — a phone left on a
 * desk over lunch would stop working. A day is long enough for that and short
 * enough that a string captured off somebody's screen does not stay useful.
 */
export const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Two fields are left out of the check string.
 *
 * `hash` is the answer, so it cannot be part of the question. `signature` is
 * Telegram's newer Ed25519 field, which exists so a third party can verify a
 * launch without holding the bot token; it was added after this scheme and is
 * not part of what the HMAC covers. Leaving it in makes every launch from a
 * current client fail.
 */
const EXCLUDED = new Set(["hash", "signature"]);

/**
 * Verify a launch, and say who opened it.
 *
 * The scheme is Telegram's: sort every other field as `key=value`, join with
 * newlines, and compare the HMAC against the one they sent. The secret is
 * itself an HMAC — of the bot token, keyed by the constant "WebAppData", which
 * is the way round that is easy to get backwards.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  now: Date = new Date(),
): InitDataResult {
  if (!initData) return { ok: false, problem: "missing" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, problem: "no-hash" };

  const checkString = [...params.entries()]
    .filter(([key]) => !EXCLUDED.has(key))
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest("hex");

  if (!equalHex(hash, expected)) return { ok: false, problem: "bad-signature" };

  // Only past this point is anything in the string worth reading.
  const authDateSeconds = Number(params.get("auth_date"));
  if (!Number.isFinite(authDateSeconds)) return { ok: false, problem: "stale" };

  const ageSeconds = now.getTime() / 1000 - authDateSeconds;
  if (ageSeconds > MAX_AUTH_AGE_SECONDS) return { ok: false, problem: "stale" };

  const user = parseUser(params.get("user"));
  if (!user) return { ok: false, problem: "no-user" };

  return { ok: true, data: { user, authDate: new Date(authDateSeconds * 1000) } };
}

/**
 * Constant-time comparison of two hex digests.
 *
 * timingSafeEqual throws when the lengths differ, so the length check has to
 * come first — and a wrong length is not a secret worth protecting.
 */
function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function parseUser(raw: string | null): TelegramUser | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const id = (parsed as { id?: unknown }).id;
    if (typeof id !== "number" || !Number.isSafeInteger(id)) return null;
    return parsed as TelegramUser;
  } catch {
    return null;
  }
}
