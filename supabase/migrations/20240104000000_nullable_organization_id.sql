-- Make organization_id nullable in uploads and reports tables
-- Users created without an organization should still be able to upload and create reports.

ALTER TABLE uploads ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE reports ALTER COLUMN organization_id DROP NOT NULL;
