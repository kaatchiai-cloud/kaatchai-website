-- 0001: Create users table (Phase 01 — Backend Foundations)
-- Forward-only migration (override O9): no ALTER after apply.
-- Billing columns (plan, stripe_customer_id, images_limit, videos_limit, period_*) are
-- explicitly excluded per override O15.

CREATE TABLE IF NOT EXISTS public.users (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text    NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_own ON public.users
  FOR ALL
  USING (auth.uid() = id);
