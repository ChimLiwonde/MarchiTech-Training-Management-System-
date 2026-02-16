
-- Create sessions table
CREATE TABLE public.sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    program_id UUID NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create attendance table
CREATE TABLE public.attendance (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    trainee_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'absent',
    checked_in_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(session_id, trainee_id)
);

-- Enable RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Triggers for updated_at
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON public.sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at
    BEFORE UPDATE ON public.attendance
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sessions RLS policies
CREATE POLICY "Admins can manage all sessions"
    ON public.sessions FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Trainers can manage their program sessions"
    ON public.sessions FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'trainer') AND EXISTS (
        SELECT 1 FROM public.training_programs WHERE id = sessions.program_id AND trainer_id = auth.uid()
    ))
    WITH CHECK (public.has_role(auth.uid(), 'trainer') AND EXISTS (
        SELECT 1 FROM public.training_programs WHERE id = sessions.program_id AND trainer_id = auth.uid()
    ));

CREATE POLICY "Trainees can view sessions for enrolled programs"
    ON public.sessions FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'trainee') AND EXISTS (
        SELECT 1 FROM public.enrollments WHERE program_id = sessions.program_id AND trainee_id = auth.uid() AND status = 'approved'
    ));

-- Attendance RLS policies
CREATE POLICY "Admins can manage all attendance"
    ON public.attendance FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Trainers can manage attendance for their sessions"
    ON public.attendance FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'trainer') AND EXISTS (
        SELECT 1 FROM public.sessions s
        JOIN public.training_programs tp ON tp.id = s.program_id
        WHERE s.id = attendance.session_id AND tp.trainer_id = auth.uid()
    ))
    WITH CHECK (public.has_role(auth.uid(), 'trainer') AND EXISTS (
        SELECT 1 FROM public.sessions s
        JOIN public.training_programs tp ON tp.id = s.program_id
        WHERE s.id = attendance.session_id AND tp.trainer_id = auth.uid()
    ));

CREATE POLICY "Trainees can view own attendance"
    ON public.attendance FOR SELECT
    TO authenticated
    USING (auth.uid() = trainee_id);

CREATE POLICY "Trainees can check in"
    ON public.attendance FOR UPDATE
    TO authenticated
    USING (auth.uid() = trainee_id)
    WITH CHECK (auth.uid() = trainee_id);
