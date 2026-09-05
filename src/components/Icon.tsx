import type { SVGProps } from "react";

/**
 * Icon keys are stored in the database (modules.icon, views.icon), so the set
 * here is the contract for what a seed row may reference. Unknown keys fall
 * back to a neutral square rather than rendering nothing.
 */
const PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5.25 9.75V20a1 1 0 0 0 1 1h3.5v-5.5h4.5V21h3.5a1 1 0 0 0 1-1V9.75",
  users:
    "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.38M15.5 4.2a3.25 3.25 0 0 1 0 6.1",
  building:
    "M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21M14 10h4.5A1.5 1.5 0 0 1 20 11.5V21M3 21h18M7.5 8h3M7.5 12h3M7.5 16h3M17 14h.01M17 17.5h.01",
  box: "M21 8.5 12 4 3 8.5m18 0L12 13M21 8.5v7L12 20m0-7L3 8.5M12 13v7M3 8.5v7L12 20",
  cart: "M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.47 1.3h8.26a1.5 1.5 0 0 0 1.47-1.2L20.5 8H6M10 20.5h.01M17 20.5h.01",
  file: "M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7l-4-4Zm0 0v4h4M9.5 12.5h5M9.5 16h5",
  wallet:
    "M3 8.5A2.5 2.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v1M3 8.5V17a2.5 2.5 0 0 0 2.5 2.5H18a2 2 0 0 0 2-2V15M3 8.5c0 1.38 1.12 2.5 2.5 2.5H21v4h-4.5a2 2 0 1 1 0-4H21",
  shield: "M12 3.5 5 6v5.5c0 4.2 2.87 7.6 7 9 4.13-1.4 7-4.8 7-9V6l-7-2.5Zm-2.5 8.8 1.9 1.9 3.6-3.9",
  refresh:
    "M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2M18 3v5h-5M6 21v-5h5",
  history:
    "M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 5v4h4M12 7.5V12l3 1.8",
  settings:
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm7.4-2.2a7.6 7.6 0 0 0 0-2l1.9-1.4-1.9-3.3-2.2.9a7.6 7.6 0 0 0-1.7-1l-.3-2.4h-3.8l-.3 2.4a7.6 7.6 0 0 0-1.7 1l-2.2-.9L3.3 9.6 5.2 11a7.6 7.6 0 0 0 0 2l-1.9 1.4 1.9 3.3 2.2-.9c.53.42 1.1.76 1.7 1l.3 2.4h3.8l.3-2.4c.6-.24 1.17-.58 1.7-1l2.2.9 1.9-3.3-1.9-1.4Z",
  grid: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",
  square: "M4 4h16v16H4V4Z",
  logout: "M15 17l5-5-5-5M20 12H9M12 20H6.5A1.5 1.5 0 0 1 5 18.5v-13A1.5 1.5 0 0 1 6.5 4H12",
  chevron: "m9 6 6 6-6 6",
  check: "m5 12.5 4.5 4.5L19 7.5",
  user: "M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0",
  menu: "M4 7h16M4 12h16M4 17h16",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4.05-4.05",
  trash: "M4 7h16M10 11v6M14 11v6M5.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h8a1.5 1.5 0 0 0 1.5-1.4L19 7M9 7V4.5h6V7",
  pencil: "M4 20h4L20 8l-4-4L4 16v4ZM14.5 5.5l4 4",
  phone:
    "M6.6 3.5h2.3l1.6 4-2 1.2a11 11 0 0 0 4.8 4.8l1.2-2 4 1.6v2.3a2.1 2.1 0 0 1-2.3 2.1A16.5 16.5 0 0 1 4.5 5.8 2.1 2.1 0 0 1 6.6 3.5Z",
  send: "M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4L21 3Z",
  mail: "M3.5 6.5h17v11h-17v-11ZM3.5 7l8.5 6 8.5-6",
  bank: "M3.5 9.5 12 4.5l8.5 5M5.5 9.5v8M10 9.5v8M14 9.5v8M18.5 9.5v8M3.5 20.5h17",
  calendar: "M7 3v3M17 3v3M3.5 8.5h17M4.5 5.5h15v15h-15v-15Z",
  plus: "M12 5v14M5 12h14",
  pin: "M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  dots: "M12 6.5h.01M12 12h.01M12 17.5h.01",
  bolt: "M13 3 5.5 13.5H12l-1 7.5 7.5-10.5H12l1-7.5Z",
  chart: "M4 20V10M10 20V4M16 20v-6M22 20H2",
  bell: "M18 8.5a6 6 0 1 0-12 0c0 5-2.5 6.5-2.5 6.5h17S18 13.5 18 8.5ZM13.7 19a2 2 0 0 1-3.4 0",
  inbox:
    "M3.5 13.5h4l1.2 2.2h6.6l1.2-2.2h4M4.6 5.6l-1.1 7.9v3a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3l-1.1-7.9a2 2 0 0 0-2-1.6H6.6a2 2 0 0 0-2 1.6Z",
  sun: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2.5v2M12 19.5v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2.5 12h2M19.5 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42",
  moon: "M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z",
  display:
    "M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM9 20.5h6M12 16.5v4",
};

type IconProps = SVGProps<SVGSVGElement> & { name: string };

export function Icon({ name, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={PATHS[name] ?? PATHS.square} />
    </svg>
  );
}
