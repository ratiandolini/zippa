// კალენდარული პერიოდის საზღვრები — თბილისის დროით (UTC+4), მიტანის ETA-ს (estimateDelivery)
// იმავე კონვენციით: სერვერი UTC-ზეა, მაგრამ "დღე/კვირა/თვე" თბილისურ დროზე ითვლება.
const TBILISI_OFFSET_MS = 4 * 3600 * 1000;

export type PayrollPeriod = "week" | "month" | "all";

/**
 * @returns პერიოდის დაწყების momenti UTC-ში (createdAt-თან შედარებისთვის).
 *  week  — მიმდინარე კალენდარული კვირა, ორშაბათი 00:00 (თბილისის დროით);
 *  month — მიმდინარე თვის 1-ლი დღე, 00:00 (თბილისის დროით);
 *  all   — მთელი ისტორია.
 */
export function periodFrom(period: PayrollPeriod, now: Date = new Date()): Date {
  if (period === "all") return new Date(0);

  // "თბილისური wall-clock" — UTC ველების წაკითხვა ამ shift-ული momentიდან
  const tb = new Date(now.getTime() + TBILISI_OFFSET_MS);
  const start = new Date(
    Date.UTC(tb.getUTCFullYear(), tb.getUTCMonth(), tb.getUTCDate()),
  );

  if (period === "month") {
    start.setUTCDate(1);
  } else {
    // week: ორშაბათი = 1. getUTCDay(): 0=კვირა, 1=ორშ, … 6=შაბ.
    const day = start.getUTCDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    start.setUTCDate(start.getUTCDate() - diffToMonday);
  }

  // უკან გადავყავართ ნამდვილ UTC momentში (რომ DB-ის createdAt-ს სწორად შევადაროთ)
  return new Date(start.getTime() - TBILISI_OFFSET_MS);
}
