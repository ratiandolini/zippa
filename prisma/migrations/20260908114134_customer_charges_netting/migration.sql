-- AlterTable
ALTER TABLE "CodRemittance" ADD COLUMN     "chargesDeducted" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "chargeSettledAt" TIMESTAMP(3);
