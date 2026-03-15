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
import { Calendar, Clock, MapPin, Plus, Loader2, BookOpen, Trash2, Download } from 'lucide-react';
import { generateICS, downloadICS } from '@/lib/icsExport';

interface Session {
  id: string;
  program_id: string;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  program_title?: string;
}

interface Program {
  id: string;
  title: string;
}

function SessionsContent() {
  const { user, role } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [programId, setProgramId] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchSessions();
    if (role === 'admin' || role === 'trainer') {
      fetchPrograms();
    }
  }, [role]);

  const fetchSessions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('session_date', { ascending: true });

    if (error) {
      toast({ title: 'Error fetching sessions', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Enrich with program titles
    const programIds = [...new Set((data || []).map(s => s.program_id))];
    let titleMap: Record<string, string> = {};
    if (programIds.length > 0) {
      const { data: progs } = await supabase
        .from('training_programs')
        .select('id, title')
        .in('id', programIds);
      if (progs) {
        titleMap = Object.fromEntries(progs.map(p => [p.id, p.title]));
      }
    }

    setSessions((data || []).map(s => ({ ...s, program_title: titleMap[s.program_id] || 'Unknown' })));
    setLoading(false);
  };

  const fetchPrograms = async () => {
    const { data } = await supabase
      .from('training_programs')
      .select('id, title')
      .order('title');
    setPrograms(data || []);
  };

  const handleCreate = async () => {
    if (!programId || !sessionDate) {
      toast({ title: 'Program and date are required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('sessions').insert({
      program_id: programId,
      session_date: sessionDate,
      start_time: startTime || null,
      end_time: endTime || null,
      location: location.trim() || null,
      notes: notes.trim() || null,
    });

    if (error) {
      toast({ title: 'Error creating session', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Session created' });
      setCreateOpen(false);
      resetForm();
      fetchSessions();
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setProgramId('');
    setSessionDate('');
    setStartTime('');
    setEndTime('');
    setLocation('');
    setNotes('');
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error deleting session', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Session deleted' });
      fetchSessions();
    }
  };

  const canCreate = role === 'admin' || role === 'trainer';
  const isPast = (date: string) => new Date(date) < new Date(new Date().toDateString());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Sessions</h2>
          <p className="text-muted-foreground">
            {canCreate ? 'Schedule and manage training sessions.' : 'View your upcoming training sessions.'}
          </p>
        </div>
        {canCreate && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Session</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Schedule Session</DialogTitle>
                <DialogDescription>Create a new training session for a program.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Program *</Label>
                  <Select value={programId} onValueChange={setProgramId}>
                    <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
                    <SelectContent>
                      {programs.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date *</Label>
                  <Input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Time</Label>
                    <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                  </div>
                  <div>
                    <Label>End Time</Label>
                    <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Room, building, or online link" />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Session details..." rows={2} />
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Session
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No sessions scheduled.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map(session => (
            <Card key={session.id} className={isPast(session.session_date) ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base leading-tight">{session.program_title}</CardTitle>
                  <Badge variant={isPast(session.session_date) ? 'secondary' : 'default'}>
                    {isPast(session.session_date) ? 'Past' : 'Upcoming'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{new Date(session.session_date).toLocaleDateString()}</span>
                </div>
                {(session.start_time || session.end_time) && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>
                      {session.start_time?.slice(0, 5) || '—'}
                      {' – '}
                      {session.end_time?.slice(0, 5) || '—'}
                    </span>
                  </div>
                )}
                {session.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{session.location}</span>
                  </div>
                )}
                {session.notes && (
                  <p className="text-xs mt-2 border-t pt-2">{session.notes}</p>
                )}
                <div className="pt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const ics = generateICS({
                        title: session.program_title || 'Training Session',
                        date: session.session_date,
                        startTime: session.start_time,
                        endTime: session.end_time,
                        location: session.location,
                        description: session.notes,
                      });
                      downloadICS(`session-${session.session_date}`, ics);
                      toast({ title: 'Calendar file downloaded' });
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" />Add to Calendar
                  </Button>
                  {canCreate && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(session.id)}>
                      <Trash2 className="h-4 w-4 mr-1" />Delete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sessions() {
  return (
    <DashboardLayout>
      <SessionsContent />
    </DashboardLayout>
  );
}
