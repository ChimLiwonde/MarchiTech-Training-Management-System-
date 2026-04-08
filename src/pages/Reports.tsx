import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isXamppMode } from '@/lib/appConfig';
import { xamppApiRequest } from '@/lib/xamppApi';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  Filter,
  Loader2,
  TrendingUp,
  Users,
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

const COLORS = [
  'hsl(221, 83%, 53%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(271, 81%, 56%)',
];

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

interface ProgramEnrollment {
  name: string;
  enrolled: number;
  approved: number;
}

interface TrainerMetric {
  name: string;
  programs: number;
  trainees: number;
  passRate: number;
}

interface ProgramFinancial {
  name: string;
  revenue: number;
  cost: number;
  profit: number;
}

interface ReportsResponse {
  stats: Stats;
  programEnrollments: ProgramEnrollment[];
  enrollmentStatusData: { name: string; value: number }[];
  assessmentData: { name: string; value: number }[];
  trainerMetrics: TrainerMetric[];
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  programFinancials: ProgramFinancial[];
}

const formatMWK = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value || 0));

export default function Reports() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState<Stats>({
    totalTrainees: 0,
    totalTrainers: 0,
    totalPrograms: 0,
    activePrograms: 0,
    totalEnrollments: 0,
    approvedEnrollments: 0,
    totalCertificates: 0,
    totalAssessments: 0,
    totalAttempts: 0,
    passedAttempts: 0,
  });
  const [programEnrollments, setProgramEnrollments] = useState<ProgramEnrollment[]>([]);
  const [enrollmentStatusData, setEnrollmentStatusData] = useState<{ name: string; value: number }[]>([]);
  const [assessmentData, setAssessmentData] = useState<{ name: string; value: number }[]>([]);
  const [trainerMetrics, setTrainerMetrics] = useState<TrainerMetric[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [programFinancials, setProgramFinancials] = useState<ProgramFinancial[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (role === 'admin') {
      void fetchReports();
    } else {
      setLoading(false);
    }
  }, [role]);

  const fetchReports = async (from?: string, to?: string) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (isXamppMode) {
        const query = new URLSearchParams();
        if (from) {
          query.set('from', from);
        }
        if (to) {
          query.set('to', to);
        }

        const suffix = query.toString() ? `?${query.toString()}` : '';
        const response = await xamppApiRequest<ReportsResponse>(`/reports${suffix}`);
        setStats(response.stats);
        setProgramEnrollments(response.programEnrollments ?? []);
        setEnrollmentStatusData(response.enrollmentStatusData ?? []);
        setAssessmentData(response.assessmentData ?? []);
        setTrainerMetrics(response.trainerMetrics ?? []);
        setTotalRevenue(response.totalRevenue ?? 0);
        setTotalCost(response.totalCost ?? 0);
        setTotalProfit(response.totalProfit ?? 0);
        setProgramFinancials(response.programFinancials ?? []);
        return;
      }

      const [rolesRes, programsRes, enrollmentsRes, certsRes, assessmentsRes, attemptsRes, profilesRes, paymentsRes] =
        await Promise.all([
          supabase.from('user_roles').select('role, user_id'),
          supabase.from('training_programs').select('id, title, status, trainer_id, cost_amount'),
          supabase.from('enrollments').select('program_id, status, enrolled_at'),
          supabase.from('certificates').select('id, issued_at'),
          supabase.from('assessments').select('id, program_id'),
          supabase.from('assessment_attempts').select('id, passed, assessment_id, completed_at'),
          supabase.from('profiles').select('user_id, full_name, email'),
          supabase.from('payments').select('program_id, amount, status, created_at'),
        ]);

      const possibleError = [
        rolesRes.error,
        programsRes.error,
        enrollmentsRes.error,
        certsRes.error,
        assessmentsRes.error,
        attemptsRes.error,
        profilesRes.error,
        paymentsRes.error,
      ].find(Boolean);

      if (possibleError) {
        throw possibleError;
      }

      let enrollments = enrollmentsRes.data || [];
      let certs = certsRes.data || [];
      let attempts = attemptsRes.data || [];
      let payments = paymentsRes.data || [];

      if (from) {
        enrollments = enrollments.filter((item) => item.enrolled_at >= from);
        certs = certs.filter((item) => item.issued_at >= from);
        attempts = attempts.filter((item) => !item.completed_at || item.completed_at >= from);
        payments = payments.filter((item) => item.created_at >= from);
      }

      if (to) {
        const toEnd = `${to}T23:59:59`;
        enrollments = enrollments.filter((item) => item.enrolled_at <= toEnd);
        certs = certs.filter((item) => item.issued_at <= toEnd);
        attempts = attempts.filter((item) => !item.completed_at || item.completed_at <= toEnd);
        payments = payments.filter((item) => item.created_at <= toEnd);
      }

      const roles = rolesRes.data || [];
      const programs = programsRes.data || [];
      const profiles = profilesRes.data || [];
      const assessments = assessmentsRes.data || [];

      const nextStats: Stats = {
        totalTrainees: roles.filter((item) => item.role === 'trainee').length,
        totalTrainers: roles.filter((item) => item.role === 'trainer').length,
        totalPrograms: programs.length,
        activePrograms: programs.filter((item) => item.status === 'active').length,
        totalEnrollments: enrollments.length,
        approvedEnrollments: enrollments.filter((item) => item.status === 'approved').length,
        totalCertificates: certs.length,
        totalAssessments: assessments.length,
        totalAttempts: attempts.length,
        passedAttempts: attempts.filter((item) => item.passed).length,
      };
      setStats(nextStats);

      const revenue = payments
        .filter((item) => item.status === 'successful')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      setTotalRevenue(revenue);

      const successfulProgramIds = new Set(
        payments
          .filter((item) => item.status === 'successful' && !!item.program_id)
          .map((item) => item.program_id as string)
      );

      const cost = programs
        .filter((item) => successfulProgramIds.has(item.id))
        .reduce((sum, item) => sum + Number(item.cost_amount || 0), 0);
      setTotalCost(cost);
      setTotalProfit(revenue - cost);

      const revenueByProgram: Record<string, number> = {};
      payments
        .filter((item) => item.status === 'successful')
        .forEach((item) => {
          if (!item.program_id) {
            return;
          }

          revenueByProgram[item.program_id] = (revenueByProgram[item.program_id] || 0) + Number(item.amount || 0);
        });

      const financials: ProgramFinancial[] = programs
        .filter((item) => (revenueByProgram[item.id] || 0) > 0)
        .map((item) => {
          const programRevenue = revenueByProgram[item.id] || 0;
          const programCost = Number(item.cost_amount || 0);
          return {
            name: item.title.length > 20 ? `${item.title.slice(0, 20)}...` : item.title,
            revenue: programRevenue,
            cost: programCost,
            profit: programRevenue - programCost,
          };
        })
        .sort((left, right) => right.profit - left.profit)
        .slice(0, 8);
      setProgramFinancials(financials);

      const programMap: Record<string, { title: string; enrolled: number; approved: number }> = {};
      programs.forEach((program) => {
        programMap[program.id] = { title: program.title, enrolled: 0, approved: 0 };
      });
      enrollments.forEach((item) => {
        if (!programMap[item.program_id]) {
          return;
        }

        programMap[item.program_id].enrolled += 1;
        if (item.status === 'approved') {
          programMap[item.program_id].approved += 1;
        }
      });
      setProgramEnrollments(
        Object.values(programMap)
          .filter((item) => item.enrolled > 0)
          .map((item) => ({
            name: item.title.length > 20 ? `${item.title.slice(0, 20)}...` : item.title,
            enrolled: item.enrolled,
            approved: item.approved,
          }))
          .slice(0, 8)
      );

      const statusCounts: Record<string, number> = {};
      enrollments.forEach((item) => {
        statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
      });
      setEnrollmentStatusData(
        Object.entries(statusCounts).map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value,
        }))
      );

      const passed = attempts.filter((item) => item.passed).length;
      const failed = attempts.filter((item) => item.passed === false).length;
      setAssessmentData(
        passed + failed > 0
          ? [{ name: 'Passed', value: passed }, { name: 'Failed', value: failed }]
          : []
      );

      const trainerIds = [...new Set(programs.map((program) => program.trainer_id))];
      const metrics: TrainerMetric[] = trainerIds.map((trainerId) => {
        const profile = profiles.find((item) => item.user_id === trainerId);
        const trainerPrograms = programs.filter((item) => item.trainer_id === trainerId);
        const programIds = trainerPrograms.map((item) => item.id);
        const trainerEnrollments = enrollments.filter((item) => programIds.includes(item.program_id) && item.status === 'approved').length;
        const assessmentIds = assessments.filter((item) => programIds.includes(item.program_id)).map((item) => item.id);
        const trainerAttempts = attempts.filter((item) => assessmentIds.includes(item.assessment_id));
        const trainerPassed = trainerAttempts.filter((item) => item.passed).length;
        const passRate = trainerAttempts.length > 0
          ? Math.round((trainerPassed / trainerAttempts.length) * 100)
          : 0;

        return {
          name: profile?.full_name || profile?.email || 'Unknown',
          programs: trainerPrograms.length,
          trainees: trainerEnrollments,
          passRate,
        };
      });
      setTrainerMetrics(metrics);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    void fetchReports(dateFrom, dateTo);
  };

  const handleClearFilter = () => {
    setDateFrom('');
    setDateTo('');
    void fetchReports();
  };

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
      ['Total Revenue (MWK)', formatMWK(totalRevenue)],
      ['Total Cost (MWK)', formatMWK(totalCost)],
      ['Total Profit (MWK)', formatMWK(totalProfit)],
      [],
      ['Trainer', 'Programs', 'Trainees', 'Pass Rate'],
      ...trainerMetrics.map((trainer) => [trainer.name, trainer.programs, trainer.trainees, `${trainer.passRate}%`]),
      [],
      ['Program', 'Enrolled', 'Approved'],
      ...programEnrollments.map((program) => [program.name, program.enrolled, program.approved]),
      [],
      ['Program', 'Revenue', 'Cost', 'Profit'],
      ...programFinancials.map((program) => [program.name, formatMWK(program.revenue), formatMWK(program.cost), formatMWK(program.profit)]),
    ];

    const csv = rows.map((row) => (row as (string | number)[]).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const passRate = stats.totalAttempts > 0 ? Math.round((stats.passedAttempts / stats.totalAttempts) * 100) : 0;
  const approvalRate = stats.totalEnrollments > 0 ? Math.round((stats.approvedEnrollments / stats.totalEnrollments) * 100) : 0;

  if (role !== 'admin') {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>This area is available to administrators only.</CardDescription>
          </CardHeader>
        </Card>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (errorMessage) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void fetchReports(dateFrom || undefined, dateTo || undefined)}>Try Again</Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reports & Analytics</h1>
            <p className="text-muted-foreground">Overview of training program performance and engagement</p>
          </div>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />Export CSV
          </Button>
        </div>

        <Card>
          <CardContent className="pb-4 pt-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Date Range</span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-40" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-40" />
                </div>
                <Button size="sm" onClick={handleFilter}>Apply</Button>
                {(dateFrom || dateTo) && (
                  <Button size="sm" variant="ghost" onClick={handleClearFilter}>Clear</Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          {[
            { label: 'Total Trainees', value: stats.totalTrainees, icon: Users, colorClass: 'text-primary bg-primary/10' },
            { label: 'Active Programs', value: stats.activePrograms, icon: BookOpen, colorClass: 'text-blue-500 bg-blue-500/10' },
            { label: 'Certificates Issued', value: stats.totalCertificates, icon: Award, colorClass: 'text-green-500 bg-green-500/10' },
            { label: 'Pass Rate', value: `${passRate}%`, icon: TrendingUp, colorClass: 'text-yellow-600 bg-yellow-500/10' },
            { label: 'Total Revenue (MWK)', value: formatMWK(totalRevenue), icon: ClipboardList, colorClass: 'text-emerald-600 bg-emerald-500/10' },
            { label: 'Total Profit (MWK)', value: formatMWK(totalProfit), icon: CheckCircle2, colorClass: 'text-indigo-600 bg-indigo-500/10' },
          ].map(({ label, value, icon: Icon, colorClass }) => (
            <Card key={label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${colorClass}`}><Icon className="h-5 w-5" /></div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: 'Total Trainers', value: stats.totalTrainers },
            { label: 'Total Programs', value: stats.totalPrograms },
            { label: 'Total Enrollments', value: stats.totalEnrollments },
            { label: 'Enrollment Approval', value: `${approvalRate}%` },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="pt-6">
                <p className="text-xl font-semibold text-foreground">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enrollments by Program</CardTitle>
              <CardDescription>Total vs approved enrollments per program</CardDescription>
            </CardHeader>
            <CardContent>
              {programEnrollments.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No enrollment data yet</div>
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
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No enrollment data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={enrollmentStatusData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {enrollmentStatusData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profit by Program</CardTitle>
              <CardDescription>Revenue minus configured program cost</CardDescription>
            </CardHeader>
            <CardContent>
              {programFinancials.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No financial data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={programFinancials} margin={{ top: 5, right: 10, left: -20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="revenue" fill={COLORS[1]} name="Revenue" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cost" fill={COLORS[3]} name="Cost" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" fill={COLORS[0]} name="Profit" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assessment Results</CardTitle>
              <CardDescription>Pass vs fail across all assessment attempts</CardDescription>
            </CardHeader>
            <CardContent>
              {assessmentData.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No assessment attempts yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={assessmentData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      <Cell fill={COLORS[1]} />
                      <Cell fill={COLORS[3]} />
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trainer Performance</CardTitle>
              <CardDescription>Programs, trainees, and pass rates per trainer</CardDescription>
            </CardHeader>
            <CardContent>
              {trainerMetrics.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No trainer data yet</div>
              ) : (
                <div className="max-h-[240px] space-y-3 overflow-y-auto">
                  {trainerMetrics.map((trainer) => (
                    <div key={trainer.name} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">{trainer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {trainer.programs} program{trainer.programs !== 1 ? 's' : ''} - {trainer.trainees} trainee{trainer.trainees !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <Badge variant={trainer.passRate >= 70 ? 'default' : 'secondary'} className="text-xs">
                        {trainer.passRate}% pass
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
