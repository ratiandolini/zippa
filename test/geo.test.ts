import { describe, it, expect } from "vitest";
import { shortAddress } from "@/lib/geo";

describe("shortAddress — გრძელი მისამართის შემოკლება", () => {
  it("ქუჩა + ნომერი + უბანი + ქალაქი", () => {
    const s = shortAddress(
      { road: "ვაჟა-ფშაველას გამზირი", house_number: "5", suburb: "საბურთალო", city: "თბილისი" },
      "5, ვაჟა-ფშაველას გამზირი, საბურთალო, ვაკე-საბურთალო, თბილისი, 0177, საქართველო",
    );
    expect(s).toBe("ვაჟა-ფშაველას გამზირი 5, საბურთალო, თბილისი");
  });

  it("ქუჩის გარეშე — უბანი და ქალაქი", () => {
    const s = shortAddress(
      { neighbourhood: "ძველი თბილისი", city: "თბილისი" },
      "ძველი თბილისი, თბილისი, საქართველო",
    );
    expect(s).toBe("ძველი თბილისი, თბილისი");
  });

  it("address დეტალების გარეშე — display_name-ის პირველი 3 სეგმენტი", () => {
    const s = shortAddress(undefined, "10, რუსთაველის გამზირი, სოლოლაკი, თბილისი, საქართველო");
    expect(s).toBe("10, რუსთაველის გამზირი, სოლოლაკი");
  });

  it("არ იმეორებს დუბლიკატ სეგმენტებს", () => {
    const s = shortAddress({ road: "თბილისი", suburb: "თბილისი", city: "თბილისი" }, "თბილისი");
    expect(s).toBe("თბილისი");
  });
});
