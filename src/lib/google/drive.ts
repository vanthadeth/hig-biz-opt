import { accessToken, GoogleAuthError } from "./auth";

/**
 * Fetching one file's bytes from Google Drive, and nothing else.
 *
 * A category's picture lives on a Drive somebody else administers; the sheet
 * only carries a link or a bare file id pointing at it. This is the read-only
 * half of getting that picture into the app's own storage — `drive.readonly`
 * is the whole of what the token below can do, so a bug here can see a file
 * it was shared, never move or delete one.
 */
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

export type GoogleDriveErrorCode = "no_credential" | "bad_credential" | "access" | "other";

export class GoogleDriveError extends Error {
  constructor(
    message: string,
    readonly code: GoogleDriveErrorCode = "other",
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleDriveError";
  }
}

function asDriveError(e: unknown): GoogleDriveError {
  if (e instanceof GoogleAuthError) return new GoogleDriveError(e.message, e.code, e.status);
  if (e instanceof Error) return new GoogleDriveError(e.message);
  return new GoogleDriveError("The file could not be read.");
}

/**
 * The file id out of whatever the sheet cell held.
 *
 * A cell that names an image is a bare id as often as it is a full sharing
 * link, because whoever filled the sheet in copied whichever one Drive
 * offered them that day. Both `/file/d/<id>/…` and `/open?id=<id>` are common
 * shapes; a bare id is accepted as itself once it looks like one, so this
 * never has to guess whether a short string is an id or something else.
 */
export function driveFileIdFrom(input: string): string | null {
  const text = input.trim();
  if (text === "") return null;

  const inPath = text.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (inPath) return inPath[1];

  const inQuery = text.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (inQuery) return inQuery[1];

  // A Drive file id is a long opaque token, the same shape as a spreadsheet
  // id. Requiring a plausible shape stops a stray word or a half-pasted URL
  // being sent to Drive as though it named a file.
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;

  return null;
}

export type DriveFile = { bytes: Buffer; contentType: string };

/**
 * One file's bytes and content type, read straight through — never cached,
 * because a category's picture on Drive can change and the next sync should
 * see that.
 */
export async function fetchDriveFile(fileId: string): Promise<DriveFile> {
  let token: string;
  try {
    token = await accessToken(SCOPE);
  } catch (e) {
    throw asDriveError(e);
  }

  const response = await fetch(`${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 403 || response.status === 404) {
      throw new GoogleDriveError(
        `Google will not hand over that file (${fileId}). Share it — or the folder `
          + "it is in — as a Viewer with the same service account the sheet is shared with.",
        "access",
        response.status,
      );
    }
    const body = await response.text().catch(() => "");
    throw new GoogleDriveError(
      `Google Drive: ${body || response.statusText}`,
      "other",
      response.status,
    );
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, contentType };
}
