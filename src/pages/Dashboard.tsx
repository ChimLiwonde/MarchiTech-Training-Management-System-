import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import DashboardLayout from '@/components/DashboardLayout';
import {
  GraduationCap,
  Users,
  BookOpen,
  Calendar,
  BarChart3,
  UserCheck,
  ClipboardList,
  Award,
} from 'lucide-react';

function DashboardContent() {
  const { user, role } = useAuth();

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
