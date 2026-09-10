-- CreateEnum
CREATE TYPE "DeliveryProof" AS ENUM ('PHOTO', 'PIN', 'NONE');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryPin" TEXT,
ADD COLUMN     "deliveryProof" "DeliveryProof" NOT NULL DEFAULT 'PHOTO';
