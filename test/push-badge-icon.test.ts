import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

// Android push-notification-ის "თეთრი კვადრატის" bug — Android status bar-ის small icon-ს
// მხოლოდ badge-სურათის ალფა-არხიდან ხატავს. სრულფეროვან/opaque PNG-ს (ან icon-ის იმავე
// ასლს) badge-ად გამოყენება ყოველთვის სოლიდურ თეთრ კვადრატს გამოსახავს.
const SW = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const BADGE_PATH = "public/icons/icon-badge-96.png";

describe("push notification badge icon (Android status-bar)", () => {
  it("sw.js-ში badge და icon სხვადასხვა ფაილს უთითებს — badge უკვე არა icon-192.png", () => {
    const badgeMatch = SW.match(/badge:\s*"([^"]+)"/);
    const iconMatch = SW.match(/icon:\s*"([^"]+)"/);
    expect(badgeMatch?.[1]).toBe("/icons/icon-badge-96.png");
    expect(iconMatch?.[1]).toBe("/icons/icon-192.png");
    expect(badgeMatch?.[1]).not.toBe(iconMatch?.[1]);
  });

  it("icon-badge-96.png არსებობს და გამჭვირვალობის (alpha) არხი აქვს", async () => {
    expect(existsSync(join(process.cwd(), BADGE_PATH))).toBe(true);
    const meta = await sharp(join(process.cwd(), BADGE_PATH)).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBe(96);
    expect(meta.height).toBe(96);
  });

  it("კუთხეები სრულად გამჭვირვალეა (არა თეთრი კვადრატის ფონი)", async () => {
    const { data, info } = await sharp(join(process.cwd(), BADGE_PATH))
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(info.width - 1, 0)).toBe(0);
    expect(alphaAt(0, info.height - 1)).toBe(0);
    expect(alphaAt(info.width - 1, info.height - 1)).toBe(0);
  });

  it("სილუეტი მონოქრომული თეთრია (opaque პიქსელები — pure #fff, არა ფერადი ლოგო)", async () => {
    const { data, info } = await sharp(join(process.cwd(), BADGE_PATH))
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    let opaqueCount = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a === 255) {
        opaqueCount++;
        expect(r).toBe(255);
        expect(g).toBe(255);
        expect(b).toBe(255);
      }
    }
    // საკმარისი რაოდენობის opaque პიქსელი, რომ ეს ნამდვილი სილუეტია (არა ცარიელი/სუფთა-გამჭვირვალე ფაილი)
    expect(opaqueCount).toBeGreaterThan(500);
  });

  it("launcher/app icon (manifest.ts) badge-ფაილს არ იყენებს — მხოლოდ push-ისთვისაა", () => {
    const manifestSrc = readFileSync(join(process.cwd(), "src/app/manifest.ts"), "utf8");
    expect(manifestSrc).not.toContain("icon-badge");
  });
});
