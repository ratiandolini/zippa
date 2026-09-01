-- CreateEnum
CREATE TYPE "DeliveryZone" AS ENUM ('TBILISI', 'REGIONAL_CITY', 'TOWN_VILLAGE');

-- DropForeignKey
ALTER TABLE "PricingRule" DROP CONSTRAINT "PricingRule_cityId_fkey";

-- DropIndex
DROP INDEX "PricingRule_kind_cityId_isActive_idx";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "basePrice",
DROP COLUMN "distancePrice",
DROP COLUMN "pricingRuleId",
DROP COLUMN "weightPrice",
ADD COLUMN     "deliveryPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "driverFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "zone" "DeliveryZone" NOT NULL DEFAULT 'TBILISI';

-- AlterTable
ALTER TABLE "PricingRule" DROP COLUMN "basePrice",
DROP COLUMN "cityId",
DROP COLUMN "createdAt",
DROP COLUMN "freeWeightKg",
DROP COLUMN "kind",
DROP COLUMN "minPrice",
DROP COLUMN "name",
DROP COLUMN "pricePerKg",
DROP COLUMN "pricePerKm",
DROP COLUMN "priority",
ADD COLUMN     "deliveryDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "driverFlatFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sameDayCutoffHour" INTEGER,
ADD COLUMN     "weightBrackets" JSONB NOT NULL,
ADD COLUMN     "zone" "DeliveryZone" NOT NULL,
ALTER COLUMN "driverPayoutPercent" DROP NOT NULL,
ALTER COLUMN "driverPayoutPercent" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_zone_key" ON "PricingRule"("zone");

