import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { GET as listDrivers } from "@/app/api/drivers/route";
import { PATCH as approveDriver } from "@/app/api/drivers/[id]/route";
import { POST as lifecyclePost } from "@/app/api/dispatch/drivers/[id]/lifecycle/route";

beforeEach(resetDb);

async function makeDispatcher() {
  return makeUser("DISPATCHER");
}

describe("პროფილის დამტკიცება — შეტყობინება მხოლოდ ფაქტობრივად გამოსაყენებელ ანგარიშზე", () => {
  it("დამტკიცება ACTIVE ჯერ არ დამტკიცებულ კურიერზე → იგზავნება 'შეგიძლია ჩაირთო'", async () => {
    const dispatcher = await makeDispatcher();
    const { profile, user } = await makeDriver({ approved: false });
    actAs(session(dispatcher));

    const r = await call(approveDriver, { params: { id: profile.id }, body: { isApproved: true } });
    expect(r.status).toBe(200);

    const notif = await prisma.notification.count({
      where: { userId: user.id, title: "პროფილი დამტკიცდა" },
    });
    expect(notif).toBe(1);
  });

  it("დამტკიცება SUSPENDED კურიერზე → შეტყობინება არ იგზავნება (ანგარიში ჯერ არ გამოსაყენებელია)", async () => {
    const dispatcher = await makeDispatcher();
    const { profile, user } = await makeDriver({ approved: false });
    await prisma.driverProfile.update({ where: { id: profile.id }, data: { lifecycleStatus: "SUSPENDED" } });
    actAs(session(dispatcher));

    const r = await call(approveDriver, { params: { id: profile.id }, body: { isApproved: true } });
    expect(r.status).toBe(200);

    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(dp.isApproved).toBe(true);
    expect(dp.lifecycleStatus).toBe("SUSPENDED");

    const notif = await prisma.notification.count({
      where: { userId: user.id, title: "პროფილი დამტკიცდა" },
    });
    expect(notif).toBe(0);
  });

  it("დამტკიცება ARCHIVED კურიერზე → შეტყობინება არ იგზავნება", async () => {
    const dispatcher = await makeDispatcher();
    const { profile, user } = await makeDriver({ approved: false });
    await prisma.driverProfile.update({ where: { id: profile.id }, data: { lifecycleStatus: "ARCHIVED" } });
    actAs(session(dispatcher));

    await call(approveDriver, { params: { id: profile.id }, body: { isApproved: true } });

    const notif = await prisma.notification.count({
      where: { userId: user.id, title: "პროფილი დამტკიცდა" },
    });
    expect(notif).toBe(0);
  });
});

describe("დასამტკიცებელი სია — lifecycle-ის მიხედვით გაფილტრული", () => {
  it("SUSPENDED/ARCHIVED + ჯერ არ დამტკიცებული კურიერი ჩვეულებრივ დასამტკიცებელ სიაში არ ჩანს", async () => {
    const dispatcher = await makeDispatcher();
    const { profile: activePending } = await makeDriver({ approved: false });
    const { profile: suspendedPending } = await makeDriver({ approved: false });
    await prisma.driverProfile.update({
      where: { id: suspendedPending.id },
      data: { lifecycleStatus: "SUSPENDED" },
    });

    actAs(session(dispatcher));
    const r = await call(listDrivers, { query: { pending: "1" } });
    const ids = (r.body.drivers as { id: string }[]).map((d) => d.id);
    expect(ids).toContain(activePending.id);
    expect(ids).not.toContain(suspendedPending.id);
  });

  it("მაგრამ ?pending=1&lifecycle=all-ით დისპეჩერს კვლავ ეძებნება (discoverable)", async () => {
    const dispatcher = await makeDispatcher();
    const { profile: suspendedPending } = await makeDriver({ approved: false });
    await prisma.driverProfile.update({
      where: { id: suspendedPending.id },
      data: { lifecycleStatus: "SUSPENDED" },
    });

    actAs(session(dispatcher));
    const r = await call(listDrivers, { query: { pending: "1", lifecycle: "all" } });
    const found = (r.body.drivers as { id: string; lifecycleStatus: string }[]).find(
      (d) => d.id === suspendedPending.id,
    );
    expect(found).toBeDefined();
    expect(found?.lifecycleStatus).toBe("SUSPENDED");
  });
});

describe("სრული თანმიმდევრობა — pending → suspend → აღდგენა → დამტკიცება → assignable", () => {
  it("bez deadlock: suspend ჯერ არ დამტკიცებულ კურიერზე, აღდგენა არ ნიშნავს დამტკიცებას, შემდეგ ჩვეულებრივი დამტკიცება", async () => {
    const dispatcher = await makeDispatcher();
    const { profile, user } = await makeDriver({ approved: false });
    actAs(session(dispatcher));

    // 1. თავიდან ჩვეულებრივ დასამტკიცებელ სიაშია
    const before = await call(listDrivers, { query: { pending: "1" } });
    expect((before.body.drivers as { id: string }[]).map((d) => d.id)).toContain(profile.id);

    // 2. დისპეჩერი დაბლოკავს ჯერ არ დამტკიცებულ კურიერს
    const suspendRes = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "SUSPEND", reason: "საეჭვო რეგისტრაცია" },
    });
    expect(suspendRes.status).toBe(200);

    // 3. ჩვეულებრივ დასამტკიცებელ სიიდან ქრება
    const duringSuspend = await call(listDrivers, { query: { pending: "1" } });
    expect((duringSuspend.body.drivers as { id: string }[]).map((d) => d.id)).not.toContain(profile.id);

    // 4. მაგრამ დისპეჩერს კვლავ ეძებნება
    const discoverable = await call(listDrivers, { query: { pending: "1", lifecycle: "all" } });
    expect((discoverable.body.drivers as { id: string }[]).map((d) => d.id)).toContain(profile.id);

    // 5. აღდგენა — ვმუშაობთ ჯერ დაუმტკიცებელ კურიერზეც (არ საჭიროებს isApproved-ს)
    const reactivateRes = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "REACTIVATE", reason: "გადაისინჯა, პრობლემა არ დადასტურდა" },
    });
    expect(reactivateRes.status).toBe(200);

    // 6. აღდგენა არ ნიშნავს დამტკიცებას — isApproved კვლავ false
    const afterReactivate = await prisma.driverProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(afterReactivate.lifecycleStatus).toBe("ACTIVE");
    expect(afterReactivate.isApproved).toBe(false);

    // 7. კვლავ ჩვეულებრივ დასამტკიცებელ სიაშია (არა deadlock)
    const afterReactivateList = await call(listDrivers, { query: { pending: "1" } });
    expect((afterReactivateList.body.drivers as { id: string }[]).map((d) => d.id)).toContain(profile.id);

    // 8. ახლა ჩვეულებრივი დამტკიცება — შეტყობინება ამჯერად იგზავნება
    const approveRes = await call(approveDriver, {
      params: { id: profile.id },
      body: { isApproved: true },
    });
    expect(approveRes.status).toBe(200);
    const notif = await prisma.notification.count({
      where: { userId: user.id, title: "პროფილი დამტკიცდა" },
    });
    expect(notif).toBe(1);

    // 9. საბოლოოდ სავალდებულო/დანიშნებადი
    const final = await prisma.driverProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(final.isApproved).toBe(true);
    expect(final.lifecycleStatus).toBe("ACTIVE");
  });
});
