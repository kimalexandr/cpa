DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LandingType') THEN
    CREATE TYPE "LandingType" AS ENUM ('external', 'internal');
  END IF;
END $$;

ALTER TABLE "offers"
  ADD COLUMN IF NOT EXISTS "landing_type" "LandingType" NOT NULL DEFAULT 'external';
