-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('PENDING', 'PICKED_UP', 'NOT_PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'REFUSED', 'RETURN_REQUESTED', 'RETURNED', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "CustomerAdjustment" ADD COLUMN     "parcelId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "isMultiParcel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parcelCount" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "OrderParcel" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "label" TEXT,
    "weightKg" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "declaredValue" DECIMAL(10,2),
    "status" "ParcelStatus" NOT NULL DEFAULT 'PENDING',
    "pickupAttempts" INTEGER NOT NULL DEFAULT 0,
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failureReason" "OrderFailureReason",
    "failureNote" TEXT,
    "returnRequestedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "proofPhotoUrl" TEXT,
    "codAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allocatedDeliveryPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allocatedDriverFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderParcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderParcelEvent" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "status" "ParcelStatus" NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderParcelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderParcel_orderId_idx" ON "OrderParcel"("orderId");

-- CreateIndex
CREATE INDEX "OrderParcel_status_idx" ON "OrderParcel"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrderParcel_orderId_sequenceNo_key" ON "OrderParcel"("orderId", "sequenceNo");

-- CreateIndex
CREATE INDEX "OrderParcelEvent_parcelId_idx" ON "OrderParcelEvent"("parcelId");

-- AddForeignKey
ALTER TABLE "CustomerAdjustment" ADD CONSTRAINT "CustomerAdjustment_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "OrderParcel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderParcel" ADD CONSTRAINT "OrderParcel_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderParcelEvent" ADD CONSTRAINT "OrderParcelEvent_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "OrderParcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

