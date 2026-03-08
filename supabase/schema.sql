-- ============================================================
-- FraudAudit — Database schema
-- ============================================================

-- Organizaciones (negocios)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Usuarios
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  organization_id UUID REFERENCES organizations(id),
  credits_balance INTEGER DEFAULT 1,
  referred_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Creditos — log de transacciones
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Uploads de archivos
CREATE TABLE uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  connector_type TEXT NOT NULL,
  source_category TEXT NOT NULL,
  detected_date_from DATE,
  detected_date_to DATE,
  detected_locations INTEGER,
  detected_rows INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Informes generados
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'processing',
  pos_upload_id UUID REFERENCES uploads(id),
  inventory_upload_id UUID REFERENCES uploads(id),
  analysis_window_from DATE,
  analysis_window_to DATE,
  locations_analyzed TEXT[],
  report_data JSONB,
  external_views INTEGER DEFAULT 0,
  share_bonus_claimed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Feedback
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  report_id UUID REFERENCES reports(id) NOT NULL,
  accuracy_rating INTEGER CHECK (accuracy_rating BETWEEN 1 AND 5),
  most_useful_section TEXT,
  missing_data TEXT,
  would_share BOOLEAN,
  would_share_reason TEXT,
  general_comments TEXT,
  credit_awarded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Referidos
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES users(id) NOT NULL,
  referred_id UUID REFERENCES users(id),
  referral_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  referrer_credit_awarded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Conectores soportados
CREATE TABLE supported_connectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  logo_url TEXT,
  export_guide_markdown TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Solicitudes de conectores
CREATE TABLE connector_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  connector_name TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices
CREATE INDEX idx_users_clerk_id ON users(clerk_id);
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_reports_slug ON reports(slug);
CREATE INDEX idx_reports_org ON reports(organization_id);
CREATE INDEX idx_reports_user ON reports(user_id);
CREATE INDEX idx_credit_transactions_user ON credit_transactions(user_id);
CREATE INDEX idx_uploads_user ON uploads(user_id);
CREATE INDEX idx_referrals_code ON referrals(referral_code);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);

-- Seed connectors
INSERT INTO supported_connectors (id, name, category, is_active) VALUES
  ('lastapp', 'Last.app', 'pos', true),
  ('glop', 'Glop', 'pos', false),
  ('agora', 'Agora', 'pos', false),
  ('revo', 'Revo', 'pos', false),
  ('tspoonlab', 'T-Spoon Lab', 'inventory', true),
  ('prezo', 'Prezo', 'inventory', false),
  ('gstock', 'GStock', 'inventory', false);
