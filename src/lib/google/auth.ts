import { createSign } from "node:crypto";

/**
 * One service account, authorised for whichever Google API asks.
 *
 * Signing a JWT and exchanging it for a token is the whole of what talking to
 * Google as this service account requires, and it does not change between
 * Sheets and Drive — only the scope in the claim does. This is that part,
 * pulled out so a second API does not mean a second copy of it.
 *
 * The scope is still the caller's to choose and is never widened here: each
 * caller mints its own token for its own scope, so a bug in the Drive code
 * can ask Google for `drive.readonly` and nothing more, and Google will
 * refuse it anything past that regardless of what this module does.
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type GoogleAuthErrorCode = "no_credential" | "bad_credential" | "access" | "other";

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    readonly code: GoogleAuthErrorCode = "other",
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

type ServiceAccount = { client_email: string; private_key: string };

/**
 * The service account, out of the environment.
 *
 * Accepts base64 as well as raw JSON because a PEM private key is full of
 * newlines, and a newline pasted into a hosting provider's environment box is
 * the single most common way this credential arrives broken.
 */
export function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new GoogleAuthError(
      "No Google service account is configured, so nothing can be read yet.",
      "no_credential",
    );
  }

  const text = raw.startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");

  // Named specifically because it is the mistake this variable invites: a
  // Google account is an address you sign in with, a service account key is a
  // file. Telling somebody their value "is not valid JSON" when they have put
  // their email in it explains nothing.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    throw new GoogleAuthError(
      "GOOGLE_SERVICE_ACCOUNT_JSON holds an email address. It needs the service "
        + "account's whole JSON key file (or the base64 of it), not an address — "
        + "and a service account is not the Google account you sign in with.",
      "bad_credential",
    );
  }

  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GoogleAuthError(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON, base64 or otherwise. "
        + "Paste the whole key file, or its base64.",
      "bad_credential",
    );
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new GoogleAuthError(
      "GOOGLE_SERVICE_ACCOUNT_JSON has no client_email or private_key. "
        + "That is not a service account key file.",
      "bad_credential",
    );
  }

  return {
    client_email: parsed.client_email,
    // A key that survived a single-line environment variable has literal \n in
    // it rather than real newlines, and OpenSSL will not read that.
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

/** The address of the service account, for a "share this with" instruction. */
export function serviceAccountEmail(): string | null {
  try {
    return serviceAccount().client_email;
  } catch {
    return null;
  }
}

export type ServiceAccountStatus =
  | { state: "missing" }
  | { state: "unreadable"; reason: string }
  | { state: "ready"; email: string };

/**
 * What the server can actually see, told apart.
 *
 * `serviceAccountEmail` returns null for every failure, which made a key that
 * was set but mangled report itself as "not configured" — sending somebody off
 * to set a variable they had already set. The three states need three different
 * answers, so they are three states.
 */
export function serviceAccountStatus(): ServiceAccountStatus {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) return { state: "missing" };
  try {
    return { state: "ready", email: serviceAccount().client_email };
  } catch (e) {
    return {
      state: "unreadable",
      reason: e instanceof Error ? e.message : "The key could not be read.",
    };
  }
}

const base64url = (input: string | Buffer) =>
  Buffer.from(input).toString("base64url");

/**
 * A token lives an hour and is scoped to one API. Sheets and Drive each mint
 * and cache their own, keyed by scope, so neither can accidentally use the
 * other's — a Sheets-only token failing against Drive with a permission error
 * is the correct, boring outcome if the two ever get mixed up.
 */
const cached = new Map<string, { token: string; expiresAt: number }>();

export async function accessToken(scope: string): Promise<string> {
  // A minute of slack, so a token that expires mid-request is not used.
  const hit = cached.get(scope);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;

  const account = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: account.client_email,
    scope,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const unsigned =
    `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.` +
    `${base64url(JSON.stringify(claims))}`;

  let signature: string;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signature = signer.sign(account.private_key, "base64url");
  } catch {
    throw new GoogleAuthError(
      "The service account's private key could not be read. It usually means the "
        + "newlines did not survive being pasted — use the base64 form instead.",
      "bad_credential",
    );
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new GoogleAuthError(
      `Google refused the service account: ${body.error_description ?? body.error ?? response.statusText}`,
      "bad_credential",
      response.status,
    );
  }

  const token = {
    token: body.access_token as string,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  cached.set(scope, token);
  return token.token;
}

/**
 * Ask Google for a token, for a given scope, and throw away the answer.
 *
 * The only check that proves the whole chain: the variable is present, the key
 * parses, it signs, and Google accepts the account for that scope. Everything
 * short of this can pass while syncing still fails.
 */
export async function checkCredential(scope: string): Promise<{ ok: true; email: string }> {
  await accessToken(scope);
  return { ok: true, email: serviceAccount().client_email };
}
