import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Target,
  CheckCircle2,
  Clock,
  Award,
  BookOpen,
  BarChart3,
  Calendar,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface ProgramProgressData {
  programId: string;
  programTitle: string;
  programStatus: string;
  startDate: string | null;
  endDate: string | null;
  // Sessions
  totalSessions: number;
  attendedSessions: number;
  attendanceRate: number;
  // Assessments
  totalAssessments: number;
  passedAssessments: number;
  failedAssessments: number;
  bestScore: number | null;
  averageScore: number | null;
  // Milestones
  isEnrolled: boolean;
  hasAttendedFirst: boolean;
  hasPassedAssessment: boolean;
  hasCertificate: boolean;
  // Overall
  overallProgress: number;
}

interface OverallStats {
  totalPrograms: number;
  completedPrograms: number;
  totalSessionsAttended: number;
  totalAssessmentsPassed: number;
  totalCertificates: number;
  averageProgress: number;
}

function ProgressContent() {
  const { user, role } = useAuth();
  const [programs, setPrograms] = useState<ProgramProgressData[]>([]);
  const [overall, setOverall] = useState<OverallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);

  useEffect(() => {
    if (user) fetchProgress();
  }, [user]);

  const fetchProgress = async () => {
    if (!user) return;
    try {
      // Get enrolled programs
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('program_id, status')
        .eq('trainee_id', user.id)
        .eq('status', 'approved');

      if (!enrollments?.length) {
        setPrograms([]);
        setOverall({ totalPrograms: 0, completedPrograms: 0, totalSessionsAttended: 0, totalAssessmentsPassed: 0, totalCertificates: 0, averageProgress: 0 });
        setLoading(false);
        return;
      }

      const progIds = enrollments.map(e => e.program_id);

      const [
        { data: progs },
        { data: sessions },
        { data: attendance },
        { data: assessments },
        { data: attempts },
        { data: certs },
      ] = await Promise.all([
        supabase.from('training_programs').select('id, title, status, start_date, end_date').in('id', progIds),
        supabase.from('sessions').select('id, program_id').in('program_id', progIds),
        supabase.from('attendance').select('session_id, status').eq('trainee_id', user.id),
        supabase.from('assessments').select('id, program_id').in('program_id', progIds).eq('is_published', true),
        supabase.from('assessment_attempts').select('assessment_id, score, passed, completed_at').eq('trainee_id', user.id).not('completed_at', 'is', null),
        supabase.from('certificates').select('program_id').eq('trainee_id', user.id),
      ]);

      // Build maps
      const sessionsByProgram: Record<string, string[]> = {};
      (sessions || []).forEach(s => {
        if (!sessionsByProgram[s.program_id]) sessionsByProgram[s.program_id] = [];
        sessionsByProgram[s.program_id].push(s.id);
      });

      const attendedSessionIds = new Set(
        (attendance || []).filter(a => a.status === 'present' || a.status === 'late').map(a => a.session_id)
      );

      const assessmentsByProgram: Record<string, string[]> = {};
      (assessments || []).forEach(a => {
        if (!assessmentsByProgram[a.program_id]) assessmentsByProgram[a.program_id] = [];
        assessmentsByProgram[a.program_id].push(a.id);
      });

      const attemptsByAssessment: Record<string, { score: number | null; passed: boolean | null }[]> = {};
      (attempts || []).forEach(a => {
        if (!attemptsByAssessment[a.assessment_id]) attemptsByAssessment[a.assessment_id] = [];
        attemptsByAssessment[a.assessment_id].push({ score: a.score, passed: a.passed });
      });

      const certProgIds = new Set((certs || []).map(c => c.program_id));

      const progressData: ProgramProgressData[] = (progs || []).map(p => {
        const progSessions = sessionsByProgram[p.id] || [];
        const attended = progSessions.filter(sid => attendedSessionIds.has(sid)).length;
        const attendanceRate = progSessions.length > 0 ? Math.round((attended / progSessions.length) * 100) : 0;

        const progAssessments = assessmentsByProgram[p.id] || [];
        let passedCount = 0;
        let failedCount = 0;
        let scores: number[] = [];

        progAssessments.forEach(aid => {
          const atts = attemptsByAssessment[aid] || [];
          const hasPassed = atts.some(a => a.passed);
          if (hasPassed) passedCount++;
          else if (atts.length > 0) failedCount++;
          atts.forEach(a => { if (a.score != null) scores.push(a.score); });
        });

        const bestScore = scores.length > 0 ? Math.max(...scores) : null;
        const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

        const hasCert = certProgIds.has(p.id);

        // Calculate overall progress (weighted: attendance 30%, assessments 50%, certificate 20%)
        const attendanceWeight = attendanceRate * 0.3;
        const assessmentWeight = progAssessments.length > 0
          ? (passedCount / progAssessments.length) * 100 * 0.5
          : (attended > 0 ? 50 : 0); // If no assessments, give credit for attendance
        const certWeight = hasCert ? 20 : 0;
        const overallProgress = Math.min(100, Math.round(attendanceWeight + assessmentWeight + certWeight));

        return {
          programId: p.id,
          programTitle: p.title,
          programStatus: p.status,
          startDate: p.start_date,
          endDate: p.end_date,
          totalSessions: progSessions.length,
          attendedSessions: attended,
          attendanceRate,
          totalAssessments: progAssessments.length,
          passedAssessments: passedCount,
          failedAssessments: failedCount,
          bestScore,
          averageScore,
          isEnrolled: true,
          hasAttendedFirst: attended > 0,
          hasPassedAssessment: passedCount > 0,
          hasCertificate: hasCert,
          overallProgress,
        };
      });

      progressData.sort((a, b) => b.overallProgress - a.overallProgress);
      setPrograms(progressData);
      if (progressData.length > 0 && !selectedProgram) {
        setSelectedProgram(progressData[0].programId);
      }

      setOverall({
        totalPrograms: progressData.length,
        completedPrograms: progressData.filter(p => p.hasCertificate).length,
        totalSessionsAttended: progressData.reduce((s, p) => s + p.attendedSessions, 0),
        totalAssessmentsPassed: progressData.reduce((s, p) => s + p.passedAssessments, 0),
        totalCertificates: progressData.filter(p => p.hasCertificate).length,
        averageProgress: progressData.length > 0
          ? Math.round(progressData.reduce((s, p) => s + p.overallProgress, 0) / progressData.length)
          : 0,
      });
    } catch (err) {
      console.error('Error fetching progress:', err);
    } finally {
      setLoading(false);
    }
  };

  const MilestoneStep = ({ done, label, icon: Icon }: { done: boolean; label: string; icon: React.ElementType }) => (
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <span className={`text-sm ${done ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{label}</span>
      {done && <CheckCircle2 className="w-4 h-4 text-primary ml-auto shrink-0" />}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const selected = programs.find(p => p.programId === selectedProgram);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Progress</h1>
        <p className="text-muted-foreground">Track your learning journey across all enrolled programs</p>
      </div>

      {/* Overall Stats */}
      {overall && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { label: 'Enrolled', value: overall.totalPrograms, icon: BookOpen, color: 'text-primary' },
            { label: 'Completed', value: overall.completedPrograms, icon: Award, color: 'text-accent-foreground' },
            { label: 'Sessions Attended', value: overall.totalSessionsAttended, icon: Calendar, color: 'text-primary' },
            { label: 'Assessments Passed', value: overall.totalAssessmentsPassed, icon: CheckCircle2, color: 'text-primary' },
            { label: 'Avg Progress', value: `${overall.averageProgress}%`, icon: TrendingUp, color: 'text-primary' },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {programs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Programs Yet</h3>
            <p className="text-muted-foreground">Enroll in a training program to start tracking your progress.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Program List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Programs</h3>
            {programs.map((prog) => (
              <Card
                key={prog.programId}
                className={`cursor-pointer transition-all hover:shadow-md ${selectedProgram === prog.programId ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelectedProgram(prog.programId)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm text-foreground truncate flex-1">{prog.programTitle}</h4>
                    {prog.hasCertificate && (
                      <Badge variant="default" className="ml-2 shrink-0 text-xs">Certified</Badge>
                    )}
                  </div>
                  <Progress value={prog.overallProgress} className="h-2 mb-1" />
                  <p className="text-xs text-muted-foreground mt-1">{prog.overallProgress}% complete</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Program Detail */}
          {selected && (
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{selected.programTitle}</CardTitle>
                      <CardDescription>
                        {selected.startDate && selected.endDate
                          ? `${format(parseISO(selected.startDate), 'MMM d, yyyy')} — ${format(parseISO(selected.endDate), 'MMM d, yyyy')}`
                          : 'No date range set'}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-primary">{selected.overallProgress}%</p>
                      <p className="text-xs text-muted-foreground">Overall</p>
                    </div>
                  </div>
                  <Progress value={selected.overallProgress} className="h-3 mt-2" />
                </CardHeader>
              </Card>

              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="attendance">Attendance</TabsTrigger>
                  <TabsTrigger value="assessments">Assessments</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Attendance</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-foreground">{selected.attendedSessions}/{selected.totalSessions}</p>
                        <p className="text-xs text-muted-foreground">sessions attended</p>
                        <Progress value={selected.attendanceRate} className="h-2 mt-2" />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Assessments</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-foreground">{selected.passedAssessments}/{selected.totalAssessments}</p>
                        <p className="text-xs text-muted-foreground">assessments passed</p>
                        <Progress value={selected.totalAssessments > 0 ? (selected.passedAssessments / selected.totalAssessments) * 100 : 0} className="h-2 mt-2" />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Best Score</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-foreground">{selected.bestScore != null ? `${selected.bestScore}%` : '—'}</p>
                        <p className="text-xs text-muted-foreground">highest assessment score</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Average Score</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-foreground">{selected.averageScore != null ? `${selected.averageScore}%` : '—'}</p>
                        <p className="text-xs text-muted-foreground">across all attempts</p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="attendance">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-foreground">Session Attendance</h4>
                        <Badge variant={selected.attendanceRate >= 80 ? 'default' : selected.attendanceRate >= 50 ? 'secondary' : 'destructive'}>
                          {selected.attendanceRate}% rate
                        </Badge>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total Sessions</span>
                          <span className="font-medium text-foreground">{selected.totalSessions}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Attended</span>
                          <span className="font-medium text-foreground">{selected.attendedSessions}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Missed</span>
                          <span className="font-medium text-foreground">{selected.totalSessions - selected.attendedSessions}</span>
                        </div>
                        <Progress value={selected.attendanceRate} className="h-3 mt-2" />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="assessments">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-foreground">Assessment Results</h4>
                        <Badge variant={selected.passedAssessments === selected.totalAssessments && selected.totalAssessments > 0 ? 'default' : 'secondary'}>
                          {selected.passedAssessments}/{selected.totalAssessments} passed
                        </Badge>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total Assessments</span>
                          <span className="font-medium text-foreground">{selected.totalAssessments}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Passed</span>
                          <span className="font-medium text-primary">{selected.passedAssessments}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Failed / Pending</span>
                          <span className="font-medium text-foreground">{selected.totalAssessments - selected.passedAssessments}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Best Score</span>
                          <span className="font-medium text-foreground">{selected.bestScore != null ? `${selected.bestScore}%` : '—'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Average Score</span>
                          <span className="font-medium text-foreground">{selected.averageScore != null ? `${selected.averageScore}%` : '—'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Milestones */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Target className="w-4 h-4" /> Milestones
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <MilestoneStep done={selected.isEnrolled} label="Enrolled in program" icon={BookOpen} />
                  <div className="ml-4 border-l-2 border-muted h-2" />
                  <MilestoneStep done={selected.hasAttendedFirst} label="Attended first session" icon={Calendar} />
                  <div className="ml-4 border-l-2 border-muted h-2" />
                  <MilestoneStep done={selected.hasPassedAssessment} label="Passed an assessment" icon={BarChart3} />
                  <div className="ml-4 border-l-2 border-muted h-2" />
                  <MilestoneStep done={selected.hasCertificate} label="Certificate earned" icon={Award} />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProgressPage() {
  return (
    <DashboardLayout>
      <ProgressContent />
    </DashboardLayout>
  );
}
