import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/current";
import { ROLE_NAV } from "@/lib/nav";

export default async function DispatchLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("DISPATCHER");
  return (
    <AppShell roleLabel="დისპეჩერი" userName={session.name} nav={ROLE_NAV.DISPATCHER}>
      {children}
    </AppShell>
  );
}
