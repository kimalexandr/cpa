-- AlterTable
ALTER TABLE "affiliate_profiles" ADD COLUMN IF NOT EXISTS "notify_news" BOOLEAN;
ALTER TABLE "affiliate_profiles" ADD COLUMN IF NOT EXISTS "notify_system" BOOLEAN;
ALTER TABLE "affiliate_profiles" ADD COLUMN IF NOT EXISTS "notify_participation" BOOLEAN;
ALTER TABLE "affiliate_profiles" ADD COLUMN IF NOT EXISTS "notify_payouts" BOOLEAN;
