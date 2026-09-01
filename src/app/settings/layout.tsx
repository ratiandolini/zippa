import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/current";
import { ROLE_NAV, ROLE_LABEL } from "@/lib/nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <AppShell roleLabel={ROLE_LABEL[session.role]} userName={session.name} nav={ROLE_NAV[session.role]}>
      {children}
    </AppShell>
  );
}
