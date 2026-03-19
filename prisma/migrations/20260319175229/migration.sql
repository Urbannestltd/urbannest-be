-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "amenities" TEXT[],
ADD COLUMN     "images" TEXT[],
ADD COLUMN     "price" DOUBLE PRECISION,
ALTER COLUMN "city" DROP NOT NULL,
ALTER COLUMN "zip" DROP NOT NULL;
