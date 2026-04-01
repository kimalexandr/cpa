ALTER TABLE "offers"
  ADD COLUMN IF NOT EXISTS "postback_secret" TEXT;

CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "offer_id" TEXT NOT NULL,
  "affiliate_id" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "status" TEXT NOT NULL DEFAULT 'accrued',
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_event_id_key" ON "ledger_entries"("event_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_affiliate_id_status_idx" ON "ledger_entries"("affiliate_id", "status");
CREATE INDEX IF NOT EXISTS "ledger_entries_supplier_id_status_idx" ON "ledger_entries"("supplier_id", "status");
CREATE INDEX IF NOT EXISTS "ledger_entries_offer_id_idx" ON "ledger_entries"("offer_id");

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_offer_id_fkey"
  FOREIGN KEY ("offer_id") REFERENCES "offers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_affiliate_id_fkey"
  FOREIGN KEY ("affiliate_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
