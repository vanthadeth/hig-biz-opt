import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_AUTH_AGE_SECONDS, verifyInitData } from "./initData";

const BOT_TOKEN = "123456:AAG-test-token-not-a-real-one";
const NOW = new Date("2026-09-04T12:00:00Z");
const AUTH_DATE = Math.floor(NOW.getTime() / 1000) - 60;

/**
 * Build a launch string the way Telegram does, so the test signs with the same
 * algorithm it is checking. That would be circular if the algorithm were the
 * only thing asserted — so the cases below are mostly about what happens when
 * one input is wrong, which a shared mistake cannot make pass.
 */
function sign(fields: Record<string, string>, token = BOT_TOKEN): string {
  const checkString = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");

  const params = new URLSearchParams(fields);
  params.set("hash", hash);
  return params.toString();
}

const USER = JSON.stringify({ id: 987654321, first_name: "Sokha", username: "sokha" });

function launch(overrides: Record<string, string> = {}) {
  return sign({
    auth_date: String(AUTH_DATE),
    query_id: "AAHdF6IQAAAAAN0Xoh",
    user: USER,
    ...overrides,
  });
}

describe("verifyInitData", () => {
  it("accepts a launch signed with the bot token", () => {
    const result = verifyInitData(launch(), BOT_TOKEN, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.user.id).toBe(987654321);
    expect(result.data.user.username).toBe("sokha");
    expect(result.data.authDate.getTime()).toBe(AUTH_DATE * 1000);
  });

  it("refuses a launch signed with a different bot's token", () => {
    const other = sign({ auth_date: String(AUTH_DATE), user: USER }, "999:other-token");

    expect(verifyInitData(other, BOT_TOKEN, NOW)).toEqual({
      ok: false,
      problem: "bad-signature",
    });
  });

  it("refuses a launch whose fields were edited after signing", () => {
    const params = new URLSearchParams(launch());
    params.set("user", JSON.stringify({ id: 111, first_name: "Somebody Else" }));

    expect(verifyInitData(params.toString(), BOT_TOKEN, NOW)).toEqual({
      ok: false,
      problem: "bad-signature",
    });
  });

  it("refuses a launch carrying no hash at all", () => {
    const params = new URLSearchParams(launch());
    params.delete("hash");

    expect(verifyInitData(params.toString(), BOT_TOKEN, NOW)).toEqual({
      ok: false,
      problem: "no-hash",
    });
  });

  it("refuses an empty string rather than treating it as anonymous", () => {
    expect(verifyInitData("", BOT_TOKEN, NOW)).toEqual({ ok: false, problem: "missing" });
  });

  it("accepts a launch right at the age limit", () => {
    const edge = sign({
      auth_date: String(Math.floor(NOW.getTime() / 1000) - MAX_AUTH_AGE_SECONDS),
      user: USER,
    });

    expect(verifyInitData(edge, BOT_TOKEN, NOW).ok).toBe(true);
  });

  it("refuses one a second past it", () => {
    const stale = sign({
      auth_date: String(Math.floor(NOW.getTime() / 1000) - MAX_AUTH_AGE_SECONDS - 1),
      user: USER,
    });

    expect(verifyInitData(stale, BOT_TOKEN, NOW)).toEqual({ ok: false, problem: "stale" });
  });

  it("leaves the Ed25519 signature field out of the check string", () => {
    // A current client sends `signature` alongside `hash`. It is signed by
    // Telegram rather than by us, is not part of what the HMAC covers, and
    // every launch would fail if it were folded in.
    const params = new URLSearchParams(launch());
    params.set("signature", "0mMmQtNjE4NC00ZDU4LTk0MjMtM2Rj");

    expect(verifyInitData(params.toString(), BOT_TOKEN, NOW).ok).toBe(true);
  });

  it("refuses a launch with no user on it", () => {
    const noUser = sign({ auth_date: String(AUTH_DATE), query_id: "AAHdF6IQ" });

    expect(verifyInitData(noUser, BOT_TOKEN, NOW)).toEqual({ ok: false, problem: "no-user" });
  });

  it("refuses a user whose id is not a number", () => {
    const odd = sign({
      auth_date: String(AUTH_DATE),
      user: JSON.stringify({ id: "987654321", first_name: "Sokha" }),
    });

    expect(verifyInitData(odd, BOT_TOKEN, NOW)).toEqual({ ok: false, problem: "no-user" });
  });

  it("survives a hash that is not hex without throwing", () => {
    const params = new URLSearchParams(launch());
    params.set("hash", "not-a-hash");

    expect(verifyInitData(params.toString(), BOT_TOKEN, NOW)).toEqual({
      ok: false,
      problem: "bad-signature",
    });
  });
});
