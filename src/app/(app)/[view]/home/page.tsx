import { getHomeSummary, greetingFor } from "@/lib/dashboard";
import { HomeDashboard } from "./HomeDashboard";

export default async function Page() {
  const summary = await getHomeSummary();

  // Resolved on the server so the greeting and date do not flip during
  // hydration, and so the whole dashboard can render in one pass.
  const now = new Date();
  const today = now.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return <HomeDashboard summary={summary} greeting={greetingFor(now)} today={today} />;
}
