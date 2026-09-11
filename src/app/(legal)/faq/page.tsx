import type { Metadata } from "next";
import Link from "next/link";
import { FAQ } from "@/lib/faq";
import { FaqAccordion } from "@/components/faq-accordion";
import { COMPANY_MAILTO } from "@/lib/company";

export const metadata: Metadata = { title: "ხშირად დასმული კითხვები" };

export default function FaqPage() {
  return (
    <article className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ხშირად დასმული კითხვები</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ვერ იპოვე პასუხი?{" "}
          <a href={COMPANY_MAILTO} className="text-accent hover:underline">
            მოგვწერე
          </a>
        </p>
      </div>

      <FaqAccordion items={FAQ} />

      <p className="text-sm text-muted-foreground">
        იხ. აგრეთვე{" "}
        <Link href="/terms" className="text-accent hover:underline">წესები და პირობები</Link> და{" "}
        <Link href="/privacy" className="text-accent hover:underline">კონფიდენციალურობა</Link>.
      </p>
    </article>
  );
}
