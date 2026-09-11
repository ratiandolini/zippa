import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, call, makeUser, makeDriver, actAs, session, prisma } from "./helpers";
import { GET as getVerification, POST as submitVerification } from "@/app/api/driver/verification/route";
import { POST as uploadDoc } from "@/app/api/driver/verification/documents/route";
import { GET as getDoc } from "@/app/api/driver/verification/documents/[docId]/route";
import { GET as getDispatchVerification, POST as reviewVerification } from "@/app/api/dispatch/drivers/[id]/verification/route";
import { GET as trackPublic } from "@/app/api/orders/track/[tn]/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { PATCH as assignDriver } from "@/app/api/orders/[id]/assign/route";

beforeEach(resetDb);

function pdfFile(name = "id.pdf") {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
  return new File([bytes], name, { type: "application/pdf" });
}
function jpgFile(name = "id.jpg") {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  return new File([bytes], name, { type: "image/jpeg" });
}

async function callUpload(type: string, file: File) {
  const fd = new FormData();
  fd.append("type", type);
  fd.append("file", file);
  const req = new Request("http://test.local/api/driver/verification/documents", {
    method: "POST",
    body: fd,
    headers: { "x-forwarded-for": "10.0.0.1" },
  });
  const res = await uploadDoc(req);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe("კურიერის ვერიფიკაცია — ახალი DRIVER offers-ს ვერ ხედავს APPROVED-მდე", () => {
  it("ახალი (isApproved=false) DRIVER offers სიაში ვერ ხედავს შეთავაზებას (assign ვერ ხდება მისზე)", async () => {
    const { profile: newDriver } = await makeDriver({ approved: false });
    const customer = await makeUser("CUSTOMER");
    actAs(session(customer));
    const order = await call(createOrder, {
      body: {
        sender: { name: "მ ა", phone: "+995599111111" },
        recipient: { name: "ლ ე", phone: "+995599222222" },
        pickup: { address: "თბილისი, ა 1", lat: 41.72, lng: 44.79 },
        delivery: { address: "თბილისი, ბ 2", lat: 41.71, lng: 44.77 },
        weightKg: 3,
        parcelValue: 50,
        paymentMethod: "CASH",
        deliveryProof: "NONE",
      },
    });
    const orderId = order.body.order.id;

    const dispatcher = await makeUser("DISPATCHER");
    actAs(session(dispatcher));
    const assign = await call(assignDriver, { params: { id: orderId }, body: { driverId: newDriver.id } });
    expect(assign.status).toBe(400); // "კურიერი არ არის ხელმისაწვდომი" — isApproved=false-ის გამო
  });

  it("არსებული (isApproved=true) DRIVER-ები migration-ის შემდეგ არ იბლოკებიან — assign მუშაობს", async () => {
    const { profile: approvedDriver } = await makeDriver({ approved: true });
    const customer = await makeUser("CUSTOMER");
    actAs(session(customer));
    const order = await call(createOrder, {
      body: {
        sender: { name: "მ ა", phone: "+995599111111" },
        recipient: { name: "ლ ე", phone: "+995599222222" },
        pickup: { address: "თბილისი, ა 1", lat: 41.72, lng: 44.79 },
        delivery: { address: "თბილისი, ბ 2", lat: 41.71, lng: 44.77 },
        weightKg: 3,
        parcelValue: 50,
        paymentMethod: "CASH",
        deliveryProof: "NONE",
      },
    });
    const orderId = order.body.order.id;
    const dispatcher = await makeUser("DISPATCHER");
    actAs(session(dispatcher));
    const assign = await call(assignDriver, { params: { id: orderId }, body: { driverId: approvedDriver.id } });
    expect(assign.status).toBe(200);
  });
});

describe("დოკუმენტების ვალიდაცია", () => {
  it("ID სავალდებულოა — FOOT კურიერს მართვის მოწმობა არ მოეთხოვება, ID_FRONT/BACK კი", async () => {
    const { user, profile } = await makeDriver({ approved: false });
    actAs(session(user));
    await call(submitVerification, { body: { transportType: "FOOT" } });

    const dispatcher = await makeUser("DISPATCHER");
    actAs(session(dispatcher));
    const detail = await call(getDispatchVerification, { params: { id: profile.id } });
    expect(detail.body.verification.missingTypes).toEqual(["ID_FRONT", "ID_BACK"]);
  });

  it("მართვის მოწმობა მხოლოდ motor-vehicle ტიპებისთვისაა სავალდებულო (CAR)", async () => {
    const { user, profile } = await makeDriver({ approved: false });
    actAs(session(user));
    await call(submitVerification, { body: { transportType: "CAR" } });

    const dispatcher = await makeUser("DISPATCHER");
    actAs(session(dispatcher));
    const detail = await call(getDispatchVerification, { params: { id: profile.id } });
    expect(detail.body.verification.missingTypes).toEqual(
      expect.arrayContaining(["ID_FRONT", "ID_BACK", "DRIVER_LICENSE_FRONT", "DRIVER_LICENSE_BACK"]),
    );
  });

  it("upload: ტიპი/ზომა/signature ვალიდაცია — PDF/JPG/PNG მხოლოდ, ყალბი ფაილი 422", async () => {
    const { user } = await makeDriver({ approved: false });
    actAs(session(user));
    await call(submitVerification, { body: { transportType: "FOOT" } });

    const ok = await callUpload("ID_FRONT", pdfFile());
    expect(ok.status).toBe(200);

    const fake = new File([new Uint8Array([1, 2, 3, 4])], "x.pdf", { type: "application/pdf" });
    const bad = await callUpload("ID_BACK", fake);
    expect(bad.status).toBe(422);

    const badType = await callUpload("NOT_A_TYPE", jpgFile());
    expect(badType.status).toBe(422);
  });

  it("private document: unauthorized → 401, owner DRIVER → 200, DISPATCHER → 200, სხვა DRIVER → 403", async () => {
    const { user, profile } = await makeDriver({ approved: false });
    actAs(session(user));
    await call(submitVerification, { body: { transportType: "FOOT" } });
    const up = await callUpload("ID_FRONT", pdfFile());
    const docId = up.body.document.id;

    actAs(null);
    const unauth = await call(getDoc, { params: { docId } });
    expect(unauth.status).toBe(401);

    actAs(session(user));
    const owner = await call(getDoc, { params: { docId } });
    expect(owner.status).toBe(200);

    const dispatcher = await makeUser("DISPATCHER");
    actAs(session(dispatcher));
    const disp = await call(getDoc, { params: { docId } });
    expect(disp.status).toBe(200);

    const { user: otherDriver } = await makeDriver({ approved: true });
    actAs(session(otherDriver));
    const stranger = await call(getDoc, { params: { docId } });
    expect(stranger.status).toBe(403);
    void profile;
  });
});

describe("approve/reject/request-changes მუშაობს", () => {
  it("approve აკლებული დოკუმენტებით იბლოკება, სავალდებულოს ატვირთვის შემდეგ დამტკიცდება და isApproved=true", async () => {
    const { user, profile } = await makeDriver({ approved: false });
    actAs(session(user));
    await call(submitVerification, { body: { transportType: "FOOT" } });

    const dispatcher = await makeUser("DISPATCHER");
    actAs(session(dispatcher));
    const early = await call(reviewVerification, { params: { id: profile.id }, body: { action: "APPROVE" } });
    expect(early.status).toBe(422);

    actAs(session(user));
    await callUpload("ID_FRONT", pdfFile());
    await callUpload("ID_BACK", pdfFile());

    actAs(session(dispatcher));
    const ok = await call(reviewVerification, { params: { id: profile.id }, body: { action: "APPROVE" } });
    expect(ok.status).toBe(200);

    const dp = await prisma.driverProfile.findUnique({ where: { id: profile.id } });
    expect(dp!.isApproved).toBe(true);
  });

  it("reject → isApproved=false, changes-requested → სტატუსი და შენიშვნა ინახება", async () => {
    const { user, profile } = await makeDriver({ approved: false });
    actAs(session(user));
    await call(submitVerification, { body: { transportType: "FOOT" } });
    await callUpload("ID_FRONT", pdfFile());
    await callUpload("ID_BACK", pdfFile());

    const dispatcher = await makeUser("DISPATCHER");
    actAs(session(dispatcher));
    const changes = await call(reviewVerification, {
      params: { id: profile.id },
      body: { action: "CHANGES_REQUESTED", message: "ID არასწორია" },
    });
    expect(changes.status).toBe(200);
    expect(changes.body.verification.status).toBe("CHANGES_REQUESTED");

    const rej = await call(reviewVerification, { params: { id: profile.id }, body: { action: "REJECT", message: "ცრუ დოკუმენტი" } });
    expect(rej.status).toBe(200);
    const dp = await prisma.driverProfile.findUnique({ where: { id: profile.id } });
    expect(dp!.isApproved).toBe(false);
  });
});

describe("საჯარო tracking-ში დოკუმენტი/პირადი ნომერი არ ჩანს", () => {
  it("public tracking payload driver verification-ის მონაცემებს არ შეიცავს", async () => {
    const { profile } = await makeDriver({ approved: true });
    const customer = await makeUser("CUSTOMER");
    actAs(session(customer));
    const created = await call(createOrder, {
      body: {
        sender: { name: "მ ა", phone: "+995599111111" },
        recipient: { name: "ლ ე", phone: "+995599222222" },
        pickup: { address: "თბილისი, ა 1", lat: 41.72, lng: 44.79 },
        delivery: { address: "თბილისი, ბ 2", lat: 41.71, lng: 44.77 },
        weightKg: 3,
        parcelValue: 50,
        paymentMethod: "CASH",
        deliveryProof: "NONE",
      },
    });
    const tn = created.body.order.trackingNumber;
    void profile;
    actAs(null);
    const r = await call(trackPublic, { params: { tn } });
    const text = JSON.stringify(r.body);
    expect(text).not.toContain("personalIdLast4");
    expect(text).not.toContain("privateStorageKey");
  });
});
