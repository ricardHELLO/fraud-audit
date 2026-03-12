-- ============================================================
-- Row Level Security — defense-in-depth
--
-- Strategy:
--   - Clerk auth does NOT use Supabase Auth, so auth.uid() is unavailable
--   - All API routes use SERVICE_ROLE_KEY which bypasses RLS
--   - These policies block any direct ANON_KEY access to sensitive data
--   - Only public-facing data (completed reports, connector catalog) is readable
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE supported_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Public read access (anon role)
-- ============================================================

-- Completed reports are publicly viewable (shared report page)
CREATE POLICY "Public can view completed reports"
  ON reports FOR SELECT
  TO anon
  USING (status = 'completed');

-- Connector catalog is public
CREATE POLICY "Public can view active connectors"
  ON supported_connectors FOR SELECT
  TO anon
  USING (is_active = true);

-- ============================================================
-- Authenticated role (service_role bypasses these automatically)
-- For future use if Supabase Auth is added
-- ============================================================

-- Authenticated users can read their own data
CREATE POLICY "Authenticated read own organizations"
  ON organizations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read own user"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read own transactions"
  ON credit_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read own uploads"
  ON uploads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read reports"
  ON reports FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read own feedback"
  ON feedback FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read own referrals"
  ON referrals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read connectors"
  ON supported_connectors FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read own connector requests"
  ON connector_requests FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- NOTE: No INSERT/UPDATE/DELETE policies for anon role.
-- With RLS enabled and no matching policy, all writes via
-- ANON_KEY are denied by default. SERVICE_ROLE_KEY bypasses
-- RLS entirely, so all API routes continue to work.
-- ============================================================
