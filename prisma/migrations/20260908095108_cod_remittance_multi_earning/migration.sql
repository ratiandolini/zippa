-- DropIndex
DROP INDEX "DriverEarning_orderId_key";

-- AlterTable
ALTER TABLE "DriverEarning" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'DELIVERY';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "codCommission" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "codRemittanceId" TEXT;

-- CreateTable
CREATE TABLE "CodRemittance" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "grossAmount" DECIMAL(10,2) NOT NULL,
    "commission" DECIMAL(10,2) NOT NULL,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodRemittance_customerId_idx" ON "CodRemittance"("customerId");

-- CreateIndex
CREATE INDEX "DriverEarning_orderId_idx" ON "DriverEarning"("orderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_codRemittanceId_fkey" FOREIGN KEY ("codRemittanceId") REFERENCES "CodRemittance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodRemittance" ADD CONSTRAINT "CodRemittance_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
