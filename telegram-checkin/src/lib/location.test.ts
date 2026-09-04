import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatAccuracy,
  formatCoordinate,
  getFix,
  hasTelegramLocation,
  locationProblem,
  LocationRefused,
  type TelegramWebApp,
} from "./location";

type ManagerStub = Partial<NonNullable<TelegramWebApp["LocationManager"]>>;

function stubTelegram(options: {
  version?: string;
  manager?: ManagerStub | null;
}): void {
  const app = {
    initData: "",
    version: options.version ?? "8.0",
    colorScheme: "light" as const,
    ready: vi.fn(),
    expand: vi.fn(),
    isVersionAtLeast: (wanted: string) =>
      Number.parseFloat(options.version ?? "8.0") >= Number.parseFloat(wanted),
    LocationManager: options.manager ?? undefined,
  };
  vi.stubGlobal("window", { ...globalThis.window, Telegram: { WebApp: app } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("formatCoordinate", () => {
  it("pins six places, past the accuracy of any phone", () => {
    expect(formatCoordinate(11.5564)).toBe("11.556400");
  });
});

describe("formatAccuracy", () => {
  it("reads as a tolerance, rounded to the metre", () => {
    expect(formatAccuracy(12.4)).toBe("±12 m");
  });

  it("says nothing when the instrument did not", () => {
    expect(formatAccuracy(null)).toBeNull();
    expect(formatAccuracy(undefined)).toBeNull();
  });
});

describe("locationProblem", () => {
  it("names the refusal so the person knows what to change", () => {
    expect(locationProblem(1)).toMatch(/refused/i);
  });

  it("falls back when there is no code to go on", () => {
    expect(locationProblem()).toMatch(/could not be found/i);
  });
});

describe("hasTelegramLocation", () => {
  it("is false outside Telegram", () => {
    expect(hasTelegramLocation(null)).toBe(false);
  });

  it("is false on a client older than Bot API 8.0", () => {
    stubTelegram({ version: "7.10", manager: { isInited: true } });

    expect(hasTelegramLocation(window.Telegram!.WebApp!)).toBe(false);
  });

  it("is false when the client claims the version but has no manager", () => {
    stubTelegram({ version: "8.0", manager: null });

    expect(hasTelegramLocation(window.Telegram!.WebApp!)).toBe(false);
  });

  it("is true on a client that has both", () => {
    stubTelegram({ version: "8.2", manager: { isInited: true } });

    expect(hasTelegramLocation(window.Telegram!.WebApp!)).toBe(true);
  });
});

describe("getFix", () => {
  it("asks Telegram when Telegram can answer", async () => {
    stubTelegram({
      manager: {
        isInited: true,
        isLocationAvailable: true,
        getLocation: (cb) =>
          cb({ latitude: 11.5564, longitude: 104.9282, horizontal_accuracy: 9 }),
      },
    });

    await expect(getFix()).resolves.toEqual({
      latitude: 11.5564,
      longitude: 104.9282,
      accuracy: 9,
      source: "telegram",
    });
  });

  it("initialises the manager first when it has not been", async () => {
    const init = vi.fn((cb?: () => void) => cb?.());
    stubTelegram({
      manager: {
        isInited: false,
        isLocationAvailable: true,
        init,
        getLocation: (cb) => cb({ latitude: 1, longitude: 2 }),
      },
    });

    await expect(getFix()).resolves.toMatchObject({ source: "telegram", accuracy: null });
    expect(init).toHaveBeenCalledOnce();
  });

  it("treats a null reading as a refusal it can offer to fix", async () => {
    stubTelegram({
      manager: { isInited: true, isLocationAvailable: true, getLocation: (cb) => cb(null) },
    });

    await expect(getFix()).rejects.toBeInstanceOf(LocationRefused);
    await expect(getFix()).rejects.toMatchObject({ canOpenSettings: true });
  });

  it("gives up plainly when the device cannot report a location at all", async () => {
    stubTelegram({
      manager: { isInited: true, isLocationAvailable: false, getLocation: vi.fn() },
    });

    await expect(getFix()).rejects.toMatchObject({ canOpenSettings: false });
  });

  it("falls back to the browser outside Telegram", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: (p: GeolocationPosition) => void) =>
          ok({ coords: { latitude: 3, longitude: 4, accuracy: 25 } } as GeolocationPosition),
      },
    });

    await expect(getFix()).resolves.toEqual({
      latitude: 3,
      longitude: 4,
      accuracy: 25,
      source: "browser",
    });
  });

  it("passes the browser's own refusal through in its own words", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (
          _ok: unknown,
          fail: (e: { code: number }) => void,
        ) => fail({ code: 1 }),
      },
    });

    await expect(getFix()).rejects.toThrow(/refused/i);
  });
});
