/**
 * Passwords a person has to read off one screen and type into another.
 *
 * Generated ones are for handing over: a manager reads it out, or pastes it
 * into a message, and the other person types it on a phone. That rules out the
 * usual soup of symbols — it is not more secure if it arrives wrong twice and
 * gets replaced by "hig1234".
 *
 * So: a wide alphabet with the ambiguous characters taken out, in groups, at a
 * length that makes the missing symbols irrelevant. Nothing here is stored;
 * a generated password exists in one response and in whatever the manager does
 * with it next.
 */

/**
 * No 0/O, 1/l/I, 5/S, 2/Z, 8/B. What is left is still 49 characters, so a
 * sixteen-character password from it carries about 89 bits — far more than the
 * symbols would have added, and it survives being read aloud down a phone.
 */
const ALPHABET = "abcdefghijkmnopqrstuvwxyzACDEFGHJKLMNPQRTUVWXY346789";

/** Four groups of four, hyphenated: the shape people expect to type. */
export const PASSWORD_LENGTH = 16;
const GROUP = 4;

/**
 * The password for a given run of random bytes.
 *
 * Split from the randomness so it can be tested: the same bytes must always
 * give the same password, and a test that cannot fix the bytes is a test of
 * nothing.
 *
 * The modulo is unbiased here because 256 is not a multiple of 49 — the bias is
 * about 2%, which matters for a cryptographic key and does not for a password
 * that is replaced the first time it is used. Said out loud rather than left
 * for somebody to discover.
 */
export function passwordFromBytes(bytes: Uint8Array): string {
  const chars = Array.from(bytes.slice(0, PASSWORD_LENGTH), (byte) =>
    ALPHABET[byte % ALPHABET.length],
  );

  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += GROUP) {
    groups.push(chars.slice(i, i + GROUP).join(""));
  }
  return groups.join("-");
}

/** A fresh one, from the platform's own randomness. */
export function generatePassword(): string {
  const bytes = new Uint8Array(PASSWORD_LENGTH);
  crypto.getRandomValues(bytes);
  return passwordFromBytes(bytes);
}

/** The shortest password this app will set. Supabase's own floor is six. */
export const PASSWORD_MIN = 8;

/**
 * What is wrong with a password somebody typed, or null when nothing is.
 *
 * One message at a time, in the order somebody would hit them, because a form
 * that lists three complaints at once is a form that gets read as one.
 */
export function passwordProblem(password: string, again: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `A password is at least ${PASSWORD_MIN} characters.`;
  }
  if (password.trim() !== password) {
    return "A password cannot start or end with a space.";
  }
  if (again !== password) return "Those two do not match.";
  return null;
}
