import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import DashboardLayout from '@/components/DashboardLayout';
import {
  GraduationCap,
  Users,
  BookOpen,
  Calendar,
  BarChart3,
  Award,
  Loader2,
  Clock,
  MapPin,
  TrendingUp,
  FileCheck,
  UserPlus,
  CheckCircle2,
  Target,
  ArrowUpRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { format, parseISO, isAfter, isBefore, addDays } from 'date-fns';
import WelcomeTour from '@/components/WelcomeTour';

interface AttendanceStat {
  programTitle: string;
  totalRecords: number;
  presentCount: number;
  rate: number;
}

interface ProgramProgress {
  programId: string;
  programTitle: string;
  totalAssessments: number;
  passedAssessments: number;
  hasCertificate: boolean;
  percentage: number;
}

interface QuickStat {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
  path?: string;
}

interface ActivityItem {
  id: string;
  type: 'enrollment' | 'certificate' | 'assessment';
  description: string;
  timestamp: string;
  icon: React.ElementType;
}

interface UpcomingSession {
  id: string;
  programTitle: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
}

const CHART_COLORS = [
  'hsl(220, 73%, 23%)',   // primary
  'hsl(37, 92%, 50%)',    // accent
  'hsl(160, 60%, 45%)',   // green
  'hsl(280, 60%, 50%)',   // purple
  'hsl(10, 70%, 55%)',    // red-ish
  'hsl(190, 70%, 45%)',   // teal
];

function DashboardContent() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStat[]>([]);
  const [quickStats, setQuickStats] = useState<(QuickStat & { path?: string })[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);
  const [enrollmentChart, setEnrollmentChart] = useState<{ name: string; count: number }[]>([]);
  const [passRateChart, setPassRateChart] = useState<{ name: string; value: number }[]>([]);
  const [programProgress, setProgramProgress] = useState<ProgramProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && role) {
      Promise.all([
        fetchQuickStats(),
        fetchAttendanceStats(),
        fetchRecentActivity(),
        fetchUpcomingSessions(),
        fetchChartData(),
        fetchProgramProgress(),
      ]).finally(() => setLoading(false));
    }
  }, [user, role]);

  const fetchQuickStats = async () => {
    const stats: QuickStat[] = [];

    if (role === 'admin') {
      const [usersRes, programsRes, sessionsRes, certsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('training_programs').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('session_date', new Date().toISOString().split('T')[0]),
        supabase.from('certificates').select('id', { count: 'exact', head: true }),
      ]);
      stats.push(
        { label: 'Total Users', value: usersRes.count ?? 0, icon: Users, path: '/users' },
        { label: 'Active Trainings', value: programsRes.count ?? 0, icon: BookOpen, path: '/trainings' },
        { label: 'Sessions Today', value: sessionsRes.count ?? 0, icon: Calendar, path: '/sessions' },
        { label: 'Certificates Issued', value: certsRes.count ?? 0, icon: Award, path: '/certificates' },
      );
    } else if (role === 'trainer') {
      const [programsRes, enrollmentsRes, sessionsRes, certsRes] = await Promise.all([
        supabase.from('training_programs').select('id', { count: 'exact', head: true }).eq('trainer_id', user!.id),
        supabase.from('enrollments').select('id, program_id', { count: 'exact' }).eq('status', 'approved'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).gte('session_date', new Date().toISOString().split('T')[0]),
        supabase.from('certificates').select('id', { count: 'exact', head: true }),
      ]);

      // Filter enrollments to only trainer's programs
      const trainerPrograms = await supabase.from('training_programs').select('id').eq('trainer_id', user!.id);
      const trainerProgramIds = (trainerPrograms.data || []).map(p => p.id);
      const traineeCount = (enrollmentsRes.data || []).filter(e => trainerProgramIds.includes(e.program_id)).length;

      stats.push(
        { label: 'My Trainings', value: programsRes.count ?? 0, icon: BookOpen, path: '/trainings' },
        { label: 'Total Trainees', value: traineeCount, icon: Users, path: '/users' },
        { label: 'Upcoming Sessions', value: sessionsRes.count ?? 0, icon: Calendar, path: '/sessions' },
        { label: 'Certificates Issued', value: certsRes.count ?? 0, icon: Award, path: '/certificates' },
      );
    } else {
      const [enrollRes, sessionsRes, certsRes, attemptsRes] = await Promise.all([
        supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('trainee_id', user!.id).eq('status', 'approved'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).gte('session_date', new Date().toISOString().split('T')[0]),
        supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('trainee_id', user!.id),
        supabase.from('assessment_attempts').select('id', { count: 'exact', head: true }).eq('trainee_id', user!.id).eq('passed', true),
      ]);
      stats.push(
        { label: 'Enrolled Programs', value: enrollRes.count ?? 0, icon: BookOpen, path: '/trainings' },
        { label: 'Upcoming Sessions', value: sessionsRes.count ?? 0, icon: Calendar, path: '/sessions' },
        { label: 'Assessments Passed', value: attemptsRes.count ?? 0, icon: GraduationCap, path: '/assessments' },
        { label: 'Certificates', value: certsRes.count ?? 0, icon: Award, path: '/certificates' },
      );
    }
    setQuickStats(stats);
  };

  const fetchAttendanceStats = async () => {
    try {
      const { data: sessions } = await supabase.from('sessions').select('id, program_id');
      if (!sessions?.length) { setAttendanceStats([]); return; }

      const programIds = [...new Set(sessions.map(s => s.program_id))];
      const { data: programs } = await supabase.from('training_programs').select('id, title').in('id', programIds);
      const titleMap: Record<string, string> = {};
      (programs || []).forEach(p => { titleMap[p.id] = p.title; });

      const { data: attendance } = await supabase.from('attendance').select('session_id, status');
      if (!attendance?.length) { setAttendanceStats([]); return; }

      const sessionProgramMap: Record<string, string> = {};
      sessions.forEach(s => { sessionProgramMap[s.id] = s.program_id; });

      const programAgg: Record<string, { total: number; present: number }> = {};
      attendance.forEach(a => {
        const progId = sessionProgramMap[a.session_id];
        if (!progId) return;
        if (!programAgg[progId]) programAgg[progId] = { total: 0, present: 0 };
        programAgg[progId].total++;
        if (a.status === 'present' || a.status === 'late') programAgg[progId].present++;
      });

      const stats = Object.entries(programAgg).map(([progId, agg]) => ({
        programTitle: titleMap[progId] || 'Unknown',
        totalRecords: agg.total,
        presentCount: agg.present,
        rate: agg.total > 0 ? Math.round((agg.present / agg.total) * 100) : 0,
      })).sort((a, b) => b.rate - a.rate);

      setAttendanceStats(stats);
    } catch { /* silent */ }
  };

  const fetchRecentActivity = async () => {
    const items: ActivityItem[] = [];

    try {
      // Recent enrollments
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('id, program_id, enrolled_at, status')
        .order('enrolled_at', { ascending: false })
        .limit(5);

      if (enrollments?.length) {
        const progIds = [...new Set(enrollments.map(e => e.program_id))];
        const { data: progs } = await supabase.from('training_programs').select('id, title').in('id', progIds);
        const titleMap: Record<string, string> = {};
        (progs || []).forEach(p => { titleMap[p.id] = p.title; });

        enrollments.forEach(e => {
          items.push({
            id: `enr-${e.id}`,
            type: 'enrollment',
            description: `New enrollment in "${titleMap[e.program_id] || 'Unknown'}" (${e.status})`,
            timestamp: e.enrolled_at,
            icon: UserPlus,
          });
        });
      }

      // Recent certificates
      const { data: certs } = await supabase
        .from('certificates')
        .select('id, program_id, issued_at, certificate_number')
        .order('issued_at', { ascending: false })
        .limit(5);

      if (certs?.length) {
        const progIds = [...new Set(certs.map(c => c.program_id))];
        const { data: progs } = await supabase.from('training_programs').select('id, title').in('id', progIds);
        const titleMap: Record<string, string> = {};
        (progs || []).forEach(p => { titleMap[p.id] = p.title; });

        certs.forEach(c => {
          items.push({
            id: `cert-${c.id}`,
            type: 'certificate',
            description: `Certificate ${c.certificate_number} issued for "${titleMap[c.program_id] || 'Unknown'}"`,
            timestamp: c.issued_at,
            icon: Award,
          });
        });
      }

      // Recent assessment attempts
      const { data: attempts } = await supabase
        .from('assessment_attempts')
        .select('id, assessment_id, completed_at, passed, score')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(5);

      if (attempts?.length) {
        const assessIds = [...new Set(attempts.map(a => a.assessment_id))];
        const { data: assessments } = await supabase.from('assessments').select('id, title').in('id', assessIds);
        const titleMap: Record<string, string> = {};
        (assessments || []).forEach(a => { titleMap[a.id] = a.title; });

        attempts.forEach(a => {
          items.push({
            id: `att-${a.id}`,
            type: 'assessment',
            description: `Assessment "${titleMap[a.assessment_id] || 'Unknown'}" completed — ${a.passed ? 'Passed' : 'Failed'} (${a.score}%)`,
            timestamp: a.completed_at!,
            icon: FileCheck,
          });
        });
      }

      // Sort all by timestamp descending
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivities(items.slice(0, 10));
    } catch { /* silent */ }
  };

  const fetchUpcomingSessions = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekLater = addDays(new Date(), 14).toISOString().split('T')[0];

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, program_id, session_date, start_time, end_time, location')
        .gte('session_date', today)
        .lte('session_date', weekLater)
        .order('session_date', { ascending: true })
        .limit(6);

      if (!sessions?.length) { setUpcomingSessions([]); return; }

      const progIds = [...new Set(sessions.map(s => s.program_id))];
      const { data: progs } = await supabase.from('training_programs').select('id, title').in('id', progIds);
      const titleMap: Record<string, string> = {};
      (progs || []).forEach(p => { titleMap[p.id] = p.title; });

      setUpcomingSessions(sessions.map(s => ({
        id: s.id,
        programTitle: titleMap[s.program_id] || 'Unknown',
        sessionDate: s.session_date,
        startTime: s.start_time,
        endTime: s.end_time,
        location: s.location,
      })));
    } catch { /* silent */ }
  };

  const fetchChartData = async () => {
    try {
      // Enrollments per program for bar chart
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('program_id')
        .eq('status', 'approved');

      if (enrollments?.length) {
        const progCounts: Record<string, number> = {};
        enrollments.forEach(e => {
          progCounts[e.program_id] = (progCounts[e.program_id] || 0) + 1;
        });

        const progIds = Object.keys(progCounts);
        const { data: progs } = await supabase.from('training_programs').select('id, title').in('id', progIds);
        const titleMap: Record<string, string> = {};
        (progs || []).forEach(p => { titleMap[p.id] = p.title; });

        const chartData = Object.entries(progCounts)
          .map(([id, count]) => ({
            name: (titleMap[id] || 'Unknown').substring(0, 20),
            count,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6);

        setEnrollmentChart(chartData);
      }

      // Pass/fail pie chart
      const { data: attempts } = await supabase
        .from('assessment_attempts')
        .select('passed')
        .not('completed_at', 'is', null);

      if (attempts?.length) {
        const passed = attempts.filter(a => a.passed === true).length;
        const failed = attempts.filter(a => a.passed === false).length;
        setPassRateChart([
          { name: 'Passed', value: passed },
          { name: 'Failed', value: failed },
        ]);
      }
    } catch { /* silent */ }
  };

  const fetchProgramProgress = async () => {
    if (!user) return;
    try {
      if (role === 'trainee') {
        const { data: enrollments } = await supabase
          .from('enrollments')
          .select('program_id')
          .eq('trainee_id', user.id)
          .eq('status', 'approved');
        if (!enrollments?.length) { setProgramProgress([]); return; }

        const progIds = enrollments.map(e => e.program_id);
        const [{ data: programs }, { data: assessments }, { data: attempts }, { data: certs }] = await Promise.all([
          supabase.from('training_programs').select('id, title').in('id', progIds),
          supabase.from('assessments').select('id, program_id').in('program_id', progIds).eq('is_published', true),
          supabase.from('assessment_attempts').select('assessment_id, passed').eq('trainee_id', user.id).eq('passed', true),
          supabase.from('certificates').select('program_id').eq('trainee_id', user.id),
        ]);

        const titleMap: Record<string, string> = {};
        (programs || []).forEach(p => { titleMap[p.id] = p.title; });
        const passedSet = new Set((attempts || []).map(a => a.assessment_id));
        const certProgSet = new Set((certs || []).map(c => c.program_id));

        const progAssessments: Record<string, string[]> = {};
        (assessments || []).forEach(a => {
          if (!progAssessments[a.program_id]) progAssessments[a.program_id] = [];
          progAssessments[a.program_id].push(a.id);
        });

        const progress: ProgramProgress[] = progIds.map(pid => {
          const total = progAssessments[pid]?.length || 0;
          const passed = total > 0 ? progAssessments[pid].filter(aid => passedSet.has(aid)).length : 0;
          return {
            programId: pid,
            programTitle: titleMap[pid] || 'Unknown',
            totalAssessments: total,
            passedAssessments: passed,
            hasCertificate: certProgSet.has(pid),
            percentage: total > 0 ? Math.round((passed / total) * 100) : 0,
          };
        });
        setProgramProgress(progress);
      } else {
        const { data: programs } = await supabase.from('training_programs').select('id, title');
        if (!programs?.length) { setProgramProgress([]); return; }

        const progIds = programs.map(p => p.id);
        const [{ data: assessments }, { data: enrollments }, { data: attempts }, { data: certs }] = await Promise.all([
          supabase.from('assessments').select('id, program_id').in('program_id', progIds).eq('is_published', true),
          supabase.from('enrollments').select('program_id, trainee_id').in('program_id', progIds).eq('status', 'approved'),
          supabase.from('assessment_attempts').select('assessment_id, trainee_id, passed').eq('passed', true),
          supabase.from('certificates').select('program_id'),
        ]);

        const titleMap: Record<string, string> = {};
        programs.forEach(p => { titleMap[p.id] = p.title; });

        const progAssessments: Record<string, string[]> = {};
        (assessments || []).forEach(a => {
          if (!progAssessments[a.program_id]) progAssessments[a.program_id] = [];
          progAssessments[a.program_id].push(a.id);
        });

        const progTrainees: Record<string, string[]> = {};
        (enrollments || []).forEach(e => {
          if (!progTrainees[e.program_id]) progTrainees[e.program_id] = [];
          progTrainees[e.program_id].push(e.trainee_id);
        });

        const passedMap: Record<string, Set<string>> = {};
        (attempts || []).forEach(a => {
          if (!passedMap[a.trainee_id]) passedMap[a.trainee_id] = new Set();
          passedMap[a.trainee_id].add(a.assessment_id);
        });

        const certCounts: Record<string, number> = {};
        (certs || []).forEach(c => { certCounts[c.program_id] = (certCounts[c.program_id] || 0) + 1; });

        const progress: ProgramProgress[] = progIds
          .filter(pid => (progTrainees[pid]?.length || 0) > 0)
          .map(pid => {
            const total = progAssessments[pid]?.length || 0;
            const trainees = progTrainees[pid] || [];
            let avgPassed = 0;
            if (total > 0 && trainees.length > 0) {
              const sum = trainees.reduce((acc, tid) => {
                const passed = progAssessments[pid].filter(aid => passedMap[tid]?.has(aid)).length;
                return acc + passed;
              }, 0);
              avgPassed = Math.round(sum / trainees.length);
            }
            return {
              programId: pid,
              programTitle: titleMap[pid] || 'Unknown',
              totalAssessments: total,
              passedAssessments: avgPassed,
              hasCertificate: (certCounts[pid] || 0) > 0,
              percentage: total > 0 ? Math.round((avgPassed / total) * 100) : 0,
            };
          })
          .sort((a, b) => b.percentage - a.percentage);
        setProgramProgress(progress);
      }
    } catch { /* silent */ }
  };

  const activityColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'enrollment': return 'bg-primary/10 text-primary';
      case 'certificate': return 'bg-accent/10 text-accent';
      case 'assessment': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold mb-1">
          Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}!
        </h2>
        <p className="text-muted-foreground">
          Here's an overview of your {role === 'admin' ? 'system' : role === 'trainer' ? 'trainings' : 'learning journey'}.
        </p>
      </div>

      {/* Welcome Tour */}
      <WelcomeTour />

      {/* Quick Stats */}
      <div id="tour-quick-stats" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {quickStats.map((stat, i) => (
          <Card
            key={i}
            className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
            onClick={() => stat.path && navigate(stat.path)}
          >
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <stat.icon className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div id="tour-charts" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrollment Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Enrollments by Program
            </CardTitle>
          </CardHeader>
          <CardContent>
            {enrollmentChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={enrollmentChart} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 88%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(0, 0%, 100%)',
                      border: '1px solid hsl(220, 20%, 88%)',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(220, 73%, 23%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
                <BarChart3 className="w-10 h-10 mb-2 opacity-50" />
                <p className="text-sm">No enrollment data yet.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pass Rate Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Assessment Pass Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            {passRateChart.length > 0 && passRateChart.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={passRateChart}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {passRateChart.map((_, index) => (
                      <Cell key={index} fill={index === 0 ? 'hsl(160, 60%, 45%)' : 'hsl(0, 84%, 60%)'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
                <GraduationCap className="w-10 h-10 mb-2 opacity-50" />
                <p className="text-sm">No assessment data yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Sessions & Recent Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="tour-upcoming">
        {/* Upcoming Sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Sessions
            </CardTitle>
            <CardDescription>Next 2 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingSessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No upcoming sessions.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingSessions.map(s => (
                  <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Calendar className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{s.programTitle}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(parseISO(s.sessionDate), 'MMM d, yyyy')}
                          {s.startTime && ` • ${s.startTime.slice(0, 5)}`}
                          {s.endTime && `–${s.endTime.slice(0, 5)}`}
                        </span>
                        {s.location && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3" />
                            {s.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card id="tour-activity">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest actions across the platform</CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recent activity yet.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {activities.map(a => (
                  <div key={a.id} className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${activityColor(a.type)}`}>
                      <a.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">{a.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(parseISO(a.timestamp), 'MMM d, yyyy • h:mm a')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Program Progress Tracker */}
      {programProgress.length > 0 && (
        <Card id="tour-progress">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {role === 'trainee' ? 'My Program Progress' : 'Program Completion Overview'}
            </CardTitle>
            <CardDescription>
              {role === 'trainee'
                ? 'Your assessment completion across enrolled programs.'
                : 'Average trainee assessment completion per program.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {programProgress.map((prog) => (
                <div key={prog.programId} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{prog.programTitle}</span>
                      {prog.hasCertificate && (
                        <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
                          <CheckCircle2 className="w-3 h-3" />
                          {role === 'trainee' ? 'Certified' : 'Certs Issued'}
                        </Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground shrink-0 ml-4">
                      {role === 'trainee'
                        ? `${prog.passedAssessments}/${prog.totalAssessments} assessments`
                        : `${prog.percentage}% avg completion`}
                    </span>
                  </div>
                  <Progress value={prog.percentage} className="h-2.5" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attendance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Attendance Check-in Rates
          </CardTitle>
          <CardDescription>Attendance rates per training program based on session records.</CardDescription>
        </CardHeader>
        <CardContent>
          {attendanceStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No attendance data yet.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {attendanceStats.map((stat, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate mr-4">{stat.programTitle}</span>
                    <span className="text-muted-foreground shrink-0">
                      {stat.presentCount}/{stat.totalRecords} ({stat.rate}%)
                    </span>
                  </div>
                  <Progress value={stat.rate} className="h-2" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  return (
    <DashboardLayout>
      <DashboardContent />
    </DashboardLayout>
  );
}
