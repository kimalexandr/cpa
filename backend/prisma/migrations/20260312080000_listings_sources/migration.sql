-- CreateTable
CREATE TABLE "listings_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_url" TEXT NOT NULL,
    "source_key" TEXT NOT NULL DEFAULT 'agroserver.ru',
    "id_prefix" TEXT NOT NULL DEFAULT 'agro',
    "category_slug" TEXT NOT NULL DEFAULT 'agrochemistry',
    "max_items" INTEGER NOT NULL DEFAULT 10,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "offer_status" TEXT NOT NULL DEFAULT 'active',
    "last_run_at" TIMESTAMP(3),
    "last_status" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings_import_logs" (
    "id" TEXT NOT NULL,
    "source_id" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'running',
    "message" TEXT,
    "detail" TEXT,
    "items_found" INTEGER NOT NULL DEFAULT 0,
    "upserted" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "listings_import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listings_sources_enabled_idx" ON "listings_sources"("enabled");

-- CreateIndex
CREATE INDEX "listings_import_logs_source_id_idx" ON "listings_import_logs"("source_id");

-- CreateIndex
CREATE INDEX "listings_import_logs_status_idx" ON "listings_import_logs"("status");

-- CreateIndex
CREATE INDEX "listings_import_logs_started_at_idx" ON "listings_import_logs"("started_at");

-- AddForeignKey
ALTER TABLE "listings_import_logs" ADD CONSTRAINT "listings_import_logs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "listings_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
