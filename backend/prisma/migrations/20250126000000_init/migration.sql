-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('affiliate', 'supplier', 'admin');
CREATE TYPE "UserStatus" AS ENUM ('active', 'blocked', 'pending_email_confirmation');
CREATE TYPE "PayoutModel" AS ENUM ('CPL', 'CPA', 'RevShare');
CREATE TYPE "OfferStatus" AS ENUM ('draft', 'active', 'paused', 'closed');
CREATE TYPE "ParticipationStatus" AS ENUM ('pending', 'approved', 'rejected', 'blocked');
CREATE TYPE "EventType" AS ENUM ('click', 'lead', 'sale');
CREATE TYPE "EventStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'processing', 'paid', 'canceled');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "name" TEXT,
    "company_name" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "city" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "affiliate_profiles" (
    "user_id" TEXT NOT NULL,
    "payout_details" TEXT,
    "traffic_sources" TEXT,
    "notes" TEXT,

    CONSTRAINT "affiliate_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "supplier_profiles" (
    "user_id" TEXT NOT NULL,
    "legal_entity" TEXT NOT NULL,
    "inn" TEXT,
    "kpp" TEXT,
    "vat_id" TEXT,
    "website" TEXT,
    "payout_terms" TEXT,

    CONSTRAINT "supplier_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target_geo" TEXT,
    "payout_model" "PayoutModel" NOT NULL,
    "payout_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "landing_url" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "affiliate_offer_participations" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "status" "ParticipationStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_offer_participations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tracking_links" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "tracking_link_id" TEXT NOT NULL,
    "event_type" "EventType" NOT NULL,
    "amount" DECIMAL(12,2),
    "currency" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'pending',
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "static_pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "static_pages_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_email_idx" ON "User"("email");

CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

CREATE INDEX "offers_category_id_idx" ON "offers"("category_id");
CREATE INDEX "offers_status_idx" ON "offers"("status");
CREATE INDEX "offers_supplier_id_idx" ON "offers"("supplier_id");

CREATE UNIQUE INDEX "affiliate_offer_participations_offer_id_affiliate_id_key" ON "affiliate_offer_participations"("offer_id", "affiliate_id");
CREATE INDEX "affiliate_offer_participations_offer_id_idx" ON "affiliate_offer_participations"("offer_id");
CREATE INDEX "affiliate_offer_participations_affiliate_id_idx" ON "affiliate_offer_participations"("affiliate_id");

CREATE UNIQUE INDEX "tracking_links_token_key" ON "tracking_links"("token");
CREATE INDEX "tracking_links_offer_id_idx" ON "tracking_links"("offer_id");
CREATE INDEX "tracking_links_affiliate_id_idx" ON "tracking_links"("affiliate_id");

CREATE INDEX "events_tracking_link_id_idx" ON "events"("tracking_link_id");
CREATE INDEX "events_event_type_idx" ON "events"("event_type");
CREATE INDEX "events_status_idx" ON "events"("status");
CREATE INDEX "events_created_at_idx" ON "events"("created_at");

CREATE INDEX "payouts_affiliate_id_idx" ON "payouts"("affiliate_id");
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

CREATE UNIQUE INDEX "static_pages_slug_language_key" ON "static_pages"("slug", "language");

-- AddForeignKey
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_profiles" ADD CONSTRAINT "supplier_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offers" ADD CONSTRAINT "offers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offers" ADD CONSTRAINT "offers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affiliate_offer_participations" ADD CONSTRAINT "affiliate_offer_participations_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "affiliate_offer_participations" ADD CONSTRAINT "affiliate_offer_participations_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tracking_links" ADD CONSTRAINT "tracking_links_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tracking_links" ADD CONSTRAINT "tracking_links_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_tracking_link_id_fkey" FOREIGN KEY ("tracking_link_id") REFERENCES "tracking_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
