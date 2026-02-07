import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  GraduationCap, 
  Users, 
  BookOpen, 
  Calendar, 
  BarChart3, 
  Settings,
  LogOut,
  User,
  Loader2
} from 'lucide-react';

export default function Dashboard() {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const getRoleLabel = () => {
    switch (role) {
      case 'admin':
        return 'Administrator';
      case 'trainer':
        return 'Trainer';
      case 'trainee':
        return 'Trainee';
      default:
        return 'User';
    }
  };

  const getRoleBadgeClass = () => {
    switch (role) {
      case 'admin':
        return 'bg-destructive/10 text-destructive';
      case 'trainer':
        return 'bg-accent/20 text-accent-foreground';
      case 'trainee':
        return 'bg-primary/10 text-primary';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Quick stats based on role
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
    } else {
      return [
        { label: 'Enrolled Programs', value: '—', icon: BookOpen },
        { label: 'Upcoming Sessions', value: '—', icon: Calendar },
        { label: 'Completed', value: '—', icon: GraduationCap },
        { label: 'Certificates', value: '—', icon: BarChart3 },
      ];
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-primary">M'archiTech</h1>
              <p className="text-xs text-muted-foreground">Training Management</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{user.email}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${getRoleBadgeClass()}`}>
                {getRoleLabel()}
              </span>
            </div>
            <Button variant="outline" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">
            Welcome back{user.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}!
          </h2>
          <p className="text-muted-foreground">
            Here's an overview of your {role === 'admin' ? 'system' : role === 'trainer' ? 'trainings' : 'learning journey'}.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {getQuickStats().map((stat, index) => (
            <Card key={index}>
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

        {/* Quick Actions */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {role === 'admin' && (
              <>
                <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Manage Users
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>Add, edit, or remove users and assign roles.</CardDescription>
                  </CardContent>
                </Card>
                <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />
                      Training Programs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>Create and manage training programs.</CardDescription>
                  </CardContent>
                </Card>
                <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      View Reports
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>Analyze training metrics and generate reports.</CardDescription>
                  </CardContent>
                </Card>
              </>
            )}

            {role === 'trainer' && (
              <>
                <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />
                      My Trainings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>View and manage your assigned trainings.</CardDescription>
                  </CardContent>
                </Card>
                <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      Schedule Session
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>Create new training sessions for your programs.</CardDescription>
                  </CardContent>
                </Card>
                <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Mark Attendance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>Record attendance for your training sessions.</CardDescription>
                  </CardContent>
                </Card>
              </>
            )}

            {role === 'trainee' && (
              <>
                <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />
                      Browse Trainings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>Explore and enroll in available training programs.</CardDescription>
                  </CardContent>
                </Card>
                <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      My Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>View your upcoming training sessions.</CardDescription>
                  </CardContent>
                </Card>
                <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-primary" />
                      My Certificates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>View and download your earned certificates.</CardDescription>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Common action for all roles */}
            <Card className="hover:border-primary/50 cursor-pointer transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  My Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>Update your personal information and settings.</CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Placeholder for recent activity */}
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
      </main>
    </div>
  );
}
