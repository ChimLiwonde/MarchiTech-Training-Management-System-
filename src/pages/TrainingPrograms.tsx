import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import {
  BookOpen,
  Plus,
  Users,
  Calendar,
  Loader2,
  Search,
  UserPlus,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface TrainingProgram {
  id: string;
  title: string;
  description: string | null;
  trainer_id: string;
  start_date: string | null;
  end_date: string | null;
  max_trainees: number | null;
  status: string;
  created_at: string;
}

interface Enrollment {
  id: string;
  program_id: string;
  trainee_id: string;
  status: string;
  enrolled_at: string;
}

function TrainingProgramsContent() {
  const { user, role } = useAuth();
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [enrollmentsDialogOpen, setEnrollmentsDialogOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<TrainingProgram | null>(null);
  const [programEnrollments, setProgramEnrollments] = useState<(Enrollment & { profile?: { full_name: string | null; email: string } })[]>([]);

  // Create form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [maxTrainees, setMaxTrainees] = useState('30');
  const [status, setStatus] = useState('draft');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPrograms();
    if (role === 'trainee') {
      fetchMyEnrollments();
    }
  }, [role]);

  const fetchPrograms = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('training_programs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error fetching programs', description: error.message, variant: 'destructive' });
    } else {
      setPrograms(data || []);
    }
    setLoading(false);
  };

  const fetchMyEnrollments = async () => {
    const { data } = await supabase
      .from('enrollments')
      .select('*')
      .eq('trainee_id', user?.id || '');
    setEnrollments(data || []);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('training_programs').insert({
      title: title.trim(),
      description: description.trim() || null,
      trainer_id: user!.id,
      start_date: startDate || null,
      end_date: endDate || null,
      max_trainees: parseInt(maxTrainees) || 30,
      status,
    });

    if (error) {
      toast({ title: 'Error creating program', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Program created successfully' });
      setCreateOpen(false);
      resetForm();
      fetchPrograms();
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setMaxTrainees('30');
    setStatus('draft');
  };

  const handleEnroll = async (programId: string) => {
    const { error } = await supabase.from('enrollments').insert({
      program_id: programId,
      trainee_id: user!.id,
      status: 'pending',
    });

    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Already enrolled', description: 'You are already enrolled in this program.', variant: 'destructive' });
      } else {
        toast({ title: 'Error enrolling', description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: 'Enrollment submitted', description: 'Your enrollment request is pending approval.' });
      fetchMyEnrollments();
    }
  };

  const handleUpdateStatus = async (programId: string, newStatus: string) => {
    const { error } = await supabase
      .from('training_programs')
      .update({ status: newStatus })
      .eq('id', programId);

    if (error) {
      toast({ title: 'Error updating status', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Status updated' });
      fetchPrograms();
    }
  };

  const viewEnrollments = async (program: TrainingProgram) => {
    setSelectedProgram(program);
    setEnrollmentsDialogOpen(true);

    const { data } = await supabase
      .from('enrollments')
      .select('*')
      .eq('program_id', program.id);

    if (data && data.length > 0) {
      const traineeIds = data.map(e => e.trainee_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', traineeIds);

      const enriched = data.map(e => ({
        ...e,
        profile: profiles?.find(p => p.user_id === e.trainee_id),
      }));
      setProgramEnrollments(enriched);
    } else {
      setProgramEnrollments([]);
    }
  };

  const handleEnrollmentAction = async (enrollmentId: string, newStatus: string) => {
    const { error } = await supabase
      .from('enrollments')
      .update({ status: newStatus })
      .eq('id', enrollmentId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Enrollment ${newStatus}` });
      if (selectedProgram) viewEnrollments(selectedProgram);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': case 'approved': return 'default';
      case 'completed': return 'secondary';
      case 'draft': case 'pending': return 'outline';
      case 'cancelled': case 'rejected': case 'withdrawn': return 'destructive';
      default: return 'outline';
    }
  };

  const filtered = programs.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const isEnrolled = (programId: string) => enrollments.some(e => e.program_id === programId);

  const canCreateProgram = role === 'admin' || role === 'trainer';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {role === 'trainee' ? 'Browse Trainings' : role === 'trainer' ? 'My Trainings' : 'Training Programs'}
          </h2>
          <p className="text-muted-foreground">
            {role === 'trainee'
              ? 'Discover and enroll in available training programs.'
              : 'Manage your training programs and enrollments.'}
          </p>
        </div>
        {canCreateProgram && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Program
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Training Program</DialogTitle>
                <DialogDescription>Set up a new training program for trainees to enroll in.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Program title" />
                </div>
                <div>
                  <Label htmlFor="desc">Description</Label>
                  <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this program covers..." rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start">Start Date</Label>
                    <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="end">End Date</Label>
                    <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="max">Max Trainees</Label>
                    <Input id="max" type="number" value={maxTrainees} onChange={(e) => setMaxTrainees(e.target.value)} />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Program
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search programs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No training programs found.</p>
            {canCreateProgram && <p className="text-sm text-muted-foreground mt-1">Create your first program to get started.</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((program) => (
            <Card key={program.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg leading-tight">{program.title}</CardTitle>
                  <Badge variant={getStatusBadgeVariant(program.status)} className="capitalize ml-2 shrink-0">
                    {program.status}
                  </Badge>
                </div>
                {program.description && (
                  <CardDescription className="line-clamp-2">{program.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-2 text-sm text-muted-foreground">
                  {(program.start_date || program.end_date) && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {program.start_date && new Date(program.start_date).toLocaleDateString()}
                        {program.start_date && program.end_date && ' — '}
                        {program.end_date && new Date(program.end_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>Max {program.max_trainees} trainees</span>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {/* Role-specific actions */}
                  {role === 'trainee' && program.status === 'active' && !isEnrolled(program.id) && (
                    <Button size="sm" onClick={() => handleEnroll(program.id)}>
                      <UserPlus className="h-4 w-4 mr-1" />
                      Enroll
                    </Button>
                  )}
                  {role === 'trainee' && isEnrolled(program.id) && (
                    <Badge variant="secondary">Enrolled</Badge>
                  )}

                  {(role === 'admin' || (role === 'trainer' && program.trainer_id === user?.id)) && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => viewEnrollments(program)}>
                        <Users className="h-4 w-4 mr-1" />
                        Enrollments
                      </Button>
                      {program.status === 'draft' && (
                        <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(program.id, 'active')}>
                          Activate
                        </Button>
                      )}
                      {program.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(program.id, 'completed')}>
                          Complete
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Enrollments Dialog */}
      <Dialog open={enrollmentsDialogOpen} onOpenChange={setEnrollmentsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enrollments — {selectedProgram?.title}</DialogTitle>
            <DialogDescription>Manage trainee enrollments for this program.</DialogDescription>
          </DialogHeader>
          {programEnrollments.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No enrollments yet.</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {programEnrollments.map((enrollment) => (
                <div key={enrollment.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">{enrollment.profile?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{enrollment.profile?.email}</p>
                    <Badge variant={getStatusBadgeVariant(enrollment.status)} className="capitalize mt-1 text-xs">
                      {enrollment.status}
                    </Badge>
                  </div>
                  {enrollment.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost" className="text-primary" onClick={() => handleEnrollmentAction(enrollment.id, 'approved')}>
                        <CheckCircle className="h-5 w-5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleEnrollmentAction(enrollment.id, 'rejected')}>
                        <XCircle className="h-5 w-5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TrainingPrograms() {
  return (
    <DashboardLayout>
      <TrainingProgramsContent />
    </DashboardLayout>
  );
}
