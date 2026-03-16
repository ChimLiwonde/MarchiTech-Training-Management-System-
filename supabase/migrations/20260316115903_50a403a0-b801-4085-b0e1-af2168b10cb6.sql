
CREATE TABLE public.program_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
    trainee_id uuid NOT NULL,
    rating integer NOT NULL,
    comment text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (program_id, trainee_id)
);

ALTER TABLE public.program_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainees can create reviews"
ON public.program_reviews
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = trainee_id
    AND has_role(auth.uid(), 'trainee'::app_role)
    AND EXISTS (
        SELECT 1 FROM public.enrollments
        WHERE enrollments.program_id = program_reviews.program_id
        AND enrollments.trainee_id = auth.uid()
        AND enrollments.status = 'approved'
    )
);

CREATE POLICY "Trainees can update own reviews"
ON public.program_reviews
FOR UPDATE
TO authenticated
USING (auth.uid() = trainee_id)
WITH CHECK (auth.uid() = trainee_id);

CREATE POLICY "Authenticated users can view reviews"
ON public.program_reviews
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Trainees can delete own reviews"
ON public.program_reviews
FOR DELETE
TO authenticated
USING (auth.uid() = trainee_id);

CREATE POLICY "Admins can manage all reviews"
ON public.program_reviews
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_program_reviews_updated_at
    BEFORE UPDATE ON public.program_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
