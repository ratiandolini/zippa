import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder } from "@/app/api/orders/route";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";
import { GET as track } from "@/app/api/orders/track/[tn]/route";

// I1 — საჯარო tracking-ის მინიმიზაცია.
// ავტორიზაციის გარეშე endpoint-მა არ უნდა გასცეს მისამართი, კურიერი, GPS,
// ფასი, PIN ან event note/კოორდინატი.

beforeEach(resetDb);

const body = {
  sender: { name: "გამ გზავნი", phone: "+995599111111" },
  recipient: { name: "მიმ ღები", phone: "+995599222222" },
  pickup: { address: "თბილისი, ვაჟა-ფშაველას 12, ბინა 5", lat: 41.72, lng: 44.79 },
  delivery: { address: "თბილისი, ჭავჭავაძის 8, სადარბაზო 2", lat: 41.71, lng: 44.77 },
  weightKg: 3,
  parcelValue: 50,
  paymentMethod: "CASH" as const,
  deliveryProof: "PIN" as const,
};

async function scenario() {
  const customer = await makeUser("CUSTOMER");
  const disp = await makeUser("DISPATCHER");
  const drv = await makeDriver({ approved: true });
  actAs(session(customer));
  const created = await call(createOrder, { body });
  const order = created.body.order as { id: string; trackingNumber: string };
  actAs(session(disp));
  await call(assign, { params: { id: order.id }, body: { driverId: drv.profile.id } });
  actAs(session(drv.user));
  for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP"])
    await call(setStatus, { params: { id: order.id }, body: { status: s, note: "შიდა შენიშვნა", lat: 41.7, lng: 44.8 } });
  // კურიერის ცოცხალი ლოკაცია
  await prisma.driverProfile.update({
    where: { id: drv.profile.id },
    data: { currentLat: 41.7, currentLng: 44.8, locationUpdatedAt: new Date() },
  });
  return { order, drv };
}

describe("საჯარო tracking payload", () => {
  it("აბრუნებს მხოლოდ უსაფრთხო ველებს", async () => {
    const { order } = await scenario();
    const r = await call(track, { params: { tn: order.trackingNumber } });
    expect(r.status).toBe(200);
    const t = r.body.tracking as Record<string, unknown>;

    expect(Object.keys(t).sort()).toEqual(
      [
        "area",
        "createdAt",
        "deliveredAt",
        "estimatedDeliveryAt",
        "kind",
        "status",
        "steps",
        "trackingNumber",
        "updatedAt",
      ].sort(),
    );
    expect(t.trackingNumber).toBe(order.trackingNumber);
    expect(t.area).toBe("თბილისი");
    expect(t.status).toBe("PICKED_UP");
  });

  it("payload-ში არსად არ ჩანს მისამართი / ტელეფონი / GPS / ფასი / PIN / note", async () => {
    const { order } = await scenario();
    const r = await call(track, { params: { tn: order.trackingNumber } });
    const raw = JSON.stringify(r.body);

    for (const leak of [
      "ვაჟა-ფშაველა",
      "ჭავჭავაძ",
      "599111111",
      "599222222",
      "44.79",
      "41.72",
      "შიდა შენიშვნა",
      "pin",
      "deliveryPin",
      "driverName",
      "driverPhone",
      "driverLocation",
      "price",
      "pickup",
      "delivery",
    ]) {
      expect(raw, `გაჟონა: ${leak}`).not.toContain(leak);
    }
  });

  it("steps — მხოლოდ სტატუსი + დრო, note/კოორდინატის გარეშე", async () => {
    const { order } = await scenario();
    const r = await call(track, { params: { tn: order.trackingNumber } });
    const steps = (r.body.tracking as { steps: Record<string, unknown>[] }).steps;
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) {
      expect(Object.keys(s).sort()).toEqual(["at", "status"]);
    }
  });

  it("უცნობი ტრეკინგ-ნომერი → 404", async () => {
    const r = await call(track, { params: { tn: "ZP-NOPE-00" } });
    expect(r.status).toBe(404);
  });
});
