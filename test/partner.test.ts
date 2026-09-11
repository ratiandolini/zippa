import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

async function submitAndApprove(customer: Awaited<ReturnType<typeof makeUser>>) {
  actAs(session(customer));
  await call(postCompany, { body: profileBody() });
  await call(submitCompany, { body: { agreeToContract: true, contractVersion: CONTRACT_VERSION } });
  const profile = await prisma.companyProfile.findUnique({ where: { ownerUserId: customer.id } });

  const dispatcher = await makeUser("DISPATCHER");
  actAs(session(dispatcher));
  const approved = await call(reviewPartner, {
    params: { id: profile!.id },
    body: { action: "APPROVE" },
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
    expect(detail.body.contractClauses.length).toBeGreaterThan(0);
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

// RETAIL_PRICE_MARKUP_ENABLED default false-ია test/env.ts-შიც (production-ის იდენტური),
// რომ calculatePrice-ის ყველა არსებული პირდაპირი გამომძახებელი (test/pricing.test.ts და სხვ.)
// უცვლელი დარჩეს. ეს ბლოკი ცალკე, module-isolated stub-ით ჩართავს markup-ს მხოლოდ
// საკუთარი ტესტებისთვის — quote/createOrder/editOrder თავიდან იმპორტირდება ყოველ ტესტზე.
describe("ორი-კატეგორია ფასი — RETAIL (+2₾) vs PARTNER (მოქმედი საბაზო ტარიფი)", () => {
  let quoteMarkup: typeof import("@/app/api/pricing/quote/route").POST;
  let createOrderMarkup: typeof import("@/app/api/orders/route").POST;
  let editOrderMarkup: typeof import("@/app/api/orders/[id]/route").PATCH;
  let postCompanyMarkup: typeof import("@/app/api/company/route").POST;
  let submitCompanyMarkup: typeof import("@/app/api/company/submit/route").POST;
  let reviewPartnerMarkup: typeof import("@/app/api/dispatch/partners/[id]/review/route").POST;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("RETAIL_PRICE_MARKUP_ENABLED", "true");
    ({ POST: quoteMarkup } = await import("@/app/api/pricing/quote/route"));
    ({ POST: createOrderMarkup } = await import("@/app/api/orders/route"));
    ({ PATCH: editOrderMarkup } = await import("@/app/api/orders/[id]/route"));
    ({ POST: postCompanyMarkup } = await import("@/app/api/company/route"));
    ({ POST: submitCompanyMarkup } = await import("@/app/api/company/submit/route"));
    ({ POST: reviewPartnerMarkup } = await import("@/app/api/dispatch/partners/[id]/review/route"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function submitAndApproveMarkup(customer: Awaited<ReturnType<typeof makeUser>>) {
    actAs(session(customer));
    await call(postCompanyMarkup, { body: profileBody() });
    await call(submitCompanyMarkup, { body: { agreeToContract: true, contractVersion: CONTRACT_VERSION } });
    const profile = await prisma.companyProfile.findUnique({ where: { ownerUserId: customer.id } });
    const dispatcher = await makeUser("DISPATCHER");
    actAs(session(dispatcher));
    await call(reviewPartnerMarkup, { params: { id: profile!.id }, body: { action: "APPROVE" } });
    return profile!;
  }

  const quoteBody = () => ({
    pickup: orderBody().pickup,
    delivery: orderBody().delivery,
    weightKg: 3,
    paymentMethod: "CASH" as const,
  });

  it("1. ჩვეულებრივი CUSTOMER (company-პროფილის გარეშე) → არსებული ფასი +2₾", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const r = await call(quoteMarkup, { body: quoteBody() });
    expect(r.status).toBe(200);
    expect(r.body.deliveryPrice).toBe(7); // 5 + 2
    expect(r.body.priceCategory).toBe("RETAIL");
  });

  it("2. APPROVED კომპანია → არსებული ფასი (markup-ის გარეშე)", async () => {
    const c = await makeUser("CUSTOMER");
    await submitAndApproveMarkup(c);
    actAs(session(c));
    const r = await call(quoteMarkup, { body: quoteBody() });
    expect(r.body.deliveryPrice).toBe(5);
    expect(r.body.priceCategory).toBe("PARTNER");
  });

  it.each([
    ["3. DRAFT", "DRAFT"],
    ["4. SUBMITTED", "SUBMITTED"],
    ["5. CHANGES_REQUESTED", "CHANGES_REQUESTED"],
    ["6. REJECTED", "REJECTED"],
    ["7. SUSPENDED", "SUSPENDED"],
  ])("%s კომპანია → +2₾ (მხოლოდ APPROVED იღებს პარტნიორის ფასს)", async (_label, status) => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    await call(postCompanyMarkup, { body: profileBody() });
    await prisma.companyProfile.update({ where: { ownerUserId: c.id }, data: { status: status as never } });
    const r = await call(quoteMarkup, { body: quoteBody() });
    expect(r.body.deliveryPrice).toBe(7);
    expect(r.body.priceCategory).toBe("RETAIL");
  });

  it("8. quote და create-order ერთსა და იმავე ფასს აბრუნებს", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const q = await call(quoteMarkup, { body: quoteBody() });
    const created = await call(createOrderMarkup, { body: orderBody() });
    expect(created.status).toBe(201);
    expect(Number(created.body.order.price.delivery)).toBe(q.body.deliveryPrice);
  });

  it("9. +2₾ მხოლოდ ერთხელ ემატება — არა კგ-ზე ან წონის ბრეკეტების რაოდენობაზე", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const light = await call(quoteMarkup, { body: { ...quoteBody(), weightKg: 3 } });
    const heavier = await call(quoteMarkup, { body: { ...quoteBody(), weightKg: 10 } });
    expect(light.body.deliveryPrice).toBe(7); // 5+2
    expect(heavier.body.deliveryPrice).toBe(8); // 6+2, არა 5+2+2 ან სხვა გამრავლება
  });

  it("10. COD (collectAmount) თანხას +2₾ არ ემატება", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const r = await call(quoteMarkup, { body: { ...quoteBody(), collectAmount: 100 } });
    expect(r.body.deliveryPrice).toBe(7); // 5+2
    expect(r.body.codAmount).toBe(107); // deliveryPrice(7) + collectAmount(100), collectAmount უცვლელი
  });

  it("11. წონის/ზონის surcharge (codFee, partnerCost) markup-ით არ იცვლება", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const r = await call(quoteMarkup, { body: quoteBody() });
    expect(r.body.codFee).toBe(0); // production-ში ყველა ზონას codFee=0
  });

  it("12. არსებული (APPROVED-მდე შექმნილ) შეკვეთის ფასი approval-ის შემდეგაც არ იცვლება", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const created = await call(createOrderMarkup, { body: orderBody() });
    const orderId = created.body.order.id;
    const before = await prisma.order.findUnique({ where: { id: orderId } });

    await submitAndApproveMarkup(c);

    const after = await prisma.order.findUnique({ where: { id: orderId } });
    expect(Number(after!.deliveryPrice)).toBe(Number(before!.deliveryPrice));
    expect(Number(after!.deliveryPrice)).toBe(7); // RETAIL-ად შექმნილი, +2₾-ითვე რჩება
  });

  it("13. კომპანიის დამტკიცება მხოლოდ მომავალ შეკვეთებზე მოქმედებს", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const before = await call(createOrderMarkup, { body: orderBody() });
    expect(before.body.order.price.delivery).toBe(7);

    await submitAndApproveMarkup(c);

    actAs(session(c));
    const after = await call(createOrderMarkup, { body: orderBody() });
    expect(after.body.order.price.delivery).toBe(5);
  });

  it("14. სხვა CUSTOMER-ის კომპანიის სტატუსით ფასის მიღება შეუძლებელია", async () => {
    const c1 = await makeUser("CUSTOMER");
    await submitAndApproveMarkup(c1); // c1 → APPROVED

    const c2 = await makeUser("CUSTOMER");
    actAs(session(c2));
    const r = await call(quoteMarkup, { body: quoteBody() });
    expect(r.body.deliveryPrice).toBe(7); // c2-ს company-პროფილი არ აქვს → RETAIL
    expect(r.body.priceCategory).toBe("RETAIL");
  });

  it("დისპეჩერის edit — ფასი ორდერის მფლობელი CUSTOMER-ის სტატუსით, არა დისპეჩერის როლით", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const created = await call(createOrderMarkup, { body: orderBody({ weightKg: 3 }) });
    const orderId = created.body.order.id;
    expect(created.body.order.price.delivery).toBe(7); // RETAIL

    await submitAndApproveMarkup(c); // c → APPROVED

    const dispatcher = await makeUser("DISPATCHER");
    actAs(session(dispatcher));
    const edited = await call(editOrderMarkup, { method: "PATCH", params: { id: orderId }, body: { weightKg: 4 } });
    expect(edited.status).toBe(200);
    expect(edited.body.order.price.delivery).toBe(5); // c-ს status=APPROVED → PARTNER, დისპეჩერის როლს მიუხედავად
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
