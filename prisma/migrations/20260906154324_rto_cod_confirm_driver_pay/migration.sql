-- CreateEnum
CREATE TYPE "OrderFailureReason" AS ENUM ('RECIPIENT_UNAVAILABLE', 'RECIPIENT_REFUSED', 'ADDRESS_INVALID', 'DAMAGED', 'OTHER');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "CashSettlement" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "failureReason" "OrderFailureReason",
ADD COLUMN     "returnFee" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PricingRule" ADD COLUMN     "driverBaseFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "driverFreeKm" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "driverPerKm" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "CashSettlement_status_idx" ON "CashSettlement"("status");
