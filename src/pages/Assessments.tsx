import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isXamppMode } from '@/lib/appConfig';
import { xamppApiRequest } from '@/lib/xamppApi';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, ClipboardCheck, Eye, Loader2, Play, Plus, Trash2, XCircle } from 'lucide-react';

interface Assessment {
  id: string;
  program_id: string;
  title: string;
  description: string | null;
  passing_score: number;
  time_limit_minutes: number | null;
  is_published: boolean;
  created_by: string;
}

interface Question {
  id: string;
  assessment_id: string;
  question_text: string;
  options: string[];
  correct_answer?: string;
  points: number;
  sort_order: number;
}

interface Attempt {
  id: string;
  assessment_id: string;
  score: number | null;
  passed: boolean | null;
  completed_at: string | null;
}

interface Program {
  id: string;
  title: string;
}

interface AssessmentsResponse {
  data: Assessment[];
  programs: Program[];
  attempts: Attempt[];
}

interface QuestionsResponse {
  data: Question[];
}

interface SubmitAttemptResponse {
  score: number;
  passed: boolean;
}

type View = 'list' | 'create' | 'questions' | 'take' | 'results';

export default function Assessments() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const canManage = role === 'admin' || role === 'trainer';

  const [view, setView] = useState<View>('list');
  const [loading, setLoading] = useState(true);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  const [selectedProgram, setSelectedProgram] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [passingScore, setPassingScore] = useState('70');

  const [activeAssessment, setActiveAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [newOptions, setNewOptions] = useState(['', '', '', '']);
  const [newCorrect, setNewCorrect] = useState('');

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ score: number; passed: boolean } | null>(null);

  useEffect(() => {
    if (!role) {
      return;
    }

    void fetchData();
  }, [role, user?.id]);

  const fetchData = async () => {
    setLoading(true);

    try {
      if (isXamppMode) {
        const response = await xamppApiRequest<AssessmentsResponse>('/assessments');
        setPrograms(response.programs ?? []);
        setAssessments(response.data ?? []);
        setAttempts(response.attempts ?? []);
        return;
      }

      const [programsRes, assessmentsRes, attemptsRes] = await Promise.all([
        supabase.from('training_programs').select('id, title').order('title'),
        supabase.from('assessments').select('*').order('created_at', { ascending: false }),
        user ? supabase.from('assessment_attempts').select('*').eq('trainee_id', user.id) : Promise.resolve({ data: [], error: null }),
      ]);

      if (programsRes.error) {
        throw programsRes.error;
      }

      if (assessmentsRes.error) {
        throw assessmentsRes.error;
      }

      if (attemptsRes.error) {
        throw attemptsRes.error;
      }

      setPrograms(programsRes.data ?? []);
      setAssessments((assessmentsRes.data as Assessment[]) ?? []);
      setAttempts((attemptsRes.data as Attempt[]) ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load assessments';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const createAssessment = async () => {
    if (!user || !selectedProgram || !title.trim()) {
      return;
    }

    try {
      if (isXamppMode) {
        await xamppApiRequest<{ id: string }>('/assessments', {
          method: 'POST',
          body: {
            program_id: selectedProgram,
            title: title.trim(),
            description: description.trim() || null,
            passing_score: parseInt(passingScore, 10) || 70,
          },
        });
      } else {
        const { error } = await supabase.from('assessments').insert({
          program_id: selectedProgram,
          title: title.trim(),
          description: description.trim() || null,
          passing_score: parseInt(passingScore, 10) || 70,
          created_by: user.id,
        });

        if (error) {
          throw error;
        }
      }

      toast({ title: 'Assessment created' });
      setTitle('');
      setDescription('');
      setSelectedProgram('');
      setPassingScore('70');
      setView('list');
      await fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create assessment';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const togglePublish = async (assessment: Assessment) => {
    try {
      if (isXamppMode) {
        await xamppApiRequest<{ is_published: boolean }>(`/assessments/${assessment.id}/publish`, {
          method: 'PATCH',
          body: {
            is_published: !assessment.is_published,
          },
        });
      } else {
        const { error } = await supabase
          .from('assessments')
          .update({ is_published: !assessment.is_published })
          .eq('id', assessment.id);

        if (error) {
          throw error;
        }
      }

      await fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update publish status';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const deleteAssessment = async (assessmentId: string) => {
    try {
      if (isXamppMode) {
        await xamppApiRequest<{ message: string }>(`/assessments/${assessmentId}`, {
          method: 'DELETE',
        });
      } else {
        const { error } = await supabase.from('assessments').delete().eq('id', assessmentId);
        if (error) {
          throw error;
        }
      }

      await fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete assessment';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const loadQuestions = async (assessment: Assessment) => {
    if (isXamppMode) {
      const response = await xamppApiRequest<QuestionsResponse>(`/assessments/${assessment.id}/questions`);
      setQuestions(response.data ?? []);
      return;
    }

    const { data, error } = await supabase
      .from('assessment_questions')
      .select('*')
      .eq('assessment_id', assessment.id)
      .order('sort_order');

    if (error) {
      throw error;
    }

    setQuestions((data as Question[]) ?? []);
  };

  const openQuestions = async (assessment: Assessment) => {
    setActiveAssessment(assessment);

    try {
      await loadQuestions(assessment);
      setView('questions');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load questions';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const addQuestion = async () => {
    if (!activeAssessment || !newQuestion.trim() || !newCorrect) {
      return;
    }

    const validOptions = newOptions.map((option) => option.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      toast({ title: 'Add at least 2 options', variant: 'destructive' });
      return;
    }

    try {
      if (isXamppMode) {
        await xamppApiRequest<{ id: string }>(`/assessments/${activeAssessment.id}/questions`, {
          method: 'POST',
          body: {
            question_text: newQuestion.trim(),
            options: validOptions,
            correct_answer: newCorrect,
            sort_order: questions.length,
          },
        });
      } else {
        const { error } = await supabase.from('assessment_questions').insert({
          assessment_id: activeAssessment.id,
          question_text: newQuestion.trim(),
          options: validOptions,
          correct_answer: newCorrect,
          sort_order: questions.length,
        });

        if (error) {
          throw error;
        }
      }

      setNewQuestion('');
      setNewOptions(['', '', '', '']);
      setNewCorrect('');
      await openQuestions(activeAssessment);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to add question';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const deleteQuestion = async (questionId: string) => {
    if (!activeAssessment) {
      return;
    }

    try {
      if (isXamppMode) {
        await xamppApiRequest<{ message: string }>(`/assessment-questions/${questionId}`, {
          method: 'DELETE',
        });
      } else {
        const { error } = await supabase.from('assessment_questions').delete().eq('id', questionId);
        if (error) {
          throw error;
        }
      }

      await openQuestions(activeAssessment);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete question';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const startQuiz = async (assessment: Assessment) => {
    setActiveAssessment(assessment);

    try {
      await loadQuestions(assessment);
      setAnswers({});
      setLastResult(null);
      setView('take');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load quiz';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const submitQuiz = async () => {
    if (!activeAssessment || !user) {
      return;
    }

    setSubmitting(true);

    try {
      let score = 0;
      let passed = false;

      if (isXamppMode) {
        const response = await xamppApiRequest<SubmitAttemptResponse>(`/assessments/${activeAssessment.id}/attempts`, {
          method: 'POST',
          body: {
            answers,
          },
        });
        score = response.score;
        passed = response.passed;
      } else {
        let earned = 0;
        let total = 0;
        questions.forEach((question) => {
          total += question.points;
          if (answers[question.id] === question.correct_answer) {
            earned += question.points;
          }
        });

        score = total > 0 ? Math.round((earned / total) * 100) : 0;
        passed = score >= activeAssessment.passing_score;

        const { error } = await supabase.from('assessment_attempts').insert({
          assessment_id: activeAssessment.id,
          trainee_id: user.id,
          answers,
          score,
          passed,
          completed_at: new Date().toISOString(),
        });

        if (error) {
          throw error;
        }
      }

      setLastResult({ score, passed });
      setView('results');
      await fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to submit quiz';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const getProgramTitle = (programId: string) =>
    programs.find((program) => program.id === programId)?.title || 'Unknown';

  const getAttempt = (assessmentId: string) =>
    attempts.find((attempt) => attempt.assessment_id === assessmentId && attempt.completed_at);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {view === 'list' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Assessments</h1>
                <p className="text-muted-foreground">
                  {canManage ? 'Create and manage quizzes' : 'Take assessments for your programs'}
                </p>
              </div>
              {canManage && (
                <Button onClick={() => setView('create')}>
                  <Plus className="mr-2 h-4 w-4" />Create Assessment
                </Button>
              )}
            </div>

            {assessments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">No assessments yet.</CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {assessments.map((assessment) => {
                  const attempt = getAttempt(assessment.id);

                  return (
                    <Card key={assessment.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base">{assessment.title}</CardTitle>
                          <Badge variant={assessment.is_published ? 'default' : 'secondary'}>
                            {assessment.is_published ? 'Published' : 'Draft'}
                          </Badge>
                        </div>
                        <CardDescription>{getProgramTitle(assessment.program_id)}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {assessment.description && <p className="text-sm text-muted-foreground">{assessment.description}</p>}
                        <p className="text-xs text-muted-foreground">Passing score: {assessment.passing_score}%</p>
                        {attempt && (
                          <div className="flex items-center gap-2">
                            {attempt.passed ? (
                              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                            <span className="text-sm font-medium">Score: {attempt.score}%</span>
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="gap-2">
                        {canManage ? (
                          <>
                            <Button variant="outline" size="sm" onClick={() => void openQuestions(assessment)}>
                              <Eye className="mr-1 h-3 w-3" />Questions
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void togglePublish(assessment)}>
                              {assessment.is_published ? 'Unpublish' : 'Publish'}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => void deleteAssessment(assessment.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        ) : (
                          assessment.is_published && (
                            <Button size="sm" onClick={() => void startQuiz(assessment)}>
                              <Play className="mr-1 h-3 w-3" />{attempt ? 'Retake' : 'Start'}
                            </Button>
                          )
                        )}
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {view === 'create' && (
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle>Create Assessment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Program</Label>
                <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                  <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
                  <SelectContent>
                    {programs.map((program) => (
                      <SelectItem key={program.id} value={program.id}>{program.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Assessment title" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
              <div>
                <Label>Passing Score (%)</Label>
                <Input
                  type="number"
                  value={passingScore}
                  onChange={(event) => setPassingScore(event.target.value)}
                  min="0"
                  max="100"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void createAssessment()} disabled={!selectedProgram || !title.trim()}>Create</Button>
                <Button variant="outline" onClick={() => setView('list')}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {view === 'questions' && activeAssessment && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">{activeAssessment.title} - Questions</h2>
                <p className="text-muted-foreground">{questions.length} question(s)</p>
              </div>
              <Button variant="outline" onClick={() => setView('list')}>Back</Button>
            </div>

            {questions.map((question, index) => (
              <Card key={question.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm">Q{index + 1}: {question.question_text}</CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => void deleteQuestion(question.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {question.options.map((option, optionIndex) => (
                      <Badge key={optionIndex} variant={option === question.correct_answer ? 'default' : 'outline'}>
                        {option}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Add Question</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Question</Label>
                  <Textarea value={newQuestion} onChange={(event) => setNewQuestion(event.target.value)} placeholder="Enter question" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {newOptions.map((option, index) => (
                    <div key={index}>
                      <Label>Option {index + 1}</Label>
                      <Input
                        value={option}
                        onChange={(event) => {
                          const nextOptions = [...newOptions];
                          nextOptions[index] = event.target.value;
                          setNewOptions(nextOptions);
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <Label>Correct Answer</Label>
                  <Select value={newCorrect} onValueChange={setNewCorrect}>
                    <SelectTrigger><SelectValue placeholder="Select correct option" /></SelectTrigger>
                    <SelectContent>
                      {newOptions.filter((option) => option.trim()).map((option, index) => (
                        <SelectItem key={index} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => void addQuestion()} disabled={!newQuestion.trim() || !newCorrect}>Add Question</Button>
              </CardContent>
            </Card>
          </div>
        )}

        {view === 'take' && activeAssessment && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h2 className="text-xl font-bold text-foreground">{activeAssessment.title}</h2>
              <p className="text-muted-foreground">Answer all questions, then submit.</p>
            </div>
            {questions.map((question, index) => (
              <Card key={question.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Q{index + 1}: {question.question_text}</CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    value={answers[question.id] || ''}
                    onValueChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
                  >
                    {question.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center gap-2">
                        <RadioGroupItem value={option} id={`${question.id}-${optionIndex}`} />
                        <Label htmlFor={`${question.id}-${optionIndex}`}>{option}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </CardContent>
              </Card>
            ))}
            <div className="flex gap-3">
              <Button onClick={() => void submitQuiz()} disabled={submitting || Object.keys(answers).length < questions.length}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />}
                Submit
              </Button>
              <Button variant="outline" onClick={() => setView('list')}>Cancel</Button>
            </div>
          </div>
        )}

        {view === 'results' && lastResult && activeAssessment && (
          <Card className="mx-auto max-w-md text-center">
            <CardHeader>
              <CardTitle>{lastResult.passed ? 'Passed' : 'Not Passed'}</CardTitle>
              <CardDescription>{activeAssessment.title}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-4xl font-bold text-foreground">{lastResult.score}%</div>
              <Progress value={lastResult.score} className="h-3" />
              <p className="text-sm text-muted-foreground">Passing score: {activeAssessment.passing_score}%</p>
              {lastResult.passed ? (
                <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--success))]" />
              ) : (
                <XCircle className="mx-auto h-12 w-12 text-destructive" />
              )}
            </CardContent>
            <CardFooter className="justify-center gap-3">
              <Button onClick={() => setView('list')}>Back to Assessments</Button>
              {!lastResult.passed && (
                <Button variant="outline" onClick={() => void startQuiz(activeAssessment)}>Retake</Button>
              )}
            </CardFooter>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
