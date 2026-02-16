-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('country', 'federal_district', 'region', 'city');

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "full_name" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "code" TEXT,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_locations" (
    "offer_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,

    CONSTRAINT "offer_locations_pkey" PRIMARY KEY ("offer_id","location_id")
);

-- CreateIndex
CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");
CREATE INDEX "locations_type_idx" ON "locations"("type");
CREATE INDEX "locations_level_idx" ON "locations"("level");
CREATE INDEX "locations_is_active_idx" ON "locations"("is_active");

-- CreateIndex
CREATE INDEX "offer_locations_location_id_idx" ON "offer_locations"("location_id");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_locations" ADD CONSTRAINT "offer_locations_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_locations" ADD CONSTRAINT "offer_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
