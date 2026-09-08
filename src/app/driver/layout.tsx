import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/current";
import { ROLE_NAV } from "@/lib/nav";
import { DriverLocationPinger } from "@/components/driver-location-pinger";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("DRIVER");
  return (
    <AppShell roleLabel="კურიერი" userName={session.name} nav={ROLE_NAV.DRIVER}>
      <DriverLocationPinger />
      {children}
    </AppShell>
  );
}
