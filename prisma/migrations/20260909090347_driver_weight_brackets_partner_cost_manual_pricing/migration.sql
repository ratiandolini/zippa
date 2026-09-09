-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "companyMargin" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "needsManualReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partnerCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "priceAdjustedAt" TIMESTAMP(3),
ADD COLUMN     "priceAdjustedById" TEXT,
ADD COLUMN     "priceAdjustmentReason" TEXT,
ADD COLUMN     "pricingSource" TEXT NOT NULL DEFAULT 'RULE';

-- AlterTable
ALTER TABLE "PricingRule" ADD COLUMN     "driverWeightBrackets" JSONB,
ADD COLUMN     "partnerCost" DECIMAL(10,2) NOT NULL DEFAULT 0;
