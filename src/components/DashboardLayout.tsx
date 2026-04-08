import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import NotificationBell from '@/components/NotificationBell';
import {
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageSquare,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const mainNav: NavItem[] = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  ];

  const roleNav: NavItem[] = [];
  if (role === 'admin') {
    roleNav.push(
      { title: 'User Management', url: '/users', icon: Users },
      { title: 'Training Programs', url: '/trainings', icon: BookOpen },
      { title: 'Schedule', url: '/schedule', icon: Calendar },
      { title: 'Resources', url: '/resources', icon: FileText },
      { title: 'Assessments', url: '/assessments', icon: ClipboardCheck },
      { title: 'Certificates', url: '/certificates', icon: Award },
      { title: 'Reports', url: '/reports', icon: BarChart3 },
      { title: 'Feedback', url: '/feedback', icon: MessageSquare },
    );
  } else if (role === 'trainer') {
    roleNav.push(
      { title: 'My Trainings', url: '/trainings', icon: BookOpen },
      { title: 'Sessions', url: '/sessions', icon: Calendar },
      { title: 'Attendance', url: '/attendance', icon: ClipboardList },
      { title: 'Resources', url: '/resources', icon: FileText },
      { title: 'Assessments', url: '/assessments', icon: ClipboardCheck },
      { title: 'Certificates', url: '/certificates', icon: Award },
      { title: 'Feedback', url: '/feedback', icon: MessageSquare },
    );
  } else {
    roleNav.push(
      { title: 'Browse Trainings', url: '/trainings', icon: BookOpen },
      { title: 'My Schedule', url: '/schedule', icon: Calendar },
      { title: 'Resources', url: '/resources', icon: FileText },
      { title: 'Assessments', url: '/assessments', icon: ClipboardCheck },
      { title: 'My Progress', url: '/progress', icon: TrendingUp },
      { title: 'Feedback', url: '/feedback', icon: MessageSquare },
      { title: 'Certificates', url: '/certificates', icon: Award },
    );
  }

  const accountNav: NavItem[] = [
    { title: 'My Profile', url: '/profile', icon: User },
  ];

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

  const displayName = user.user_metadata?.full_name || user.full_name || user.email || 'User';

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar>
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
                <GraduationCap className="h-5 w-5 text-sidebar-primary-foreground" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-sidebar-foreground">M'archiTech</h1>
                <p className="text-xs text-sidebar-foreground/60">Training Management</p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainNav.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        isActive={location.pathname === item.url}
                        onClick={() => navigate(item.url)}
                        tooltip={item.title}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>{getRoleLabel()} Tools</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {roleNav.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        isActive={location.pathname === item.url}
                        onClick={() => navigate(item.url)}
                        tooltip={item.title}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Account</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {accountNav.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        isActive={location.pathname === item.url}
                        onClick={() => navigate(item.url)}
                        tooltip={item.title}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent">
                <User className="h-4 w-4 text-sidebar-accent-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {displayName}
                </p>
                <p className="truncate text-xs text-sidebar-foreground/60">{getRoleLabel()}</p>
              </div>
            </div>
            <SidebarMenuButton onClick={() => void handleSignOut()} tooltip="Sign Out">
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <h2 className="flex-1 text-sm font-semibold text-foreground">
              {[...mainNav, ...roleNav, ...accountNav].find((item) => item.url === location.pathname)?.title || 'Dashboard'}
            </h2>
            <NotificationBell />
          </header>
          <main className="flex-1 p-6">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
