-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountType" "AccountType" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "agreedAt" TIMESTAMP(3),
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "taxId" TEXT,
ADD COLUMN     "termsVersion" TEXT;
