
-- Create certificates table
CREATE TABLE public.certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trainee_id UUID NOT NULL,
  program_id UUID NOT NULL,
  assessment_id UUID,
  attempt_id UUID,
  issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  certificate_number TEXT NOT NULL UNIQUE DEFAULT 'CERT-' || upper(substring(gen_random_uuid()::text, 1, 8)),
  issued_by UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Admins can manage all certificates
CREATE POLICY "Admins can manage all certificates"
ON public.certificates FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trainers can issue and view certificates for their programs
CREATE POLICY "Trainers can issue certificates for their programs"
ON public.certificates FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'trainer'::app_role) AND
  auth.uid() = issued_by AND
  EXISTS (
    SELECT 1 FROM public.training_programs
    WHERE id = certificates.program_id AND trainer_id = auth.uid()
  )
);

CREATE POLICY "Trainers can view certificates for their programs"
ON public.certificates FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'trainer'::app_role) AND
  EXISTS (
    SELECT 1 FROM public.training_programs
    WHERE id = certificates.program_id AND trainer_id = auth.uid()
  )
);

-- Trainees can view their own certificates
CREATE POLICY "Trainees can view their own certificates"
ON public.certificates FOR SELECT
TO authenticated
USING (auth.uid() = trainee_id);

-- Add updated_at trigger
CREATE TRIGGER update_certificates_updated_at
  BEFORE UPDATE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
