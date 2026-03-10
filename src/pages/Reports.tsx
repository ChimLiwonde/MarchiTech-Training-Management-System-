import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Users, BookOpen, Award, CheckCircle2, TrendingUp, ClipboardList, Download, Filter } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const COLORS = ['hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(271, 81%, 56%)'];

interface Stats {
  totalTrainees: number;
  totalTrainers: number;
  totalPrograms: number;
  activePrograms: number;
  totalEnrollments: number;
  approvedEnrollments: number;
  totalCertificates: number;
  totalAssessments: number;
  totalAttempts: number;
  passedAttempts: number;
}

interface ProgramEnrollment { name: string; enrolled: number; approved: number; }
interface TrainerMetric { name: string; programs: number; trainees: number; passRate: number; }

export default function Reports() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState<Stats>({
    totalTrainees: 0, totalTrainers: 0, totalPrograms: 0, activePrograms: 0,
    totalEnrollments: 0, approvedEnrollments: 0, totalCertificates: 0,
    totalAssessments: 0, totalAttempts: 0, passedAttempts: 0,
  });
  const [programEnrollments, setProgramEnrollments] = useState<ProgramEnrollment[]>([]);
  const [enrollmentStatusData, setEnrollmentStatusData] = useState<{ name: string; value: number }[]>([]);
  const [assessmentData, setAssessmentData] = useState<{ name: string; value: number }[]>([]);
  const [trainerMetrics, setTrainerMetrics] = useState<TrainerMetric[]>([]);

  useEffect(() => { fetchReports(); }, []);

  const fetchReports = async (from?: string, to?: string) => {
    setLoading(true);
    const [rolesRes, programsRes, enrollmentsRes, certsRes, assessmentsRes, attemptsRes, profilesRes] =
      await Promise.all([
        supabase.from('user_roles').select('role, user_id'),
        supabase.from('training_programs').select('id, title, status, trainer_id'),
        supabase.from('enrollments').select('program_id, status, enrolled_at'),
        supabase.from('certificates').select('id, issued_at'),
        supabase.from('assessments').select('id, program_id'),
        supabase.from('assessment_attempts').select('id, passed, assessment_id, completed_at'),
        supabase.from('profiles').select('user_id, full_name, email'),
      ]);

    let enrollments = enrollmentsRes.data || [];
    let certs = certsRes.data || [];
    let attempts = attemptsRes.data || [];

    // Apply date filters
    if (from) {
      enrollments = enrollments.filter(e => e.enrolled_at >= from);
      certs = certs.filter(c => c.issued_at >= from);
      attempts = attempts.filter(a => !a.completed_at || a.completed_at >= from);
    }
    if (to) {
      const toEnd = to + 'T23:59:59';
      enrollments = enrollments.filter(e => e.enrolled_at <= toEnd);
      certs = certs.filter(c => c.issued_at <= toEnd);
      attempts = attempts.filter(a => !a.completed_at || a.completed_at <= toEnd);
    }

    const roles = rolesRes.data || [];
    const programs = programsRes.data || [];
    const profiles = profilesRes.data || [];
    const assessments = assessmentsRes.data || [];

    const newStats: Stats = {
      totalTrainees: roles.filter(r => r.role === 'trainee').length,
      totalTrainers: roles.filter(r => r.role === 'trainer').length,
      totalPrograms: programs.length,
      activePrograms: programs.filter(p => p.status === 'active').length,
      totalEnrollments: enrollments.length,
      approvedEnrollments: enrollments.filter(e => e.status === 'approved').length,
      totalCertificates: certs.length,
      totalAssessments: assessments.length,
      totalAttempts: attempts.length,
      passedAttempts: attempts.filter(a => a.passed).length,
    };
    setStats(newStats);

    // Program enrollment chart
    const progMap: Record<string, { title: string; enrolled: number; approved: number }> = {};
    programs.forEach(p => { progMap[p.id] = { title: p.title, enrolled: 0, approved: 0 }; });
    enrollments.forEach(e => {
      if (progMap[e.program_id]) {
        progMap[e.program_id].enrolled++;
        if (e.status === 'approved') progMap[e.program_id].approved++;
      }
    });
    setProgramEnrollments(
      Object.values(progMap)
        .filter(p => p.enrolled > 0)
        .map(p => ({ name: p.title.length > 20 ? p.title.slice(0, 20) + '…' : p.title, enrolled: p.enrolled, approved: p.approved }))
        .slice(0, 8)
    );

    // Enrollment status pie
    const statusCounts: Record<string, number> = {};
    enrollments.forEach(e => { statusCounts[e.status] = (statusCounts[e.status] || 0) + 1; });
    setEnrollmentStatusData(Object.entries(statusCounts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1), value,
    })));

    // Assessment pass/fail
    const passed = attempts.filter(a => a.passed).length;
    const failed = attempts.filter(a => a.passed === false).length;
    setAssessmentData(passed + failed > 0 ? [{ name: 'Passed', value: passed }, { name: 'Failed', value: failed }] : []);

    // Per-trainer metrics
    const trainerIds = [...new Set(programs.map(p => p.trainer_id))];
    const metrics: TrainerMetric[] = trainerIds.map(tid => {
      const profile = profiles.find(p => p.user_id === tid);
      const trainerPrograms = programs.filter(p => p.trainer_id === tid);
      const programIds = trainerPrograms.map(p => p.id);
      const trainerEnrollments = enrollments.filter(e => programIds.includes(e.program_id) && e.status === 'approved').length;
      const assessmentIds = assessments.filter(a => programIds.includes(a.program_id)).map(a => a.id);
      const trainerAttempts = attempts.filter(a => assessmentIds.includes(a.assessment_id));
      const trainerPassed = trainerAttempts.filter(a => a.passed).length;
      const rate = trainerAttempts.length > 0 ? Math.round((trainerPassed / trainerAttempts.length) * 100) : 0;
      return {
        name: profile?.full_name || profile?.email || 'Unknown',
        programs: trainerPrograms.length,
        trainees: trainerEnrollments,
        passRate: rate,
      };
    });
    setTrainerMetrics(metrics);

    setLoading(false);
  };

  const handleFilter = () => { fetchReports(dateFrom, dateTo); };
  const handleClearFilter = () => { setDateFrom(''); setDateTo(''); fetchReports(); };

  const exportCSV = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Total Trainees', stats.totalTrainees],
      ['Total Trainers', stats.totalTrainers],
      ['Total Programs', stats.totalPrograms],
      ['Active Programs', stats.activePrograms],
      ['Total Enrollments', stats.totalEnrollments],
      ['Approved Enrollments', stats.approvedEnrollments],
      ['Certificates Issued', stats.totalCertificates],
      ['Total Assessments', stats.totalAssessments],
      ['Total Attempts', stats.totalAttempts],
      ['Passed Attempts', stats.passedAttempts],
      ['Pass Rate', `${passRate}%`],
      [],
      ['Trainer', 'Programs', 'Trainees', 'Pass Rate'],
      ...trainerMetrics.map(t => [t.name, t.programs, t.trainees, `${t.passRate}%`]),
      [],
      ['Program', 'Enrolled', 'Approved'],
      ...programEnrollments.map(p => [p.name, p.enrolled, p.approved]),
    ];
    const csv = rows.map(r => (r as (string | number)[]).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const passRate = stats.totalAttempts > 0 ? Math.round((stats.passedAttempts / stats.totalAttempts) * 100) : 0;
  const approvalRate = stats.totalEnrollments > 0 ? Math.round((stats.approvedEnrollments / stats.totalEnrollments) * 100) : 0;

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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reports & Analytics</h1>
            <p className="text-muted-foreground">Overview of training program performance and engagement</p>
          </div>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
        </div>

        {/* Date Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Date Range</span>
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
                </div>
                <Button size="sm" onClick={handleFilter}>Apply</Button>
                {(dateFrom || dateTo) && (
                  <Button size="sm" variant="ghost" onClick={handleClearFilter}>Clear</Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Trainees', value: stats.totalTrainees, icon: Users, colorClass: 'text-primary bg-primary/10' },
            { label: 'Active Programs', value: stats.activePrograms, icon: BookOpen, colorClass: 'text-blue-500 bg-blue-500/10' },
            { label: 'Certificates Issued', value: stats.totalCertificates, icon: Award, colorClass: 'text-green-500 bg-green-500/10' },
            { label: 'Pass Rate', value: `${passRate}%`, icon: TrendingUp, colorClass: 'text-yellow-600 bg-yellow-500/10' },
          ].map(({ label, value, icon: Icon, colorClass }) => (
            <Card key={label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${colorClass}`}><Icon className="h-5 w-5" /></div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Trainers', value: stats.totalTrainers },
            { label: 'Total Programs', value: stats.totalPrograms },
            { label: 'Total Enrollments', value: stats.totalEnrollments },
            { label: 'Enrollment Approval', value: `${approvalRate}%` },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="pt-6">
                <p className="text-xl font-semibold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enrollments by Program</CardTitle>
              <CardDescription>Total vs approved enrollments per program</CardDescription>
            </CardHeader>
            <CardContent>
              {programEnrollments.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No enrollment data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={programEnrollments} margin={{ top: 5, right: 10, left: -20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="enrolled" fill={COLORS[0]} name="Enrolled" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="approved" fill={COLORS[1]} name="Approved" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enrollment Status Breakdown</CardTitle>
              <CardDescription>Distribution of enrollment statuses</CardDescription>
            </CardHeader>
            <CardContent>
              {enrollmentStatusData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No enrollment data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={enrollmentStatusData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {enrollmentStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Assessment & Trainer Metrics */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assessment Results</CardTitle>
              <CardDescription>Pass vs fail across all assessment attempts</CardDescription>
            </CardHeader>
            <CardContent>
              {assessmentData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No assessment attempts yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={assessmentData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      <Cell fill={COLORS[1]} /><Cell fill={COLORS[3]} />
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Per-Trainer Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trainer Performance</CardTitle>
              <CardDescription>Programs, trainees, and pass rates per trainer</CardDescription>
            </CardHeader>
            <CardContent>
              {trainerMetrics.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No trainer data yet</div>
              ) : (
                <div className="space-y-3 max-h-[240px] overflow-y-auto">
                  {trainerMetrics.map(t => (
                    <div key={t.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.programs} program{t.programs !== 1 ? 's' : ''} · {t.trainees} trainee{t.trainees !== 1 ? 's' : ''}</p>
                      </div>
                      <Badge variant={t.passRate >= 70 ? 'default' : 'secondary'} className="text-xs">
                        {t.passRate}% pass
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
