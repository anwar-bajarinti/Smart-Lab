-- ==============================================================================
-- 002_incubation_start_and_storage.sql
-- Safe Non-Destructive Migration: Student Incubation Journey Start Date & Storage Metrics
--
-- IMPORTANT:
-- 1. DO NOT DROP ANY EXISTING TABLES.
-- 2. Uses ADD COLUMN IF NOT EXISTS.
-- 3. Adds secure PostgreSQL RPC for storage monitoring.
-- ==============================================================================

-- 1. ADD INCUBATION JOURNEY & RETENTION COLUMNS TO USERS TABLE
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS incubation_start_date date;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS academic_year_at_start integer;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS retention_period_years integer;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS retention_end_date date;

-- Add index for retention queries
CREATE INDEX IF NOT EXISTS idx_users_retention_end_date ON public.users (retention_end_date);
CREATE INDEX IF NOT EXISTS idx_users_incubation_start_date ON public.users (incubation_start_date);

-- 2. SECURE STORAGE METRICS RPC FUNCTION
-- Allows Admin & Substitute Admin to query PostgreSQL database and public schema footprint
CREATE OR REPLACE FUNCTION public.get_database_storage_stats()
RETURNS jsonb AS $$
DECLARE
  db_size bigint;
  tbl_size bigint;
  users_cnt bigint;
  components_cnt bigint;
  transactions_cnt bigint;
  visits_cnt bigint;
  audit_cnt bigint;
BEGIN
  -- Verify caller role is Admin or Substitute Admin
  IF public.get_current_user_role() NOT IN ('admin', 'substitute_admin') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required to inspect storage metrics.';
  END IF;

  SELECT pg_database_size(current_database()) INTO db_size;

  SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)
  INTO tbl_size
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public';

  SELECT COUNT(*) INTO users_cnt FROM public.users;
  SELECT COUNT(*) INTO components_cnt FROM public.components;
  SELECT COUNT(*) INTO transactions_cnt FROM public.transactions;
  SELECT COUNT(*) INTO visits_cnt FROM public.visits;
  SELECT COUNT(*) INTO audit_cnt FROM public.audit_logs;

  RETURN jsonb_build_object(
    'databaseSizeBytes', db_size,
    'publicSchemaSizeBytes', tbl_size,
    'usersCount', users_cnt,
    'componentsCount', components_cnt,
    'transactionsCount', transactions_cnt,
    'visitsCount', visits_cnt,
    'auditLogsCount', audit_cnt,
    'timestamp', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
