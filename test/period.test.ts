import { describe, it, expect } from "vitest";
import { periodFrom } from "@/lib/period";

const TB_OFFSET = 4 * 3600 * 1000;
const tbFields = (d: Date) => new Date(d.getTime() + TB_OFFSET); // "თბილისური" UTC-ველები

describe("periodFrom — კალენდარული საზღვრები (თბილისის დროით)", () => {
  it("all — 1970 (მთელი ისტორია)", () => {
    expect(periodFrom("all").getTime()).toBe(0);
  });

  it("week — ორშაბათი 00:00 თბილისურად, always <= now, არასდროს 7 დღეზე ძველი", () => {
    const now = new Date();
    const start = periodFrom("week", now);
    expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
    const diffDays = (now.getTime() - start.getTime()) / 86_400_000;
    expect(diffDays).toBeLessThan(7);

    const tb = tbFields(start);
    expect(tb.getUTCDay()).toBe(1); // ორშაბათი
    expect(tb.getUTCHours()).toBe(0);
    expect(tb.getUTCMinutes()).toBe(0);
  });

  it("month — მიმდინარე თვის 1-ლი, 00:00 თბილისურად", () => {
    const now = new Date();
    const start = periodFrom("month", now);
    expect(start.getTime()).toBeLessThanOrEqual(now.getTime());

    const tb = tbFields(start);
    const tbNow = tbFields(now);
    expect(tb.getUTCDate()).toBe(1);
    expect(tb.getUTCHours()).toBe(0);
    expect(tb.getUTCMonth()).toBe(tbNow.getUTCMonth());
    expect(tb.getUTCFullYear()).toBe(tbNow.getUTCFullYear());
  });

  it("კვირის საზღვარი — ორშაბათი 00:05 თბილისურად ეკუთვნის ახალ კვირას, არა წინას", () => {
    // ვიპოვოთ ნებისმიერი ორშაბათი და ავიღოთ 00:05 თბილისურ დროზე
    let d = new Date();
    while (tbFields(d).getUTCDay() !== 1) d = new Date(d.getTime() - 86_400_000);
    const tb = tbFields(d);
    const mondayMidnightTb = Date.UTC(tb.getUTCFullYear(), tb.getUTCMonth(), tb.getUTCDate(), 0, 5);
    const mondayAt0005 = new Date(mondayMidnightTb - TB_OFFSET);

    const start = periodFrom("week", mondayAt0005);
    // 00:05-ის კვირის დაწყება უნდა იყოს ზუსტად ის ორშაბათი 00:00, არა 6 დღით ადრე
    expect(Math.abs(start.getTime() - (mondayAt0005.getTime() - 5 * 60_000))).toBeLessThan(1000);
  });

  it("კვირის საზღვარი — კვირა 23:55 თბილისურად ეკუთვნის წინა (მიმდინარე) კვირას, არა შემდეგს", () => {
    let d = new Date();
    while (tbFields(d).getUTCDay() !== 0) d = new Date(d.getTime() - 86_400_000); // კვირა
    const tb = tbFields(d);
    const sundayLateTb = Date.UTC(tb.getUTCFullYear(), tb.getUTCMonth(), tb.getUTCDate(), 23, 55);
    const sundayAt2355 = new Date(sundayLateTb - TB_OFFSET);

    const start = periodFrom("week", sundayAt2355);
    const startTb = tbFields(start);
    expect(startTb.getUTCDay()).toBe(1);
    // ამ ორშაბათი-დან კვირა 23:55-მდე ზუსტად 6 დღე + 23სთ55წთ უნდა იყოს
    const diffMs = sundayAt2355.getTime() - start.getTime();
    expect(diffMs).toBeGreaterThan(6 * 86_400_000);
    expect(diffMs).toBeLessThan(7 * 86_400_000);
  });
});
