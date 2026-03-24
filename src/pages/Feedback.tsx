import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Star, MessageSquare, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { z } from 'zod';

const reviewSchema = z.object({
  rating: z.number().min(1, 'Please select a rating').max(5),
  comment: z.string().trim().max(1000, 'Comment must be less than 1000 characters').optional(),
});

interface ProgramWithReview {
  id: string;
  title: string;
  description: string | null;
  status: string;
  myReview: {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
  } | null;
  avgRating: number | null;
  reviewCount: number;
}

interface ProgramRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
}

interface EnrollmentWithProgram {
  program_id: string;
  training_programs: ProgramRow | null;
}

interface ProgramReviewRow {
  id: string;
  program_id: string;
  trainee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

function StarRating({ rating, onRate, interactive = false, size = 'md' }: {
  rating: number;
  onRate?: (r: number) => void;
  interactive?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [hover, setHover] = useState(0);
  const sizeClass = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-7 w-7' : 'h-5 w-5';

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          className={interactive ? 'cursor-pointer transition-transform hover:scale-110' : 'cursor-default'}
          onMouseEnter={() => interactive && setHover(star)}
          onMouseLeave={() => interactive && setHover(0)}
          onClick={() => onRate?.(star)}
        >
          <Star
            className={`${sizeClass} ${
              star <= (hover || rating)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground/30'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export default function Feedback() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [programs, setPrograms] = useState<ProgramWithReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingProgram, setEditingProgram] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const isTrainee = role === 'trainee';

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch programs the trainee is enrolled in (approved)
      let programsData: ProgramRow[] = [];

      if (isTrainee) {
        const { data: enrollments } = await supabase
          .from('enrollments')
          .select('program_id, training_programs(id, title, description, status)')
          .eq('trainee_id', user.id)
          .eq('status', 'approved');

        programsData = ((enrollments || []) as EnrollmentWithProgram[])
          .map((e) => e.training_programs)
          .filter((p): p is ProgramRow => Boolean(p));
      } else {
        // Trainers/admins see all programs with reviews
        const { data } = await supabase
          .from('training_programs')
          .select('id, title, description, status');
        programsData = (data as ProgramRow[]) || [];
      }

      // Fetch all reviews for these programs
      const programIds = programsData.map((p) => p.id);
      if (programIds.length === 0) {
        setPrograms([]);
        setLoading(false);
        return;
      }

      const { data: reviews } = await supabase
        .from('program_reviews')
        .select('*')
        .in('program_id', programIds);

      const typedReviews = (reviews || []) as ProgramReviewRow[];
      const enriched: ProgramWithReview[] = programsData.map((p) => {
        const programReviews = typedReviews.filter((r) => r.program_id === p.id);
        const myReview = isTrainee
          ? programReviews.find((r) => r.trainee_id === user.id) || null
          : null;
        const avgRating = programReviews.length > 0
          ? programReviews.reduce((sum: number, r) => sum + r.rating, 0) / programReviews.length
          : null;

        return {
          id: p.id,
          title: p.title,
          description: p.description,
          status: p.status,
          myReview,
          avgRating,
          reviewCount: programReviews.length,
        };
      });

      setPrograms(enriched);
    } catch {
      toast({ title: 'Error', description: 'Failed to load feedback data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [user, role]);

  const openReviewDialog = (programId: string, existing?: ProgramWithReview['myReview']) => {
    setEditingProgram(programId);
    setRating(existing?.rating || 0);
    setComment(existing?.comment || '');
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!user || !editingProgram) return;

    const parsed = reviewSchema.safeParse({ rating, comment: comment || undefined });
    if (!parsed.success) {
      toast({ title: 'Validation Error', description: parsed.error.errors[0].message, variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const program = programs.find(p => p.id === editingProgram);
      if (program?.myReview) {
        // Update
        const { error } = await supabase
          .from('program_reviews')
          .update({ rating, comment: comment.trim() || null })
          .eq('id', program.myReview.id);
        if (error) throw error;
        toast({ title: 'Review Updated', description: 'Your feedback has been updated.' });
      } else {
        // Insert
        const { error } = await supabase
          .from('program_reviews')
          .insert({ program_id: editingProgram, trainee_id: user.id, rating, comment: comment.trim() || null });
        if (error) throw error;
        toast({ title: 'Review Submitted', description: 'Thank you for your feedback!' });
      }
      setDialogOpen(false);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit review';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (reviewId: string) => {
    try {
      const { error } = await supabase.from('program_reviews').delete().eq('id', reviewId);
      if (error) throw error;
      toast({ title: 'Review Deleted', description: 'Your review has been removed.' });
      fetchData();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete review', variant: 'destructive' });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Program Feedback</h1>
          <p className="text-muted-foreground">
            {isTrainee ? 'Rate and review training programs you\'re enrolled in' : 'View trainee feedback on programs'}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : programs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">
                {isTrainee ? 'No enrolled programs to review yet.' : 'No programs with feedback yet.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {programs.map((program) => (
              <Card key={program.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{program.title}</CardTitle>
                      {program.description && (
                        <CardDescription className="line-clamp-2 mt-1">{program.description}</CardDescription>
                      )}
                    </div>
                    <Badge variant={program.status === 'active' ? 'default' : 'secondary'}>
                      {program.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Aggregate rating */}
                  <div className="flex items-center gap-3">
                    <StarRating rating={Math.round(program.avgRating || 0)} size="sm" />
                    <span className="text-sm text-muted-foreground">
                      {program.avgRating ? `${program.avgRating.toFixed(1)} avg` : 'No ratings'} · {program.reviewCount} review{program.reviewCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Trainee's own review */}
                  {isTrainee && program.myReview && (
                    <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground">Your Review</span>
                          <StarRating rating={program.myReview.rating} size="sm" />
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openReviewDialog(program.id, program.myReview)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(program.myReview!.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {program.myReview.comment && (
                        <p className="text-sm text-muted-foreground">{program.myReview.comment}</p>
                      )}
                    </div>
                  )}

                  {/* Write review button */}
                  {isTrainee && !program.myReview && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => openReviewDialog(program.id)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Write a Review
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {programs.find(p => p.id === editingProgram)?.myReview ? 'Edit Review' : 'Write a Review'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Rating</label>
              <StarRating rating={rating} onRate={setRating} interactive size="lg" />
              {rating === 0 && <p className="text-xs text-destructive">Please select a rating</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Comment (optional)</label>
              <Textarea
                placeholder="Share your experience with this program..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                rows={4}
              />
              <p className="text-xs text-muted-foreground text-right">{comment.length}/1000</p>
            </div>
            <Button onClick={handleSubmit} disabled={submitting || rating === 0} className="w-full">
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {programs.find(p => p.id === editingProgram)?.myReview ? 'Update Review' : 'Submit Review'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
