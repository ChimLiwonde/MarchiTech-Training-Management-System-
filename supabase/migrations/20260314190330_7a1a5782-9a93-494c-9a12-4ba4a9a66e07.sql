
-- Create notifications table
CREATE TABLE public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type text NOT NULL DEFAULT 'info',
    is_read boolean NOT NULL DEFAULT false,
    link text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- System can insert notifications (via triggers with SECURITY DEFINER)
-- No direct insert policy needed for users

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger function: notify on new enrollment
CREATE OR REPLACE FUNCTION public.notify_on_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    _program_title text;
    _trainer_id uuid;
BEGIN
    SELECT title, trainer_id INTO _program_title, _trainer_id
    FROM public.training_programs WHERE id = NEW.program_id;

    -- Notify the trainee
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
        NEW.trainee_id,
        'Enrollment ' || CASE WHEN NEW.status = 'approved' THEN 'Approved' WHEN NEW.status = 'pending' THEN 'Submitted' ELSE NEW.status END,
        'Your enrollment in "' || _program_title || '" is ' || NEW.status || '.',
        'enrollment',
        '/trainings'
    );

    -- Notify the trainer on new pending enrollment
    IF NEW.status = 'pending' AND _trainer_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, link)
        VALUES (
            _trainer_id,
            'New Enrollment Request',
            'A trainee has requested enrollment in "' || _program_title || '".',
            'enrollment',
            '/trainings'
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER on_enrollment_created
AFTER INSERT ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_enrollment();

-- Trigger function: notify on enrollment status update
CREATE OR REPLACE FUNCTION public.notify_on_enrollment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    _program_title text;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        SELECT title INTO _program_title
        FROM public.training_programs WHERE id = NEW.program_id;

        INSERT INTO public.notifications (user_id, title, message, type, link)
        VALUES (
            NEW.trainee_id,
            'Enrollment ' || INITCAP(NEW.status),
            'Your enrollment in "' || _program_title || '" has been ' || NEW.status || '.',
            'enrollment',
            '/trainings'
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_enrollment_updated
AFTER UPDATE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_enrollment_update();

-- Trigger function: notify on certificate issued
CREATE OR REPLACE FUNCTION public.notify_on_certificate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    _program_title text;
BEGIN
    SELECT title INTO _program_title
    FROM public.training_programs WHERE id = NEW.program_id;

    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
        NEW.trainee_id,
        'Certificate Issued!',
        'You have been awarded a certificate for "' || _program_title || '" (' || NEW.certificate_number || ').',
        'certificate',
        '/certificates'
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_certificate_issued
AFTER INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.notify_on_certificate();

-- Trigger function: notify enrolled trainees when a new session is created
CREATE OR REPLACE FUNCTION public.notify_on_session_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    _program_title text;
    _trainee record;
BEGIN
    SELECT title INTO _program_title
    FROM public.training_programs WHERE id = NEW.program_id;

    FOR _trainee IN
        SELECT trainee_id FROM public.enrollments
        WHERE program_id = NEW.program_id AND status = 'approved'
    LOOP
        INSERT INTO public.notifications (user_id, title, message, type, link)
        VALUES (
            _trainee.trainee_id,
            'New Session Scheduled',
            'A new session for "' || _program_title || '" has been scheduled on ' || NEW.session_date || '.',
            'session',
            '/schedule'
        );
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_session_created
AFTER INSERT ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.notify_on_session_created();
