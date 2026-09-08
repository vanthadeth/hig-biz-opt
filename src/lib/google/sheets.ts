import {
  accessToken,
  checkCredential as checkCredentialFor,
  GoogleAuthError,
  serviceAccountEmail,
  serviceAccountStatus,
  type ServiceAccountStatus,
} from "./auth";

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
 * The signing and token exchange behind `accessToken` are shared with Drive in
 * `google/auth.ts` — the two APIs need the same handshake, scoped differently.
 */
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
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

/** `GoogleAuthError` in the type this module has always thrown. */
function asSheetsError(e: unknown): GoogleSheetsError {
  if (e instanceof GoogleAuthError) return new GoogleSheetsError(e.message, e.code, e.status);
  if (e instanceof Error) return new GoogleSheetsError(e.message);
  return new GoogleSheetsError("The sheet could not be read.");
}

async function sheetsToken(): Promise<string> {
  try {
    return await accessToken(SCOPE);
  } catch (e) {
    throw asSheetsError(e);
  }
}

export { serviceAccountEmail, serviceAccountStatus };
export type { ServiceAccountStatus };

/**
 * Ask Google for a token and throw away the answer.
 *
 * The only check that proves the whole chain: the variable is present, the key
 * parses, it signs, and Google accepts the account. Everything short of this
 * can pass while syncing still fails.
 */
export async function checkCredential(): Promise<{ ok: true; email: string }> {
  try {
    return await checkCredentialFor(SCOPE);
  } catch (e) {
    throw asSheetsError(e);
  }
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
  const token = await sheetsToken();
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
  const token = await sheetsToken();
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
