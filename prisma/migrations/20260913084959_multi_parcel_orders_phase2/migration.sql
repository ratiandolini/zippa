-- AlterEnum
ALTER TYPE "OrderFailureReason" ADD VALUE 'RETURN';

-- AlterTable
ALTER TABLE "OrderParcel" ALTER COLUMN "weightKg" DROP NOT NULL;

