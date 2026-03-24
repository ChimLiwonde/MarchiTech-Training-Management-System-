-- Add fee and currency to training programs
ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS fee_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'MWK';

-- Create payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id uuid NOT NULL,
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'paychangu',
  provider_reference text,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'MWK',
  status text NOT NULL CHECK (status IN ('pending','successful','failed','cancelled')),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, trainee_id)
);

-- Enable RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
DROP TRIGGER IF EXISTS update_payments_updated_at ON public.payments;
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies
CREATE POLICY "Admins can manage all payments"
ON public.payments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Trainees can view own payments"
ON public.payments
FOR SELECT
TO authenticated
USING (auth.uid() = trainee_id);

CREATE POLICY "Trainees can create own payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = trainee_id);

