/**
 * Getting a fix, from whichever instrument this device has.
 *
 * The formatters here are copied from the web app's src/lib/customers.ts rather
 * than imported: this is a separate project with its own package.json, and
 * sharing a dozen lines of pure arithmetic is not worth turning the repository
 * into a workspace. If they ever disagree, this file is the one that is wrong.
 */

/** Six places is roughly a tenth of a metre — past the accuracy of any phone. */
export const COORDINATE_PLACES = 6;

/** Which instrument answered. Stored, because they are not equivalent. */
export type LocationSource = "telegram" | "browser";

export type Fix = {
  latitude: number;
  longitude: number;
  /** The reading's own claim about itself, in metres. Null when it did not say. */
  accuracy: number | null;
  source: LocationSource;
};

export function formatCoordinate(value: number): string {
  return value.toFixed(COORDINATE_PLACES);
}

export function formatAccuracy(metres: number | null | undefined): string | null {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return null;
  return `±${Math.round(metres)} m`;
}

/** GeolocationPositionError codes, in the words somebody standing outside needs. */
export const GEOLOCATION_MESSAGES: Record<number, string> = {
  1: "Location access was refused. Allow it and try again.",
  2: "Your location is not available right now.",
  3: "Finding your location took too long.",
};

export function locationProblem(code?: number): string {
  if (code !== undefined && GEOLOCATION_MESSAGES[code]) return GEOLOCATION_MESSAGES[code];
  return "Your location could not be found.";
}

/** What Telegram's LocationManager hands back. Everything but the pair is optional. */
type TelegramLocation = {
  latitude: number;
  longitude: number;
  horizontal_accuracy?: number | null;
};

type LocationManager = {
  isInited: boolean;
  isLocationAvailable: boolean;
  isAccessGranted: boolean;
  isAccessRequested: boolean;
  init: (callback?: () => void) => void;
  getLocation: (callback: (location: TelegramLocation | null) => void) => void;
  openSettings: () => void;
};

export type TelegramWebApp = {
  initData: string;
  version: string;
  colorScheme: "light" | "dark";
  ready: () => void;
  expand: () => void;
  isVersionAtLeast: (version: string) => boolean;
  LocationManager?: LocationManager;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function telegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/**
 * Telegram's location manager arrived in Bot API 8.0. An older client — and
 * there are plenty on phones this team already carries — has the object missing
 * entirely, so both the version and the property are checked.
 */
export function hasTelegramLocation(app: TelegramWebApp | null): boolean {
  if (!app?.LocationManager) return false;
  try {
    return app.isVersionAtLeast("8.0");
  } catch {
    return false;
  }
}

export class LocationRefused extends Error {
  /** True when Telegram can send the person somewhere to change their mind. */
  readonly canOpenSettings: boolean;

  constructor(message: string, canOpenSettings: boolean) {
    super(message);
    this.name = "LocationRefused";
    this.canOpenSettings = canOpenSettings;
  }
}

/**
 * A fix from Telegram when it can give one, and from the browser otherwise.
 *
 * Telegram is asked first because inside its webview it is the one that can
 * actually prompt: the browser's own permission dialog is unreliable there, and
 * on some builds never appears at all.
 */
export async function getFix(): Promise<Fix> {
  const app = telegramWebApp();
  if (hasTelegramLocation(app)) return telegramFix(app!);
  return browserFix();
}

function telegramFix(app: TelegramWebApp): Promise<Fix> {
  const manager = app.LocationManager!;

  return new Promise((resolve, reject) => {
    const request = () => {
      if (!manager.isLocationAvailable) {
        reject(new LocationRefused("This device cannot report its location.", false));
        return;
      }

      manager.getLocation((location) => {
        // A null reading is Telegram's way of saying the person said no.
        if (!location) {
          reject(
            new LocationRefused(
              "Location access was refused. Allow it and try again.",
              true,
            ),
          );
          return;
        }

        resolve({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.horizontal_accuracy ?? null,
          source: "telegram",
        });
      });
    };

    if (manager.isInited) request();
    else manager.init(request);
  });
}

function browserFix(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new LocationRefused(locationProblem(), false));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: "browser",
        }),
      (error) => reject(new LocationRefused(locationProblem(error.code), false)),
      // The same three as the customer form: a shop's pin and a punch want the
      // same thing from the hardware.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}
