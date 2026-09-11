import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder } from "@/app/api/orders/route";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";
import { GET as payroll } from "@/app/api/dispatch/payroll/route";

beforeEach(resetDb);

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const body = (over: Record<string, unknown> = {}) => ({
  sender: { name: "მა რი", phone: "+995599111111" },
  recipient: { name: "ლე ვა", phone: "+995599222222" },
  pickup: { address: "თბილისი, ა 1", lat: 41.72, lng: 44.79 },
  delivery: { address: "თბილისი, ბ 2", lat: 41.71, lng: 44.77 },
  weightKg: 3,
  parcelValue: 50,
  paymentMethod: "CASH",
  deliveryProof: "NONE",
  ...over,
});

async function deliverOne() {
  const customer = await makeUser("CUSTOMER");
  const drv = await makeDriver({ approved: true });
  const disp = await makeUser("DISPATCHER");
  actAs(session(customer));
  const created = await call(createOrder, { body: body() });
  const oid = (created.body.order as { id: string }).id;
  actAs(session(disp));
  await call(assign, { params: { id: oid }, body: { driverId: drv.profile.id } });
  actAs(session(drv.user));
  for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
    await call(setStatus, { params: { id: oid }, body: { status: s } });
  }
  return { drv, disp };
}

describe("/dispatch/payroll — კალენდარული პერიოდი", () => {
  it("8 დღის წინანდელი მიტანა 'week'-ში არ ითვლება, 'all'-ში ითვლება", async () => {
    const { drv, disp } = await deliverOne();
    // ფაქტობრივ earning-ს ხელოვნურად ვაძველებთ — 8 დღით უკან (გარანტირებულად წინა კვირაშია)
    await prisma.driverEarning.updateMany({
      where: { driverId: drv.profile.id },
      data: { createdAt: new Date(Date.now() - 8 * 86_400_000) },
    });

    actAs(session(disp));
    const week = await call(payroll, { query: { period: "week" } });
    const all = await call(payroll, { query: { period: "all" } });

    expect(week.body.totals.earned).toBe(0);
    expect(all.body.totals.earned).toBeGreaterThan(0);
  });

  it("მიმდინარე ბალანსები (unpaidNow/cashOutNow) უცვლელია period-ის მიუხედავად", async () => {
    const { drv, disp } = await deliverOne();
    await prisma.driverEarning.updateMany({
      where: { driverId: drv.profile.id },
      data: { createdAt: new Date(Date.now() - 8 * 86_400_000) },
    });

    actAs(session(disp));
    const week = await call(payroll, { query: { period: "week" } });
    const month = await call(payroll, { query: { period: "month" } });
    const all = await call(payroll, { query: { period: "all" } });

    expect(week.body.totals.unpaidNow).toBe(all.body.totals.unpaidNow);
    expect(month.body.totals.unpaidNow).toBe(all.body.totals.unpaidNow);
    expect(week.body.totals.cashOutNow).toBe(all.body.totals.cashOutNow);
    expect(week.body.totals.unpaidNow).toBeGreaterThan(0); // საერთოდ არაფერი არ დარიცხულა, თუ 0-ია ტესტი ცარიელია
  });

  it("ცარიელ პერიოდში totals ყველა ველი 0-ია", async () => {
    actAs(session(await makeUser("DISPATCHER")));
    const r = await call(payroll, { query: { period: "week" } });
    expect(r.status).toBe(200);
    for (const v of Object.values(r.body.totals as Record<string, number>)) {
      expect(v).toBe(0);
    }
  });

  it("არასწორი period-პარამეტრი 'week'-ზე fallback-დება (არ ვარდება)", async () => {
    actAs(session(await makeUser("DISPATCHER")));
    const r = await call(payroll, { query: { period: "yesterday" } });
    expect(r.status).toBe(200);
    expect(r.body.period).toBe("week");
  });
});

describe("/dispatch/payroll UI — alignment/grouping/COD-განცალკევება (source-based)", () => {
  const SRC = "src/app/dispatch/payroll/page.tsx";

  it("Tile-ის label ზონას აქვს ფიქსირებული მინიმალური სიმაღლე (alignment fix)", () => {
    expect(read(SRC)).toContain("min-h-[2.25rem]");
  });

  it("'მიმდინარე ნაშთები' ცალკე ჯგუფის სათაურად არსებობს", () => {
    expect(read(SRC)).toContain("მიმდინარე ნაშთები");
  });

  it("COD სექციას აქვს ცალკე სათაური და განმარტება, კურიერის ბარათებისგან დაშორებული", () => {
    const src = read(SRC);
    expect(src).toContain("COD ანგარიშსწორება");
    expect(src).toContain("მომხმარებლისგან");
  });

  it("loading-ის დროს tile-ები არ იმალება — skeleton გამოიყენება", () => {
    const src = read(SRC);
    expect(src).toContain("TileSkeleton");
    expect(src).not.toMatch(/\{t\s*&&\s*\(\s*<div className="mb-6 grid/);
  });
});
