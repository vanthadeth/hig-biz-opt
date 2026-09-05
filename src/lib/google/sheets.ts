import { createSign } from "node:crypto";

/**
 * Reading a Google Sheet, and nothing else.
 *
 * The scope below is the whole protection on HIG's spreadsheets. It is not a
 * policy this code follows — it is the only scope the access token is ever
 * minted with, so a request that tried to write would be refused by Google
 * before it reached the file. Somebody who later adds a write path here gets an
 * error from Google, not a modified sheet. That is worth more than any amount
 * of care in the application, which is why it is a constant and not a setting.
 *
 * No SDK: this environment cannot reach the npm registry, and the whole of what
 * `googleapis` would do for us here is sign a JWT and exchange it for a token.
 * Node's crypto does that in thirty lines.
 */
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/**
 * `code` separates the three failures that need different answers from a
 * person: nothing is configured, the sheet is not shared with us, or Google
 * said something else. The screen shows setup steps for the first and the
 * sharing instruction for the second, rather than one message for all three.
 */
export type GoogleSheetsErrorCode = "no_credential" | "bad_credential" | "access" | "other";

export class GoogleSheetsError extends Error {
  constructor(
    message: string,
    readonly code: GoogleSheetsErrorCode = "other",
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleSheetsError";
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
function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new GoogleSheetsError(
      "No Google service account is configured, so no sheet can be read yet.",
      "no_credential",
    );
  }

  const text = raw.startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");

  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GoogleSheetsError(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON, base64 or otherwise. "
        + "Paste the whole key file, or its base64.",
      "bad_credential",
    );
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new GoogleSheetsError(
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

const base64url = (input: string | Buffer) =>
  Buffer.from(input).toString("base64url");

/** A token lives an hour; minting one per row of a sheet would be absurd. */
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  // A minute of slack, so a token that expires mid-request is not used.
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const account = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: account.client_email,
    scope: SCOPE,
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
    throw new GoogleSheetsError(
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
    throw new GoogleSheetsError(
      `Google refused the service account: ${body.error_description ?? body.error ?? response.statusText}`,
      "bad_credential",
      response.status,
    );
  }

  cached = {
    token: body.access_token as string,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

/** The address of the service account, for the "share the sheet with" instruction. */
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

/**
 * Ask Google for a token and throw away the answer.
 *
 * The only check that proves the whole chain: the variable is present, the key
 * parses, it signs, and Google accepts the account. Everything short of this
 * can pass while syncing still fails.
 */
export async function checkCredential(): Promise<{ ok: true; email: string }> {
  await accessToken();
  return { ok: true, email: serviceAccount().client_email };
}

export type SheetValues = { headers: string[]; rows: unknown[][] };

/**
 * A tab's values, headings first.
 *
 * UNFORMATTED_VALUE rather than the display text: it makes a date arrive as the
 * serial number it is rather than as "03/04/2024", which no reader can tell
 * from the fourth of March. Numbers arrive as numbers for the same reason.
 */
export async function readSheet(
  spreadsheetId: string,
  range: string,
): Promise<SheetValues> {
  const token = await accessToken();
  const url =
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}` +
    `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body?.error?.message ?? response.statusText;
    if (response.status === 403 || response.status === 404) {
      throw new GoogleSheetsError(
        `Google will not open that sheet: ${detail}. Share it with ${
          serviceAccountEmail() ?? "the service account"
        } as a Viewer.`,
        "access",
        response.status,
      );
    }
    throw new GoogleSheetsError(`Google Sheets: ${detail}`, "other", response.status);
  }

  const body = (await response.json()) as { values?: unknown[][] };
  const values = body.values ?? [];
  if (values.length === 0) return { headers: [], rows: [] };

  return {
    headers: (values[0] ?? []).map((h) => String(h ?? "").trim()),
    rows: values.slice(1),
  };
}

/** The tabs in a file, so the screen can offer them rather than ask for typing. */
export async function readTabs(spreadsheetId: string): Promise<string[]> {
  const token = await accessToken();
  const response = await fetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
    { headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new GoogleSheetsError(
      `Google will not open that sheet: ${body?.error?.message ?? response.statusText}. ` +
        `Share it with ${serviceAccountEmail() ?? "the service account"} as a Viewer.`,
      "access",
      response.status,
    );
  }

  const body = (await response.json()) as {
    sheets?: { properties?: { title?: string } }[];
  };
  return (body.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => typeof t === "string");
}
