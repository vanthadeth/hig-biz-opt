/**
 * The wordmark, in whichever variant suits the current theme.
 *
 * Both files are in the markup and CSS hides one (see the [data-logo] rules in
 * globals.css), so the right mark is painted on the first frame — no JavaScript,
 * nothing to hydrate, and no flicker when switching theme.
 *
 * Swapping in real artwork means replacing public/logo-light.svg and
 * public/logo-dark.svg. Nothing here changes.
 */
export function Logo({ className = "h-7" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      {/* Plain <img>: these are fixed-size static SVGs, so next/image would add
          machinery without buying anything. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-light.svg" alt="HIG" data-logo="light" className="h-full w-auto" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-dark.svg" alt="" aria-hidden="true" data-logo="dark" className="h-full w-auto" />
    </span>
  );
}
