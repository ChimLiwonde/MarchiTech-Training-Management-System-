
-- Create a function to auto-issue certificates when a trainee passes an assessment
CREATE OR REPLACE FUNCTION public.auto_issue_certificate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Only trigger when passed is set to true and completed_at is set
    IF NEW.passed = true AND NEW.completed_at IS NOT NULL THEN
        -- Check if certificate already exists for this attempt
        IF NOT EXISTS (
            SELECT 1 FROM public.certificates
            WHERE attempt_id = NEW.id
        ) THEN
            -- Get the program_id from the assessment
            INSERT INTO public.certificates (trainee_id, program_id, assessment_id, attempt_id, issued_by)
            SELECT
                NEW.trainee_id,
                a.program_id,
                NEW.assessment_id,
                NEW.id,
                a.created_by
            FROM public.assessments a
            WHERE a.id = NEW.assessment_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Create trigger on assessment_attempts
CREATE TRIGGER trigger_auto_issue_certificate
    AFTER INSERT OR UPDATE OF passed ON public.assessment_attempts
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_issue_certificate();

-- Add RLS policy for certificates so the auto-issue function (SECURITY DEFINER) can insert
-- The existing RLS policies already cover admin/trainer access. The trigger uses SECURITY DEFINER so it bypasses RLS.
