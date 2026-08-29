import { redirect } from "next/navigation";
import { resolveEntryPath } from "@/lib/access";

export default async function RootPage() {
  redirect(await resolveEntryPath());
}
