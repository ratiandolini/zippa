import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { COMPANY, COMPANY_MAILTO } from "@/lib/company";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/">
            <Logo />
          </Link>
          <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            მთავარი
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl space-y-3 px-5 py-6 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/pricing" className="hover:text-foreground">ფასები</Link>
            <Link href="/faq" className="hover:text-foreground">კითხვები</Link>
            <Link href="/terms" className="hover:text-foreground">წესები და პირობები</Link>
            <Link href="/privacy" className="hover:text-foreground">კონფიდენციალურობა</Link>
            <span className="ml-auto">© 2026 Zippa</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <a href={COMPANY.phoneHref} className="hover:text-foreground">{COMPANY.phone}</a>
            <a href={COMPANY_MAILTO} className="hover:text-foreground">{COMPANY.email}</a>
            <span>{COMPANY.name}</span>
            <span>ს/კ {COMPANY.taxId}</span>
            <span>{COMPANY.address}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
