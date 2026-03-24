-- Add cost tracking so we can compute profit in reports
ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS cost_amount numeric(12,2) NOT NULL DEFAULT 0;

