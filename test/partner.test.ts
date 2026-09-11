import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, call, makeUser, actAs, session, prisma } from "./helpers";
import { GET as getCompany, POST as postCompany } from "@/app/api/company/route";
import { POST as submitCompany } from "@/app/api/company/submit/route";
import { GET as getContract } from "@/app/api/company/contract/route";
import { GET as listPartners } from "@/app/api/dispatch/partners/route";
import { GET as getPartner } from "@/app/api/dispatch/partners/[id]/route";
import { POST as reviewPartner } from "@/app/api/dispatch/partners/[id]/review/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { POST as quote } from "@/app/api/pricing/quote/route";
import { CONTRACT_VERSION } from "@/lib/partner-contract";

beforeEach(resetDb);

const profileBody = (over: Record<string, unknown> = {}) => ({
  legalName: "შპს ტესტი",
  taxId: "123456789",
  legalAddress: "თბილისი, ვაჟა-ფშაველას 1",
  contactPersonName: "გიორგი გიორგაძე",
  contactEmail: "partner@test.ge",
  contactPhone: "+995599123456",
  ...over,
});

const orderBody = (over: Record<string, unknown> = {}) => ({
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

async function submitAndApprove(customer: Awaited<ReturnType<typeof makeUser>>, pricing?: unknown) {
  actAs(session(customer));
  await call(postCompany, { body: profileBody() });
  await call(submitCompany, { body: { agreeToContract: true, contractVersion: CONTRACT_VERSION } });
  const profile = await prisma.companyProfile.findUnique({ where: { ownerUserId: customer.id } });

  const dispatcher = await makeUser("DISPATCHER");
  actAs(session(dispatcher));
  const approved = await call(reviewPartner, {
    params: { id: profile!.id },
    body: { action: "APPROVE", pricing },
  });
  return { profile: profile!, approved, dispatcher };
}

describe("პარტნიორი კომპანია — ჩვეულებრივი CUSTOMER ნაკადი უცვლელია", () => {
  it("ჩვეულებრივი CUSTOMER-ს company-პროფილის გარეშეც შეკვეთის შექმნა ძველებურად მუშაობს", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const r = await call(createOrder, { body: orderBody() });
    expect(r.status).toBe(201);
  });

  it("company-პროფილი null-ია, სანამ ამას თავად არ შექმნის (სავალდებულო არაა)", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const r = await call(getCompany);
    expect(r.status).toBe(200);
    expect(r.body.profile).toBeNull();
  });
});

describe("პარტნიორის განაცხადი — draft/submit", () => {
  it("draft profile იქმნება და status=DRAFT", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const r = await call(postCompany, { body: profileBody() });
    expect(r.status).toBe(200);
    expect(r.body.profile.status).toBe("DRAFT");
  });

  it("submit checkbox-ის გარეშე იბლოკება", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    await call(postCompany, { body: profileBody() });
    const bad = await call(submitCompany, { body: { agreeToContract: false, contractVersion: CONTRACT_VERSION } });
    expect(bad.status).toBe(422);
  });

  it("contract acceptance ინახება submit-ის შემდეგ", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    await call(postCompany, { body: profileBody() });
    const r = await call(submitCompany, { body: { agreeToContract: true, contractVersion: CONTRACT_VERSION } });
    expect(r.status).toBe(200);
    const profile = await prisma.companyProfile.findUnique({ where: { ownerUserId: c.id } });
    const acceptances = await prisma.companyContractAcceptance.findMany({
      where: { companyProfileId: profile!.id },
    });
    expect(acceptances).toHaveLength(1);
    expect(acceptances[0]!.contractVersion).toBe(CONTRACT_VERSION);
  });

  it("unauthorized მომხმარებელი (login-ის გარეშე) ვერ ხედავს company endpoint-ს", async () => {
    actAs(null);
    const r = await call(getCompany);
    expect(r.status).toBe(401);
  });

  it("სხვა CUSTOMER ვერ ხედავს სხვის company-პროფილს (dispatcher detail-ის მიღმა)", async () => {
    const c1 = await makeUser("CUSTOMER");
    const c2 = await makeUser("CUSTOMER");
    actAs(session(c1));
    await call(postCompany, { body: profileBody() });
    // c2-ის GET /api/company მხოლოდ საკუთარ (null) პროფილს აბრუნებს, c1-ის მონაცემები არსად არ გამოჰყავს
    actAs(session(c2));
    const r = await call(getCompany);
    expect(r.status).toBe(200);
    expect(r.body.profile).toBeNull();
  });

  it("DRIVER/DISPATCHER ვერ ქმნის company-პროფილს (მხოლოდ CUSTOMER)", async () => {
    const driver = await makeUser("DRIVER");
    actAs(session(driver));
    const r = await call(postCompany, { body: profileBody() });
    expect(r.status).toBe(403);
  });
});

describe("დისპეჩერის review გვერდი", () => {
  it("DISPATCHER ხედავს სრულ review გვერდს (list + detail)", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    await call(postCompany, { body: profileBody() });
    await call(submitCompany, { body: { agreeToContract: true, contractVersion: CONTRACT_VERSION } });
    const profile = await prisma.companyProfile.findUnique({ where: { ownerUserId: c.id } });

    const dispatcher = await makeUser("DISPATCHER");
    actAs(session(dispatcher));
    const list = await call(listPartners, { query: { status: "SUBMITTED" } });
    expect(list.status).toBe(200);
    expect(list.body.partners).toHaveLength(1);

    const detail = await call(getPartner, { params: { id: profile!.id } });
    expect(detail.status).toBe(200);
    expect(detail.body.profile.legalName).toBe("შპს ტესტი");
    expect(detail.body.legalReviewClauses.length).toBeGreaterThan(0);
  });

  it("CUSTOMER-ს დისპეჩერის review endpoint-ზე წვდომა არ აქვს", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const r = await call(listPartners);
    expect(r.status).toBe(403);
  });

  it("approval აკლებული მონაცემებით (თანხმობის გარეშე) იბლოკება", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    await call(postCompany, { body: profileBody() });
    // submit არ ხდება — თანხმობა არ არსებობს
    const profile = await prisma.companyProfile.findUnique({ where: { ownerUserId: c.id } });

    const dispatcher = await makeUser("DISPATCHER");
    actAs(session(dispatcher));
    const r = await call(reviewPartner, { params: { id: profile!.id }, body: { action: "APPROVE" } });
    expect(r.status).toBe(422);
    expect(String(r.body.error)).toContain("ხელშეკრულებაზე თანხმობა");
  });

  it("approval transaction წარმატებულია — status=APPROVED", async () => {
    const c = await makeUser("CUSTOMER");
    const { approved } = await submitAndApprove(c);
    expect(approved.status).toBe(200);
    expect(approved.body.profile.status).toBe("APPROVED");
  });

  it("იგივე action-ის ხელახალი გაშვება (idempotent) → 409", async () => {
    const c = await makeUser("CUSTOMER");
    const { profile, dispatcher } = await submitAndApprove(c);
    actAs(session(dispatcher));
    const again = await call(reviewPartner, { params: { id: profile.id }, body: { action: "APPROVE" } });
    expect(again.status).toBe(409);
  });
});

describe("custom pricing — მხოლოდ APPROVED კომპანიაზე", () => {
  it("DRAFT/SUBMITTED კომპანიის quote საჯარო ტარიფით ითვლება", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    await call(postCompany, { body: profileBody() });
    await call(submitCompany, { body: { agreeToContract: true, contractVersion: CONTRACT_VERSION } });
    const r = await call(quote, {
      body: { pickup: orderBody().pickup, delivery: orderBody().delivery, weightKg: 3, paymentMethod: "CASH" },
    });
    expect(r.status).toBe(200);
    expect(r.body.deliveryPrice).toBe(5); // საჯარო თბილისის ტარიფი 3კგ → 5₾
  });

  it("APPROVED კომპანიის 20% ფასდაკლება ავტომატურად ჩაირთვება quote-ზე", async () => {
    const c = await makeUser("CUSTOMER");
    await submitAndApprove(c, { pricingMode: "DISCOUNT_PERCENT", discountPercent: 20 });

    actAs(session(c));
    const r = await call(quote, {
      body: { pickup: orderBody().pickup, delivery: orderBody().delivery, weightKg: 3, paymentMethod: "CASH" },
    });
    expect(r.status).toBe(200);
    expect(r.body.deliveryPrice).toBe(4); // 5 * 0.8
  });

  it("ძველ (APPROVED-მდე შექმნილ) შეკვეთას ფასდაკლების დამტკიცების შემდეგაც ფასი არ ეცვლება", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const created = await call(createOrder, { body: orderBody() });
    expect(created.status).toBe(201);
    const orderId = (created.body.order as { id: string }).id;
    const before = await prisma.order.findUnique({ where: { id: orderId } });

    await submitAndApprove(c, { pricingMode: "DISCOUNT_PERCENT", discountPercent: 50 });

    const after = await prisma.order.findUnique({ where: { id: orderId } });
    expect(Number(after!.deliveryPrice)).toBe(Number(before!.deliveryPrice));
  });

  it("სხვა (company-პროფილის არმქონე) CUSTOMER-ის ფასი უცვლელია", async () => {
    const c1 = await makeUser("CUSTOMER");
    await submitAndApprove(c1, { pricingMode: "DISCOUNT_PERCENT", discountPercent: 30 });

    const c2 = await makeUser("CUSTOMER");
    actAs(session(c2));
    const r = await call(quote, {
      body: { pickup: orderBody().pickup, delivery: orderBody().delivery, weightKg: 3, paymentMethod: "CASH" },
    });
    expect(r.body.deliveryPrice).toBe(5);
  });
});

describe("duplicate taxId/email collision", () => {
  it("ერთი CUSTOMER-ს ერთზე მეტი company-პროფილის შექმნა ვერ შესაძლებელი — მეორედ POST → update, არა ახალი row", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    await call(postCompany, { body: profileBody() });
    await call(postCompany, { body: profileBody({ legalName: "განახლებული სახელი" }) });
    const rows = await prisma.companyProfile.findMany({ where: { ownerUserId: c.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.legalName).toBe("განახლებული სახელი");
  });

  it("ორი სხვადასხვა CUSTOMER-ს ერთი და იგივე taxId-ით პროფილი უსაფრთხოდ იქმნება (taxId არ არის @unique)", async () => {
    const c1 = await makeUser("CUSTOMER");
    const c2 = await makeUser("CUSTOMER");
    actAs(session(c1));
    const r1 = await call(postCompany, { body: profileBody({ taxId: "999999999" }) });
    actAs(session(c2));
    const r2 = await call(postCompany, { body: profileBody({ taxId: "999999999" }) });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });
});
