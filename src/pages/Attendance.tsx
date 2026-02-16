import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { ClipboardList, Loader2, Calendar, CheckCircle, UserCheck } from 'lucide-react';

interface SessionWithProgram {
  id: string;
  program_id: string;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  program_title?: string;
}

interface AttendanceRecord {
  id: string;
  session_id: string;
  trainee_id: string;
  status: string;
  checked_in_at: string | null;
  trainee_name?: string;
  trainee_email?: string;
}

function AttendanceContent() {
  const { user, role } = useAuth();
  const [sessions, setSessions] = useState<SessionWithProgram[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, [role]);

  const fetchSessions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('session_date', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const programIds = [...new Set((data || []).map(s => s.program_id))];
    let titleMap: Record<string, string> = {};
    if (programIds.length > 0) {
      const { data: progs } = await supabase
        .from('training_programs')
        .select('id, title')
        .in('id', programIds);
      if (progs) titleMap = Object.fromEntries(progs.map(p => [p.id, p.title]));
    }

    setSessions((data || []).map(s => ({ ...s, program_title: titleMap[s.program_id] || 'Unknown' })));
    setLoading(false);
  };

  const fetchAttendance = async (sessionId: string) => {
    setLoadingAttendance(true);
    setSelectedSessionId(sessionId);

    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('session_id', sessionId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoadingAttendance(false);
      return;
    }

    // Enrich with trainee names
    const traineeIds = (data || []).map(a => a.trainee_id);
    let profileMap: Record<string, { full_name: string | null; email: string }> = {};
    if (traineeIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', traineeIds);
      if (profiles) {
        profileMap = Object.fromEntries(profiles.map(p => [p.user_id, { full_name: p.full_name, email: p.email }]));
      }
    }

    setAttendance((data || []).map(a => ({
      ...a,
      trainee_name: profileMap[a.trainee_id]?.full_name || null,
      trainee_email: profileMap[a.trainee_id]?.email || '',
    })));
    setLoadingAttendance(false);
  };

  // Trainer: initialize attendance for all approved enrollees of a session's program
  const initializeAttendance = async () => {
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('trainee_id')
      .eq('program_id', session.program_id)
      .eq('status', 'approved');

    if (!enrollments || enrollments.length === 0) {
      toast({ title: 'No approved trainees', description: 'No trainees are enrolled in this program.', variant: 'destructive' });
      return;
    }

    const rows = enrollments.map(e => ({
      session_id: selectedSessionId,
      trainee_id: e.trainee_id,
      status: 'absent',
    }));

    const { error } = await supabase.from('attendance').insert(rows);
    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Attendance already initialized', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: 'Attendance initialized' });
      fetchAttendance(selectedSessionId);
    }
  };

  // Trainer: update a trainee's status
  const updateStatus = async (attendanceId: string, newStatus: string) => {
    const { error } = await supabase
      .from('attendance')
      .update({ status: newStatus })
      .eq('id', attendanceId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setAttendance(prev => prev.map(a => a.id === attendanceId ? { ...a, status: newStatus } : a));
    }
  };

  // Trainee: self check-in
  const selfCheckIn = async (attendanceId: string) => {
    const { error } = await supabase
      .from('attendance')
      .update({ status: 'present', checked_in_at: new Date().toISOString() })
      .eq('id', attendanceId);

    if (error) {
      toast({ title: 'Error checking in', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Checked in!' });
      fetchAttendance(selectedSessionId);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'default';
      case 'late': return 'secondary';
      case 'excused': return 'outline';
      case 'absent': return 'destructive';
      default: return 'outline';
    }
  };

  const isTrainerOrAdmin = role === 'admin' || role === 'trainer';

  // For trainees, filter only their own attendance
  const visibleAttendance = role === 'trainee'
    ? attendance.filter(a => a.trainee_id === user?.id)
    : attendance;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Attendance</h2>
        <p className="text-muted-foreground">
          {isTrainerOrAdmin ? 'Track and manage trainee attendance per session.' : 'View your attendance and check in to sessions.'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No sessions available.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Session selector */}
          <div className="max-w-md">
            <Label className="mb-2 block">Select Session</Label>
            <Select value={selectedSessionId} onValueChange={fetchAttendance}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a session..." />
              </SelectTrigger>
              <SelectContent>
                {sessions.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.program_title} — {new Date(s.session_date).toLocaleDateString()}
                    {s.start_time ? ` at ${s.start_time.slice(0, 5)}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSessionId && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Attendance Records
                  </div>
                </CardTitle>
                {isTrainerOrAdmin && (
                  <Button size="sm" variant="outline" onClick={initializeAttendance}>
                    <UserCheck className="h-4 w-4 mr-1" />
                    Initialize Roster
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {loadingAttendance ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : visibleAttendance.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {isTrainerOrAdmin
                      ? 'No attendance records yet. Click "Initialize Roster" to add enrolled trainees.'
                      : 'No attendance record for this session.'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {visibleAttendance.map(record => (
                      <div key={record.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <p className="font-medium text-sm">{record.trainee_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{record.trainee_email}</p>
                          {record.checked_in_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Checked in: {new Date(record.checked_in_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {isTrainerOrAdmin ? (
                            <Select value={record.status} onValueChange={(val) => updateStatus(record.id, val)}>
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="present">Present</SelectItem>
                                <SelectItem value="absent">Absent</SelectItem>
                                <SelectItem value="late">Late</SelectItem>
                                <SelectItem value="excused">Excused</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <>
                              <Badge variant={getStatusColor(record.status)} className="capitalize">
                                {record.status}
                              </Badge>
                              {record.status === 'absent' && (
                                <Button size="sm" onClick={() => selfCheckIn(record.id)}>
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Check In
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function Attendance() {
  return (
    <DashboardLayout>
      <AttendanceContent />
    </DashboardLayout>
  );
}
