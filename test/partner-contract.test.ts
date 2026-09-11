import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, call, makeUser, actAs, session, prisma } from "./helpers";
import { GET as getCompany, POST as postCompany } from "@/app/api/company/route";
import { POST as submitCompany } from "@/app/api/company/submit/route";
import { GET as getPartner } from "@/app/api/dispatch/partners/[id]/route";
import {
  CONTRACT_VERSION,
  CONTRACT_CLAUSES,
  publicContractText,
  contractContentHash,
} from "@/lib/partner-contract";

beforeEach(resetDb);

const profileBody = () => ({
  legalName: "შპს ტესტი",
  taxId: "123456789",
  legalAddress: "თბილისი, ვაჟა-ფშაველას 1",
  contactPersonName: "გიორგი გიორგაძე",
  contactEmail: "partner@test.ge",
  contactPhone: "+995599123456",
});

describe("ხელშეკრულების ტექსტი — ვერსია 1.1", () => {
  it("ტექსტში placeholder/შიდა შენიშვნა აღარ არსებობს", () => {
    const text = publicContractText();
    for (const marker of ["დასადგენია", "იურისტთან შეთანხმებით", "legalReviewRequired", "[", "]"]) {
      expect(text).not.toContain(marker);
    }
  });

  it("ვერსია არის 1.1", () => {
    expect(CONTRACT_VERSION).toBe("1.1");
  });

  it("hash ემთხვევა ტექსტს — სტაბილური და დეტერმინირებული", () => {
    const h1 = contractContentHash();
    const h2 = contractContentHash();
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("ContractClause-ს legalReviewRequired ველი აღარ აქვს", () => {
    for (const c of CONTRACT_CLAUSES) {
      expect(c).not.toHaveProperty("legalReviewRequired");
    }
  });
});

describe("თანხმობის ციკლი — draft/submit/append-only", () => {
  it("unchecked checkbox-ით submit უარყოფილია", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    await call(postCompany, { body: profileBody() });
    const r = await call(submitCompany, {
      body: { agreeToContract: false, contractVersion: CONTRACT_VERSION },
    });
    expect(r.status).toBe(422);
    const profile = await prisma.companyProfile.findUnique({ where: { ownerUserId: c.id } });
    const acceptances = await prisma.companyContractAcceptance.findMany({
      where: { companyProfileId: profile!.id },
    });
    expect(acceptances).toHaveLength(0);
  });

  it("DRAFT სტატუსი (მხოლოდ პროფილის შენახვა) acceptance-ს არ ქმნის", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    await call(postCompany, { body: profileBody() });
    const profile = await prisma.companyProfile.findUnique({ where: { ownerUserId: c.id } });
    expect(profile!.status).toBe("DRAFT");
    const acceptances = await prisma.companyContractAcceptance.findMany({
      where: { companyProfileId: profile!.id },
    });
    expect(acceptances).toHaveLength(0);
  });

  it("SUBMIT ქმნის append-only acceptance-ს ზუსტად მიმდინარე ვერსია/hash-ით", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    await call(postCompany, { body: profileBody() });
    const r = await call(submitCompany, {
      body: { agreeToContract: true, contractVersion: CONTRACT_VERSION },
    });
    expect(r.status).toBe(200);
    const profile = await prisma.companyProfile.findUnique({ where: { ownerUserId: c.id } });
    const acceptances = await prisma.companyContractAcceptance.findMany({
      where: { companyProfileId: profile!.id },
    });
    expect(acceptances).toHaveLength(1);
    expect(acceptances[0]!.contractVersion).toBe(CONTRACT_VERSION);
    expect(acceptances[0]!.contractContentHash).toBe(contractContentHash());
  });

  it("ძველი (1.0) acceptance ჩანაწერი ახალი submit-ის შემდეგაც უცვლელია", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    await call(postCompany, { body: profileBody() });
    const profile = await prisma.companyProfile.findUnique({ where: { ownerUserId: c.id } });

    // სიმულაცია — ძველი, v1.0-ზე მიღებული თანხმობა, პირდაპირ ბაზაში (როგორც production-ში იქნებოდა)
    const old = await prisma.companyContractAcceptance.create({
      data: {
        companyProfileId: profile!.id,
        contractVersion: "1.0",
        contractTitle: "Zippa — პარტნიორობის ხელშეკრულება",
        contractContentHash: "old-hash-placeholder",
        acceptedByUserId: c.id,
      },
    });

    await call(submitCompany, { body: { agreeToContract: true, contractVersion: CONTRACT_VERSION } });

    const oldAfter = await prisma.companyContractAcceptance.findUnique({ where: { id: old.id } });
    expect(oldAfter!.contractVersion).toBe("1.0");
    expect(oldAfter!.contractContentHash).toBe("old-hash-placeholder");

    const all = await prisma.companyContractAcceptance.findMany({
      where: { companyProfileId: profile!.id },
      orderBy: { acceptedAt: "asc" },
    });
    expect(all).toHaveLength(2);
    expect(all[1]!.contractVersion).toBe(CONTRACT_VERSION);
  });
});

describe("დისპეჩერის ერთიანი გვერდი — პროფილი + მიღებული ხელშეკრულება", () => {
  it("დისპეჩერი ერთ response-ში ხედავს კომპანიის პროფილსა და მიღებული ხელშეკრულების სრულ ტექსტს", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    await call(postCompany, { body: profileBody() });
    await call(submitCompany, { body: { agreeToContract: true, contractVersion: CONTRACT_VERSION } });
    const profile = await prisma.companyProfile.findUnique({ where: { ownerUserId: c.id } });

    const dispatcher = await makeUser("DISPATCHER");
    actAs(session(dispatcher));
    const r = await call(getPartner, { params: { id: profile!.id } });
    expect(r.status).toBe(200);
    expect(r.body.profile.legalName).toBe("შპს ტესტი");
    expect(r.body.contractClauses.length).toBe(CONTRACT_CLAUSES.length);
    expect(r.body.contractClauses[0].title).toContain("მხარეები");
    expect(r.body.acceptedCurrentVersion).toBe(true);
  });
});
