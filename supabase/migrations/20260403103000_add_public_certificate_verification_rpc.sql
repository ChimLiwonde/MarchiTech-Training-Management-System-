CREATE OR REPLACE FUNCTION public.verify_certificate_public(p_certificate_number TEXT)
RETURNS TABLE (
  certificate_number TEXT,
  issued_at TIMESTAMPTZ,
  trainee_name TEXT,
  program_title TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.certificate_number,
    c.issued_at,
    COALESCE(p.full_name, p.email, 'Unknown') AS trainee_name,
    COALESCE(tp.title, 'Unknown') AS program_title
  FROM public.certificates c
  LEFT JOIN public.profiles p ON p.user_id = c.trainee_id
  LEFT JOIN public.training_programs tp ON tp.id = c.program_id
  WHERE UPPER(c.certificate_number) = UPPER(p_certificate_number)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_certificate_public(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_certificate_public(TEXT) TO authenticated;
