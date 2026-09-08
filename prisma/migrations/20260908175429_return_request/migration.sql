-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "returnReason" TEXT,
ADD COLUMN     "returnRequestedAt" TIMESTAMP(3),
ADD COLUMN     "returnResolvedAt" TIMESTAMP(3);
