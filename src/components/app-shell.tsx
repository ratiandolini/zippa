"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { PushSetup } from "@/components/push-setup";

function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground", className)}
    >
      <LogOut className="h-4 w-4" /> გამოსვლა
    </button>
  );
}

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export function AppShell({
  nav,
  roleLabel,
  userName,
  push,
  children,
}: {
  nav: NavItem[];
  roleLabel: string;
  userName: string;
  push?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-background lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active(item.href)
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="h-4 w-4">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-border p-4">
          <div className="text-xs text-muted-foreground">{roleLabel} · {userName}</div>
          <LogoutButton />
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/80 px-5 backdrop-blur">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Link
              href="/settings"
              className="flex items-center gap-2 rounded-full p-0.5 hover:bg-muted"
              title="პარამეტრები"
            >
              <span className="hidden text-sm text-muted-foreground sm:block">{userName}</span>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                {userName.slice(0, 1)}
              </span>
            </Link>
            <LogoutButton className="lg:hidden" />
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-5 py-6 pb-24 lg:pb-6">
          {push && <PushSetup />}
          {children}
        </main>
      </div>

      {/* Bottom tab bar — mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div
          className={cn(
            "flex",
            nav.length > 5
              ? "gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "mx-auto max-w-md",
          )}
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[10px] font-medium leading-tight transition-colors",
                nav.length > 5 ? "w-16 shrink-0" : "min-w-0 flex-1 px-1",
                active(item.href) ? "text-accent" : "text-muted-foreground",
              )}
            >
              <span className="h-5 w-5">{item.icon}</span>
              <span className={cn("text-center", nav.length > 5 ? "" : "truncate")}>
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
