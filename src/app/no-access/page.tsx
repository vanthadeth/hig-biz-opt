import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyViews, requireViewer } from "@/lib/access";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata: Metadata = { title: "No access" };

export default async function NoAccessPage() {
  const viewer = await requireViewer();
  const views = await getMyViews();

  // If access has since been granted, do not strand the user here.
  if (views.length === 1) redirect(`/${views[0].key}/home`);
  if (views.length > 1) redirect("/select-view");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">No view assigned</h1>
      <p className="mt-2 text-sm text-muted">
        {viewer.full_name}, your account does not have access to any view yet. Ask a
        system administrator to assign one.
      </p>
      <div className="mt-8">
        <SignOutButton />
      </div>
    </main>
  );
}
