import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  GraduationCap, 
  Users, 
  BookOpen, 
  Calendar, 
  BarChart3, 
  Award,
  CheckCircle,
  ArrowRight,
  Shield
} from 'lucide-react';

export default function Landing() {
  const features = [
    {
      icon: BookOpen,
      title: 'Training Programs',
      description: 'Create and manage comprehensive training programs with modules, resources, and assessments.',
    },
    {
      icon: Users,
      title: 'User Management',
      description: 'Manage trainers and trainees with role-based access control and profile management.',
    },
    {
      icon: Calendar,
      title: 'Session Scheduling',
      description: 'Schedule training sessions and track attendance with automated notifications.',
    },
    {
      icon: BarChart3,
      title: 'Progress Tracking',
      description: 'Monitor trainee progress, completion rates, and generate detailed reports.',
    },
    {
      icon: Award,
      title: 'Certifications',
      description: 'Issue certificates upon successful completion of training programs.',
    },
    {
      icon: Shield,
      title: 'Secure & Reliable',
      description: 'Enterprise-grade security with role-based access and data protection.',
    },
  ];

  const roles = [
    {
      title: 'Administrators',
      description: 'Full system control including user management, training creation, and analytics.',
      features: ['Manage all users', 'Create training programs', 'View analytics & reports', 'System configuration'],
    },
    {
      title: 'Trainers',
      description: 'Conduct trainings, manage sessions, and track trainee performance.',
      features: ['Manage assigned trainings', 'Schedule sessions', 'Mark attendance', 'Upload resources'],
    },
    {
      title: 'Trainees',
      description: 'Enroll in programs, attend sessions, and earn certifications.',
      features: ['Browse & enroll', 'Access resources', 'Take assessments', 'Download certificates'],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
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

          <div className="flex items-center gap-3">
            <Link to="/schedule">
              <Button variant="ghost" size="sm">
                Project Schedule
              </Button>
            </Link>
            <Link to="/auth">
              <Button>
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 md:py-32 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/20 text-accent-foreground mb-6">
            <Award className="w-4 h-4" />
            <span className="text-sm font-medium">Professional Training Platform</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold text-primary mb-6 max-w-4xl mx-auto leading-tight">
            Streamline Your Training Management
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            A comprehensive platform to manage training programs, track attendance, 
            assess progress, and issue certifications—all in one place.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="text-lg px-8">
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/schedule">
              <Button size="lg" variant="outline" className="text-lg px-8">
                View Demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
              Everything You Need
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A complete suite of tools to manage your training operations efficiently.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="border-2 hover:border-primary/30 transition-colors">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Roles Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
              Built for Everyone
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Role-based access ensures everyone has the tools they need.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {roles.map((role, index) => (
              <Card key={index} className="relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-accent" />
                <CardHeader>
                  <CardTitle className="text-xl">{role.title}</CardTitle>
                  <CardDescription className="text-base">
                    {role.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {role.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-accent flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Transform Your Training?
          </h2>
          <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
            Join organizations that trust M'archiTech for their training management needs.
          </p>
          <Link to="/auth">
            <Button size="lg" variant="secondary" className="text-lg px-8">
              Get Started Today
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-primary">M'archiTech</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 M'archiTech Training Management System. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
