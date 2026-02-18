import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Users, BookOpen, Award, CheckCircle2, TrendingUp, ClipboardList } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
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
interface AttendanceRate { program: string; rate: number; }

export default function Reports() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalTrainees: 0, totalTrainers: 0, totalPrograms: 0, activePrograms: 0,
    totalEnrollments: 0, approvedEnrollments: 0, totalCertificates: 0,
    totalAssessments: 0, totalAttempts: 0, passedAttempts: 0,
  });
  const [programEnrollments, setProgramEnrollments] = useState<ProgramEnrollment[]>([]);
  const [enrollmentStatusData, setEnrollmentStatusData] = useState<{ name: string; value: number }[]>([]);
  const [assessmentData, setAssessmentData] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => { fetchReports(); }, []);

  const fetchReports = async () => {
    setLoading(true);
    const [rolesRes, programsRes, enrollmentsRes, certsRes, assessmentsRes, attemptsRes, sessionsRes, attendanceRes] =
      await Promise.all([
        supabase.from('user_roles').select('role'),
        supabase.from('training_programs').select('id, title, status'),
        supabase.from('enrollments').select('program_id, status'),
        supabase.from('certificates').select('id'),
        supabase.from('assessments').select('id'),
        supabase.from('assessment_attempts').select('id, passed'),
        supabase.from('sessions').select('id, program_id'),
        supabase.from('attendance').select('id, status, session_id'),
      ]);

    const roles = rolesRes.data || [];
    const programs = programsRes.data || [];
    const enrollments = enrollmentsRes.data || [];
    const attempts = attemptsRes.data || [];

    const newStats: Stats = {
      totalTrainees: roles.filter(r => r.role === 'trainee').length,
      totalTrainers: roles.filter(r => r.role === 'trainer').length,
      totalPrograms: programs.length,
      activePrograms: programs.filter(p => p.status === 'active').length,
      totalEnrollments: enrollments.length,
      approvedEnrollments: enrollments.filter(e => e.status === 'approved').length,
      totalCertificates: (certsRes.data || []).length,
      totalAssessments: (assessmentsRes.data || []).length,
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
    const progEnrollData = Object.values(progMap)
      .filter(p => p.enrolled > 0)
      .map(p => ({ name: p.title.length > 20 ? p.title.slice(0, 20) + '…' : p.title, enrolled: p.enrolled, approved: p.approved }))
      .slice(0, 8);
    setProgramEnrollments(progEnrollData);

    // Enrollment status pie
    const statusCounts: Record<string, number> = {};
    enrollments.forEach(e => { statusCounts[e.status] = (statusCounts[e.status] || 0) + 1; });
    setEnrollmentStatusData(Object.entries(statusCounts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    })));

    // Assessment pass/fail pie
    const passed = attempts.filter(a => a.passed).length;
    const failed = attempts.filter(a => a.passed === false).length;
    if (passed + failed > 0) {
      setAssessmentData([
        { name: 'Passed', value: passed },
        { name: 'Failed', value: failed },
      ]);
    }

    setLoading(false);
  };

  const passRate = stats.totalAttempts > 0
    ? Math.round((stats.passedAttempts / stats.totalAttempts) * 100)
    : 0;
  const approvalRate = stats.totalEnrollments > 0
    ? Math.round((stats.approvedEnrollments / stats.totalEnrollments) * 100)
    : 0;

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
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports & Analytics</h1>
          <p className="text-muted-foreground">Overview of training program performance and engagement</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalTrainees}</p>
                  <p className="text-xs text-muted-foreground">Total Trainees</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <BookOpen className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.activePrograms}</p>
                  <p className="text-xs text-muted-foreground">Active Programs</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Award className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalCertificates}</p>
                  <p className="text-xs text-muted-foreground">Certificates Issued</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <TrendingUp className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{passRate}%</p>
                  <p className="text-xs text-muted-foreground">Assessment Pass Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Trainers', value: stats.totalTrainers, icon: Users, color: 'purple' },
            { label: 'Total Programs', value: stats.totalPrograms, icon: BookOpen, color: 'blue' },
            { label: 'Total Enrollments', value: stats.totalEnrollments, icon: ClipboardList, color: 'orange' },
            { label: 'Enrollment Approval', value: `${approvalRate}%`, icon: CheckCircle2, color: 'green' },
          ].map(({ label, value, icon: Icon, color }) => (
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
          {/* Program Enrollment Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enrollments by Program</CardTitle>
              <CardDescription>Total vs approved enrollments per program</CardDescription>
            </CardHeader>
            <CardContent>
              {programEnrollments.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No enrollment data yet
                </div>
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

          {/* Enrollment Status Pie */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enrollment Status Breakdown</CardTitle>
              <CardDescription>Distribution of enrollment statuses</CardDescription>
            </CardHeader>
            <CardContent>
              {enrollmentStatusData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No enrollment data yet
                </div>
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
                      {enrollmentStatusData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Assessment Chart */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assessment Results</CardTitle>
              <CardDescription>Pass vs fail across all assessment attempts</CardDescription>
            </CardHeader>
            <CardContent>
              {assessmentData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No assessment attempts yet
                </div>
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

          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">System Summary</CardTitle>
              <CardDescription>Key platform metrics at a glance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: 'Total Users', value: stats.totalTrainees + stats.totalTrainers },
                  { label: 'Training Programs', value: stats.totalPrograms },
                  { label: 'Total Assessments', value: stats.totalAssessments },
                  { label: 'Assessment Attempts', value: stats.totalAttempts },
                  { label: 'Certificates Issued', value: stats.totalCertificates },
                  { label: 'Overall Pass Rate', value: `${passRate}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-semibold text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
