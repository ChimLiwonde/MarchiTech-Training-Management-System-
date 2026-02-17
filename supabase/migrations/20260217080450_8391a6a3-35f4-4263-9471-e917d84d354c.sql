
-- Storage bucket for training materials
INSERT INTO storage.buckets (id, name, public) VALUES ('training-materials', 'training-materials', true);

-- Storage RLS policies
CREATE POLICY "Anyone authenticated can view materials"
ON storage.objects FOR SELECT
USING (bucket_id = 'training-materials' AND auth.role() = 'authenticated');

CREATE POLICY "Admins and trainers can upload materials"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'training-materials' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'trainer')));

CREATE POLICY "Admins and trainers can delete materials"
ON storage.objects FOR DELETE
USING (bucket_id = 'training-materials' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'trainer')));

-- Training resources table
CREATE TABLE public.training_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  file_type TEXT,
  external_url TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.training_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all resources" ON public.training_resources FOR ALL
USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Trainers can manage their program resources" ON public.training_resources FOR ALL
USING (has_role(auth.uid(), 'trainer') AND EXISTS (
  SELECT 1 FROM training_programs WHERE id = training_resources.program_id AND trainer_id = auth.uid()
))
WITH CHECK (has_role(auth.uid(), 'trainer') AND EXISTS (
  SELECT 1 FROM training_programs WHERE id = training_resources.program_id AND trainer_id = auth.uid()
));

CREATE POLICY "Trainees can view resources for enrolled programs" ON public.training_resources FOR SELECT
USING (has_role(auth.uid(), 'trainee') AND EXISTS (
  SELECT 1 FROM enrollments WHERE program_id = training_resources.program_id AND trainee_id = auth.uid() AND status = 'approved'
));

CREATE TRIGGER update_training_resources_updated_at
BEFORE UPDATE ON public.training_resources
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Assessments table
CREATE TABLE public.assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  passing_score INTEGER NOT NULL DEFAULT 70,
  time_limit_minutes INTEGER,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all assessments" ON public.assessments FOR ALL
USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Trainers can manage their program assessments" ON public.assessments FOR ALL
USING (has_role(auth.uid(), 'trainer') AND EXISTS (
  SELECT 1 FROM training_programs WHERE id = assessments.program_id AND trainer_id = auth.uid()
))
WITH CHECK (has_role(auth.uid(), 'trainer') AND EXISTS (
  SELECT 1 FROM training_programs WHERE id = assessments.program_id AND trainer_id = auth.uid()
));

CREATE POLICY "Trainees can view published assessments for enrolled programs" ON public.assessments FOR SELECT
USING (has_role(auth.uid(), 'trainee') AND is_published = true AND EXISTS (
  SELECT 1 FROM enrollments WHERE program_id = assessments.program_id AND trainee_id = auth.uid() AND status = 'approved'
));

CREATE TRIGGER update_assessments_updated_at
BEFORE UPDATE ON public.assessments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Assessment questions table
CREATE TABLE public.assessment_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'multiple_choice',
  options JSONB NOT NULL DEFAULT '[]',
  correct_answer TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assessment_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all questions" ON public.assessment_questions FOR ALL
USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Trainers can manage their assessment questions" ON public.assessment_questions FOR ALL
USING (has_role(auth.uid(), 'trainer') AND EXISTS (
  SELECT 1 FROM assessments a JOIN training_programs tp ON tp.id = a.program_id
  WHERE a.id = assessment_questions.assessment_id AND tp.trainer_id = auth.uid()
))
WITH CHECK (has_role(auth.uid(), 'trainer') AND EXISTS (
  SELECT 1 FROM assessments a JOIN training_programs tp ON tp.id = a.program_id
  WHERE a.id = assessment_questions.assessment_id AND tp.trainer_id = auth.uid()
));

CREATE POLICY "Trainees can view questions for published assessments" ON public.assessment_questions FOR SELECT
USING (has_role(auth.uid(), 'trainee') AND EXISTS (
  SELECT 1 FROM assessments a JOIN enrollments e ON e.program_id = a.program_id
  WHERE a.id = assessment_questions.assessment_id AND a.is_published = true AND e.trainee_id = auth.uid() AND e.status = 'approved'
));

-- Assessment attempts table
CREATE TABLE public.assessment_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  trainee_id UUID NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  score INTEGER,
  passed BOOLEAN,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assessment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all attempts" ON public.assessment_attempts FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Trainers can view attempts for their assessments" ON public.assessment_attempts FOR SELECT
USING (has_role(auth.uid(), 'trainer') AND EXISTS (
  SELECT 1 FROM assessments a JOIN training_programs tp ON tp.id = a.program_id
  WHERE a.id = assessment_attempts.assessment_id AND tp.trainer_id = auth.uid()
));

CREATE POLICY "Trainees can manage their own attempts" ON public.assessment_attempts FOR ALL
USING (auth.uid() = trainee_id) WITH CHECK (auth.uid() = trainee_id);
