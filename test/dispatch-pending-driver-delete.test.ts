import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { GET as listDrivers } from "@/app/api/drivers/route";
import { POST as lifecyclePost } from "@/app/api/dispatch/drivers/[id]/lifecycle/route";
import { POST as createOrder } from "@/app/api/orders/route";

beforeEach(resetDb);

async function makeDispatcher() {
  return makeUser("DISPATCHER");
}

const orderBody = (over: Record<string, unknown> = {}) => ({
  sender: { name: "მა რი", phone: "+995599111111" },
  recipient: { name: "ლე ვა", phone: "+995599222222" },
  pickup: { address: "თბილისი, ა 1", lat: 41.72, lng: 44.79 },
  delivery: { address: "თბილისი, ბ 2", lat: 41.71, lng: 44.77 },
  weightKg: 3,
  paymentMethod: "CASH",
  ...over,
});

describe("დასამტკიცებელი კურიერის წაშლა — 'დასამტკიცებელი' სექციაში", () => {
  it("გამოუყენებელი (pending) კურიერის წაშლა წარმატებით სრულდება", async () => {
    const dispatcher = await makeDispatcher();
    const { profile, user } = await makeDriver({ approved: false });
    actAs(session(dispatcher));

    const r = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "DELETE", reason: "ტესტური რეგისტრაცია, არასდროს გამოყენებული" },
    });
    expect(r.status).toBe(200);

    expect(await prisma.driverProfile.findUnique({ where: { id: profile.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });

  it("დაცული ისტორიის მქონე pending კურიერის წაშლა უარყოფილია — მონაცემები უცვლელი", async () => {
    const dispatcher = await makeDispatcher();
    const customer = await makeUser("CUSTOMER");
    const { profile } = await makeDriver({ approved: false });

    actAs(session(customer));
    const created = await call(createOrder, { body: orderBody() });
    const orderId = (created.body.order as { id: string }).id;
    // ისტორია ხელით — DELIVERED, კურიერზე მიბმული (approved-ის მიუხედავად ისტორია ისტორიაა)
    await prisma.order.update({ where: { id: orderId }, data: { status: "DELIVERED", driverId: profile.id } });

    actAs(session(dispatcher));
    const r = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "DELETE", reason: "ტესტის მცდელობა" },
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/დააარქივე/);

    const stillExists = await prisma.driverProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(stillExists.lifecycleStatus).toBe("ACTIVE");
    expect(stillExists.isApproved).toBe(false);
    const untouchedOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(untouchedOrder.status).toBe("DELIVERED");
    expect(untouchedOrder.driverId).toBe(profile.id);
  });

  it("reason-ის გარეშე → 422, კურიერი წაშლილი არ არის", async () => {
    const dispatcher = await makeDispatcher();
    const { profile } = await makeDriver({ approved: false });
    actAs(session(dispatcher));

    const r = await call(lifecyclePost, { params: { id: profile.id }, body: { action: "DELETE" } });
    expect(r.status).toBe(422);
    expect(await prisma.driverProfile.findUnique({ where: { id: profile.id } })).not.toBeNull();
  });

  it("არა-დისპეჩერი → 403, კურიერი წაშლილი არ არის", async () => {
    const customer = await makeUser("CUSTOMER");
    const { profile } = await makeDriver({ approved: false });
    actAs(session(customer));

    const r = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "DELETE", reason: "მცდელობა არა-დისპეჩერისგან" },
    });
    expect(r.status).toBe(403);
    expect(await prisma.driverProfile.findUnique({ where: { id: profile.id } })).not.toBeNull();
  });

  it("წარმატებული წაშლის შემდეგ 'დასამტკიცებელი' სია (GET ?pending=1) მას აღარ აბრუნებს", async () => {
    const dispatcher = await makeDispatcher();
    const { profile: toDelete } = await makeDriver({ approved: false });
    const { profile: staysPending } = await makeDriver({ approved: false });
    actAs(session(dispatcher));

    const before = await call(listDrivers, { query: { pending: "1" } });
    const idsBefore = (before.body.drivers as { id: string }[]).map((d) => d.id);
    expect(idsBefore).toContain(toDelete.id);
    expect(idsBefore).toContain(staysPending.id);

    const del = await call(lifecyclePost, {
      params: { id: toDelete.id },
      body: { action: "DELETE", reason: "სია refresh-ის ტესტი" },
    });
    expect(del.status).toBe(200);

    const after = await call(listDrivers, { query: { pending: "1" } });
    const idsAfter = (after.body.drivers as { id: string }[]).map((d) => d.id);
    expect(idsAfter).not.toContain(toDelete.id);
    expect(idsAfter).toContain(staysPending.id);
  });
});
