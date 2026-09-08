import { describe, it, expect } from "vitest";
import { shortAddress, compactAddress } from "@/lib/geo";

describe("shortAddress — გრძელი მისამართის შემოკლება", () => {
  it("ქუჩა ნომერი, ქალაქი", () => {
    const s = shortAddress(
      { road: "ვაჟა-ფშაველას გამზირი", house_number: "5", suburb: "საბურთალო", city: "თბილისი" },
      "5, ვაჟა-ფშაველას გამზირი, საბურთალო, ვაკე-საბურთალო, თბილისი, 0177, საქართველო",
    );
    expect(s).toBe("ვაჟა-ფშაველას გამზირი 5, თბილისი");
  });

  it("ქუჩის გარეშე — უბანი და ქალაქი", () => {
    const s = shortAddress(
      { neighbourhood: "ძველი თბილისი", city: "თბილისი" },
      "ძველი თბილისი, თბილისი, საქართველო",
    );
    expect(s).toBe("ძველი თბილისი, თბილისი");
  });

  it("address დეტალების გარეშე — compactAddress fallback (2 სეგმენტი)", () => {
    const s = shortAddress(undefined, "10, რუსთაველის გამზირი, სოლოლაკი, თბილისი, საქართველო");
    expect(s).toBe("10, რუსთაველის გამზირი");
  });
});

describe("compactAddress — შენახული სტრიქონის შემოკლება", () => {
  it("აგდებს ინდექსს, ქვეყანას, რაიონს; ტოვებს პირველ 2-ს", () => {
    expect(compactAddress("კოსტავას ქუჩა 15, ვაკე, ვაკის რაიონი, თბილისი, 0179, საქართველო")).toBe(
      "კოსტავას ქუჩა 15, ვაკე",
    );
  });
  it("მოკლე სტრიქონი უცვლელი", () => {
    expect(compactAddress("ვაკე 25")).toBe("ვაკე 25");
  });
});
