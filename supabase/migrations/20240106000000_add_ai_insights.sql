-- Add AI insights column to reports table
-- Separate from report_data because:
-- 1. AI insights are generated asynchronously after the report
-- 2. Avoids JSONB merges that could overwrite report_data
-- 3. Separates deterministic analysis from AI-generated content
ALTER TABLE reports ADD COLUMN ai_insights JSONB;
