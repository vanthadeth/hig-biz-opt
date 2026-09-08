import { redirect } from "next/navigation";

/**
 * `OpenVisitPage` and `VisitRecord` both know the way back as `/${viewKey}/visits`
 * — the main app's own list. Footprint has no list of its own to be; its one
 * screen already is the day, so this only ever bounces there.
 */
export default function FootprintVisitsPage() {
  redirect("/footprint");
}
