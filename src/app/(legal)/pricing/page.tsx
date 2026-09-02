import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ფასები",
  description: "Zippa-ს ტარიფები — მიტანის ფასი წონისა და ზონის მიხედვით. თბილისი, რეგიონული ქალაქები, დაბა/სოფელი.",
};

const ROWS: [string, string, string, string][] = [
  ["0–6 კგ", "5 ₾", "7 ₾", "11 ₾"],
  ["6–10 კგ", "6 ₾", "9 ₾", "13 ₾"],
  ["10–15 კგ", "8 ₾", "12 ₾", "16 ₾"],
  ["15–20 კგ", "10 ₾", "15 ₾", "19 ₾"],
  ["20–30 კგ", "13 ₾", "19 ₾", "23 ₾"],
  ["30–40 კგ", "16 ₾", "28 ₾", "33 ₾"],
  ["40–50 კგ", "20 ₾", "38 ₾", "43 ₾"],
];

export default function PricingPage() {
  return (
    <article className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ფასები</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          მიტანის საფასური განისაზღვრება ამანათის წონითა და მიტანის ზონით. ზუსტ თანხას შეკვეთის
          გაფორმებისას, გადახდამდე ნახავ.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-4 py-3 font-medium">წონა</th>
              <th className="px-4 py-3 text-right font-medium">თბილისი</th>
              <th className="px-4 py-3 text-right font-medium">რეგიონული ქალაქი</th>
              <th className="px-4 py-3 text-right font-medium">დაბა / სოფელი</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([w, a, b, c]) => (
              <tr key={w} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{w}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{a}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{b}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="ml-5 list-disc space-y-1.5 text-sm text-muted-foreground">
        <li>ნაღდი ანგარიშსწორებისას (COD) შესაძლოა დაერიცხოს მცირე საკომისიო.</li>
        <li>20 კგ-ზე მეტი ან არასტანდარტული ზომის გზავნილი მიიღება წინასწარი შეთანხმებით.</li>
        <li>თბილისში 16:00-მდე გაფორმებული შეკვეთა, როგორც წესი, იმავე დღეს მიდის.</li>
        <li>რეგიონული ქალაქები — მეორე დღეს, დაბა/სოფელი — 2 სამუშაო დღეში (სავარაუდო).</li>
      </ul>

      <p className="text-sm text-muted-foreground">
        დეტალები —{" "}
        <Link href="/terms" className="text-accent hover:underline">წესები და პირობები</Link>,{" "}
        <Link href="/faq" className="text-accent hover:underline">ხშირად დასმული კითხვები</Link>.
      </p>
    </article>
  );
}
