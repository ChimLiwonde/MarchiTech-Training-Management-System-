import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Award, Download, Plus, GraduationCap, CheckCircle2, Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';

interface Certificate {
  id: string;
  trainee_id: string;
  program_id: string;
  assessment_id: string | null;
  attempt_id: string | null;
  issued_at: string;
  certificate_number: string;
  issued_by: string;
  notes: string | null;
}

interface Program { id: string; title: string; trainer_id: string; }
interface Profile { user_id: string; full_name: string | null; email: string; }
interface Attempt {
  id: string;
  assessment_id: string;
  trainee_id: string;
  score: number | null;
  passed: boolean | null;
  completed_at: string | null;
}

export default function Certificates() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const canManage = role === 'admin' || role === 'trainer';
  const printRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [issuingOpen, setIssuingOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedTrainee, setSelectedTrainee] = useState('');
  const [selectedAttempt, setSelectedAttempt] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [viewCert, setViewCert] = useState<Certificate | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [programsRes, certsRes] = await Promise.all([
      supabase.from('training_programs').select('id, title, trainer_id').order('title'),
      supabase.from('certificates').select('*').order('issued_at', { ascending: false }),
    ]);
    if (programsRes.data) setPrograms(programsRes.data);
    if (certsRes.data) setCertificates(certsRes.data as Certificate[]);

    if (canManage) {
      const [profilesRes, attemptsRes] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, email'),
        supabase.from('assessment_attempts').select('*').eq('passed', true),
      ]);
      if (profilesRes.data) setProfiles(profilesRes.data as Profile[]);
      if (attemptsRes.data) setAttempts(attemptsRes.data as Attempt[]);
    }
    setLoading(false);
  };

  const issueCertificate = async () => {
    if (!user || !selectedProgram || !selectedTrainee) return;
    setIssuing(true);
    const attempt = attempts.find(a => a.id === selectedAttempt);
    const { error } = await supabase.from('certificates').insert({
      trainee_id: selectedTrainee,
      program_id: selectedProgram,
      assessment_id: attempt?.assessment_id || null,
      attempt_id: selectedAttempt || null,
      issued_by: user.id,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Certificate issued successfully!', description: 'The trainee can now view their certificate.' });
      setIssuingOpen(false);
      setSelectedProgram(''); setSelectedTrainee(''); setSelectedAttempt('');
      fetchData();
    }
    setIssuing(false);
  };

  const getTraineeName = (id: string) => {
    const p = profiles.find(pr => pr.user_id === id);
    return p?.full_name || p?.email || 'Unknown';
  };
  const getProgramTitle = (id: string) => programs.find(p => p.id === id)?.title || 'Unknown';

  const traineeAttemptsForProgram = attempts.filter(a => {
    if (!selectedProgram || !selectedTrainee) return false;
    return a.trainee_id === selectedTrainee;
  });

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Certificate</title>
      <style>
        body { margin: 0; font-family: Georgia, serif; background: #fff; }
        .cert { width: 800px; margin: 40px auto; padding: 60px; border: 12px double #b8860b; text-align: center; }
        .cert-logo { font-size: 48px; margin-bottom: 16px; }
        .cert-title { font-size: 36px; color: #b8860b; font-weight: bold; margin-bottom: 8px; }
        .cert-subtitle { font-size: 18px; color: #555; margin-bottom: 40px; }
        .cert-presented { font-size: 14px; color: #777; margin-bottom: 12px; }
        .cert-name { font-size: 32px; color: #1a1a1a; font-weight: bold; border-bottom: 2px solid #b8860b; display: inline-block; padding-bottom: 4px; margin-bottom: 24px; }
        .cert-program { font-size: 16px; color: #333; margin-bottom: 32px; }
        .cert-meta { font-size: 12px; color: #999; margin-top: 40px; }
      </style></head><body>${printContent}</body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Certificates</h1>
            <p className="text-muted-foreground">
              {canManage ? 'Issue and manage training certificates' : 'Your earned certificates'}
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setIssuingOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />Issue Certificate
            </Button>
          )}
        </div>

        {certificates.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No certificates yet.</p>
              {role === 'trainee' && (
                <p className="text-sm text-muted-foreground mt-2">Complete assessments to earn certificates!</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {certificates.map((cert) => (
              <Card key={cert.id} className="relative overflow-hidden border-2">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 via-yellow-600 to-yellow-400" />
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <Award className="h-8 w-8 text-yellow-600" />
                    <Badge variant="outline" className="text-xs font-mono">{cert.certificate_number}</Badge>
                  </div>
                  <CardTitle className="text-base mt-2">{getProgramTitle(cert.program_id)}</CardTitle>
                  {canManage && (
                    <CardDescription className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      {getTraineeName(cert.trainee_id)}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Issued: {format(new Date(cert.issued_at), 'MMMM d, yyyy')}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setViewCert(cert)}>
                    <Printer className="h-3 w-3 mr-2" />View & Print
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Issue Certificate Dialog */}
        <Dialog open={issuingOpen} onOpenChange={setIssuingOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue Certificate</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Training Program</Label>
                <Select value={selectedProgram} onValueChange={v => { setSelectedProgram(v); setSelectedTrainee(''); setSelectedAttempt(''); }}>
                  <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
                  <SelectContent>
                    {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Trainee</Label>
                <Select value={selectedTrainee} onValueChange={setSelectedTrainee} disabled={!selectedProgram}>
                  <SelectTrigger><SelectValue placeholder="Select trainee" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.full_name || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {traineeAttemptsForProgram.length > 0 && (
                <div>
                  <Label>Link to Assessment (optional)</Label>
                  <Select value={selectedAttempt} onValueChange={setSelectedAttempt}>
                    <SelectTrigger><SelectValue placeholder="Select passed attempt" /></SelectTrigger>
                    <SelectContent>
                      {traineeAttemptsForProgram.map(a => (
                        <SelectItem key={a.id} value={a.id}>Score: {a.score}% — {a.completed_at ? format(new Date(a.completed_at), 'MMM d, yyyy') : 'N/A'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={issueCertificate}
                  disabled={issuing || !selectedProgram || !selectedTrainee}
                  className="flex-1"
                >
                  {issuing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Award className="h-4 w-4 mr-2" />}
                  Issue Certificate
                </Button>
                <Button variant="outline" onClick={() => setIssuingOpen(false)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* View/Print Certificate Dialog */}
        <Dialog open={!!viewCert} onOpenChange={() => setViewCert(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Certificate Preview</DialogTitle>
            </DialogHeader>
            {viewCert && (
              <div>
                <div ref={printRef}>
                  <div className="cert" style={{
                    border: '10px double #b8860b',
                    padding: '48px',
                    textAlign: 'center',
                    background: 'linear-gradient(135deg, #fffdf0 0%, #fff 50%, #fffdf0 100%)',
                    borderRadius: '8px',
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎓</div>
                    <h2 style={{ fontSize: '28px', color: '#b8860b', fontFamily: 'Georgia, serif', marginBottom: '4px' }}>
                      Certificate of Completion
                    </h2>
                    <p style={{ color: '#777', fontSize: '14px', marginBottom: '32px' }}>
                      M'archiTech Training Management System
                    </p>
                    <p style={{ color: '#555', fontSize: '14px', marginBottom: '12px' }}>
                      This is to certify that
                    </p>
                    <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#1a1a1a', fontFamily: 'Georgia, serif', borderBottom: '2px solid #b8860b', display: 'inline-block', paddingBottom: '4px', marginBottom: '20px' }}>
                      {getTraineeName(viewCert.trainee_id)}
                    </p>
                    <p style={{ color: '#555', fontSize: '14px', marginBottom: '8px' }}>
                      has successfully completed the training program
                    </p>
                    <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#333', marginBottom: '32px', fontFamily: 'Georgia, serif' }}>
                      {getProgramTitle(viewCert.program_id)}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #ddd' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ borderBottom: '1px solid #333', width: '160px', marginBottom: '4px' }} />
                        <p style={{ fontSize: '11px', color: '#777' }}>Authorized Signature</p>
                      </div>
                      <div style={{ textAlign: 'center', fontSize: '11px', color: '#999' }}>
                        <p>Issued: {format(new Date(viewCert.issued_at), 'MMMM d, yyyy')}</p>
                        <p style={{ fontFamily: 'monospace' }}>{viewCert.certificate_number}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button onClick={handlePrint} className="flex-1">
                    <Printer className="h-4 w-4 mr-2" />Print Certificate
                  </Button>
                  <Button variant="outline" onClick={() => setViewCert(null)}>Close</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
