-- Atomic increment for external_views using UPDATE.
-- Replaces the read-modify-write pattern in the informe page.
CREATE OR REPLACE FUNCTION public.increment_external_views(p_report_id UUID)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.reports
  SET external_views = external_views + 1
  WHERE id = p_report_id;
$$;
