-- ============================================================
-- Migration: Add missing columns for API compatibility
-- ============================================================

-- Reports: add connector type columns
ALTER TABLE reports ADD COLUMN IF NOT EXISTS pos_connector TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS inventory_connector TEXT;

-- Uploads: add months_covered and credits_required
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS months_covered INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS credits_required INTEGER;

-- Users: add referral_code column for the referral system
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Users: change referred_by from UUID to TEXT (stores referral code, not user id)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_referred_by_fkey;
ALTER TABLE users ALTER COLUMN referred_by TYPE TEXT USING referred_by::TEXT;
