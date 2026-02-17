import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, ClipboardCheck, Eye, Trash2, CheckCircle2, XCircle, Play } from 'lucide-react';

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
  correct_answer: string;
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

interface Program { id: string; title: string; }

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

  // Create assessment form
  const [selectedProgram, setSelectedProgram] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [passingScore, setPassingScore] = useState('70');

  // Question management
  const [activeAssessment, setActiveAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [newOptions, setNewOptions] = useState(['', '', '', '']);
  const [newCorrect, setNewCorrect] = useState('');

  // Quiz taking
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ score: number; total: number; passed: boolean } | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [pRes, aRes, attRes] = await Promise.all([
      supabase.from('training_programs').select('id, title').order('title'),
      supabase.from('assessments').select('*').order('created_at', { ascending: false }),
      user ? supabase.from('assessment_attempts').select('*').eq('trainee_id', user.id) : Promise.resolve({ data: [] }),
    ]);
    if (pRes.data) setPrograms(pRes.data);
    if (aRes.data) setAssessments(aRes.data as Assessment[]);
    if (attRes.data) setAttempts(attRes.data as Attempt[]);
    setLoading(false);
  };

  const createAssessment = async () => {
    if (!user || !selectedProgram || !title.trim()) return;
    const { error } = await supabase.from('assessments').insert({
      program_id: selectedProgram,
      title: title.trim(),
      description: description.trim() || null,
      passing_score: parseInt(passingScore) || 70,
      created_by: user.id,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Assessment created' });
      setTitle(''); setDescription(''); setSelectedProgram(''); setPassingScore('70');
      setView('list');
      fetchData();
    }
  };

  const togglePublish = async (a: Assessment) => {
    const { error } = await supabase.from('assessments').update({ is_published: !a.is_published }).eq('id', a.id);
    if (!error) fetchData();
  };

  const deleteAssessment = async (id: string) => {
    const { error } = await supabase.from('assessments').delete().eq('id', id);
    if (!error) fetchData();
  };

  const openQuestions = async (a: Assessment) => {
    setActiveAssessment(a);
    const { data } = await supabase.from('assessment_questions').select('*').eq('assessment_id', a.id).order('sort_order');
    setQuestions((data as Question[]) || []);
    setView('questions');
  };

  const addQuestion = async () => {
    if (!activeAssessment || !newQuestion.trim() || !newCorrect) return;
    const validOptions = newOptions.filter((o) => o.trim());
    if (validOptions.length < 2) {
      toast({ title: 'Add at least 2 options', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('assessment_questions').insert({
      assessment_id: activeAssessment.id,
      question_text: newQuestion.trim(),
      options: validOptions,
      correct_answer: newCorrect,
      sort_order: questions.length,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setNewQuestion(''); setNewOptions(['', '', '', '']); setNewCorrect('');
      openQuestions(activeAssessment);
    }
  };

  const deleteQuestion = async (qId: string) => {
    await supabase.from('assessment_questions').delete().eq('id', qId);
    if (activeAssessment) openQuestions(activeAssessment);
  };

  const startQuiz = async (a: Assessment) => {
    setActiveAssessment(a);
    const { data } = await supabase.from('assessment_questions').select('*').eq('assessment_id', a.id).order('sort_order');
    setQuestions((data as Question[]) || []);
    setAnswers({});
    setLastResult(null);
    setView('take');
  };

  const submitQuiz = async () => {
    if (!activeAssessment || !user) return;
    setSubmitting(true);
    let earned = 0;
    let total = 0;
    questions.forEach((q) => {
      total += q.points;
      if (answers[q.id] === q.correct_answer) earned += q.points;
    });
    const score = total > 0 ? Math.round((earned / total) * 100) : 0;
    const passed = score >= activeAssessment.passing_score;

    await supabase.from('assessment_attempts').insert({
      assessment_id: activeAssessment.id,
      trainee_id: user.id,
      answers,
      score,
      passed,
      completed_at: new Date().toISOString(),
    });

    setLastResult({ score, total: 100, passed });
    setView('results');
    setSubmitting(false);
    fetchData();
  };

  const getProgramTitle = (pid: string) => programs.find((p) => p.id === pid)?.title || 'Unknown';
  const getAttempt = (aId: string) => attempts.find((at) => at.assessment_id === aId && at.completed_at);

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
                  <Plus className="h-4 w-4 mr-2" />Create Assessment
                </Button>
              )}
            </div>

            {assessments.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No assessments yet.</CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {assessments.map((a) => {
                  const attempt = getAttempt(a.id);
                  return (
                    <Card key={a.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base">{a.title}</CardTitle>
                          <Badge variant={a.is_published ? 'default' : 'secondary'}>
                            {a.is_published ? 'Published' : 'Draft'}
                          </Badge>
                        </div>
                        <CardDescription>{getProgramTitle(a.program_id)}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
                        <p className="text-xs text-muted-foreground">Passing score: {a.passing_score}%</p>
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
                            <Button variant="outline" size="sm" onClick={() => openQuestions(a)}>
                              <Eye className="h-3 w-3 mr-1" />Questions
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => togglePublish(a)}>
                              {a.is_published ? 'Unpublish' : 'Publish'}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteAssessment(a.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        ) : (
                          a.is_published && (
                            <Button size="sm" onClick={() => startQuiz(a)}>
                              <Play className="h-3 w-3 mr-1" />{attempt ? 'Retake' : 'Start'}
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
                    {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Assessment title" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <Label>Passing Score (%)</Label>
                <Input type="number" value={passingScore} onChange={(e) => setPassingScore(e.target.value)} min="0" max="100" />
              </div>
              <div className="flex gap-2">
                <Button onClick={createAssessment} disabled={!selectedProgram || !title.trim()}>Create</Button>
                <Button variant="outline" onClick={() => setView('list')}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {view === 'questions' && activeAssessment && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">{activeAssessment.title} — Questions</h2>
                <p className="text-muted-foreground">{questions.length} question(s)</p>
              </div>
              <Button variant="outline" onClick={() => setView('list')}>Back</Button>
            </div>

            {questions.map((q, i) => (
              <Card key={q.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm">Q{i + 1}: {q.question_text}</CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => deleteQuestion(q.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(q.options as string[]).map((opt, j) => (
                      <Badge key={j} variant={opt === q.correct_answer ? 'default' : 'outline'}>{opt}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardHeader><CardTitle className="text-base">Add Question</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Question</Label>
                  <Textarea value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} placeholder="Enter question" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {newOptions.map((opt, i) => (
                    <div key={i}>
                      <Label>Option {i + 1}</Label>
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const copy = [...newOptions];
                          copy[i] = e.target.value;
                          setNewOptions(copy);
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
                      {newOptions.filter((o) => o.trim()).map((o, i) => (
                        <SelectItem key={i} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={addQuestion} disabled={!newQuestion.trim() || !newCorrect}>Add Question</Button>
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
            {questions.map((q, i) => (
              <Card key={q.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Q{i + 1}: {q.question_text}</CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup value={answers[q.id] || ''} onValueChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}>
                    {(q.options as string[]).map((opt, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <RadioGroupItem value={opt} id={`${q.id}-${j}`} />
                        <Label htmlFor={`${q.id}-${j}`}>{opt}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </CardContent>
              </Card>
            ))}
            <div className="flex gap-3">
              <Button onClick={submitQuiz} disabled={submitting || Object.keys(answers).length < questions.length}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ClipboardCheck className="h-4 w-4 mr-2" />}
                Submit
              </Button>
              <Button variant="outline" onClick={() => setView('list')}>Cancel</Button>
            </div>
          </div>
        )}

        {view === 'results' && lastResult && activeAssessment && (
          <Card className="max-w-md mx-auto text-center">
            <CardHeader>
              <CardTitle>{lastResult.passed ? '🎉 Passed!' : 'Not Passed'}</CardTitle>
              <CardDescription>{activeAssessment.title}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-4xl font-bold text-foreground">{lastResult.score}%</div>
              <Progress value={lastResult.score} className="h-3" />
              <p className="text-sm text-muted-foreground">Passing score: {activeAssessment.passing_score}%</p>
              {lastResult.passed ? (
                <CheckCircle2 className="h-12 w-12 text-[hsl(var(--success))] mx-auto" />
              ) : (
                <XCircle className="h-12 w-12 text-destructive mx-auto" />
              )}
            </CardContent>
            <CardFooter className="justify-center gap-3">
              <Button onClick={() => setView('list')}>Back to Assessments</Button>
              {!lastResult.passed && (
                <Button variant="outline" onClick={() => startQuiz(activeAssessment)}>Retake</Button>
              )}
            </CardFooter>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
