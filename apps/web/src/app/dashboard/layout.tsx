import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { DashboardNav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-6 md:grid-cols-[260px_1fr]">
      <DashboardNav session={session} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
