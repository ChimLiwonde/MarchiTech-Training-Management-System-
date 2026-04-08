import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isXamppMode } from '@/lib/appConfig';
import { xamppApiRequest } from '@/lib/xamppApi';
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
  trainee_name?: string | null;
  trainee_email?: string;
}

interface SessionsResponse {
  data: SessionWithProgram[];
}

interface AttendanceResponse {
  data: AttendanceRecord[];
}

function AttendanceContent() {
  const { user, role } = useAuth();
  const [sessions, setSessions] = useState<SessionWithProgram[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  useEffect(() => {
    void fetchSessions();
  }, [role]);

  const fetchSessions = async () => {
    setLoading(true);

    try {
      if (isXamppMode) {
        const response = await xamppApiRequest<SessionsResponse>('/sessions');
        const sorted = [...(response.data ?? [])].sort((left, right) => right.session_date.localeCompare(left.session_date));
        setSessions(sorted);
        return;
      }

      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .order('session_date', { ascending: false });

      if (error) {
        throw error;
      }

      const programIds = [...new Set((data || []).map((session) => session.program_id))];
      let titleMap: Record<string, string> = {};
      if (programIds.length > 0) {
        const { data: progs } = await supabase
          .from('training_programs')
          .select('id, title')
          .in('id', programIds);
        if (progs) {
          titleMap = Object.fromEntries(progs.map((program) => [program.id, program.title]));
        }
      }

      setSessions((data || []).map((session) => ({
        ...session,
        program_title: titleMap[session.program_id] || 'Unknown',
      })));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch sessions';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendance = async (sessionId: string) => {
    setLoadingAttendance(true);
    setSelectedSessionId(sessionId);

    try {
      if (isXamppMode) {
        const response = await xamppApiRequest<AttendanceResponse>(`/sessions/${sessionId}/attendance`);
        setAttendance(response.data ?? []);
        return;
      }

      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('session_id', sessionId);

      if (error) {
        throw error;
      }

      const traineeIds = (data || []).map((record) => record.trainee_id);
      let profileMap: Record<string, { full_name: string | null; email: string }> = {};
      if (traineeIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', traineeIds);
        if (profiles) {
          profileMap = Object.fromEntries(profiles.map((profile) => [
            profile.user_id,
            { full_name: profile.full_name, email: profile.email },
          ]));
        }
      }

      setAttendance((data || []).map((record) => ({
        ...record,
        trainee_name: profileMap[record.trainee_id]?.full_name || null,
        trainee_email: profileMap[record.trainee_id]?.email || '',
      })));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch attendance';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoadingAttendance(false);
    }
  };

  const initializeAttendance = async () => {
    const session = sessions.find((item) => item.id === selectedSessionId);
    if (!session) {
      return;
    }

    try {
      if (isXamppMode) {
        const response = await xamppApiRequest<{ message: string }>(`/sessions/${selectedSessionId}/attendance/initialize`, {
          method: 'POST',
        });
        toast({ title: response.message });
        await fetchAttendance(selectedSessionId);
        return;
      }

      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('trainee_id')
        .eq('program_id', session.program_id)
        .eq('status', 'approved');

      if (!enrollments || enrollments.length === 0) {
        toast({ title: 'No approved trainees', description: 'No trainees are enrolled in this program.', variant: 'destructive' });
        return;
      }

      const rows = enrollments.map((enrollment) => ({
        session_id: selectedSessionId,
        trainee_id: enrollment.trainee_id,
        status: 'absent',
      }));

      const { error } = await supabase.from('attendance').insert(rows);
      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Attendance already initialized', variant: 'destructive' });
        } else {
          throw error;
        }
      } else {
        toast({ title: 'Attendance initialized' });
        await fetchAttendance(selectedSessionId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to initialize attendance';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const updateStatus = async (attendanceId: string, newStatus: string) => {
    try {
      if (isXamppMode) {
        await xamppApiRequest<{ status: string }>(`/attendance/${attendanceId}`, {
          method: 'PATCH',
          body: { status: newStatus },
        });
      } else {
        const { error } = await supabase
          .from('attendance')
          .update({ status: newStatus })
          .eq('id', attendanceId);

        if (error) {
          throw error;
        }
      }

      setAttendance((current) => current.map((record) => (
        record.id === attendanceId ? { ...record, status: newStatus } : record
      )));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update attendance';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const selfCheckIn = async (attendanceId: string) => {
    try {
      if (isXamppMode) {
        await xamppApiRequest<{ message: string }>(`/attendance/${attendanceId}/check-in`, {
          method: 'POST',
        });
      } else {
        const { error } = await supabase
          .from('attendance')
          .update({ status: 'present', checked_in_at: new Date().toISOString() })
          .eq('id', attendanceId);

        if (error) {
          throw error;
        }
      }

      toast({ title: 'Checked in!' });
      await fetchAttendance(selectedSessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to check in';
      toast({ title: 'Error checking in', description: message, variant: 'destructive' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'default';
      case 'late':
        return 'secondary';
      case 'excused':
        return 'outline';
      case 'absent':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const isTrainerOrAdmin = role === 'admin' || role === 'trainer';
  const visibleAttendance = role === 'trainee'
    ? attendance.filter((record) => record.trainee_id === user?.id)
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
          <CardContent className="py-12 text-center">
            <ClipboardList className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No sessions available.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="max-w-md">
            <Label className="mb-2 block">Select Session</Label>
            <Select value={selectedSessionId} onValueChange={(value) => void fetchAttendance(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a session..." />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.program_title} - {new Date(session.session_date).toLocaleDateString()}
                    {session.start_time ? ` at ${session.start_time.slice(0, 5)}` : ''}
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
                  <Button size="sm" variant="outline" onClick={() => void initializeAttendance()}>
                    <UserCheck className="mr-1 h-4 w-4" />
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
                  <p className="py-8 text-center text-muted-foreground">
                    {isTrainerOrAdmin
                      ? 'No attendance records yet. Click "Initialize Roster" to add enrolled trainees.'
                      : 'No attendance record for this session.'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {visibleAttendance.map((record) => (
                      <div key={record.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">{record.trainee_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{record.trainee_email}</p>
                          {record.checked_in_at && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Checked in: {new Date(record.checked_in_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {isTrainerOrAdmin ? (
                            <Select value={record.status} onValueChange={(value) => void updateStatus(record.id, value)}>
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
                                <Button size="sm" onClick={() => void selfCheckIn(record.id)}>
                                  <CheckCircle className="mr-1 h-4 w-4" />
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
