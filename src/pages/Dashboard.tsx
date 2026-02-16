import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import DashboardLayout from '@/components/DashboardLayout';
import {
  GraduationCap,
  Users,
  BookOpen,
  Calendar,
  BarChart3,
  Award,
  Loader2,
} from 'lucide-react';

interface AttendanceStat {
  programTitle: string;
  totalRecords: number;
  presentCount: number;
  rate: number;
}

function DashboardContent() {
  const { user, role } = useAuth();
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (user && role) {
      fetchAttendanceStats();
    }
  }, [user, role]);

  const fetchAttendanceStats = async () => {
    setLoadingStats(true);
    try {
      // Get sessions visible to this user
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, program_id');

      if (!sessions || sessions.length === 0) {
        setAttendanceStats([]);
        setLoadingStats(false);
        return;
      }

      // Get program titles
      const programIds = [...new Set(sessions.map(s => s.program_id))];
      const { data: programs } = await supabase
        .from('training_programs')
        .select('id, title')
        .in('id', programIds);
      const titleMap: Record<string, string> = {};
      (programs || []).forEach(p => { titleMap[p.id] = p.title; });

      // Get attendance records
      const sessionIds = sessions.map(s => s.id);
      const { data: attendance } = await supabase
        .from('attendance')
        .select('session_id, status');

      if (!attendance || attendance.length === 0) {
        setAttendanceStats([]);
        setLoadingStats(false);
        return;
      }

      // Map session_id -> program_id
      const sessionProgramMap: Record<string, string> = {};
      sessions.forEach(s => { sessionProgramMap[s.id] = s.program_id; });

      // Aggregate per program
      const programAgg: Record<string, { total: number; present: number }> = {};
      attendance.forEach(a => {
        const progId = sessionProgramMap[a.session_id];
        if (!progId) return;
        if (!programAgg[progId]) programAgg[progId] = { total: 0, present: 0 };
        programAgg[progId].total++;
        if (a.status === 'present' || a.status === 'late') {
          programAgg[progId].present++;
        }
      });

      const stats: AttendanceStat[] = Object.entries(programAgg).map(([progId, agg]) => ({
        programTitle: titleMap[progId] || 'Unknown',
        totalRecords: agg.total,
        presentCount: agg.present,
        rate: agg.total > 0 ? Math.round((agg.present / agg.total) * 100) : 0,
      }));

      stats.sort((a, b) => b.rate - a.rate);
      setAttendanceStats(stats);
    } catch {
      // silently fail
    }
    setLoadingStats(false);
  };

  const getQuickStats = () => {
    if (role === 'admin') {
      return [
        { label: 'Total Users', value: '—', icon: Users },
        { label: 'Active Trainings', value: '—', icon: BookOpen },
        { label: 'Sessions Today', value: '—', icon: Calendar },
        { label: 'Completion Rate', value: '—', icon: BarChart3 },
      ];
    } else if (role === 'trainer') {
      return [
        { label: 'My Trainings', value: '—', icon: BookOpen },
        { label: 'Total Trainees', value: '—', icon: Users },
        { label: 'Upcoming Sessions', value: '—', icon: Calendar },
        { label: 'Avg. Attendance', value: '—', icon: BarChart3 },
      ];
    }
    return [
      { label: 'Enrolled Programs', value: '—', icon: BookOpen },
      { label: 'Upcoming Sessions', value: '—', icon: Calendar },
      { label: 'Completed', value: '—', icon: GraduationCap },
      { label: 'Certificates', value: '—', icon: Award },
    ];
  };

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

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {getQuickStats().map((stat, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <stat.icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
          {loadingStats ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : attendanceStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No attendance data yet.</p>
              <p className="text-sm">Attendance stats will appear once sessions have been tracked.</p>
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

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest actions and notifications will appear here.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No recent activity yet.</p>
            <p className="text-sm">Start by exploring the available features!</p>
          </div>
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
