
-- Create training programs table
CREATE TABLE public.training_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    trainer_id UUID NOT NULL,
    start_date DATE,
    end_date DATE,
    max_trainees INTEGER DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create enrollments table
CREATE TABLE public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
    trainee_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'withdrawn')),
    enrolled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(program_id, trainee_id)
);

-- Enable RLS
ALTER TABLE public.training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Update trigger for training_programs
CREATE TRIGGER update_training_programs_updated_at
    BEFORE UPDATE ON public.training_programs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Update trigger for enrollments
CREATE TRIGGER update_enrollments_updated_at
    BEFORE UPDATE ON public.enrollments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for training_programs

-- Admins can do everything
CREATE POLICY "Admins can manage all programs"
    ON public.training_programs FOR ALL
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trainers can view all programs and manage their own
CREATE POLICY "Trainers can view all programs"
    ON public.training_programs FOR SELECT
    USING (public.has_role(auth.uid(), 'trainer'));

CREATE POLICY "Trainers can create programs"
    ON public.training_programs FOR INSERT
    WITH CHECK (public.has_role(auth.uid(), 'trainer') AND auth.uid() = trainer_id);

CREATE POLICY "Trainers can update their own programs"
    ON public.training_programs FOR UPDATE
    USING (public.has_role(auth.uid(), 'trainer') AND auth.uid() = trainer_id);

-- Trainees can view active programs
CREATE POLICY "Trainees can view active programs"
    ON public.training_programs FOR SELECT
    USING (public.has_role(auth.uid(), 'trainee') AND status = 'active');

-- RLS Policies for enrollments

-- Admins can do everything
CREATE POLICY "Admins can manage all enrollments"
    ON public.enrollments FOR ALL
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trainers can view enrollments for their programs
CREATE POLICY "Trainers can view program enrollments"
    ON public.enrollments FOR SELECT
    USING (
        public.has_role(auth.uid(), 'trainer') AND
        EXISTS (SELECT 1 FROM public.training_programs WHERE id = program_id AND trainer_id = auth.uid())
    );

-- Trainers can update enrollment status for their programs
CREATE POLICY "Trainers can update program enrollments"
    ON public.enrollments FOR UPDATE
    USING (
        public.has_role(auth.uid(), 'trainer') AND
        EXISTS (SELECT 1 FROM public.training_programs WHERE id = program_id AND trainer_id = auth.uid())
    );

-- Trainees can view their own enrollments
CREATE POLICY "Trainees can view own enrollments"
    ON public.enrollments FOR SELECT
    USING (auth.uid() = trainee_id);

-- Trainees can enroll themselves
CREATE POLICY "Trainees can enroll themselves"
    ON public.enrollments FOR INSERT
    WITH CHECK (public.has_role(auth.uid(), 'trainee') AND auth.uid() = trainee_id);

-- Trainees can withdraw (update their own enrollment)
CREATE POLICY "Trainees can withdraw enrollment"
    ON public.enrollments FOR UPDATE
    USING (auth.uid() = trainee_id);
