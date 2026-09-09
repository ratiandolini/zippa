import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMPANY, COMPANY_MAILTO } from "@/lib/company";
import { RETURN_FEE_PCT } from "@/lib/domain";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("საკონტაქტო კონფიგი — ერთი წყარო", () => {
  it("COMPANY.email რეალურია (არა support@zippa.ge)", () => {
    expect(COMPANY.email).toBe("ratiandolini@gmail.com");
    expect(COMPANY.email).not.toMatch(/@zippa\.ge$/);
    expect(COMPANY_MAILTO).toBe(`mailto:${COMPANY.email}`);
  });

  it("COMPANY შეიცავს რეკვიზიტებს", () => {
    expect(COMPANY.name).toBe("ინდ. მეწარმე რატი კურტანიძე");
    expect(COMPANY.taxId).toBe("01008043044");
    expect(COMPANY.address).toBe("თბილისი, მინდელის ქ. 3");
    expect(COMPANY.phone).toBe("+995 598 42 32 34");
    expect(COMPANY.phoneHref).toBe("tel:+995598423234");
  });

  it("არსად src-ში არ ჩანს support@zippa.ge", () => {
    const files = [
      "src/app/page.tsx",
      "src/app/(legal)/faq/page.tsx",
      "src/app/(legal)/privacy/page.tsx",
      "src/app/(legal)/terms/page.tsx",
      "src/app/(legal)/layout.tsx",
      "src/lib/push.ts",
      "src/lib/nominatim.ts",
      "src/lib/company.ts",
    ];
    for (const f of files) {
      expect(read(f), `${f} შეიცავს support@zippa.ge-ს`).not.toContain("support@zippa.ge");
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

  it("sticky CTA მიდის მომხმარებლის რეგისტრაციაზე, safe-area padding-ით", () => {
    expect(home).toContain("/register?role=CUSTOMER");
    expect(home).toContain("env(safe-area-inset-bottom)");
  });

  it("ზედმეტად ფართო დაპირება მოხსნილია", () => {
    expect(home).not.toContain("მთელი საქართველოს მასშტაბით");
    expect(home).toContain("თბილისი და საქართველოს რეგიონები");
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
