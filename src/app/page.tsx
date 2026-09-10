import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { appUrl } from "@/lib/app-url";
import { COMPANY, COMPANY_MAILTO } from "@/lib/company";

export const metadata: Metadata = {
  title: "Zippa — საკურიერო სერვისი | თბილისი და საქართველოს რეგიონები",
  description:
    "გააგზავნე ამანათი თბილისში ან საქართველოს რეგიონებში. გამჭვირვალე ფასი წონისა და ზონის მიხედვით, ცოცხალი რუკა, დადასტურებული კურიერები. თბილისში 5 ₾-დან.",
  keywords: [
    "საკურიერო",
    "კურიერი",
    "ამანათის მიტანა",
    "მიწოდება",
    "თბილისი",
    "საქართველო",
    "courier",
    "delivery",
    "Georgia",
    "Zippa",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Zippa — საკურიერო სერვისი | თბილისი და საქართველოს რეგიონები",
    description:
      "ამანათის მიტანა თბილისში და რეგიონებში. გამჭვირვალე ფასი, ცოცხალი რუკა, დადასტურებული კურიერები.",
    url: "/",
    siteName: "Zippa",
    locale: "ka_GE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Zippa — საკურიერო სერვისი",
    description: "ამანათის მიტანა თბილისსა და საქართველოს რეგიონებში.",
  },
};
import { buttonVariants } from "@/components/ui/button";
import { TrackSearch } from "@/components/track-search";
import { MobileStickyCta } from "@/components/mobile-sticky-cta";
import Image from "next/image";
import { MapPin, Clock, ShieldCheck, Wallet, ArrowRight } from "lucide-react";
import { FAQ } from "@/lib/faq";
import { FaqAccordion } from "@/components/faq-accordion";

function Photo({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={"relative overflow-hidden rounded-xl bg-muted " + (className ?? "")}>
      <Image src={src} alt={alt} fill sizes="(max-width: 768px) 100vw, 600px" className="object-cover" />
    </div>
  );
}

const features = [
  { icon: Clock, title: "სწრაფი მიტანა", text: "თბილისში 16:00-მდე გაფორმებული შეკვეთა — იმავე დღეს. რეგიონებში მიწოდების სავარაუდო ვადა ნაჩვენებია შეკვეთის დადასტურებამდე." },
  { icon: MapPin, title: "ცოცხალი რუკა", text: "ნახე რუკაზე სად არის ამანათი და კურიერი — რეალურ დროში." },
  { icon: Wallet, title: "მარტივი გადახდა", text: "მიტანის საფასურს ნაღდით იხდი კურიერთან. მაღაზიებს კურიერი ნივთის ფასსაც ჩააბარებინებს მიმღებს." },
  { icon: ShieldCheck, title: "საიმედოობა", text: "დადასტურებული კურიერები, მიტანის ფოტო-დადასტურება." },
];

const steps: [string, string, string][] = [
  ["1", "შექმენი შეკვეთა", "მიუთითე საიდან სად, წონა და მიმღები"],
  ["2", "კურიერი მიიღებს", "დისპეჩერი უახლოეს კურიერს მიანიჭებს, კურიერი ადასტურებს"],
  ["3", "ნახე რუკაზე", "აკონტროლე მიტანა რეალურ დროში"],
  ["4", "მიღება", "მიმღები ადასტურებს — შეკვეთა დასრულდა"],
];

function JsonLd() {
  const base = appUrl();
  const data = {
    "@context": "https://schema.org",
    "@type": "MovingCompany",
    name: COMPANY.brand,
    legalName: COMPANY.name,
    description: "საკურიერო სერვისი — თბილისი და საქართველოს რეგიონები",
    url: base,
    areaServed: { "@type": "Country", name: "Georgia" },
    address: {
      "@type": "PostalAddress",
      streetAddress: "მინდელის ქ. 3",
      addressLocality: "თბილისი",
      addressCountry: "GE",
    },
    email: COMPANY.email,
    telephone: COMPANY.phoneHref.replace("tel:", ""),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <JsonLd />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            შესვლა
          </Link>
          <Link href="/register" className={buttonVariants({ size: "sm" })}>
            რეგისტრაცია
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-10 sm:pt-16 lg:grid-cols-2">
        <div className="max-w-xl">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            თბილისი და საქართველოს რეგიონები
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.25] sm:text-5xl">
            საკურიერო სერვისი,
            <br className="hidden sm:block" /> რომელსაც ენდობი
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            გააგზავნე ამანათი ქალაქში ან ქალაქებს შორის. გამჭვირვალე ფასი,
            ცოცხალი რუკა და დადასტურებული კურიერები.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              id="hero-cta"
              href="/register?role=CUSTOMER"
              className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}
            >
              ამანათის გაგზავნა <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/register?role=DRIVER"
              className={buttonVariants({ size: "lg", variant: "outline", className: "w-full sm:w-auto" })}
            >
              გახდი კურიერი
            </Link>
          </div>
          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="font-medium">თბილისში 5 ₾-დან</span>
            <Link href="/pricing" className="text-accent hover:underline">
              ნახე ფასები →
            </Link>
          </div>
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-muted-foreground">ამანათის მოძებნა ნომრით</p>
            <TrackSearch />
          </div>
        </div>
        <Photo src="/photos/hero-courier.jpg" alt="კურიერი ამანათით" className="aspect-[4/3] w-full" />
      </section>

      {/* დეკორატიული ფოტოები — მობილურზე დამალული */}
      <section className="mx-auto hidden max-w-6xl px-5 pb-16 sm:block">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Photo src="/photos/parcels.jpg" alt="ამანათები" className="aspect-square" />
          <Photo src="/photos/courier-transport.jpg" alt="კურიერი ტრანსპორტით" className="aspect-square" />
          <Photo src="/photos/customer.jpg" alt="კმაყოფილი მომხმარებელი" className="aspect-square" />
        </div>
      </section>

      <section className="border-y border-border bg-muted/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-14 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title}>
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-background shadow-card">
                <f.icon className="h-5 w-5 text-accent" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-semibold">როგორ მუშაობს</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([n, title, text]) => (
            <div key={n} className="rounded-xl border border-border bg-card p-5 shadow-card">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                {n}
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <h2 className="text-2xl font-semibold">ხშირად დასმული კითხვები</h2>
          <div className="mt-8">
            <FaqAccordion items={FAQ.slice(0, 4)} />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            <Link href="/faq" className="text-accent hover:underline">ყველა კითხვა →</Link>
          </p>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 text-sm text-muted-foreground sm:grid-cols-2">
          <div className="space-y-3">
            <Logo className="text-foreground" />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link href="/pricing" className="hover:text-foreground">ფასები</Link>
              <Link href="/faq" className="hover:text-foreground">კითხვები</Link>
              <Link href="/terms" className="hover:text-foreground">წესები და პირობები</Link>
              <Link href="/privacy" className="hover:text-foreground">კონფიდენციალურობა</Link>
            </div>
            <p>© 2026 Zippa</p>
          </div>
          <div className="space-y-1 sm:text-right">
            <p className="font-medium text-foreground">კონტაქტი</p>
            <p>
              <a href={COMPANY.phoneHref} className="hover:text-foreground">{COMPANY.phone}</a>
            </p>
            <p>
              <a href={COMPANY_MAILTO} className="hover:text-foreground">{COMPANY.email}</a>
            </p>
            <p>{COMPANY.name}</p>
            <p>ს/კ: {COMPANY.taxId}</p>
            <p>{COMPANY.address}</p>
          </div>
        </div>
      </footer>

      {/* მობილურის sticky CTA — ჩნდება მხოლოდ Hero CTA-ს viewport-ს გასვლის შემდეგ */}
      <MobileStickyCta />
    </div>
  );
}
