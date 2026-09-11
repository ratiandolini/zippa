import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMPANY, COMPANY_MAILTO } from "@/lib/company";
import { RETURN_FEE_PCT } from "@/lib/domain";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("საკონტაქტო კონფიგი — ერთი წყარო", () => {
  it("COMPANY.email არის კომპანიის ახალი ელფოსტა (არა პირადი, არა support@zippa.ge)", () => {
    expect(COMPANY.email).toBe("support.zippa@gmail.com");
    expect(COMPANY.email).not.toMatch(/@zippa\.ge$/);
    expect(COMPANY_MAILTO).toBe(`mailto:${COMPANY.email}`);
  });

  it("COMPANY შეიცავს რეკვიზიტებს და არა პირად ტელეფონს", () => {
    expect(COMPANY.name).toBe("ინდ. მეწარმე რატი კურტანიძე");
    expect(COMPANY.taxId).toBe("01008043044");
    expect(COMPANY.address).toBe("თბილისი, მინდელის ქ. 3");
    expect(COMPANY).not.toHaveProperty("phone");
    expect(COMPANY).not.toHaveProperty("phoneHref");
  });

  const PUBLIC_FILES = [
    "src/app/page.tsx",
    "src/app/(legal)/faq/page.tsx",
    "src/app/(legal)/privacy/page.tsx",
    "src/app/(legal)/terms/page.tsx",
    "src/app/(legal)/layout.tsx",
    "src/lib/push.ts",
    "src/lib/nominatim.ts",
    "src/lib/company.ts",
    "src/app/receipt/[id]/page.tsx",
  ];

  it("არსად src-ში არ ჩანს support@zippa.ge", () => {
    for (const f of PUBLIC_FILES) {
      expect(read(f), `${f} შეიცავს support@zippa.ge-ს`).not.toContain("support@zippa.ge");
    }
  });

  it("არსად საჯარო კოდში არ ჩანს ძველი პირადი ელფოსტა", () => {
    for (const f of PUBLIC_FILES) {
      expect(read(f), `${f} შეიცავს ratiandolini@gmail.com-ს`).not.toContain(
        "ratiandolini@gmail.com",
      );
      expect(read(f), `${f} შეიცავს ratir1991@gmail.com-ს`).not.toContain(
        "ratir1991@gmail.com",
      );
    }
  });

  it("არსად საჯარო კოდში არ ჩანს პირადი ტელეფონის ნომერი", () => {
    for (const f of PUBLIC_FILES) {
      expect(read(f), `${f} შეიცავს ტელეფონის ნომერს`).not.toMatch(/598[\s-]?42[\s-]?32[\s-]?34/);
      expect(read(f), `${f} შეიცავს tel: href-ს`).not.toContain("tel:+995598423234");
    }
  });
});

describe("დაბრუნების ტარიფის გამჭვირვალობა", () => {
  const SENTENCE =
    "ამანათის კურიერისთვის გადაცემის შემდეგ გაუქმებისას დაბრუნების ტარიფი შეადგენს შესაბამისი მიტანის ფასის 50%-ს";

  it("RETURN_FEE_PCT უდრის 50%-ს (ტექსტი ემთხვევა ლოგიკას)", () => {
    expect(RETURN_FEE_PCT).toBe(0.5);
  });

  it("ფასების გვერდი შეიცავს 50%-იან წესს", () => {
    // ტექსტი შესაძლოა გატეხილი იყოს ხაზებად — ვამოწმებთ თეთრსივცისგან გაწმენდილს
    const src = read("src/app/(legal)/pricing/page.tsx").replace(/\s+/g, " ");
    expect(src).toContain(SENTENCE);
  });

  it("წესები და პირობები შეიცავს 50%-იან წესს", () => {
    const src = read("src/app/(legal)/terms/page.tsx").replace(/\s+/g, " ");
    expect(src).toContain(SENTENCE);
  });
});

describe("CASH-only launch — ბარათი/SMS არსად არ იპირება", () => {
  const terms = read("src/app/(legal)/terms/page.tsx");
  const privacy = read("src/app/(legal)/privacy/page.tsx");
  const newOrder = read("src/app/app/new/page.tsx");
  const forgot = read("src/app/(auth)/forgot/page.tsx");

  it("Terms — არ ახსენებს ბარათით გადახდას ან გადახდის პროვაიდერს", () => {
    expect(terms).not.toContain("ბარათით");
    expect(terms).not.toContain("გადახდის პროვაიდერ");
    expect(terms).not.toContain("ონლაინ გადახდილი");
  });

  it("Terms — მიტანის საფასური = ნაღდი კურიერთან; COD ცალკე განმარტებით", () => {
    const t = terms.replace(/\s+/g, " ");
    expect(t).toContain("მიტანის საფასურს მომხმარებელი იხდის ნაღდი ანგარიშსწორებით კურიერთან");
    expect(t).toContain("COD (Cash on Delivery)");
    expect(t).toContain("კურიერი მიმღებისგან ნაღდად");
    expect(t).toContain("გამგზავნს უბრუნებს შეთანხმებული მეთოდით");
  });

  it("Privacy — არ ახსენებს გადახდის პროვაიდერს ან ბარათს", () => {
    expect(privacy).not.toContain("გადახდის პროვაიდერ");
    expect(privacy).not.toContain("ბარათის");
    expect(privacy).not.toContain("CVV");
  });

  it("Terms/Privacy/forgot — SMS არსად არ იპირება მომხმარებელს", () => {
    expect(terms).not.toContain("SMS");
    expect(privacy).not.toContain("SMS");
    expect(forgot).not.toContain("SMS");
    expect(forgot).not.toContain("ტელეფონი ან ელფოსტა");
  });

  it("new-order UI — CARD არჩევანი არ არსებობს, deliveryProof default PHOTO", () => {
    expect(newOrder).toContain('const payment = "CASH" as const');
    expect(newOrder).not.toMatch(/"CARD"/);
    expect(newOrder).toContain('useState<"PHOTO" | "PIN" | "NONE">("PHOTO")');
  });

  it("PIN — მიმღები კურიერს ეუბნება კოდს (SMS-ით არ იგზავნება)", () => {
    expect(newOrder).toContain("მიმღები კურიერს ეტყვის 4-ნიშნა კოდს");
    const track = read("src/app/app/track/page.tsx");
    expect(track).toContain("გადაეცი ეს კოდი მიმღებს");
  });
});

describe("რუკა — Geoapify + OpenStreetMap fallback", () => {
  const tiles = read("src/lib/map-tiles.ts");
  const map = read("src/components/map.tsx");
  const picker = read("src/components/map-picker.tsx");

  it("Geoapify key-ს იყენებს, key-ის გარეშე OSM fallback", () => {
    expect(tiles).toContain("NEXT_PUBLIC_GEOAPIFY_KEY");
    expect(tiles).toContain("maps.geoapify.com/v1/tile");
    expect(tiles).toContain("tile.openstreetmap.org"); // fallback
  });

  it("attribution — Geoapify + OpenStreetMap", () => {
    expect(tiles).toContain("Geoapify");
    expect(tiles).toContain("OpenStreetMap");
  });

  it("map კომპონენტები საერთო tileConfig-ს იყენებენ (არა hard-coded URL)", () => {
    expect(map).toContain("tileConfig");
    expect(picker).toContain("tileConfig");
    expect(map).not.toContain("{s}.tile.openstreetmap.org");
    expect(picker).not.toContain("{s}.tile.openstreetmap.org");
  });

  it("geocoding — Geoapify key-ს იყენებს, key-ის გარეშე Nominatim fallback", () => {
    const geo = read("src/lib/nominatim.ts");
    expect(geo).toContain("api.geoapify.com/v1/geocode");
    expect(geo).toContain("GEOAPIFY_KEY ? await geoapifySearch");
    expect(geo).toContain("nominatimSearchRaw"); // fallback
  });
});

describe("მთავარი გვერდი — მობილური გამარტივება", () => {
  const home = read("src/app/page.tsx");

  it("Hero-ს მთავარი CTA არის „ამანათის გაგზავნა“", () => {
    expect(home).toContain("ამანათის გაგზავნა");
    expect(home).not.toContain("შეკვეთის გაფორმება");
  });

  it("დეკორატიული ფოტოების სექცია მობილურზე დამალულია", () => {
    expect(home).toMatch(/hidden[^"]*sm:block/);
  });

  it("FAQ მთავარ გვერდზე — მხოლოდ 4 კითხვა", () => {
    expect(home).toContain("FAQ.slice(0, 4)");
  });

  it("Hero CTA-ს აქვს id=\"hero-cta\" (sticky CTA-ს observer-ის სამიზნე)", () => {
    expect(home).toContain('id="hero-cta"');
  });

  it("sticky CTA ცალკე კლიენტ-კომპონენტშია, არა inline მუდმივად ხილული", () => {
    expect(home).toContain("<MobileStickyCta />");
    // page.tsx-ში „ამანათის გაგზავნა“ ზუსტად ერთხელ — მხოლოდ Hero CTA
    // (sticky CTA-ს ტექსტი კომპონენტშია; საწყის ეკრანზე დუბლიკატი არ ჩანს)
    expect(home.match(/ამანათის გაგზავნა/g)).toHaveLength(1);
    expect(home).not.toContain("fixed inset-x-0 bottom-0");
  });

  it("ზედმეტად ფართო დაპირება მოხსნილია", () => {
    expect(home).not.toContain("მთელი საქართველოს მასშტაბით");
    expect(home).toContain("თბილისი და საქართველოს რეგიონები");
  });
});

describe("მობილურის sticky CTA — დუბლირება საწყის ეკრანზე არ ჩანს", () => {
  const cta = read("src/components/mobile-sticky-cta.tsx");

  it("კლიენტ-კომპონენტია და IntersectionObserver-ს იყენებს", () => {
    expect(cta).toContain('"use client"');
    expect(cta).toContain("IntersectionObserver");
  });

  it("საწყისი მდგომარეობა — დამალული (useState(false))", () => {
    expect(cta).toMatch(/useState\(\s*false\s*\)/);
  });

  it("Hero CTA-ს (id=\"hero-cta\") აკვირდება და მისი გამოჩენისას იმალება", () => {
    expect(cta).toContain('getElementById("hero-cta")');
    expect(cta).toContain("!entry.isIntersecting");
  });

  it("დამალულ მდგომარეობაში — pointer-events-none + opacity-0 (ვიზუალურად და ინტერაქციულად გამორთული)", () => {
    expect(cta).toContain("pointer-events-none opacity-0");
    expect(cta).toContain('tabIndex={show ? 0 : -1}');
  });

  it("desktop-ზე საერთოდ არ ჩანს (sm:hidden), safe-area padding შენარჩუნებულია", () => {
    expect(cta).toContain("sm:hidden");
    expect(cta).toContain("env(safe-area-inset-bottom)");
  });
});

describe("კურიერის ბარათი — ანაზღაურების ტექსტი გამართული", () => {
  const card = read("src/components/driver-order-card.tsx");

  it("„შენ ერიცხება“ აღარ არის (გრამატიკულად არასწორი)", () => {
    expect(card).not.toContain("შენ ერიცხება");
  });

  it("გამოიყენება გამართული ფორმა „გერიცხება“", () => {
    expect(card).toContain('"გერიცხება"');
    expect(card).toContain("მიღების შემთხვევაში გერიცხება");
  });
});

describe("DB backup workflow — pg_dump-ის შეცდომა pipe-ში არ იკარგება", () => {
  const wf = read(".github/workflows/db-backup.yml");

  it("Dump ნაბიჯში ჩართულია set -euo pipefail", () => {
    const dumpStep = wf.slice(wf.indexOf("Dump database"));
    expect(dumpStep).toContain("set -euo pipefail");
  });

  it("pg_dump ცალკე ფაილში იწერება (არა gzip-ის pipe-ში)", () => {
    // pg_dump | gzip pattern აღარ არსებობს — exit code იკარგებოდა
    expect(wf).not.toMatch(/pg_dump[^\n|]*\|\s*gzip/);
    expect(wf).toMatch(/pg_dump[^\n]*>\s*"\$RAW"/);
  });

  it("dump ვალიდირდება — ზომა, PostgreSQL მარკერი, ცხრილი/მონაცემი", () => {
    expect(wf).toContain('"$BYTES" -lt 2048');
    expect(wf).toContain('grep -q "PostgreSQL database dump"');
    expect(wf).toMatch(/grep -qE '.*CREATE TABLE/);
  });

  it("gzip-ის მთლიანობა მოწმდება (gzip -t)", () => {
    expect(wf).toContain("gzip -t");
  });

  it("pg_dump 18.x-იდან — postgres:18 container (Neon server 18.x)", () => {
    expect(wf).toMatch(/container:\s*\n\s*image:\s*postgres:18/);
  });

  it("pg_dump ვერსია 18.x-ზე მკაცრად მოწმდება — არა 18.x → workflow ვარდება", () => {
    expect(wf).toContain("pg_dump --version");
    expect(wf).toContain('*"(PostgreSQL) 18."*)');
    // არა-18 ვერსიაზე workflow ვარდება
    expect(wf).toMatch(/pg_dump არ არის 18\.x[^\n]*exit 1/);
  });

  it("client 16-ის apt-install-ზე აღარ ვეყრდნობით", () => {
    expect(wf).not.toContain("postgresql-client-16");
    expect(wf).not.toContain("postgresql-client-17");
  });
});

describe("რეგისტრაცია — როლის პარამეტრით პირდაპირი ფორმა", () => {
  const reg = read("src/app/(auth)/register/page.tsx");
  it("roleLocked ლოგიკა არსებობს", () => {
    expect(reg).toContain("roleLocked");
    expect(reg).toContain('roleParam === "CUSTOMER" || roleParam === "DRIVER"');
  });
  it("როლის არჩევის ბლოკი იმალება როცა roleLocked", () => {
    expect(reg).toContain("{!roleLocked && (");
  });
  it("კურიერზე გადასვლის ლინკი", () => {
    expect(reg).toContain("კურიერი ხარ? დარეგისტრირდი კურიერად");
    expect(reg).toContain("/register?role=DRIVER");
  });
});
