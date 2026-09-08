import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, actAs, session } from "./helpers";
import { POST as subscribe, DELETE as unsubscribe } from "@/app/api/push/subscribe/route";

const sub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BKxAbc...", auth: "authtoken123" },
};

beforeEach(resetDb);

describe("Web Push გამოწერა", () => {
  it("ავტორიზაციის გარეშე → 401", async () => {
    actAs(null);
    expect((await call(subscribe, { body: sub })).status).toBe(401);
  });

  it("ინახავს გამოწერას; ხელახლა — upsert (დუბლიკატი არ ჩნდება)", async () => {
    const u = await makeUser("DRIVER");
    actAs(session(u));
    expect((await call(subscribe, { body: sub })).status).toBe(200);
    expect((await call(subscribe, { body: sub })).status).toBe(200);
    expect(await prisma.pushSubscription.count()).toBe(1);
    const row = await prisma.pushSubscription.findFirstOrThrow();
    expect(row.userId).toBe(u.id);
    expect(row.auth).toBe("authtoken123");
  });

  it("წაშლა endpoint-ით", async () => {
    const u = await makeUser("DISPATCHER");
    actAs(session(u));
    await call(subscribe, { body: sub });
    expect((await call(unsubscribe, { method: "DELETE", body: { endpoint: sub.endpoint } })).status).toBe(200);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });
});
