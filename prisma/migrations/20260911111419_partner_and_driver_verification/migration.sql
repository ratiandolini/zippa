-- CreateEnum
CREATE TYPE "CompanyProfileStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CompanyPricingMode" AS ENUM ('DEFAULT', 'DISCOUNT_PERCENT', 'CUSTOM_RULES');

-- CreateEnum
CREATE TYPE "TransportType" AS ENUM ('FOOT', 'BICYCLE', 'MOTORCYCLE', 'CAR', 'VAN');

-- CreateEnum
CREATE TYPE "DriverVerificationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DriverDocumentType" AS ENUM ('ID_FRONT', 'ID_BACK', 'DRIVER_LICENSE_FRONT', 'DRIVER_LICENSE_BACK', 'VEHICLE_REGISTRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "DriverDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "legalAddress" TEXT NOT NULL,
    "contactPersonName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "billingEmail" TEXT,
    "status" "CompanyProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "changesRequestedMessage" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyContractAcceptance" (
    "id" TEXT NOT NULL,
    "companyProfileId" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "contractTitle" TEXT NOT NULL,
    "contractContentHash" TEXT NOT NULL,
    "acceptedByUserId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedIp" TEXT,
    "acceptedUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyContractAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyPricingProfile" (
    "id" TEXT NOT NULL,
    "companyProfileId" TEXT NOT NULL,
    "pricingMode" "CompanyPricingMode" NOT NULL DEFAULT 'DEFAULT',
    "discountPercent" DECIMAL(5,2),
    "customRules" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPricingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerAuditEvent" (
    "id" TEXT NOT NULL,
    "companyProfileId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "message" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverVerification" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "transportType" "TransportType" NOT NULL DEFAULT 'FOOT',
    "status" "DriverVerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "personalIdLast4" TEXT,
    "rejectionReason" TEXT,
    "changesRequestedMessage" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverDocument" (
    "id" TEXT NOT NULL,
    "driverVerificationId" TEXT NOT NULL,
    "type" "DriverDocumentType" NOT NULL,
    "privateStorageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "status" "DriverDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "DriverDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_ownerUserId_key" ON "CompanyProfile"("ownerUserId");

-- CreateIndex
CREATE INDEX "CompanyProfile_status_idx" ON "CompanyProfile"("status");

-- CreateIndex
CREATE INDEX "CompanyProfile_taxId_idx" ON "CompanyProfile"("taxId");

-- CreateIndex
CREATE INDEX "CompanyContractAcceptance_companyProfileId_idx" ON "CompanyContractAcceptance"("companyProfileId");

-- CreateIndex
CREATE INDEX "CompanyPricingProfile_companyProfileId_active_idx" ON "CompanyPricingProfile"("companyProfileId", "active");

-- CreateIndex
CREATE INDEX "PartnerAuditEvent_companyProfileId_idx" ON "PartnerAuditEvent"("companyProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverVerification_driverId_key" ON "DriverVerification"("driverId");

-- CreateIndex
CREATE INDEX "DriverVerification_status_idx" ON "DriverVerification"("status");

-- CreateIndex
CREATE INDEX "DriverDocument_driverVerificationId_idx" ON "DriverDocument"("driverVerificationId");

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyContractAcceptance" ADD CONSTRAINT "CompanyContractAcceptance_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyContractAcceptance" ADD CONSTRAINT "CompanyContractAcceptance_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPricingProfile" ADD CONSTRAINT "CompanyPricingProfile_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPricingProfile" ADD CONSTRAINT "CompanyPricingProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAuditEvent" ADD CONSTRAINT "PartnerAuditEvent_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverVerification" ADD CONSTRAINT "DriverVerification_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverVerification" ADD CONSTRAINT "DriverVerification_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_driverVerificationId_fkey" FOREIGN KEY ("driverVerificationId") REFERENCES "DriverVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data backfill (additive, idempotent): "grandfather" ის ალბათ დაამტკიცებული კურიერები —
-- ეს ახალი ცხრილის ჩანაწერია, არსებულ მონაცემებს არ ეხება/არ ცვლის. isApproved-ის მართალი
-- გატი (offers/assign) ამ ჩანაწერზე არ დამოკიდებულა — ეს მხოლოდ დისპეჩერის review-პანელს
-- აძლევს ჭეშმარიტ საწყის მდგომარეობას "NOT_SUBMITTED"-ის ნაცვლად.
INSERT INTO "DriverVerification" ("id", "driverId", "transportType", "status", "changesRequestedMessage", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  dp."id",
  CASE dp."vehicleType"
    WHEN 'BIKE' THEN 'BICYCLE'
    WHEN 'MOTORCYCLE' THEN 'MOTORCYCLE'
    WHEN 'CAR' THEN 'CAR'
    WHEN 'VAN' THEN 'VAN'
    ELSE 'FOOT'
  END::"TransportType",
  'APPROVED'::"DriverVerificationStatus",
  'grandfathered — დამტკიცებულია დოკუმენტური ვერიფიკაციის დამატებამდე',
  now(),
  now()
FROM "DriverProfile" dp
WHERE dp."isApproved" = true
  AND NOT EXISTS (SELECT 1 FROM "DriverVerification" dv WHERE dv."driverId" = dp."id");
