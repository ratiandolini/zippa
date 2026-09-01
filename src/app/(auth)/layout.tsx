import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-muted/40 px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        {children}
        <div className="mt-6 flex justify-center gap-4 text-xs text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground">წესები</Link>
          <Link href="/privacy" className="hover:text-foreground">კონფიდენციალურობა</Link>
        </div>
      </div>
    </div>
  );
}
