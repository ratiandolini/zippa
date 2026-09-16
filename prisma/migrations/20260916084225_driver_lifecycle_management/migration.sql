-- CreateEnum
CREATE TYPE "DriverLifecycleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "DriverProfile" ADD COLUMN     "lifecycleStatus" "DriverLifecycleStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "DriverLifecycleEvent" (
    "id" TEXT NOT NULL,
    "driverId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "driverNameSnapshot" TEXT,
    "driverPhoneSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverLifecycleEvent_driverId_idx" ON "DriverLifecycleEvent"("driverId");

-- CreateIndex
CREATE INDEX "DriverProfile_lifecycleStatus_idx" ON "DriverProfile"("lifecycleStatus");

-- AddForeignKey
ALTER TABLE "DriverLifecycleEvent" ADD CONSTRAINT "DriverLifecycleEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

