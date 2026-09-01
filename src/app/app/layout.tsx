import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/current";
import { ROLE_NAV } from "@/lib/nav";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("CUSTOMER");
  return (
    <AppShell roleLabel="მომხმარებელი" userName={session.name} nav={ROLE_NAV.CUSTOMER}>
      {children}
    </AppShell>
  );
}
