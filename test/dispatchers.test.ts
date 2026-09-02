import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, actAs, session } from "./helpers";
import { GET as list, POST as create } from "@/app/api/dispatchers/route";
import { PATCH as update } from "@/app/api/dispatchers/[id]/route";

beforeEach(resetDb);

describe("დისპეჩერების გუნდი", () => {
  it("დისპეჩერი ამატებს ახალ დისპეჩერს", async () => {
    const admin = await makeUser("DISPATCHER");
    actAs(session(admin));

    const r = await call(create, {
      body: { name: "ახალი დისპ", email: "d2@test.ge", phone: "+995599443322", password: "secret12345" },
    });
    expect(r.status).toBe(201);

    const u = await prisma.user.findUnique({ where: { email: "d2@test.ge" } });
    expect(u?.role).toBe("DISPATCHER");
    expect(u?.isActive).toBe(true);
  });

  it("კურიერს არ შეუძლია დისპეჩერის დამატება → 403", async () => {
    const drv = await makeUser("DRIVER");
    actAs(session(drv));
    const r = await call(create, {
      body: { name: "x y", email: "d3@test.ge", phone: "+995599443311", password: "secret12345" },
    });
    expect(r.status).toBe(403);
  });

  it("დეაქტივაცია და გააქტიურება", async () => {
    const admin = await makeUser("DISPATCHER");
    const other = await makeUser("DISPATCHER", { email: "o@test.ge" });
    actAs(session(admin));

    const off = await call(update, { method: "PATCH", body: { isActive: false }, params: { id: other.id } });
    expect(off.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: other.id } }))?.isActive).toBe(false);

    const on = await call(update, { method: "PATCH", body: { isActive: true }, params: { id: other.id } });
    expect(on.status).toBe(200);
  });

  it("საკუთარი თავის დეაქტივაცია → 400", async () => {
    const admin = await makeUser("DISPATCHER");
    actAs(session(admin));
    const r = await call(update, { method: "PATCH", body: { isActive: false }, params: { id: admin.id } });
    expect(r.status).toBe(400);
  });

  it("სია აბრუნებს ყველა დისპეჩერს", async () => {
    const admin = await makeUser("DISPATCHER");
    await makeUser("DISPATCHER", { email: "l1@test.ge" });
    actAs(session(admin));
    const r = await call(list);
    expect(r.status).toBe(200);
    expect(r.body.dispatchers.length).toBe(2);
  });
});
