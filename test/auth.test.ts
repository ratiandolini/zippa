import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser } from "./helpers";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as changePassword } from "@/app/api/auth/password/route";
import { POST as forgot } from "@/app/api/auth/forgot/route";
import { POST as reset } from "@/app/api/auth/reset/route";
import { actAs, session } from "./helpers";

beforeEach(resetDb);

describe("register", () => {
  it("ქმნის მომხმარებელს", async () => {
    const r = await call(register, {
      body: { name: "ანა ტესტი", email: "ana@test.ge", phone: "+995599112233", password: "secret12345", role: "CUSTOMER", agreed: true },
    });
    expect(r.status).toBe(201);
    const u = await prisma.user.findUnique({ where: { email: "ana@test.ge" } });
    expect(u?.role).toBe("CUSTOMER");
    expect(u?.agreedAt).toBeInstanceOf(Date);
  });

  it("DRIVER-ს უჩნდება დაუმტკიცებელი პროფილი", async () => {
    await call(register, {
      body: { name: "დრ", email: "dr@test.ge", phone: "+995599112244", password: "secret12345", role: "DRIVER", agreed: true },
    });
    const u = await prisma.user.findUnique({ where: { email: "dr@test.ge" }, include: { driverProfile: true } });
    expect(u?.driverProfile?.isApproved).toBe(false);
  });

  it("კომპანიის ანგარიში ინახავს დასახელებას და ს/კ-ს", async () => {
    const r = await call(register, {
      body: {
        name: "საკონტაქტო პირი", email: "co@test.ge", phone: "+995599112255", password: "secret12345",
        role: "CUSTOMER", accountType: "COMPANY", companyName: "შპს ტესტი", taxId: "404123456", agreed: true,
      },
    });
    expect(r.status).toBe(201);
    const u = await prisma.user.findUnique({ where: { email: "co@test.ge" } });
    expect(u?.accountType).toBe("COMPANY");
    expect(u?.companyName).toBe("შპს ტესტი");
    expect(u?.taxId).toBe("404123456");
  });

  it("კომპანია ს/კ-ს გარეშე → 422", async () => {
    const r = await call(register, {
      body: {
        name: "პირი", email: "co2@test.ge", phone: "+995599112266", password: "secret12345",
        role: "CUSTOMER", accountType: "COMPANY", companyName: "შპს X", agreed: true,
      },
    });
    expect(r.status).toBe(422);
  });

  it("წესებზე თანხმობის გარეშე → 422", async () => {
    const r = await call(register, {
      body: { name: "უთანხმო", email: "na@test.ge", phone: "+995599112277", password: "secret12345", role: "CUSTOMER" },
    });
    expect(r.status).toBe(422);
  });

  it("დუბლიკატი ელფოსტა → 409", async () => {
    await makeUser("CUSTOMER", { email: "dup@test.ge" });
    const r = await call(register, {
      body: { name: "დუბლი კაცი", email: "dup@test.ge", phone: "+995599000001", password: "secret12345", role: "CUSTOMER", agreed: true },
    });
    expect(r.status).toBe(409);
  });

  it("სუსტი პაროლი → 422", async () => {
    const r = await call(register, {
      body: { name: "x", email: "weak@test.ge", phone: "+995599000002", password: "123", role: "CUSTOMER" },
    });
    expect(r.status).toBe(422);
  });
});

describe("login", () => {
  it("ელფოსტით და ტელეფონით მუშაობს", async () => {
    await makeUser("CUSTOMER", { email: "l@test.ge", phone: "+995599556677", password: "password123" });
    expect((await call(login, { body: { emailOrPhone: "l@test.ge", password: "password123" } })).status).toBe(200);
    expect((await call(login, { body: { emailOrPhone: "599 55 66 77", password: "password123" } })).status).toBe(200);
  });

  it("არასწორი პაროლი → 401", async () => {
    await makeUser("CUSTOMER", { email: "l2@test.ge", password: "password123" });
    const r = await call(login, { body: { emailOrPhone: "l2@test.ge", password: "wrong" } });
    expect(r.status).toBe(401);
  });

  it("გათიშული მომხმარებელი → 401", async () => {
    await makeUser("CUSTOMER", { email: "off@test.ge", password: "password123", isActive: false });
    const r = await call(login, { body: { emailOrPhone: "off@test.ge", password: "password123" } });
    expect(r.status).toBe(401);
  });

  it("rate limit — 11-ე მცდელობა → 429", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < 10; i++) {
      await call(login, { body: { emailOrPhone: "none@test.ge", password: "x" }, ip });
    }
    const r = await call(login, { body: { emailOrPhone: "none@test.ge", password: "x" }, ip });
    expect(r.status).toBe(429);
  });
});

describe("password change", () => {
  it("არასწორი მიმდინარე → 401; სწორი → იცვლება", async () => {
    const u = await makeUser("CUSTOMER", { password: "password123" });
    actAs(session(u));
    expect((await call(changePassword, { body: { currentPassword: "nope", newPassword: "brandnew123" } })).status).toBe(401);
    expect((await call(changePassword, { body: { currentPassword: "password123", newPassword: "brandnew123" } })).status).toBe(200);
    actAs(null);
    expect((await call(login, { body: { emailOrPhone: u.email, password: "password123" } })).status).toBe(401);
    expect((await call(login, { body: { emailOrPhone: u.email, password: "brandnew123" } })).status).toBe(200);
  });

  it("პაროლის ცვლილება ზრდის tokenVersion-ს (ძველი სესიები კვდება)", async () => {
    const u = await makeUser("CUSTOMER", { password: "password123" });
    expect(u.tokenVersion).toBe(0);
    actAs(session(u));
    await call(changePassword, { body: { currentPassword: "password123", newPassword: "brandnew123" } });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.tokenVersion).toBe(1);
  });
});

describe("password reset", () => {
  it("კოდით პაროლი იცვლება, კოდი ერთჯერადია", async () => {
    const u = await makeUser("CUSTOMER", { phone: "+995599888777", password: "password123" });
    await call(forgot, { body: { emailOrPhone: u.email } });
    const pr = await prisma.passwordReset.findFirstOrThrow({ where: { userId: u.id } });
    // კოდი ჰეშირებულია — ტესტისთვის ვქმნით ცნობილ კოდს
    await prisma.passwordReset.deleteMany({ where: { userId: u.id } });
    const { hashPassword } = await import("@/lib/auth/password");
    await prisma.passwordReset.create({
      data: { userId: u.id, codeHash: await hashPassword("123456"), expiresAt: new Date(Date.now() + 60000) },
    });

    const ok = await call(reset, { body: { emailOrPhone: u.email, code: "123456", newPassword: "resetted123" } });
    expect(ok.status).toBe(200);
    expect((await call(login, { body: { emailOrPhone: u.email, password: "resetted123" } })).status).toBe(200);

    const reuse = await call(reset, { body: { emailOrPhone: u.email, code: "123456", newPassword: "again12345" } });
    expect(reuse.status).toBe(400);
    void pr;

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.tokenVersion).toBe(1);
  });

  it("არასებული მომხმარებელი → მაინც 200 (გაჟონვის გარეშე)", async () => {
    const r = await call(forgot, { body: { emailOrPhone: "ghost@test.ge" } });
    expect(r.status).toBe(200);
  });
});
