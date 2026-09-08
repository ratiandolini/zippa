import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder } from "@/app/api/orders/route";
import { POST as quote } from "@/app/api/pricing/quote/route";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";
import { POST as review } from "@/app/api/orders/[id]/review/route";
import { PATCH as driverMe } from "@/app/api/driver/me/route";
import { PATCH as approveDriver } from "@/app/api/drivers/[id]/route";
import { POST as settle } from "@/app/api/driver/settlement/route";
import { PATCH as reviewSettle } from "@/app/api/settlements/[id]/route";
import { POST as payout } from "@/app/api/drivers/[id]/payout/route";
import { GET as codGet, POST as codPay } from "@/app/api/dispatch/cod/route";
import { GET as myCod } from "@/app/api/orders/cod/route";
import { GET as payroll } from "@/app/api/dispatch/payroll/route";
import { GET as analytics } from "@/app/api/dispatch/analytics/route";

const TB = { lat: 41.72, lng: 44.79 };
const TB2 = { lat: 41.71, lng: 44.77 };

const orderBody = (over: Record<string, unknown> = {}) => ({
  sender: { name: "მაღაზია ერთი", phone: "+995599111111" },
  recipient: { name: "ლევან კ", phone: "+995599222222" },
  pickup: { address: "თბილისი, რუსთაველის 10", ...TB },
  delivery: { address: "თბილისი, ვაკე 25", ...TB2 },
  weightKg: 3,
  parcelValue: 200,
  paymentMethod: "CASH",
  ...over,
});

async function runToDelivered(oid: string, drvProfileId: string, drvUser: { id: string; role: "DRIVER"; name: string; email: string }, disp: { id: string; role: "DISPATCHER"; name: string; email: string }) {
  actAs(session(disp));
  await call(assign, { params: { id: oid }, body: { driverId: drvProfileId } });
  actAs(session(drvUser));
  for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
    const r = await call(setStatus, { params: { id: oid }, body: { status: s } });
    expect(r.status, `გადასვლა → ${s}`).toBe(200);
  }
}

beforeEach(resetDb);

describe("სრული ნაკადი — შეკვეთიდან ანგარიშსწორებამდე", () => {
  it("მაღაზია → COD შეკვეთა → ჩაბარება → ყველა ფინანსური რგოლი", async () => {
    // — მონაწილეები —
    const shop = await makeUser("CUSTOMER", { name: "მაღაზია" });
    const disp = await makeUser("DISPATCHER");
    const drv = await makeDriver({ approved: false, status: "OFFLINE" });

    // — დისპეჩერი ამტკიცებს კურიერს —
    actAs(session(disp));
    const appr = await call(approveDriver, { method: "PATCH", params: { id: drv.profile.id }, body: { isApproved: true } });
    expect(appr.status).toBe(200);

    // — კურიერი ხაზზე —
    actAs(session(drv.user));
    await call(driverMe, { method: "PATCH", body: { status: "AVAILABLE" } });

    // — ფასის შეთავაზება (quote) —
    actAs(session(shop));
    const q = await call(quote, {
      body: { pickup: TB, delivery: TB2, weightKg: 3, paymentMethod: "CASH", collectAmount: 150 },
    });
    expect(q.status).toBe(200);
    expect(q.body.totalPrice).toBe(5); // მიტანა
    expect(q.body.codCommission).toBe(3); // 150 × 2%
    expect(q.body.codNet).toBe(147);
    expect(q.body.codAmount).toBe(155); // 5 + 150

    // — შეკვეთის შექმნა —
    const created = await call(createOrder, { body: orderBody({ collectAmount: 150 }) });
    expect([200, 201]).toContain(created.status);
    const oid = (created.body.order as { id: string }).id;
    let db = await prisma.order.findUniqueOrThrow({ where: { id: oid } });
    expect(Number(db.codAmount)).toBe(155);
    expect(Number(db.codCommission)).toBe(3);
    expect(Number(db.parcelValue)).toBe(200);

    // — მთელი ციკლი ჩაბარებამდე —
    await runToDelivered(oid, drv.profile.id, { ...drv.user, role: "DRIVER" }, { ...disp, role: "DISPATCHER" });

    db = await prisma.order.findUniqueOrThrow({ where: { id: oid } });
    expect(db.status).toBe("DELIVERED");
    expect(db.deliveredAt).toBeTruthy();

    // — კურიერის ფინანსები —
    let dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(3); // driverFee
    expect(Number(dp.cashOnHand)).toBe(155); // მთელი codAmount
    expect(dp.totalDeliveries).toBe(1);
    expect(dp.status).toBe("AVAILABLE");

    const earn = await prisma.driverEarning.findFirstOrThrow({ where: { orderId: oid } });
    expect(Number(earn.driverAmount)).toBe(3);
    expect(Number(earn.companyAmount)).toBe(2); // 5 − 3
    expect(earn.collectedInCash).toBe(true);

    // — კურიერი აბარებს ნაღდს, დისპეჩერი ადასტურებს —
    actAs(session(drv.user));
    const decl = await call(settle, { body: { amount: 155 } });
    const sid = (decl.body.settlement as { id: string }).id;
    dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.cashOnHand)).toBe(155); // ჯერ არ შეცვლილა

    actAs(session(disp));
    await call(reviewSettle, { method: "PATCH", params: { id: sid }, body: { action: "CONFIRM" } });
    dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.cashOnHand)).toBe(0);

    // — დისპეჩერი უხდის კურიერს ანაზღაურებას —
    await call(payout, { params: { id: drv.profile.id }, body: { amount: 3 } });
    dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(0);

    // — COD გამგზავნისთვის —
    const codList = await call(codGet, {});
    const row = (codList.body.outstanding as Record<string, number>[]).find(
      (r) => (r.customerId as never) === shop.id,
    );
    expect(row!.gross).toBe(150);
    expect(row!.commission).toBe(3);
    expect(row!.charges).toBe(0);
    expect(row!.net).toBe(147);

    const codP = await call(codPay, { body: { customerId: shop.id, method: "ბანკი" } });
    expect(codP.status).toBe(200);
    expect((codP.body as { net: number }).net).toBe(147);

    db = await prisma.order.findUniqueOrThrow({ where: { id: oid } });
    expect(db.codRemittanceId).toBeTruthy();

    // — მომხმარებელი ხედავს —
    actAs(session(shop));
    const mine = await call(myCod, {});
    expect((mine.body as { outstandingNet: number }).outstandingNet).toBe(0);
    expect((mine.body as { history: unknown[] }).history).toHaveLength(1);

    // — შეფასება —
    const rev = await call(review, { method: "POST", params: { id: oid }, body: { rating: 5, comment: "სწრაფად" } });
    expect([200, 201]).toContain(rev.status);
    dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(dp.ratingCount).toBe(1);
    expect(dp.ratingAvg).toBe(5);

    // — ანალიტიკა —
    actAs(session(disp));
    const an = await call(analytics, {});
    expect((an.body.totals as { delivered: number }).delivered).toBe(1);
    expect((an.body.totals as { companyEarnings: number }).companyEarnings).toBe(5); // 2 მარჟა + 3 COD საკომ.
    expect((an.body.totals as { driverPay: number }).driverPay).toBe(3);

    // — payroll —
    const pr = await call(payroll, { query: { period: "month" } });
    const prow = (pr.body.rows as Record<string, number>[]).find(
      (r) => (r.driverId as never) === drv.profile.id,
    );
    expect(prow!.deliveries).toBe(1);
    expect(prow!.earnedInPeriod).toBe(3);
    expect(prow!.paidInPeriod).toBe(3);
    expect(prow!.remittedInPeriod).toBe(155);
    expect(prow!.unpaidEarnings).toBe(0);
  });

  it("ჩაშლილი მიტანა → returnFee იქვითება მომდევნო COD-იდან", async () => {
    const shop = await makeUser("CUSTOMER");
    const disp = await makeUser("DISPATCHER");
    const drv = await makeDriver({ approved: true });

    // შეკვეთა 1 — ჩაიშლება
    actAs(session(shop));
    const o1 = (await call(createOrder, { body: orderBody({ collectAmount: 0 }) })).body.order as { id: string };
    actAs(session(disp));
    await call(assign, { params: { id: o1.id }, body: { driverId: drv.profile.id } });
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT"]) {
      await call(setStatus, { params: { id: o1.id }, body: { status: s } });
    }
    const fail = await call(setStatus, {
      params: { id: o1.id },
      body: { status: "FAILED", failureReason: "RECIPIENT_REFUSED" },
    });
    expect(fail.status).toBe(200);
    const d1 = await prisma.order.findUniqueOrThrow({ where: { id: o1.id } });
    expect(Number(d1.returnFee)).toBe(2.5); // deliveryPrice 5 × 50%
    expect(d1.chargeSettledAt).toBeNull();

    // შეკვეთა 2 — COD-ით, ჩაბარდება
    actAs(session(shop));
    const o2 = (await call(createOrder, { body: orderBody({ collectAmount: 100 }) })).body.order as { id: string };
    actAs(session(disp));
    await call(assign, { params: { id: o2.id }, body: { driverId: drv.profile.id } });
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
      await call(setStatus, { params: { id: o2.id }, body: { status: s } });
    }

    // COD ანგარიშსწორება: 100 − 2 (საკომ.) − 2.5 (returnFee) = 95.5
    actAs(session(disp));
    const list = await call(codGet, {});
    const row = (list.body.outstanding as Record<string, number>[]).find(
      (r) => (r.customerId as never) === shop.id,
    );
    expect(row!.gross).toBe(100);
    expect(row!.commission).toBe(2);
    expect(row!.charges).toBe(2.5);
    expect(row!.net).toBe(95.5);

    const pay = await call(codPay, { body: { customerId: shop.id, method: "ბანკი" } });
    expect((pay.body as { net: number }).net).toBe(95.5);

    // ორივე შეკვეთა settled
    const after1 = await prisma.order.findUniqueOrThrow({ where: { id: o1.id } });
    expect(after1.chargeSettledAt).toBeTruthy();
    const after2 = await prisma.order.findUniqueOrThrow({ where: { id: o2.id } });
    expect(after2.codRemittanceId).toBeTruthy();
  });
});
