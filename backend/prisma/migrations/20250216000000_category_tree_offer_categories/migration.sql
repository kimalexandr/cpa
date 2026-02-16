-- Category: hierarchical fields
ALTER TABLE "categories" ADD COLUMN "parent_id" TEXT;
ALTER TABLE "categories" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "categories" ADD COLUMN "external_ref" TEXT;

ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");
CREATE INDEX "categories_level_idx" ON "categories"("level");
CREATE INDEX "categories_is_active_idx" ON "categories"("is_active");

-- Offer-Category many-to-many
CREATE TABLE "offer_categories" (
    "offer_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    CONSTRAINT "offer_categories_pkey" PRIMARY KEY ("offer_id","category_id")
);

ALTER TABLE "offer_categories" ADD CONSTRAINT "offer_categories_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_categories" ADD CONSTRAINT "offer_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "offer_categories_category_id_idx" ON "offer_categories"("category_id");

-- Backfill: copy existing offer->category into offer_categories
INSERT INTO "offer_categories" ("offer_id", "category_id")
SELECT "id", "category_id" FROM "offers" WHERE "category_id" IS NOT NULL
ON CONFLICT ("offer_id", "category_id") DO NOTHING;

-- Make primary category optional
ALTER TABLE "offers" ALTER COLUMN "category_id" DROP NOT NULL;
