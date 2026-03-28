-- Add is_demo flag to reports table for server-side demo limit enforcement
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
